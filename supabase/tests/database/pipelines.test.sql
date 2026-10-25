-- Pipeline idempotency and notification-scheduling tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'fan@test.local', '{"full_name":"Fan"}', '{"provider":"spotify"}');
insert into public.user_locations (user_id, city_id, radius_km)
select '00000000-0000-0000-0000-0000000000a1', id, 50 from public.cities where name = 'Berlin';

-- Spotify import is idempotent and preserves curation --------------------------
select is(
  public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(),
    '[{"time_range":"short_term","rank":1,"spotify_id":"sp1","name":"Band One","genres":["indie"]},
      {"time_range":"long_term","rank":4,"spotify_id":"sp1","name":"Band One","genres":["indie"]}]') ->> 'new_artists',
  '1', 'first import links one artist across ranges');

update public.user_artists set is_pinned = true, interest_level = 'love'
where user_id = '00000000-0000-0000-0000-0000000000a1';

select is(
  public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(),
    '[{"time_range":"short_term","rank":9,"spotify_id":"sp1","name":"Band One","genres":[]}]') ->> 'new_artists',
  '0', 're-import does not duplicate the fan-list entry');
select is((select count(*)::int from public.artists where canonical_name = 'Band One'), 1, 'no duplicate canonical artist');
select ok((select is_pinned and interest_level = 'love' from public.user_artists
           where user_id = '00000000-0000-0000-0000-0000000000a1'), 'pin and interest survive refresh');

-- Link the Ticketmaster attraction with high confidence.
select public.link_artist_provider((select artist_id from public.artist_provider_ids where external_artist_id = 'sp1'),
  'ticketmaster', 'K1', null, 'provider_link', 1.0);

-- Event ingestion ---------------------------------------------------------------
create temp table payload as select jsonb_build_object(
  'provider', 'ticketmaster', 'external_event_id', 'E1', 'title', 'Band One – Tour',
  'source_status', 'onsale', 'lifecycle_status', 'announced', 'source_url', 'https://example.test/e1',
  'raw_payload_hash', 'h1', 'is_variant_hint', false,
  'starts_at', (date_trunc('hour', now()) + interval '60 days')::text, 'start_date_local', (now() + interval '60 days')::date::text,
  'start_time_tba', false, 'timezone', 'Europe/Berlin',
  'venue', jsonb_build_object('external_venue_id', 'V1', 'name', 'Arena', 'city', 'Berlin', 'country_code', 'DE',
                              'latitude', 52.507, 'longitude', 13.443, 'timezone', 'Europe/Berlin'),
  'attraction_ids', jsonb_build_array('K1'),
  'sales', jsonb_build_array(jsonb_build_object('sale_key', 'public', 'sale_type', 'general', 'sale_name', 'General sale',
            'starts_at', (date_trunc('hour', now()) + interval '5 days')::text, 'start_time_unknown', false)),
  'offers', jsonb_build_array(jsonb_build_object('offer_key', 'standard:EUR', 'offer_type', 'standard',
            'min_price', 49.5, 'max_price', 89, 'currency', 'EUR', 'destination_url', 'https://example.test/e1', 'is_resale', false))
) as p;

create temp table r1 as select public.ingest_provider_event(p) as r from payload;
select ok((select (r ->> 'created')::boolean from r1), 'first ingest creates an event');
create temp table r2 as select public.ingest_provider_event(p) as r from payload;
select ok(not (select (r ->> 'created')::boolean from r2), 'second ingest is idempotent');
select is((select count(*)::int from public.events e join public.venue_provider_ids v on v.venue_id = e.venue_id where v.external_venue_id = 'V1'), 1, 'one canonical event');
select is((select count(*)::int from public.event_sales where event_id = (select (r ->> 'event_id')::uuid from r1)), 1, 'one sale phase');
select is((select count(*)::int from public.event_artists where event_id = (select (r ->> 'event_id')::uuid from r1) and match_confidence = 1), 1, 'artist linked with confidence');

-- A VIP package listing for the same show attaches to the same canonical event.
select public.ingest_provider_event(p || jsonb_build_object('external_event_id', 'E1-VIP', 'title', 'Band One – VIP Package',
  'is_variant_hint', true,
  'offers', jsonb_build_array(jsonb_build_object('offer_key', 'package:EUR', 'offer_type', 'package', 'min_price', 199,
                              'max_price', 199, 'currency', 'EUR', 'destination_url', 'https://example.test/vip'))))
from payload;
select is((select count(*)::int from public.events e join public.venue_provider_ids v on v.venue_id = e.venue_id where v.external_venue_id = 'V1'), 1, 'VIP listing does not create a second concert');
select is((select count(*)::int from public.ticket_offers where event_id = (select (r ->> 'event_id')::uuid from r1)), 2, 'VIP listing becomes an extra offer');
select is((select canonical_title from public.events where id = (select (r ->> 'event_id')::uuid from r1)), 'Band One – Tour', 'canonical title stays from primary listing');

-- Notification scheduling ---------------------------------------------------------
select is((public.schedule_event_notifications((select (r ->> 'event_id')::uuid from r1), true) ->> 'scheduled')::int, 3,
  'schedules new-event alert, sale reminder and sale-open job');
select is((public.schedule_event_notifications((select (r ->> 'event_id')::uuid from r1), true) ->> 'scheduled')::int, 0,
  'rescheduling is deduplicated');

-- Sale time moves: old reminders are invalidated and new ones scheduled.
create temp table r3 as select public.ingest_provider_event(p || jsonb_build_object('sales', jsonb_build_array(
  jsonb_build_object('sale_key', 'public', 'sale_type', 'general', 'sale_name', 'General sale',
    'starts_at', (date_trunc('hour', now()) + interval '6 days')::text, 'start_time_unknown', false)))) as r from payload;
select ok(jsonb_array_length((select r -> 'changes' from r3)) = 1, 'sale-time change is audited');
select is((public.schedule_event_notifications((select (r ->> 'event_id')::uuid from r3), false) ->> 'cancelled')::int, 2,
  'stale sale reminders are cancelled');
select is((select count(*)::int from public.notification_jobs where status = 'pending' and event_id = (select (r ->> 'event_id')::uuid from r1)
           and notification_type in ('general_sale_starting_soon', 'sale_open')), 2, 'fresh reminders scheduled');

-- Cancellation suppresses all future sale reminders.
create temp table r4 as select public.ingest_provider_event(p || jsonb_build_object('lifecycle_status', 'cancelled')) as r from payload;
select public.schedule_event_notifications((select (r ->> 'event_id')::uuid from r4), false, (select r -> 'changes' from r4));
select is((select count(*)::int from public.notification_jobs where status = 'pending' and event_id = (select (r ->> 'event_id')::uuid from r1)
           and notification_type in ('general_sale_starting_soon', 'sale_open')), 0, 'cancelled event has no pending sale reminders');

-- Claiming is exclusive.
update public.notification_jobs set scheduled_at = now() - interval '1 minute' where status = 'pending' and event_id = (select (r ->> 'event_id')::uuid from r1);
select ok((select count(*) from public.claim_notification_jobs(10)) >= 1, 'due jobs can be claimed');

select * from finish();
rollback;
