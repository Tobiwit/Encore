-- Canonical artist creation for manual additions. Called by the server after it has verified the
-- artist against Spotify with the user's own token; clients can never create catalogue rows.
create or replace function public.ensure_spotify_artist(p_spotify_id text, p_name text, p_image_url text,
                                                        p_genres text[], p_external_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artist_id uuid;
begin
  select artist_id into v_artist_id from public.artist_provider_ids
  where provider = 'spotify' and external_artist_id = p_spotify_id;
  if v_artist_id is not null then
    return v_artist_id;
  end if;

  insert into public.artists (canonical_name, image_url, genres, metadata_source)
  values (p_name, nullif(p_image_url, ''), coalesce(p_genres, '{}'), 'spotify')
  returning id into v_artist_id;

  insert into public.artist_provider_ids (artist_id, provider, external_artist_id, external_url)
  values (v_artist_id, 'spotify', p_spotify_id, nullif(p_external_url, ''))
  on conflict (provider, external_artist_id) do nothing;

  if not found then
    delete from public.artists where id = v_artist_id;
    select artist_id into v_artist_id from public.artist_provider_ids
    where provider = 'spotify' and external_artist_id = p_spotify_id;
  end if;
  return v_artist_id;
end;
$$;

revoke all on function public.ensure_spotify_artist(text, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.ensure_spotify_artist(text, text, text, text[], text) to service_role;

-- Friend-sourced artist suggestions: artists on friends' visible fan lists that the caller
-- does not follow (or has not dismissed), with an explainable friend count.
create or replace function public.get_friend_artist_suggestions(p_limit integer default 12)
returns table (artist_id uuid, canonical_name text, image_url text, friend_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.canonical_name, a.image_url, count(distinct ua.user_id)::integer
  from public.user_artists ua
  join public.artists a on a.id = ua.artist_id
  where ua.user_id <> auth.uid()
    and not ua.is_dismissed
    and ua.interest_level in ('love', 'like')
    and public.can_view_fan_list(auth.uid(), ua.user_id)
    and not exists (select 1 from public.user_artists mine where mine.user_id = auth.uid() and mine.artist_id = ua.artist_id)
  group by a.id
  order by count(distinct ua.user_id) desc, a.canonical_name
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.get_friend_artist_suggestions(integer) to authenticated;
