-- Listening insights: turn Spotify's three time ranges into explainable, sticky interest levels.
--
--   Core favourite = in all three ranges (4 weeks, 6 months, all time) -> "love".
--   Long-time fan  = in the user's "all time" top artists plus at least one other range.
--                    Becomes at least "like", gets a permanent badge, is never pruned.
--   Steady         = present in "6 months" or "all time"        -> "like".
--   In rotation    = only in "last 4 weeks"                      -> "curious"; leaves the fan list
--                    once it drops out of every range (unless pinned, edited or long-time).
--
-- The algorithm only upgrades levels it set itself (interest_source = 'auto'). Anything the user
-- chose is never changed, and automatic levels are never lowered.

create type public.interest_source as enum ('auto', 'user');

alter table public.user_artists
  add column interest_source public.interest_source not null default 'auto',
  add column long_time_fan_since timestamptz;

-- Rows the user already edited (pin, interest, notifications) count as user-chosen.
update public.user_artists set interest_source = 'user' where updated_at > created_at + interval '1 second';

create or replace function public.apply_listening_insights(p_user_id uuid, p_batch_id uuid, p_prune boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_long_time integer;
  v_upgraded integer;
  v_loved integer;
  v_pruned integer := 0;
begin
  if to_regclass('pg_temp.insight_ranges') is null then
    create temporary table insight_ranges (artist_id uuid primary key, s boolean, m boolean, l boolean) on commit drop;
  else
    truncate pg_temp.insight_ranges;
  end if;
  insert into pg_temp.insight_ranges
  select artist_id,
         bool_or(time_range = 'short_term'),
         bool_or(time_range = 'medium_term'),
         bool_or(time_range = 'long_term')
  from public.artist_listening_snapshots
  where user_id = p_user_id and batch_id = p_batch_id
  group by artist_id;

  update public.user_artists ua
  set long_time_fan_since = now()
  from pg_temp.insight_ranges r
  where ua.user_id = p_user_id and ua.artist_id = r.artist_id
    and ua.long_time_fan_since is null
    and r.l and (r.m or r.s);
  get diagnostics v_long_time = row_count;

  update public.user_artists ua
  set interest_level = 'like'
  from pg_temp.insight_ranges r
  where ua.user_id = p_user_id and ua.artist_id = r.artist_id
    and ua.interest_source = 'auto' and ua.interest_level = 'curious'
    and (r.m or r.l or ua.long_time_fan_since is not null);
  get diagnostics v_upgraded = row_count;

  update public.user_artists ua
  set interest_level = 'love'
  from pg_temp.insight_ranges r
  where ua.user_id = p_user_id and ua.artist_id = r.artist_id
    and ua.interest_source = 'auto' and ua.interest_level <> 'love'
    and r.s and r.m and r.l;
  get diagnostics v_loved = row_count;

  -- Prune "in rotation" artists that left every range. Only when this batch actually contains a
  -- fresh short-term list, so a failed range can never empty someone's fan list.
  if p_prune and exists (
    select 1 from public.artist_listening_snapshots
    where user_id = p_user_id and batch_id = p_batch_id and time_range = 'short_term'
  ) then
    delete from public.user_artists ua
    where ua.user_id = p_user_id
      and ua.added_source = 'spotify_import'
      and ua.interest_source = 'auto'
      and ua.interest_level = 'curious'
      and not ua.is_pinned
      and not ua.is_dismissed
      and ua.long_time_fan_since is null
      and not exists (select 1 from pg_temp.insight_ranges r where r.artist_id = ua.artist_id);
    get diagnostics v_pruned = row_count;
  end if;

  return jsonb_build_object('long_time_fans_added', v_long_time, 'upgraded', v_upgraded, 'loved', v_loved, 'pruned', v_pruned);
end;
$$;

revoke all on function public.apply_listening_insights(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.apply_listening_insights(uuid, uuid, boolean) to service_role;

-- Backfill: untouched imports restart at "curious" and are re-classified from each user's most
-- recent batch (no pruning during the backfill).
update public.user_artists set interest_level = 'curious'
where added_source = 'spotify_import' and interest_source = 'auto' and interest_level = 'like';

do $$
declare
  r record;
begin
  for r in
    select distinct on (user_id) user_id, batch_id
    from public.artist_listening_snapshots
    order by user_id, synced_at desc
  loop
    perform public.apply_listening_insights(r.user_id, r.batch_id, false);
  end loop;
end;
$$;

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
  v_insights jsonb;
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
    insert into public.user_artists (user_id, artist_id, added_source, interest_level)
    values (p_user_id, v_artist_id, 'spotify_import', 'curious')
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

  -- Classify against this batch before trimming history.
  v_insights := public.apply_listening_insights(p_user_id, p_batch_id, true);

  -- Retain this batch plus the two most recent earlier ones.
  delete from public.artist_listening_snapshots s
  where s.user_id = p_user_id
    and s.batch_id <> p_batch_id
    and s.batch_id not in (
      select batch_id from public.artist_listening_snapshots
      where user_id = p_user_id and batch_id <> p_batch_id
      group by batch_id
      order by max(synced_at) desc
      limit 2
    );

  return jsonb_build_object('new_artists', v_new_links, 'snapshots', v_snapshots) || v_insights;
end;
$$;

revoke all on function public.import_spotify_top_artists(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_spotify_top_artists(uuid, uuid, jsonb) to service_role;
