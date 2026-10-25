-- Listening insights: automatic levels, long-time fans and pruning.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'listener@test.local', '{"full_name":"Listener"}', '{"provider":"spotify"}');

create temp table items(j jsonb);
-- LT: all-time + 6 months (long-time fan) · ST: 6 months only (steady)
-- RO: 4 weeks only (rotation) · KEEP: 4 weeks only, but the user will set a level
insert into items values ('[
  {"time_range":"long_term","rank":1,"spotify_id":"lis-LT","name":"LT"},
  {"time_range":"medium_term","rank":2,"spotify_id":"lis-LT","name":"LT"},
  {"time_range":"medium_term","rank":1,"spotify_id":"lis-ST","name":"ST"},
  {"time_range":"short_term","rank":1,"spotify_id":"lis-RO","name":"RO"},
  {"time_range":"short_term","rank":2,"spotify_id":"lis-KEEP","name":"KEEP"},
  {"time_range":"short_term","rank":3,"spotify_id":"lis-CORE","name":"CORE"},
  {"time_range":"medium_term","rank":3,"spotify_id":"lis-CORE","name":"CORE"},
  {"time_range":"long_term","rank":3,"spotify_id":"lis-CORE","name":"CORE"}
]');

select public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(), j) from items;

create temp view levels as
select a.canonical_name as name, ua.interest_level::text as level, ua.long_time_fan_since is not null as long_time
from public.user_artists ua join public.artists a on a.id = ua.artist_id
where ua.user_id = '00000000-0000-0000-0000-0000000000e1';

select is((select level from levels where name = 'LT'), 'like', 'long-time fan becomes like');
select ok((select long_time from levels where name = 'LT'), 'long-time fan is flagged');
select is((select level from levels where name = 'ST'), 'like', 'steady favourite becomes like');
select ok(not (select long_time from levels where name = 'ST'), 'one range is not long-time');
select is((select level from levels where name = 'RO'), 'curious', 'rotation-only stays curious');
select is((select level from levels where name = 'CORE'), 'love', 'all three ranges becomes love');

-- The user chooses a level for KEEP; it must never be pruned or changed.
update public.user_artists set interest_level = 'curious', interest_source = 'user'
where artist_id = (select artist_id from public.artist_provider_ids where external_artist_id = 'lis-KEEP');

-- Next sync: everyone dropped out of every range except a brand-new short-term artist.
select public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(),
  '[{"time_range":"short_term","rank":1,"spotify_id":"lis-NEW","name":"NEW"}]');

select ok(exists (select 1 from levels where name = 'LT' and level = 'like' and long_time), 'long-time fan never drops out');
select ok(exists (select 1 from levels where name = 'ST' and level = 'like'), 'steady favourite is kept');
select ok(not exists (select 1 from levels where name = 'RO'), 'rotation-only artist is pruned after leaving every range');
select ok(exists (select 1 from levels where name = 'KEEP'), 'user-chosen level is never pruned');

-- A failed short-term range must never prune anything.
select public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(),
  '[{"time_range":"long_term","rank":1,"spotify_id":"lis-LT","name":"LT"}]');
select ok(exists (select 1 from levels where name = 'NEW'), 'no pruning without a fresh short-term list');

-- Auto levels are only ever upgraded: NEW reaching 6 months becomes like.
select public.import_spotify_top_artists('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(),
  '[{"time_range":"medium_term","rank":4,"spotify_id":"lis-NEW","name":"NEW"},{"time_range":"short_term","rank":1,"spotify_id":"lis-NEW","name":"NEW"}]');
select is((select level from levels where name = 'NEW'), 'like', 'rotation artist that sticks around is upgraded');
select is((select level from levels where name = 'CORE'), 'love', 'automatic love is never lowered after dropping out');

select * from finish();
rollback;
