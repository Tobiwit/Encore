-- Server-side pipelines. Every function here is idempotent and callable only by service_role.
-- TypeScript normalises provider payloads (src/server/providers); these functions persist them
-- atomically so retries never duplicate artists, events or notifications.

-- ---------------------------------------------------------------------------
-- Spotify import
-- ---------------------------------------------------------------------------

-- p_items: [{ time_range, rank, spotify_id, name, image_url, genres[], external_url }]
create or replace function public.import_spotify_top_artists(p_user_id uuid, p_batch_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_artist_id uuid;
  v_new_links integer := 0;
  v_snapshots integer := 0;
  v_inserted boolean;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    select artist_id into v_artist_id
    from public.artist_provider_ids
    where provider = 'spotify' and external_artist_id = v_item ->> 'spotify_id';

    if v_artist_id is null then
      insert into public.artists (canonical_name, image_url, genres, metadata_source)
      values (
        v_item ->> 'name',
        v_item ->> 'image_url',
        coalesce(array(select jsonb_array_elements_text(v_item -> 'genres')), '{}'),
        'spotify'
      )
      returning id into v_artist_id;

      insert into public.artist_provider_ids (artist_id, provider, external_artist_id, external_url)
      values (v_artist_id, 'spotify', v_item ->> 'spotify_id', v_item ->> 'external_url')
      on conflict (provider, external_artist_id) do nothing;

      -- Lost a race with a concurrent import: use the winner and discard our row.
      if not found then
        delete from public.artists where id = v_artist_id;
        select artist_id into v_artist_id from public.artist_provider_ids
        where provider = 'spotify' and external_artist_id = v_item ->> 'spotify_id';
      end if;
    else
      update public.artists
      set canonical_name = v_item ->> 'name',
          image_url = coalesce(v_item ->> 'image_url', image_url),
          genres = coalesce(array(select jsonb_array_elements_text(v_item -> 'genres')), genres)
      where id = v_artist_id and metadata_source = 'spotify';
    end if;

    -- Never overwrite user curation (pins, interest, dismissals) on re-import.
    v_inserted := false;
    insert into public.user_artists (user_id, artist_id, added_source)
    values (p_user_id, v_artist_id, 'spotify_import')
    on conflict (user_id, artist_id) do nothing
    returning true into v_inserted;
    if v_inserted then
      v_new_links := v_new_links + 1;
    end if;

    insert into public.artist_listening_snapshots (user_id, artist_id, time_range, rank, batch_id)
    values (p_user_id, v_artist_id, (v_item ->> 'time_range')::public.spotify_time_range,
            (v_item ->> 'rank')::integer, p_batch_id)
    on conflict (user_id, artist_id, time_range, batch_id) do nothing;
    if found then
      v_snapshots := v_snapshots + 1;
    end if;
  end loop;

  -- Retain only the three most recent batches of listening history per user.
  delete from public.artist_listening_snapshots s
  where s.user_id = p_user_id
    and s.batch_id not in (
      select batch_id from public.artist_listening_snapshots
      where user_id = p_user_id
      group by batch_id
      order by max(synced_at) desc
      limit 3
    );

  return jsonb_build_object('new_artists', v_new_links, 'snapshots', v_snapshots);
end;
$$;

-- Accounts due for a scheduled refresh.
create or replace function public.claim_spotify_sync_accounts(p_limit integer)
returns setof public.connected_accounts
language sql
security definer
set search_path = ''
as $$
  update public.connected_accounts ca
  set last_sync_attempt_at = now(),
      -- Lease: if the worker dies the account becomes due again after 30 minutes.
      next_sync_at = now() + interval '30 minutes'
  where ca.id in (
    select id from public.connected_accounts
    where provider = 'spotify' and status = 'active' and next_sync_at <= now()
    order by next_sync_at
    limit p_limit
    for update skip locked
  )
  returning ca.*;
$$;

create or replace function public.record_spotify_sync_result(p_account_id uuid, p_success boolean, p_error text,
                                                            p_revoked boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_success then
    update public.connected_accounts
    set last_successful_sync_at = now(), last_sync_error = null, sync_failure_count = 0,
        next_sync_at = now() + interval '7 days', status = 'active'
    where id = p_account_id;
  elsif p_revoked then
    update public.connected_accounts
    set status = 'revoked', last_sync_error = p_error,
        access_token_encrypted = null, refresh_token_encrypted = null
    where id = p_account_id;
  else
    -- Bounded exponential backoff: 15 min, 1 h, 4 h, 16 h, then weekly cadence resumes.
    update public.connected_accounts
    set last_sync_error = p_error,
        sync_failure_count = sync_failure_count + 1,
        next_sync_at = now() + case
          when sync_failure_count >= 4 then interval '7 days'
          else interval '15 minutes' * power(4, sync_failure_count)
        end,
        status = case when sync_failure_count >= 4 then 'error'::public.connected_account_status else status end
    where id = p_account_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Artist ↔ Ticketmaster attraction mapping
-- ---------------------------------------------------------------------------

create or replace function public.artists_needing_provider_lookup(p_provider text, p_limit integer)
returns table (artist_id uuid, canonical_name text, spotify_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.canonical_name, sp.external_artist_id
  from public.artists a
  left join public.artist_provider_ids sp on sp.artist_id = a.id and sp.provider = 'spotify'
  where exists (select 1 from public.user_artists ua where ua.artist_id = a.id and not ua.is_dismissed)
    and not exists (select 1 from public.artist_provider_ids p where p.artist_id = a.id and p.provider = p_provider)
    and (a.provider_lookup_at is null or a.provider_lookup_at < now() - interval '14 days')
  order by a.provider_lookup_at nulls first, a.created_at
  limit p_limit;
$$;

create or replace function public.link_artist_provider(p_artist_id uuid, p_provider text, p_external_id text,
                                                       p_external_url text, p_method public.match_method,
                                                       p_confidence numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.artists set provider_lookup_at = now() where id = p_artist_id;
  if p_external_id is null then
    return;
  end if;
  insert into public.artist_provider_ids (artist_id, provider, external_artist_id, external_url, match_method, match_confidence)
  values (p_artist_id, p_provider, p_external_id, nullif(p_external_url, ''), p_method, p_confidence)
  on conflict (provider, external_artist_id) do nothing;
end;
$$;

create or replace function public.artists_due_for_event_refresh(p_provider text, p_limit integer)
returns table (artist_id uuid, canonical_name text, external_artist_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.canonical_name, p.external_artist_id
  from public.artists a
  join public.artist_provider_ids p on p.artist_id = a.id and p.provider = p_provider
  where exists (select 1 from public.user_artists ua where ua.artist_id = a.id and not ua.is_dismissed)
    and (a.events_refreshed_at is null or a.events_refreshed_at < now() - interval '12 hours')
  order by a.events_refreshed_at nulls first
  limit p_limit;
$$;

create or replace function public.mark_artist_events_refreshed(p_artist_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.artists set events_refreshed_at = now() where id = p_artist_id;
$$;

-- ---------------------------------------------------------------------------
-- Event ingestion
-- ---------------------------------------------------------------------------

/*
p jsonb (see NormalizedEvent in src/server/providers/types.ts):
{
  provider, external_event_id, title, source_status, lifecycle_status, source_url, raw_payload_hash,
  is_variant_hint, starts_at, start_date_local, start_time_tba, ends_at, timezone, image_url,
  venue: { external_venue_id, name, address, postal_code, city, country_code, latitude, longitude, timezone } | null,
  attraction_ids: [text],
  sales:  [{ sale_key, sale_type, sale_name, starts_at, ends_at, start_time_unknown }],
  offers: [{ offer_key, offer_type, min_price, max_price, currency, destination_url, is_resale }]
}
*/
create or replace function public.ingest_provider_event(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := p ->> 'provider';
  v_record public.event_provider_records;
  v_event public.events;
  v_event_id uuid;
  v_venue_id uuid;
  v_created boolean := false;
  v_is_primary boolean := true;
  v_starts_at timestamptz := (p ->> 'starts_at')::timestamptz;
  v_tba boolean := coalesce((p ->> 'start_time_tba')::boolean, false);
  v_status public.event_lifecycle_status := coalesce((p ->> 'lifecycle_status')::public.event_lifecycle_status, 'unknown');
  v_artist_ids uuid[];
  v_sale jsonb;
  v_offer jsonb;
  v_old_sale_start timestamptz;
  v_changes jsonb := '[]'::jsonb;
  v_sale_keys text[] := '{}';
  v_offer_keys text[] := '{}';
begin
  -- Venue
  if p -> 'venue' is not null and jsonb_typeof(p -> 'venue') = 'object' then
    select venue_id into v_venue_id from public.venue_provider_ids
    where provider = v_provider and external_venue_id = p -> 'venue' ->> 'external_venue_id';

    if v_venue_id is null then
      insert into public.venues (name, address, postal_code, city, country_code, latitude, longitude, timezone)
      values (p -> 'venue' ->> 'name', p -> 'venue' ->> 'address', p -> 'venue' ->> 'postal_code',
              p -> 'venue' ->> 'city', p -> 'venue' ->> 'country_code',
              (p -> 'venue' ->> 'latitude')::double precision, (p -> 'venue' ->> 'longitude')::double precision,
              p -> 'venue' ->> 'timezone')
      returning id into v_venue_id;
      insert into public.venue_provider_ids (venue_id, provider, external_venue_id)
      values (v_venue_id, v_provider, p -> 'venue' ->> 'external_venue_id');
    else
      update public.venues
      set name = p -> 'venue' ->> 'name',
          address = coalesce(p -> 'venue' ->> 'address', address),
          postal_code = coalesce(p -> 'venue' ->> 'postal_code', postal_code),
          city = coalesce(p -> 'venue' ->> 'city', city),
          country_code = coalesce(p -> 'venue' ->> 'country_code', country_code),
          latitude = coalesce((p -> 'venue' ->> 'latitude')::double precision, latitude),
          longitude = coalesce((p -> 'venue' ->> 'longitude')::double precision, longitude),
          timezone = coalesce(p -> 'venue' ->> 'timezone', timezone)
      where id = v_venue_id;
    end if;
  end if;

  -- Canonical artists for this record, only via established provider links (never by title).
  select coalesce(array_agg(distinct api.artist_id), '{}') into v_artist_ids
  from public.artist_provider_ids api
  where api.provider = v_provider
    and api.external_artist_id in (select jsonb_array_elements_text(coalesce(p -> 'attraction_ids', '[]'::jsonb)));

  -- Resolve the canonical event.
  select * into v_record from public.event_provider_records
  where provider = v_provider and external_event_id = p ->> 'external_event_id'
  for update;

  if found then
    v_event_id := v_record.event_id;
    v_is_primary := v_record.is_primary;
  else
    -- Conservative same-provider dedupe: VIP/package listings for the same show share venue,
    -- exact start time and at least one canonical artist.
    if v_venue_id is not null and v_starts_at is not null and not v_tba and cardinality(v_artist_ids) > 0 then
      select e.id into v_event_id
      from public.events e
      where e.venue_id = v_venue_id
        and e.starts_at = v_starts_at
        and not e.start_time_tba
        and exists (select 1 from public.event_artists ea where ea.event_id = e.id and ea.artist_id = any (v_artist_ids))
      order by e.created_at
      limit 1;
    end if;

    if v_event_id is not null then
      v_is_primary := false;
      -- If the existing primary looks like a package and this one does not, promote this record.
      if not coalesce((p ->> 'is_variant_hint')::boolean, false) and exists (
        select 1 from public.event_provider_records r
        where r.event_id = v_event_id and r.is_primary and r.external_title ~* '(vip|package|paket|upgrade|platinum|hospitality)'
      ) then
        update public.event_provider_records set is_primary = false where event_id = v_event_id;
        v_is_primary := true;
      end if;
    else
      insert into public.events (canonical_title, venue_id, starts_at, start_date_local, start_time_tba, ends_at,
                                 timezone, lifecycle_status, event_url, image_url)
      values (p ->> 'title', v_venue_id, v_starts_at, (p ->> 'start_date_local')::date, v_tba,
              (p ->> 'ends_at')::timestamptz, p ->> 'timezone', v_status, p ->> 'source_url', p ->> 'image_url')
      returning id into v_event_id;
      v_created := true;
    end if;

    insert into public.event_provider_records (event_id, provider, external_event_id, external_title, is_primary)
    values (v_event_id, v_provider, p ->> 'external_event_id', p ->> 'title', v_is_primary)
    returning * into v_record;
  end if;

  update public.event_provider_records
  set external_title = p ->> 'title',
      source_status = p ->> 'source_status',
      source_url = p ->> 'source_url',
      raw_payload_hash = p ->> 'raw_payload_hash',
      last_synced_at = now(),
      is_primary = v_is_primary
  where id = v_record.id;

  -- Core event fields come from the primary record; record significant changes.
  select * into v_event from public.events where id = v_event_id for update;

  if v_is_primary and not v_created then
    if v_event.starts_at is distinct from v_starts_at then
      insert into public.event_changes (event_id, field, old_value, new_value)
      values (v_event_id, 'starts_at', v_event.starts_at::text, v_starts_at::text);
      v_changes := v_changes || jsonb_build_object('field', 'starts_at', 'old', v_event.starts_at, 'new', v_starts_at);
    end if;
    if v_event.lifecycle_status is distinct from v_status then
      insert into public.event_changes (event_id, field, old_value, new_value)
      values (v_event_id, 'lifecycle_status', v_event.lifecycle_status::text, v_status::text);
      v_changes := v_changes || jsonb_build_object('field', 'lifecycle_status', 'old', v_event.lifecycle_status, 'new', v_status);
    end if;

    update public.events
    set canonical_title = p ->> 'title',
        venue_id = coalesce(v_venue_id, venue_id),
        starts_at = v_starts_at,
        start_date_local = (p ->> 'start_date_local')::date,
        start_time_tba = v_tba,
        ends_at = (p ->> 'ends_at')::timestamptz,
        timezone = coalesce(p ->> 'timezone', timezone),
        lifecycle_status = v_status,
        event_url = p ->> 'source_url',
        image_url = coalesce(p ->> 'image_url', image_url),
        last_verified_at = now()
    where id = v_event_id;
  else
    update public.events set last_verified_at = now() where id = v_event_id;
  end if;

  -- Artist associations (confidence inherited from the provider link).
  insert into public.event_artists (event_id, artist_id, match_confidence, match_method)
  select v_event_id, api.artist_id, api.match_confidence, api.match_method
  from public.artist_provider_ids api
  where api.provider = v_provider and api.artist_id = any (v_artist_ids)
  on conflict (event_id, artist_id) do update
    set match_confidence = greatest(public.event_artists.match_confidence, excluded.match_confidence);

  -- Sale phases for this provider record.
  for v_sale in select * from jsonb_array_elements(coalesce(p -> 'sales', '[]'::jsonb))
  loop
    v_sale_keys := v_sale_keys || (v_sale ->> 'sale_key');

    select starts_at into v_old_sale_start from public.event_sales
    where provider_record_id = v_record.id and sale_key = v_sale ->> 'sale_key';

    if found and v_old_sale_start is distinct from (v_sale ->> 'starts_at')::timestamptz then
      insert into public.event_changes (event_id, field, old_value, new_value)
      values (v_event_id, 'sale:' || (v_sale ->> 'sale_key'), v_old_sale_start::text, v_sale ->> 'starts_at');
      v_changes := v_changes || jsonb_build_object('field', 'sale:' || (v_sale ->> 'sale_key'),
                                                   'old', v_old_sale_start, 'new', v_sale ->> 'starts_at');
    end if;

    insert into public.event_sales (event_id, provider_record_id, sale_key, sale_type, sale_name, starts_at, ends_at,
                                    start_time_unknown, last_verified_at)
    values (v_event_id, v_record.id, v_sale ->> 'sale_key', (v_sale ->> 'sale_type')::public.sale_type,
            v_sale ->> 'sale_name', (v_sale ->> 'starts_at')::timestamptz, (v_sale ->> 'ends_at')::timestamptz,
            coalesce((v_sale ->> 'start_time_unknown')::boolean, false), now())
    on conflict (provider_record_id, sale_key) do update
      set sale_type = excluded.sale_type,
          sale_name = excluded.sale_name,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          start_time_unknown = excluded.start_time_unknown,
          event_id = excluded.event_id,
          last_verified_at = now();
  end loop;

  delete from public.event_sales
  where provider_record_id = v_record.id and not (sale_key = any (v_sale_keys));

  -- Ticket offers for this provider record.
  for v_offer in select * from jsonb_array_elements(coalesce(p -> 'offers', '[]'::jsonb))
  loop
    v_offer_keys := v_offer_keys || (v_offer ->> 'offer_key');
    insert into public.ticket_offers (event_id, provider_record_id, offer_key, provider, offer_type, min_price, max_price,
                                      currency, destination_url, is_resale, link_generated_at, last_verified_at)
    values (v_event_id, v_record.id, v_offer ->> 'offer_key', v_provider,
            (v_offer ->> 'offer_type')::public.offer_type,
            (v_offer ->> 'min_price')::numeric, (v_offer ->> 'max_price')::numeric, v_offer ->> 'currency',
            v_offer ->> 'destination_url', coalesce((v_offer ->> 'is_resale')::boolean, false), now(), now())
    on conflict (provider_record_id, offer_key) do update
      set offer_type = excluded.offer_type,
          min_price = excluded.min_price,
          max_price = excluded.max_price,
          currency = excluded.currency,
          destination_url = excluded.destination_url,
          is_resale = excluded.is_resale,
          event_id = excluded.event_id,
          last_verified_at = now();
  end loop;

  delete from public.ticket_offers
  where provider_record_id = v_record.id and not (offer_key = any (v_offer_keys));

  return jsonb_build_object('event_id', v_event_id, 'created', v_created, 'is_primary', v_is_primary,
                            'changes', v_changes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification scheduling
-- ---------------------------------------------------------------------------

-- Users who should hear about an event: they follow a confidently matched artist, have
-- notifications on for that artist, and the venue is inside one of their search areas.
create or replace function public.event_audience(p_event_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ua.user_id
  from public.event_artists ea
  join public.user_artists ua on ua.artist_id = ea.artist_id
  join public.users u on u.id = ua.user_id and u.deleted_at is null
  join public.events e on e.id = ea.event_id
  left join public.venues v on v.id = e.venue_id
  where ea.event_id = p_event_id
    and ea.match_confidence >= 0.9  -- ambiguous matches never trigger alerts
    and not ua.is_dismissed
    and ua.notify_enabled
    and exists (
      select 1 from public.user_locations ul
      join public.cities c on c.id = ul.city_id
      where ul.user_id = ua.user_id
        and public.distance_km(c.latitude, c.longitude, v.latitude, v.longitude) <= ul.radius_km
    )
    and not exists (select 1 from public.event_dismissals d where d.user_id = ua.user_id and d.event_id = p_event_id);
$$;

create or replace function public.schedule_event_notifications(p_event_id uuid, p_is_new boolean default false,
                                                              p_changes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_scheduled integer := 0;
  v_cancelled integer := 0;
  v_count integer;
  v_inactive boolean;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('scheduled', 0, 'cancelled', 0);
  end if;

  v_inactive := v_event.lifecycle_status in ('cancelled', 'postponed', 'offsale', 'ended')
             or (v_event.starts_at is not null and v_event.starts_at < now());

  -- Stale sale reminders: event inactive, sale removed, or sale time no longer matches snapshot.
  update public.notification_jobs j
  set status = 'cancelled', last_error = 'invalidated by event update'
  where j.event_id = p_event_id
    and j.status = 'pending'
    and j.notification_type in ('presale_starting_soon', 'general_sale_starting_soon', 'sale_open')
    and (
      v_inactive
      or j.sale_id is null
      or not exists (
        select 1 from public.event_sales s
        where s.id = j.sale_id and s.starts_at = j.sale_starts_at_snapshot and not s.start_time_unknown
      )
    );
  get diagnostics v_cancelled = row_count;

  if not v_inactive then
    -- "Starting soon" reminders, honouring each user's lead time and per-type preferences.
    -- The primary listing's sale phases are authoritative; package/VIP variants only fill in
    -- when the primary has none. Identical phases collapse to one reminder.
    with sales as (
      select distinct on (s.sale_type, s.starts_at) s.id, s.sale_type, s.starts_at
      from public.event_sales s
      join public.event_provider_records r on r.id = s.provider_record_id
      where s.event_id = p_event_id
        and s.starts_at is not null and not s.start_time_unknown and s.starts_at > now()
        and (r.is_primary or not exists (
          select 1 from public.event_sales s2
          join public.event_provider_records r2 on r2.id = s2.provider_record_id
          where s2.event_id = p_event_id and r2.is_primary
        ))
      order by s.sale_type, s.starts_at, r.is_primary desc, s.id
    ),
    candidates as (
      select a.user_id, s.id as sale_id, s.starts_at, s.sale_type,
        case when s.sale_type = 'presale' then 'presale_starting_soon' else 'general_sale_starting_soon' end::public.notification_type as ntype,
        s.starts_at - make_interval(mins => np.reminder_lead_minutes) as at
      from public.event_audience(p_event_id) a
      join public.notification_preferences np on np.user_id = a.user_id
      cross join sales s
      where (s.sale_type = 'presale' and np.presale_reminders_enabled)
         or (s.sale_type <> 'presale' and np.general_sale_reminders_enabled)
    ),
    all_jobs as (
      select user_id, sale_id, sale_type, starts_at, ntype, at from candidates where at > now()
      union all
      select user_id, sale_id, sale_type, starts_at, 'sale_open'::public.notification_type, starts_at from candidates
    ),
    upserted as (
      insert into public.notification_jobs (user_id, event_id, sale_id, notification_type, scheduled_at,
                                            sale_starts_at_snapshot, deduplication_key)
      select user_id, p_event_id, sale_id, ntype, at, starts_at,
        concat_ws(':', ntype, user_id, p_event_id, sale_type, extract(epoch from starts_at)::bigint)
      from all_jobs
      on conflict (deduplication_key) do update
        set status = 'pending', scheduled_at = excluded.scheduled_at, sale_id = excluded.sale_id,
            sale_starts_at_snapshot = excluded.sale_starts_at_snapshot, last_error = null
        where public.notification_jobs.status = 'cancelled'
      returning 1
    )
    select count(*) into v_count from upserted;
    v_scheduled := v_scheduled + v_count;

    if p_is_new then
      insert into public.notification_jobs (user_id, event_id, notification_type, scheduled_at, deduplication_key)
      select a.user_id, p_event_id, 'new_event', now(), concat_ws(':', 'new_event', a.user_id, p_event_id)
      from public.event_audience(p_event_id) a
      join public.notification_preferences np on np.user_id = a.user_id and np.new_event_alerts_enabled
      on conflict (deduplication_key) do nothing;
      get diagnostics v_count = row_count;
      v_scheduled := v_scheduled + v_count;
    end if;
  end if;

  -- Date or status changes: tell people who saved the event or declared an intention.
  if jsonb_array_length(coalesce(p_changes, '[]'::jsonb)) > 0
     and exists (select 1 from jsonb_array_elements(p_changes) c where c ->> 'field' in ('starts_at', 'lifecycle_status')) then
    insert into public.notification_jobs (user_id, event_id, notification_type, scheduled_at, deduplication_key)
    select x.user_id, p_event_id, 'event_changed', now(),
      concat_ws(':', 'event_changed', x.user_id, p_event_id, v_event.lifecycle_status,
                coalesce(extract(epoch from v_event.starts_at)::bigint, 0))
    from (
      select user_id from public.saved_events where event_id = p_event_id
      union
      select user_id from public.event_interests where event_id = p_event_id
    ) x
    on conflict (deduplication_key) do nothing;
    get diagnostics v_count = row_count;
    v_scheduled := v_scheduled + v_count;
  end if;

  return jsonb_build_object('scheduled', v_scheduled, 'cancelled', v_cancelled);
end;
$$;

-- Atomically claim due jobs; stuck "processing" jobs are reclaimed after 10 minutes.
create or replace function public.claim_notification_jobs(p_limit integer)
returns setof public.notification_jobs
language sql
security definer
set search_path = ''
as $$
  update public.notification_jobs j
  set status = 'processing', locked_at = now(), attempt_count = j.attempt_count + 1
  where j.id in (
    select id from public.notification_jobs
    where (status = 'pending' and scheduled_at <= now())
       or (status = 'processing' and locked_at < now() - interval '10 minutes')
    order by scheduled_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

-- p_outcome: 'deliver' | 'suppress' | 'defer' | 'fail'
create or replace function public.complete_notification_job(p_job_id uuid, p_outcome text, p_reason text default null,
                                                           p_defer_until timestamptz default null,
                                                           p_title text default null, p_body text default null,
                                                           p_deep_link text default null, p_payload jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.notification_jobs;
  v_notification_id uuid;
begin
  select * into v_job from public.notification_jobs where id = p_job_id for update;
  if not found then
    return null;
  end if;

  if p_outcome = 'deliver' then
    insert into public.notifications (user_id, type, title, body, deep_link, payload, deduplication_key)
    values (v_job.user_id, v_job.notification_type, p_title, p_body, p_deep_link, coalesce(p_payload, '{}'),
            v_job.deduplication_key)
    on conflict (user_id, deduplication_key) do nothing
    returning id into v_notification_id;

    update public.notification_jobs
    set status = 'delivered', delivered_at = now(), locked_at = null, last_error = null
    where id = p_job_id;
  elsif p_outcome = 'suppress' then
    update public.notification_jobs set status = 'suppressed', last_error = p_reason, locked_at = null where id = p_job_id;
  elsif p_outcome = 'defer' then
    update public.notification_jobs
    set status = 'pending', scheduled_at = p_defer_until, last_error = p_reason, locked_at = null,
        attempt_count = greatest(attempt_count - 1, 0)
    where id = p_job_id;
  else
    update public.notification_jobs
    set status = case when attempt_count >= max_attempts then 'failed'::public.notification_job_status else 'pending'::public.notification_job_status end,
        scheduled_at = now() + interval '1 minute' * power(2, attempt_count),
        last_error = p_reason,
        locked_at = null
    where id = p_job_id;
  end if;

  return v_notification_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

create or replace function public.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer;
  v_jobs integer;
  v_runs integer;
  v_invites integer;
  v_events integer;
begin
  delete from public.notifications where created_at < now() - interval '180 days';
  get diagnostics v_notifications = row_count;
  delete from public.notification_jobs
  where status in ('delivered', 'suppressed', 'cancelled', 'failed') and updated_at < now() - interval '60 days';
  get diagnostics v_jobs = row_count;
  delete from public.job_runs where started_at < now() - interval '30 days';
  get diagnostics v_runs = row_count;
  delete from public.friend_invites where expires_at < now() - interval '30 days';
  get diagnostics v_invites = row_count;
  update public.events set lifecycle_status = 'ended'
  where starts_at < now() - interval '1 day' and lifecycle_status not in ('ended', 'cancelled');
  get diagnostics v_events = row_count;
  return jsonb_build_object('notifications', v_notifications, 'jobs', v_jobs, 'job_runs', v_runs,
                            'invites', v_invites, 'events_ended', v_events);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.import_spotify_top_artists(uuid, uuid, jsonb)',
    'public.claim_spotify_sync_accounts(integer)',
    'public.record_spotify_sync_result(uuid, boolean, text, boolean)',
    'public.artists_needing_provider_lookup(text, integer)',
    'public.link_artist_provider(uuid, text, text, text, public.match_method, numeric)',
    'public.artists_due_for_event_refresh(text, integer)',
    'public.mark_artist_events_refreshed(uuid)',
    'public.ingest_provider_event(jsonb)',
    'public.event_audience(uuid)',
    'public.schedule_event_notifications(uuid, boolean, jsonb)',
    'public.claim_notification_jobs(integer)',
    'public.complete_notification_job(uuid, text, text, timestamptz, text, text, text, jsonb)',
    'public.run_retention()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
