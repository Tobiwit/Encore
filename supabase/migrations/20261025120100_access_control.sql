-- Row-level security, grants and social RPCs.
-- Principle: the browser only ever talks to Postgres as `authenticated` through these policies.
-- Provider data (events, sales, offers, artists) is written exclusively by the service role.

-- ---------------------------------------------------------------------------
-- Baseline grants: nothing for anon, explicit grants for authenticated
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Pure helpers are safe for everyone.
grant execute on function public.normalize_name(text) to authenticated, service_role;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to authenticated, service_role;

-- Reference and provider data: read-only for signed-in users.
grant select on public.cities, public.artists, public.artist_provider_ids, public.venues,
  public.events, public.event_provider_records, public.event_artists, public.event_sales,
  public.ticket_offers, public.event_changes
  to authenticated;

-- User-owned data.
grant select, update on public.users to authenticated;
grant select, insert, update, delete on public.user_locations, public.user_artists,
  public.saved_events, public.event_dismissals, public.event_interests to authenticated;
grant select on public.artist_listening_snapshots to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select on public.friendships, public.user_blocks, public.friend_invites to authenticated;

-- Tokens are never selectable by clients: grant only non-secret columns.
grant select (id, user_id, provider, provider_user_id, scopes, connected_at,
  last_successful_sync_at, last_sync_attempt_at, last_sync_error, status)
  on public.connected_accounts to authenticated;

