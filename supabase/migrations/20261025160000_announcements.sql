-- Announcements vs. back-fill.
-- The first time an artist's concerts are fetched, every existing show is discovered at once.
-- Those are not "just announced" and must not trigger "new concert" alerts. Only events that
-- appear on later fetches get announced_at (= when Encore first saw them).

alter table public.events add column announced_at timestamptz;
create index events_announced_at_idx on public.events (announced_at) where announced_at is not null;

-- Existing rows all came from initial back-fills: leave announced_at null.

drop function public.artists_due_for_event_refresh(text, integer);

create function public.artists_due_for_event_refresh(p_provider text, p_limit integer)
returns table (artist_id uuid, canonical_name text, external_artist_id text, first_fetch boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.canonical_name, p.external_artist_id, a.events_refreshed_at is null
  from public.artists a
  join public.artist_provider_ids p on p.artist_id = a.id and p.provider = p_provider
  where exists (select 1 from public.user_artists ua where ua.artist_id = a.id and not ua.is_dismissed)
    and (a.events_refreshed_at is null or a.events_refreshed_at < now() - interval '20 hours')
  order by a.events_refreshed_at nulls first
  limit p_limit;
$$;

revoke all on function public.artists_due_for_event_refresh(text, integer) from public, anon, authenticated;
grant execute on function public.artists_due_for_event_refresh(text, integer) to service_role;

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
                                 timezone, lifecycle_status, event_url, image_url, announced_at)
      values (p ->> 'title', v_venue_id, v_starts_at, (p ->> 'start_date_local')::date, v_tba,
              (p ->> 'ends_at')::timestamptz, p ->> 'timezone', v_status, p ->> 'source_url', p ->> 'image_url',
              -- Events found while back-filling an artist's existing shows are not announcements.
              case when coalesce((p ->> 'is_backfill')::boolean, false) then null else now() end)
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

revoke all on function public.ingest_provider_event(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_provider_event(jsonb) to service_role;
