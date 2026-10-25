-- Back-filled events are stored but never treated as announcements.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.artists (id, canonical_name, metadata_source) values ('f0000000-0000-0000-0000-000000000001', 'Backfill Band', 'spotify');
insert into public.artist_provider_ids (artist_id, provider, external_artist_id) values ('f0000000-0000-0000-0000-000000000001', 'ticketmaster', 'BF-1');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'bf@test.local');
insert into public.user_artists (user_id, artist_id, added_source) values ('00000000-0000-0000-0000-0000000000f9', 'f0000000-0000-0000-0000-000000000001', 'manual');

select is((select first_fetch from public.artists_due_for_event_refresh('ticketmaster', 1000) where artist_id = 'f0000000-0000-0000-0000-000000000001'),
  true, 'an artist never fetched is flagged as first fetch');

create temp table base as select jsonb_build_object(
  'provider', 'ticketmaster', 'title', 'Backfill Band live', 'lifecycle_status', 'announced', 'raw_payload_hash', 'x',
  'starts_at', (now() + interval '90 days')::text, 'attraction_ids', jsonb_build_array('BF-1'), 'sales', '[]'::jsonb, 'offers', '[]'::jsonb) as p;

create temp table r_old as select public.ingest_provider_event(p || '{"external_event_id":"BF-E1","is_backfill":true}') as r from base;
select ok((select announced_at is null from public.events where id = (select (r ->> 'event_id')::uuid from r_old)),
  'event found during the first fetch has no announcement time');

select public.mark_artist_events_refreshed('f0000000-0000-0000-0000-000000000001');
update public.artists set events_refreshed_at = now() - interval '1 day' where id = 'f0000000-0000-0000-0000-000000000001';
select is((select first_fetch from public.artists_due_for_event_refresh('ticketmaster', 1000) where artist_id = 'f0000000-0000-0000-0000-000000000001'),
  false, 'later refreshes are not first fetches');

create temp table r_new as select public.ingest_provider_event(p || '{"external_event_id":"BF-E2","is_backfill":false}') as r from base;
select ok((select announced_at is not null from public.events where id = (select (r ->> 'event_id')::uuid from r_new)),
  'event that appears on a later fetch is an announcement');

select * from finish();
rollback;
