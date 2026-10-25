-- Encore core schema.
-- Conventions: UUID primary keys, timestamps in UTC (timestamptz), event-local time zones kept
-- as IANA identifiers for display, external provider IDs never used as internal keys.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.interest_level as enum ('love', 'like', 'curious');
create type public.artist_added_source as enum ('spotify_import', 'manual', 'friend_suggestion', 'discovery');
create type public.spotify_time_range as enum ('short_term', 'medium_term', 'long_term');
create type public.connected_account_status as enum ('active', 'revoked', 'error');
create type public.match_method as enum ('provider_link', 'exact_name', 'manual');

-- Event lifecycle. Sale phases live in event_sales; the UI derives "presale scheduled" etc.
-- from those rows rather than overloading this column.
create type public.event_lifecycle_status as enum (
  'announced', 'presale_scheduled', 'general_sale_scheduled', 'on_sale', 'offsale',
  'postponed', 'rescheduled', 'cancelled', 'ended', 'unknown'
);
create type public.sale_type as enum ('presale', 'general', 'other');
create type public.offer_type as enum ('standard', 'vip', 'package', 'platinum', 'resale', 'other');

create type public.event_intention as enum ('interested', 'going', 'looking_for_company');
create type public.social_visibility as enum ('friends', 'private');
create type public.friendship_status as enum ('pending', 'accepted', 'declined');

create type public.notification_type as enum (
  'presale_starting_soon', 'general_sale_starting_soon', 'sale_open', 'new_event',
  'event_changed', 'friend_interest', 'friend_request'
);
create type public.notification_job_status as enum (
  'pending', 'processing', 'delivered', 'suppressed', 'failed', 'cancelled'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Deterministic transliteration (kept in sync with normalizeName in src/lib/text.ts).
  select nullif(
    btrim(
      regexp_replace(
        translate(
          replace(replace(lower(coalesce(p_name, '')), 'ß', 'ss'), '&', ' and '),
          'àáâãäåāçćčèéêëēėęìíîïīłñńòóôõöøōùúûüūýÿžźżšś',
          'aaaaaaaccceeeeeeeiiiiilnnooooooouuuuuyyzzzss'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- Great-circle distance in kilometres.
create or replace function public.distance_km(lat1 double precision, lon1 double precision,
                                             lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 2 * 6371.0088 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    ))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Reference data: cities used for location selection (no precise user location stored)
-- ---------------------------------------------------------------------------

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code char(2) not null,
  latitude double precision not null,
  longitude double precision not null,
  timezone text not null,
  unique (name, country_code)
);

-- ---------------------------------------------------------------------------
-- Users and accounts
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  spotify_user_id text unique,
  display_name text not null default 'Music fan',
  avatar_url text,
  home_location_id uuid,
  timezone text not null default 'Europe/Berlin',
  fan_list_visibility public.social_visibility not null default 'friends',
  default_intention_visibility public.social_visibility not null default 'friends',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  city_id uuid not null references public.cities (id),
  radius_km integer not null default 50 check (radius_km between 5 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, city_id)
);

alter table public.users
  add constraint users_home_location_fk
  foreign key (home_location_id) references public.user_locations (id) on delete set null;

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  provider_user_id text not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_successful_sync_at timestamptz,
  last_sync_attempt_at timestamptz,
  last_sync_error text,
  sync_failure_count integer not null default 0,
  next_sync_at timestamptz not null default now(),
  status public.connected_account_status not null default 'active',
  unique (provider, provider_user_id),
  unique (user_id, provider)
);

create index connected_accounts_next_sync_idx on public.connected_accounts (next_sync_at) where status = 'active';

-- ---------------------------------------------------------------------------
-- Artists
-- ---------------------------------------------------------------------------

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text generated always as (public.normalize_name(canonical_name)) stored,
  image_url text,
  genres text[] not null default '{}',
  metadata_source text not null,
  provider_lookup_at timestamptz,
  events_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index artists_normalized_name_idx on public.artists (normalized_name);

create table public.artist_provider_ids (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  provider text not null check (provider in ('spotify', 'ticketmaster', 'eventim')),
  external_artist_id text not null,
  external_url text,
  match_method public.match_method not null default 'provider_link',
  match_confidence numeric(3, 2) not null default 1.00 check (match_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (provider, external_artist_id),
  unique (artist_id, provider)
);

create table public.user_artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  interest_level public.interest_level not null default 'like',
  is_pinned boolean not null default false,
  is_dismissed boolean not null default false,
  notify_enabled boolean not null default true,
  added_source public.artist_added_source not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, artist_id)
);

create index user_artists_artist_idx on public.user_artists (artist_id) where not is_dismissed;

create table public.artist_listening_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  time_range public.spotify_time_range not null,
  rank integer not null check (rank > 0),
  batch_id uuid not null,
  synced_at timestamptz not null default now(),
  unique (user_id, artist_id, time_range, batch_id)
);

create index artist_listening_snapshots_user_idx on public.artist_listening_snapshots (user_id, synced_at desc);

-- ---------------------------------------------------------------------------
-- Venues and events
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  postal_code text,
  city text,
  country_code char(2),
  latitude double precision,
  longitude double precision,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index venues_lat_lon_idx on public.venues (latitude, longitude);

