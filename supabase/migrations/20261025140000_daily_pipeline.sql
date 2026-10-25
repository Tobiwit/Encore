-- Daily data pipeline + frequent notification delivery.
-- Data (Spotify, Ticketmaster) is fetched once a day by the host's cron. Delivery of already
-- scheduled reminders must happen close to sale time, so Postgres itself (pg_cron + pg_net)
-- pings the app's delivery endpoint every few minutes. URL and secret live in Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily runs: refresh anything not refreshed in the last ~20 hours.
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
    and (a.events_refreshed_at is null or a.events_refreshed_at < now() - interval '20 hours')
  order by a.events_refreshed_at nulls first
  limit p_limit;
$$;

revoke all on function public.artists_due_for_event_refresh(text, integer) from public, anon, authenticated;
grant execute on function public.artists_due_for_event_refresh(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Concert-search progress for the signed-in user
-- ---------------------------------------------------------------------------

create or replace function public.get_concert_search_status()
returns table (
  followed integer,
  checked integer,
  found integer,
  verified integer,
  refreshed integer,
  last_run_at timestamptz,
  last_run_status text,
  last_run_problem text,
  running boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select a.provider_lookup_at, a.events_refreshed_at, tm.match_confidence
    from public.user_artists ua
    join public.artists a on a.id = ua.artist_id
    left join public.artist_provider_ids tm on tm.artist_id = a.id and tm.provider = 'ticketmaster'
    where ua.user_id = auth.uid() and not ua.is_dismissed
  ),
  last_run as (
    select r.finished_at, r.status, r.error, r.details
    from public.job_runs r
    where r.job_name in ('daily', 'concert-search', 'artist-matching', 'event-refresh')
      and r.status <> 'running'
    order by r.started_at desc
    limit 1
  )
  select
    count(*)::integer,
    count(*) filter (where m.provider_lookup_at is not null or m.match_confidence is not null)::integer,
    count(m.match_confidence)::integer,
    count(*) filter (where m.match_confidence >= 0.9)::integer,
    count(*) filter (where m.match_confidence is not null and m.events_refreshed_at is not null)::integer,
    (select finished_at from last_run),
    (select status from last_run),
    -- Only operational summaries (no secrets): a failure, a skipped provider, or the last provider error.
    (select coalesce(
       case when status = 'failed' then left(error, 200) end,
       details ->> 'skipped',
       details #>> '{matching,skipped}',
       left(details ->> 'lastError', 200),
       left(details #>> '{matching,lastError}', 200),
       left(details #>> '{refresh,lastError}', 200)
     ) from last_run),
    exists (
      select 1 from public.job_runs r
      where r.job_name in ('daily', 'concert-search', 'artist-matching', 'event-refresh')
        and r.status = 'running' and r.started_at > now() - interval '10 minutes'
    )
  from mine m
  where auth.uid() is not null;
$$;

grant execute on function public.get_concert_search_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Frequent delivery trigger
-- ---------------------------------------------------------------------------

-- Configure once per environment (SQL editor):
--   select vault.create_secret('https://your-app.vercel.app', 'encore_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'encore_cron_secret');
-- Without both secrets this is a no-op (e.g. local development, where `pnpm worker` delivers).
create or replace function public.trigger_notification_delivery()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'encore_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'encore_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/notifications-deliver',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_notification_delivery() from public, anon, authenticated;

select cron.schedule('encore-notifications-deliver', '*/5 * * * *', 'select public.trigger_notification_delivery()');