-- Users may not change identity-bearing columns on their own row.
revoke update on public.users from authenticated;
grant update (display_name, home_location_id, timezone, fan_list_visibility,
  default_intention_visibility, onboarding_completed_at)
  on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- Social helper predicates (security definer so policies can consult other users' rows)
-- ---------------------------------------------------------------------------

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b
    and exists (
      select 1 from public.friendships
      where user_low = least(a, b) and user_high = greatest(a, b) and status = 'accepted'
    )
    and not public.is_blocked_between(a, b);
$$;

create or replace function public.can_view_fan_list(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = owner
    or (
      public.are_friends(viewer, owner)
      and exists (select 1 from public.users u where u.id = owner and u.fan_list_visibility = 'friends')
    );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_view_fan_list(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.cities enable row level security;
alter table public.users enable row level security;
alter table public.user_locations enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.artists enable row level security;
alter table public.artist_provider_ids enable row level security;
alter table public.user_artists enable row level security;
alter table public.artist_listening_snapshots enable row level security;
alter table public.venues enable row level security;
alter table public.venue_provider_ids enable row level security;
alter table public.events enable row level security;
alter table public.event_provider_records enable row level security;
alter table public.event_artists enable row level security;
alter table public.event_sales enable row level security;
alter table public.ticket_offers enable row level security;
alter table public.event_changes enable row level security;
alter table public.saved_events enable row level security;
alter table public.event_dismissals enable row level security;
alter table public.event_interests enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.friend_invites enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.job_runs enable row level security;

-- Shared catalogue: readable by any signed-in user.
create policy "catalogue readable" on public.cities for select to authenticated using (true);
create policy "catalogue readable" on public.artists for select to authenticated using (true);
create policy "catalogue readable" on public.artist_provider_ids for select to authenticated using (true);
create policy "catalogue readable" on public.venues for select to authenticated using (true);
create policy "catalogue readable" on public.events for select to authenticated using (true);
create policy "catalogue readable" on public.event_provider_records for select to authenticated using (true);
create policy "catalogue readable" on public.event_artists for select to authenticated using (true);
create policy "catalogue readable" on public.event_sales for select to authenticated using (true);
create policy "catalogue readable" on public.ticket_offers for select to authenticated using (true);
create policy "catalogue readable" on public.event_changes for select to authenticated using (true);

-- Own profile row only. Other people's names/avatars go through get_profiles().
create policy "own row" on public.users for select to authenticated using (id = (select auth.uid()));
create policy "update own row" on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own locations" on public.user_locations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own accounts" on public.connected_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- Fan list: owner has full control; accepted, unblocked friends may read when the owner allows it.
create policy "own fan list" on public.user_artists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friends read fan list" on public.user_artists for select to authenticated
  using (not is_dismissed and public.can_view_fan_list((select auth.uid()), user_id));

create policy "own snapshots" on public.artist_listening_snapshots for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own saved" on public.saved_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own dismissals" on public.event_dismissals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Intentions: private ones are never visible to anyone else, including via direct API reads.
create policy "own intentions" on public.event_interests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "friends read shared intentions" on public.event_interests for select to authenticated
  using (visibility = 'friends' and public.are_friends((select auth.uid()), user_id));

create policy "participants read" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, recipient_id));

create policy "own blocks" on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "own invites" on public.friend_invites for select to authenticated
  using (inviter_id = (select auth.uid()));

create policy "own preferences" on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- notification_jobs, job_runs, venue_provider_ids: no client policies (service role only).

-- A user may point home_location_id only at one of their own locations.
create or replace function public.check_home_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.home_location_id is not null and not exists (
    select 1 from public.user_locations where id = new.home_location_id and user_id = new.id
  ) then
    raise exception 'home location must belong to the user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_check_home_location
  before insert or update of home_location_id on public.users
  for each row execute function public.check_home_location();

-- ---------------------------------------------------------------------------
-- Rate limiting for social mutations
-- ---------------------------------------------------------------------------

create table public.rate_limit_events (
  user_id uuid not null references public.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_idx on public.rate_limit_events (user_id, action, created_at desc);
alter table public.rate_limit_events enable row level security;

create or replace function public.enforce_rate_limit(p_action text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid and action = p_action and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'rate limit exceeded for %', p_action using errcode = 'P0429';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
  delete from public.rate_limit_events
  where user_id = v_uid and action = p_action and created_at < now() - interval '2 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- Social RPCs
-- ---------------------------------------------------------------------------

create or replace function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Names and avatars for users the caller has a relationship with (friend or pending request).
create or replace function public.get_profiles(p_ids uuid[])
returns table (id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name, u.avatar_url
  from public.users u
  where u.id = any (p_ids)
    and u.deleted_at is null
    and (
      u.id = auth.uid()
      or (
        not public.is_blocked_between(auth.uid(), u.id)
        and exists (
          select 1 from public.friendships f
          where f.user_low = least(auth.uid(), u.id) and f.user_high = greatest(auth.uid(), u.id)
            and f.status in ('accepted', 'pending')
        )
      )
    );
$$;

create or replace function public.create_friend_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_token text;
begin
  perform public.enforce_rate_limit('create_invite', 20, interval '1 day');
  insert into public.friend_invites (inviter_id) values (v_uid) returning token into v_token;
  return v_token;
end;
$$;

-- Public-safe invite lookup: reveals only the inviter's display name and avatar.
create or replace function public.get_invite(p_token text)
returns table (inviter_id uuid, display_name text, avatar_url text, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name, u.avatar_url, i.expires_at < now()
  from public.friend_invites i
  join public.users u on u.id = i.inviter_id
  where i.token = p_token
    and u.deleted_at is null
    and auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), u.id);
$$;

create or replace function public.send_friend_request(p_recipient uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_existing public.friendships;
  v_id uuid;
begin
  if p_recipient = v_uid then
    raise exception 'cannot befriend yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_recipient and deleted_at is null) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(v_uid, p_recipient) then
    -- Do not reveal the block; behave like a missing user.
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  perform public.enforce_rate_limit('friend_request', 30, interval '1 hour');

  select * into v_existing from public.friendships
  where user_low = least(v_uid, p_recipient) and user_high = greatest(v_uid, p_recipient)
  for update;

  if found then
    if v_existing.status = 'accepted' then
      return v_existing.id;
    elsif v_existing.status = 'pending' and v_existing.recipient_id = v_uid then
      -- They already asked us: accept.
      update public.friendships set status = 'accepted' where id = v_existing.id;
      return v_existing.id;
    elsif v_existing.status = 'pending' then
      return v_existing.id;
    else
      update public.friendships
      set requester_id = v_uid, recipient_id = p_recipient, status = 'pending'
      where id = v_existing.id;
      v_id := v_existing.id;
    end if;
  else
    insert into public.friendships (requester_id, recipient_id)
    values (v_uid, p_recipient)
    returning id into v_id;
  end if;

  insert into public.notification_jobs (user_id, actor_id, notification_type, scheduled_at, deduplication_key)
  values (p_recipient, v_uid, 'friend_request', now(), 'friend_request:' || v_id || ':' || extract(epoch from now())::bigint)
  on conflict (deduplication_key) do nothing;

  return v_id;
end;
$$;

create or replace function public.accept_friend_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_inviter uuid;
begin
  select inviter_id into v_inviter from public.friend_invites
  where token = p_token and expires_at > now();
  if v_inviter is null then
    raise exception 'invite not found or expired' using errcode = 'P0002';
  end if;
  return public.send_friend_request(v_inviter);
end;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  update public.friendships
  set status = case when p_accept then 'accepted'::public.friendship_status else 'declined'::public.friendship_status end
  where id = p_friendship_id and recipient_id = v_uid and status = 'pending';
  if not found then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.friendships
  where user_low = least(v_uid, p_other) and user_high = greatest(v_uid, p_other);
end;
$$;

create or replace function public.block_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_other = v_uid then
    raise exception 'cannot block yourself' using errcode = '22023';
  end if;
  perform public.enforce_rate_limit('block', 50, interval '1 hour');
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, p_other) on conflict do nothing;
  delete from public.friendships
  where user_low = least(v_uid, p_other) and user_high = greatest(v_uid, p_other);
  -- Drop any pending social notifications between the two.
  update public.notification_jobs set status = 'cancelled'
  where status = 'pending'
    and ((user_id = v_uid and actor_id = p_other) or (user_id = p_other and actor_id = v_uid));
end;
$$;

create or replace function public.unblock_user(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.user_blocks where blocker_id = v_uid and blocked_id = p_other;
end;
$$;

-- Accepted friends with explainable overlap (shared artist count), no opaque scores.
create or replace function public.get_friends()
returns table (friend_id uuid, display_name text, avatar_url text, shared_artist_count integer, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name, u.avatar_url,
    case when u.fan_list_visibility = 'friends' then (
      select count(*)::integer
      from public.user_artists mine
      join public.user_artists theirs on theirs.artist_id = mine.artist_id
      where mine.user_id = auth.uid() and not mine.is_dismissed
        and theirs.user_id = u.id and not theirs.is_dismissed
    ) else 0 end,
    f.updated_at
  from public.friendships f
  join public.users u on u.id = case when f.requester_id = auth.uid() then f.recipient_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.recipient_id)
    and f.status = 'accepted'
    and u.deleted_at is null
    and not public.is_blocked_between(auth.uid(), u.id)
  order by u.display_name;
$$;

create or replace function public.get_friend_requests()
returns table (friendship_id uuid, other_id uuid, display_name text, avatar_url text, incoming boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, u.id, u.display_name, u.avatar_url, f.recipient_id = auth.uid(), f.created_at
  from public.friendships f
  join public.users u on u.id = case when f.requester_id = auth.uid() then f.recipient_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.recipient_id)
    and f.status = 'pending'
    and u.deleted_at is null
    and not public.is_blocked_between(auth.uid(), u.id)
  order by f.created_at desc;
$$;

-- Friends' visible intentions for an event.
create or replace function public.get_event_friend_interests(p_event_id uuid)
returns table (user_id uuid, display_name text, avatar_url text, intention public.event_intention, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name, u.avatar_url, ei.intention, ei.updated_at
  from public.event_interests ei
  join public.users u on u.id = ei.user_id
  where ei.event_id = p_event_id
    and ei.visibility = 'friends'
    and u.deleted_at is null
    and public.are_friends(auth.uid(), ei.user_id)
  order by ei.updated_at desc;
$$;

-- Friends' visible intentions across upcoming events (activity feed).
create or replace function public.get_friend_activity(p_limit integer default 30)
returns table (user_id uuid, display_name text, avatar_url text, event_id uuid,
  intention public.event_intention, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name, u.avatar_url, ei.event_id, ei.intention, ei.updated_at
  from public.event_interests ei
  join public.users u on u.id = ei.user_id
  join public.events e on e.id = ei.event_id
  where ei.visibility = 'friends'
    and u.deleted_at is null
    and (e.starts_at is null or e.starts_at > now() - interval '1 day')
    and public.are_friends(auth.uid(), ei.user_id)
  order by ei.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.get_profiles(uuid[]) to authenticated;
grant execute on function public.create_friend_invite() to authenticated;
grant execute on function public.get_invite(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_invite(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.get_event_friend_interests(uuid) to authenticated;
grant execute on function public.get_friend_activity(integer) to authenticated;

-- Notify friends when someone signals they want company or are going (debounced via dedup key).
create or replace function public.queue_friend_interest_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility <> 'friends' or new.intention = 'interested' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.intention = new.intention and old.visibility = new.visibility then
    return new;
  end if;

  insert into public.notification_jobs (user_id, event_id, actor_id, notification_type, scheduled_at, deduplication_key)
  select friend.id, new.event_id, new.user_id, 'friend_interest', now() + interval '2 minutes',
    'friend_interest:' || friend.id || ':' || new.user_id || ':' || new.event_id || ':' || new.intention
  from public.friendships f
  join public.users friend on friend.id = case when f.requester_id = new.user_id then f.recipient_id else f.requester_id end
  where new.user_id in (f.requester_id, f.recipient_id)
    and f.status = 'accepted'
    and not public.is_blocked_between(new.user_id, friend.id)
  on conflict (deduplication_key) do nothing;
  return new;
end;
$$;

create trigger event_interests_notify_friends
  after insert or update on public.event_interests
  for each row execute function public.queue_friend_interest_notifications();
