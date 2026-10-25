"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import { bestImage, searchArtists, SpotifyAuthError, type SpotifyArtist } from "@/server/spotify/client";
import { searchConcertsForArtist } from "@/server/jobs/events";
import { getValidAccessToken } from "@/server/spotify/sync";
import type { ActionResult } from "./events";

const prefSchema = z
  .object({
    interest_level: z.enum(["love", "like", "curious"]).optional(),
    is_pinned: z.boolean().optional(),
    notify_enabled: z.boolean().optional(),
    is_dismissed: z.boolean().optional(),
  })
  .strict();

export async function updateArtistPreference(artistId: string, patch: z.input<typeof prefSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.uuid().safeParse(artistId);
  const parsed = prefSchema.safeParse(patch);
  if (!id.success || !parsed.success || Object.keys(parsed.data).length === 0) return { ok: false, error: "Invalid request" };

  const supabase = await createClient();
  // An explicit interest choice is the user's: the listening-insights algorithm never overrides it.
  const update = parsed.data.interest_level ? { ...parsed.data, interest_source: "user" as const } : parsed.data;
  const { error } = await supabase.from("user_artists").update(update).eq("user_id", user.id).eq("artist_id", id.data);
  if (error) return { ok: false, error: "Could not save your change. Please try again." };
  revalidatePath("/artists");
  revalidatePath(`/artists/${id.data}`);
  revalidatePath("/discover");
  return { ok: true };
}

/**
 * Removing keeps a dismissed row (rather than deleting) so the weekly Spotify import does not
 * silently re-add an artist the user removed. The canonical artist record is untouched.
 */
export async function removeArtist(artistId: string): Promise<ActionResult> {
  return updateArtistPreference(artistId, { is_dismissed: true, is_pinned: false });
}

export async function restoreArtist(artistId: string): Promise<ActionResult> {
  return updateArtistPreference(artistId, { is_dismissed: false });
}

/** Follow an artist that already exists in the catalogue (e.g. suggested by a friend). */
export async function followArtist(artistId: string, source: "friend_suggestion" | "discovery" = "discovery"): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.uuid().safeParse(artistId);
  if (!id.success) return { ok: false, error: "Invalid artist" };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("user_artists").select("id").eq("user_id", user.id).eq("artist_id", id.data).maybeSingle();
  const { error } = existing
    ? await supabase.from("user_artists").update({ is_dismissed: false }).eq("id", existing.id)
    : await supabase.from("user_artists").insert({ user_id: user.id, artist_id: id.data, added_source: source, interest_level: "curious" });
  if (error) return { ok: false, error: "Could not add this artist." };
  searchConcertsSoon(id.data);
  revalidatePath("/artists");
  revalidatePath(`/artists/${id.data}`);
  return { ok: true };
}

/** Look a newly followed artist up on Ticketmaster right after responding (see searchConcertsForArtist). */
function searchConcertsSoon(artistId: string) {
  after(() => searchConcertsForArtist(createAdminClient(), artistId));
}

export type ArtistSearchResult = { spotifyId: string; name: string; imageUrl: string | null; genres: string[]; followed: boolean };

async function spotifyTokenFor(userId: string) {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("connected_accounts")
    .select("id, user_id, access_token_encrypted, refresh_token_encrypted, expires_at, status")
    .eq("user_id", userId)
    .eq("provider", "spotify")
    .maybeSingle();
  if (!account || account.status !== "active") return null;
  return getValidAccessToken(admin, account);
}

export async function searchSpotifyArtists(query: string): Promise<{ ok: true; results: ArtistSearchResult[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const q = z.string().trim().min(2).max(80).safeParse(query);
  if (!q.success) return { ok: true, results: [] };

  let artists: SpotifyArtist[];
  try {
    const token = await spotifyTokenFor(user.id);
    if (!token) return { ok: false, error: "Reconnect Spotify to search for artists." };
    artists = await searchArtists(token, q.data);
  } catch (error) {
    if (error instanceof SpotifyAuthError) return { ok: false, error: "Your Spotify connection needs to be renewed. Reconnect in Profile." };
    return { ok: false, error: "Search is unavailable right now. Please try again in a moment." };
  }

  const supabase = await createClient();
  const ids = artists.map((a) => a.id);
  const { data: known } = await supabase
    .from("artist_provider_ids")
    .select("external_artist_id, artist_id")
    .eq("provider", "spotify")
    .in("external_artist_id", ids.length ? ids : ["-"]);
  const artistIds = (known ?? []).map((k) => k.artist_id);
  const { data: mine } = await supabase
    .from("user_artists")
    .select("artist_id")
    .eq("user_id", user.id)
    .eq("is_dismissed", false)
    .in("artist_id", artistIds.length ? artistIds : ["00000000-0000-0000-0000-000000000000"]);
  const followedArtistIds = new Set((mine ?? []).map((m) => m.artist_id));
  const followedSpotify = new Set((known ?? []).filter((k) => followedArtistIds.has(k.artist_id)).map((k) => k.external_artist_id));

  return {
    ok: true,
    results: artists.map((a) => ({
      spotifyId: a.id,
      name: a.name,
      imageUrl: bestImage(a.images),
      genres: (a.genres ?? []).slice(0, 2),
      followed: followedSpotify.has(a.id),
    })),
  };
}

/**
 * Adds a Spotify artist chosen from search. The client sends only the Spotify ID; name and
 * imagery are re-read from Spotify server-side so the catalogue never stores client-supplied data.
 */
export async function addSpotifyArtist(spotifyId: string, searchQuery: string): Promise<ActionResult & { artistId?: string }> {
  const user = await requireUser();
  const id = z.string().regex(/^[A-Za-z0-9]{22}$/).safeParse(spotifyId);
  const q = z.string().trim().min(2).max(80).safeParse(searchQuery);
  if (!id.success || !q.success) return { ok: false, error: "Invalid artist" };

  let artist: SpotifyArtist | undefined;
  try {
    const token = await spotifyTokenFor(user.id);
    if (!token) return { ok: false, error: "Reconnect Spotify to add artists." };
    artist = (await searchArtists(token, q.data)).find((a) => a.id === id.data);
  } catch {
    return { ok: false, error: "Spotify is unavailable right now. Please try again." };
  }
  if (!artist) return { ok: false, error: "That artist could not be verified on Spotify." };

  const admin = createAdminClient();
  const { data: artistId, error } = await admin.rpc("ensure_spotify_artist", {
    p_spotify_id: artist.id,
    p_name: artist.name,
    p_image_url: bestImage(artist.images) ?? "",
    p_genres: artist.genres ?? [],
    p_external_url: artist.external_urls?.spotify ?? "",
  });
  if (error || !artistId) return { ok: false, error: "Could not add this artist." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("user_artists").select("id").eq("user_id", user.id).eq("artist_id", artistId).maybeSingle();
  const { error: linkError } = existing
    ? await supabase.from("user_artists").update({ is_dismissed: false }).eq("id", existing.id)
    : await supabase.from("user_artists").insert({ user_id: user.id, artist_id: artistId, added_source: "manual" });
  if (linkError) return { ok: false, error: "Could not add this artist." };

  searchConcertsSoon(artistId);
  revalidatePath("/artists");
  return { ok: true, artistId };
}
