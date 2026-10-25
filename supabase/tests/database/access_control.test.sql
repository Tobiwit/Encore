-- Access-control tests: run with `pnpm db:test` (supabase test db).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', '{"full_name":"Alex","provider_id":"spotify-a"}', '{"provider":"spotify"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', '{"full_name":"Bo","provider_id":"spotify-b"}', '{"provider":"spotify"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local', '{"full_name":"Cam","provider_id":"spotify-c"}', '{"provider":"spotify"}');

insert into public.connected_accounts (user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted)
values ('00000000-0000-0000-0000-00000000000a', 'spotify', 'spotify-a', 'secret-access', 'secret-refresh');

insert into public.artists (id, canonical_name, metadata_source) values
  ('10000000-0000-0000-0000-000000000001', 'Shared Artist', 'spotify');
insert into public.user_artists (user_id, artist_id, added_source) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'manual'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'manual');

insert into public.events (id, canonical_title, starts_at, lifecycle_status) values
  ('20000000-0000-0000-0000-000000000001', 'Test Show', now() + interval '30 days', 'announced');
insert into public.event_interests (user_id, event_id, intention, visibility) values
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'going', 'friends');

select ok(exists (select 1 from public.users where id = '00000000-0000-0000-0000-00000000000a' and display_name = 'Alex'),
  'auth trigger creates app user from Spotify metadata');
select ok(exists (select 1 from public.notification_preferences where user_id = '00000000-0000-0000-0000-00000000000a'),
  'auth trigger creates default notification preferences');

-- Anonymous ------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.events $$, '42501', null, 'anon cannot read events');
reset role;

-- As A (not yet friends with B) -----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.users), 1, 'A sees only their own users row');
select throws_ok($$ select access_token_encrypted from public.connected_accounts $$, '42501', null,
  'A cannot read even their own encrypted access token');
select is((select status::text from public.connected_accounts), 'active', 'A can read their connection status');
select is((select count(*)::int from public.user_artists where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'non-friend cannot read B fan list');
select is((select count(*)::int from public.event_interests where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'non-friend cannot read B intentions');
select throws_ok(
  $$ insert into public.user_artists (user_id, artist_id, added_source)
     values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'manual') $$,
  '42501', null, 'A cannot write to B fan list');
update public.user_artists set is_pinned = true where user_id = '00000000-0000-0000-0000-00000000000b';
select throws_ok($$ insert into public.events (canonical_title) values ('Fake') $$, '42501', null,
  'clients cannot create events');
select throws_ok($$ update public.ticket_offers set min_price = 1 $$, '42501', null,
  'clients cannot modify ticket offers');
select throws_ok($$ select public.ingest_provider_event('{}'::jsonb) $$, '42501', null,
  'clients cannot call ingestion');
select throws_ok($$ select * from public.notification_jobs $$, '42501', null,
  'clients cannot read notification jobs');
select throws_ok($$ update public.users set spotify_user_id = 'hijack' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'A cannot change identity columns');
select is((select count(*)::int from public.get_profiles(array['00000000-0000-0000-0000-00000000000b'::uuid])), 0,
  'get_profiles hides unrelated users');

-- Friend request A -> B
select lives_ok($$ select public.send_friend_request('00000000-0000-0000-0000-00000000000b') $$, 'A sends request to B');
select throws_ok(
  $$ select public.respond_friend_request((select id from public.friendships limit 1), true) $$,
  'P0002', null, 'requester cannot accept their own request');
reset role;

select ok(not (select is_pinned from public.user_artists where user_id = '00000000-0000-0000-0000-00000000000b'),
  'A update to B fan list affected no rows');

-- As B: accept ----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.respond_friend_request((select id from public.friendships limit 1), true) $$,
  'recipient accepts request');
insert into public.event_interests (user_id, event_id, intention, visibility)
select '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'interested', 'private'
on conflict (user_id, event_id) do nothing;
reset role;

-- As A: friends now ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.user_artists where user_id = '00000000-0000-0000-0000-00000000000b'), 1,
  'friend can read B fan list');
select is((select shared_artist_count from public.get_friends()), 1, 'shared artist count is explainable');
select is((select count(*)::int from public.get_event_friend_interests('20000000-0000-0000-0000-000000000001')), 1,
  'friend sees B friends-visible intention');
reset role;

-- B hides the intention and the fan list.
update public.event_interests set visibility = 'private' where user_id = '00000000-0000-0000-0000-00000000000b';
update public.users set fan_list_visibility = 'private' where id = '00000000-0000-0000-0000-00000000000b';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.event_interests where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'hidden intention is invisible via direct table read');
select is((select count(*)::int from public.user_artists where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'private fan list is invisible to friends');
reset role;

update public.event_interests set visibility = 'friends' where user_id = '00000000-0000-0000-0000-00000000000b';

-- B blocks A: blocking overrides friendship.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.block_user('00000000-0000-0000-0000-00000000000a') $$, 'B blocks A');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.event_interests where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'blocked user cannot see intentions');
select throws_ok($$ select public.send_friend_request('00000000-0000-0000-0000-00000000000b') $$, 'P0002', null,
  'blocked user cannot re-send a request (block not revealed)');
reset role;

-- C cannot point home location at someone else's location.
insert into public.user_locations (id, user_id, city_id)
select '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', id from public.cities where name = 'Berlin';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select throws_ok(
  $$ update public.users set home_location_id = '30000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-00000000000c' $$,
  '42501', null, 'home location must belong to the user');
reset role;

select * from finish();
rollback;
