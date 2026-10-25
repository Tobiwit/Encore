-- Concert-search status and delivery scheduling.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'status@test.local', '{"full_name":"Status"}', '{"provider":"spotify"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'other@test.local', '{"full_name":"Other"}', '{"provider":"spotify"}');

insert into public.artists (id, canonical_name, metadata_source, provider_lookup_at, events_refreshed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'Linked', 'spotify', now(), now()),
  ('d0000000-0000-0000-0000-000000000002', 'Name only', 'spotify', now(), null),
  ('d0000000-0000-0000-0000-000000000003', 'Not found', 'spotify', now(), null),
  ('d0000000-0000-0000-0000-000000000004', 'Pending', 'spotify', null, null);
insert into public.artist_provider_ids (artist_id, provider, external_artist_id, match_method, match_confidence) values
  ('d0000000-0000-0000-0000-000000000001', 'ticketmaster', 'TM-1', 'provider_link', 1.0),
  ('d0000000-0000-0000-0000-000000000002', 'ticketmaster', 'TM-2', 'exact_name', 0.7);
insert into public.user_artists (user_id, artist_id, added_source)
select '00000000-0000-0000-0000-0000000000d1', id, 'spotify_import' from public.artists where id::text like 'd0000000%';
insert into public.job_runs (job_name, status, started_at, finished_at, details) values
  ('daily', 'succeeded', now(), now(),
   '{"matching": {"lastError": "Ticketmaster /attractions.json responded 401"}, "refresh": {}}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select results_eq(
  $$ select followed, checked, found, verified, refreshed from public.get_concert_search_status() $$,
  $$ values (4, 3, 2, 1, 1) $$,
  'status counts followed, checked, found, verified and refreshed artists'
);
select is((select last_run_problem from public.get_concert_search_status()), 'Ticketmaster /attractions.json responded 401',
  'status surfaces the last provider error');
select ok(not (select running from public.get_concert_search_status()), 'no run in progress');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select is((select followed from public.get_concert_search_status()), 0, 'status only counts the caller''s own artists');

select throws_ok($$ select public.trigger_notification_delivery() $$, '42501', null, 'clients cannot trigger delivery');
reset role;

select is(public.trigger_notification_delivery(), null, 'delivery trigger is a no-op without Vault configuration');
select is((select schedule from cron.job where jobname = 'encore-notifications-deliver'), '*/5 * * * *',
  'delivery is scheduled every five minutes');

select * from finish();
rollback;