create table public.venue_provider_ids (
  venue_id uuid not null references public.venues (id) on delete cascade,
  provider text not null,
  external_venue_id text not null,
  primary key (provider, external_venue_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  venue_id uuid references public.venues (id),
  starts_at timestamptz,
  start_date_local date,
  start_time_tba boolean not null default false,
  ends_at timestamptz,
  timezone text,
  lifecycle_status public.event_lifecycle_status not null default 'unknown',
  event_url text,
  image_url text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);
create index events_venue_start_idx on public.events (venue_id, starts_at);

create table public.event_provider_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  external_title text not null,
  is_primary boolean not null default true,
  source_status text,
  source_url text,
  raw_payload_hash text,
  last_synced_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create index event_provider_records_event_idx on public.event_provider_records (event_id);

create table public.event_artists (
  event_id uuid not null references public.events (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  match_confidence numeric(3, 2) not null check (match_confidence between 0 and 1),
  match_method public.match_method not null,
  primary key (event_id, artist_id)
);

create index event_artists_artist_idx on public.event_artists (artist_id);

create table public.event_sales (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  provider_record_id uuid not null references public.event_provider_records (id) on delete cascade,
  sale_key text not null,
  sale_type public.sale_type not null,
  sale_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  start_time_unknown boolean not null default false,
  last_verified_at timestamptz not null default now(),
  unique (provider_record_id, sale_key)
);

create index event_sales_starts_at_idx on public.event_sales (starts_at);
create index event_sales_event_idx on public.event_sales (event_id);

create table public.ticket_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  provider_record_id uuid not null references public.event_provider_records (id) on delete cascade,
  offer_key text not null,
  provider text not null,
  offer_type public.offer_type not null default 'standard',
  min_price numeric(10, 2) check (min_price >= 0),
  max_price numeric(10, 2) check (max_price >= 0),
  currency char(3),
  destination_url text,
  is_resale boolean not null default false,
  affiliate_provider text,
  affiliate_config jsonb,
  link_generated_at timestamptz,
  last_verified_at timestamptz not null default now(),
  unique (provider_record_id, offer_key),
  check (min_price is null or max_price is null or min_price <= max_price),
  check ((min_price is null and max_price is null) or currency is not null)
);

create index ticket_offers_event_idx on public.ticket_offers (event_id);

-- Audit trail for significant source changes (date, status, sale times).
create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  detected_at timestamptz not null default now()
);

create index event_changes_event_idx on public.event_changes (event_id, detected_at desc);

-- ---------------------------------------------------------------------------
-- Personal event state (saved, dismissed) and social intentions — stored separately
-- ---------------------------------------------------------------------------

create table public.saved_events (
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.event_dismissals (
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.event_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  intention public.event_intention not null,
  visibility public.social_visibility not null default 'friends',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index event_interests_event_idx on public.event_interests (event_id);

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  user_low uuid generated always as (least(requester_id, recipient_id)) stored,
  user_high uuid generated always as (greatest(requester_id, recipient_id)) stored,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique (user_low, user_high)
);

create index friendships_recipient_idx on public.friendships (recipient_id, status);
create index friendships_requester_idx on public.friendships (requester_id, status);

create table public.user_blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.friend_invites (
  token text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  inviter_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create index friend_invites_inviter_idx on public.friend_invites (inviter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  presale_reminders_enabled boolean not null default true,
  general_sale_reminders_enabled boolean not null default true,
  new_event_alerts_enabled boolean not null default true,
  friend_activity_enabled boolean not null default true,
  push_enabled boolean not null default false,
  reminder_lead_minutes integer not null default 60 check (reminder_lead_minutes between 5 and 1440),
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Europe/Berlin',
  updated_at timestamptz not null default now(),
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  sale_id uuid references public.event_sales (id) on delete set null,
  actor_id uuid references public.users (id) on delete cascade,
  notification_type public.notification_type not null,
  scheduled_at timestamptz not null,
  sale_starts_at_snapshot timestamptz,
  status public.notification_job_status not null default 'pending',
  deduplication_key text not null unique,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  locked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_jobs_due_idx on public.notification_jobs (scheduled_at) where status = 'pending';
create index notification_jobs_event_idx on public.notification_jobs (event_id) where status = 'pending';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  deep_link text not null,
  payload jsonb not null default '{}',
  deduplication_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, deduplication_key)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}',
  error text
);

create index job_runs_name_idx on public.job_runs (job_name, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger artists_updated_at before update on public.artists for each row execute function public.set_updated_at();
create trigger user_artists_updated_at before update on public.user_artists for each row execute function public.set_updated_at();
create trigger venues_updated_at before update on public.venues for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger event_interests_updated_at before update on public.event_interests for each row execute function public.set_updated_at();
create trigger friendships_updated_at before update on public.friendships for each row execute function public.set_updated_at();
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();
create trigger notification_jobs_updated_at before update on public.notification_jobs for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user → app user + default preferences
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.users (id, spotify_user_id, display_name, avatar_url)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'spotify'
      then coalesce(v_meta ->> 'provider_id', v_meta ->> 'sub') end,
    coalesce(nullif(v_meta ->> 'full_name', ''), nullif(v_meta ->> 'name', ''), 'Music fan'),
    nullif(v_meta ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
