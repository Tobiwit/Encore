import "server-only";
import { latestRanks, listeningStatus, type Ranks, type TimeRange } from "@/lib/listening";
import type { InterestLevel } from "@/lib/ranking";
import type { createClient } from "@/lib/supabase/server";
import type { ArtistSummary, FriendFace } from "@/lib/types";
import { getEventSummaries } from "./events";

type Client = Awaited<ReturnType<typeof createClient>>;

type Row = {
  artist_id: string;
  interest_level: InterestLevel;
  is_pinned: boolean;
  is_dismissed: boolean;
  notify_enabled: boolean;
  added_source: ArtistSummary["source"];
  interest_source: "auto" | "user";
  long_time_fan_since: string | null;
  artist: { id: string; canonical_name: string; image_url: string | null; genres: string[] } | null;
};

function toSummary(r: Row, upcoming: Map<string, number>, ranks: Map<string, Ranks> = new Map()): ArtistSummary {
  const artistRanks = ranks.get(r.artist_id);
  return {
    id: r.artist_id,
    name: r.artist?.canonical_name ?? "Unknown artist",
    imageUrl: r.artist?.image_url ?? null,
    genres: r.artist?.genres ?? [],
    interest: r.interest_level,
    pinned: r.is_pinned,
    notify: r.notify_enabled,
    source: r.added_source,
    upcomingCount: upcoming.get(r.artist_id) ?? 0,
    ranks: artistRanks,
    status: listeningStatus(artistRanks, r.long_time_fan_since),
    longTimeFanSince: r.long_time_fan_since,
    interestSource: r.interest_source,
  };
}

export async function getMyArtists(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from("user_artists")
    .select(
      "artist_id, interest_level, is_pinned, is_dismissed, notify_enabled, added_source, interest_source, long_time_fan_since, artist:artists(id, canonical_name, image_url, genres)",
    )
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load artists: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  // At most three batches are retained per user, so this stays small (≤ 3 × 150 rows).
  const { data: snapshots } = await supabase
    .from("artist_listening_snapshots")
    .select("artist_id, time_range, rank, batch_id, synced_at")
    .eq("user_id", userId);
  const ranks = latestRanks((snapshots ?? []) as { artist_id: string; time_range: TimeRange; rank: number; batch_id: string; synced_at: string }[]);

  const activeIds = rows.filter((r) => !r.is_dismissed).map((r) => r.artist_id);
  const upcoming = new Map<string, number>();
  for (let i = 0; i < activeIds.length; i += 100) {
    const { data: ea } = await supabase
      .from("event_artists")
      .select("artist_id, event:events!inner(starts_at, lifecycle_status)")
      .in("artist_id", activeIds.slice(i, i + 100))
      .gte("event.starts_at", new Date().toISOString())
      .not("event.lifecycle_status", "in", "(cancelled,ended)");
    for (const r of ea ?? []) upcoming.set(r.artist_id, (upcoming.get(r.artist_id) ?? 0) + 1);
  }

  const order: Record<InterestLevel, number> = { love: 0, like: 1, curious: 2 };
  const active = rows
    .filter((r) => !r.is_dismissed)
    .map((r) => toSummary(r, upcoming, ranks))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || order[a.interest] - order[b.interest] || a.name.localeCompare(b.name));
  const removed = rows.filter((r) => r.is_dismissed).map((r) => toSummary(r, upcoming, ranks));
  return { active, removed };
}

export type TasteStats = {
  total: number;
  byInterest: Record<InterestLevel, number>;
  pinned: number;
  imported: number;
  manual: number;
  topGenres: { genre: string; count: number }[];
  withUpcoming: number;
  longTime: number;
  rotation: number;
};

export function computeTasteStats(artists: ArtistSummary[]): TasteStats {
  const genres = new Map<string, number>();
  for (const a of artists) for (const g of a.genres) genres.set(g, (genres.get(g) ?? 0) + 1);
  return {
    total: artists.length,
    byInterest: {
      love: artists.filter((a) => a.interest === "love").length,
      like: artists.filter((a) => a.interest === "like").length,
      curious: artists.filter((a) => a.interest === "curious").length,
    },
    pinned: artists.filter((a) => a.pinned).length,
    imported: artists.filter((a) => a.source === "spotify_import").length,
    manual: artists.filter((a) => a.source !== "spotify_import").length,
    topGenres: [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count })),
    withUpcoming: artists.filter((a) => (a.upcomingCount ?? 0) > 0).length,
    longTime: artists.filter((a) => a.status === "long_time").length,
    rotation: artists.filter((a) => a.status === "rotation").length,
  };
}

export async function getArtistDetail(supabase: Client, userId: string, artistId: string) {
  const { data: artist } = await supabase.from("artists").select("id, canonical_name, image_url, genres, provider_lookup_at, events_refreshed_at").eq("id", artistId).maybeSingle();
  if (!artist) return null;

  const [{ data: providers }, { data: mine }, { data: ranks }, { data: eventLinks }, { data: friendRows }] = await Promise.all([
    supabase.from("artist_provider_ids").select("provider, external_url, external_artist_id, match_method, match_confidence").eq("artist_id", artistId),
    supabase.from("user_artists").select("interest_level, is_pinned, is_dismissed, notify_enabled, added_source, interest_source, long_time_fan_since, created_at").eq("user_id", userId).eq("artist_id", artistId).maybeSingle(),
    supabase.from("artist_listening_snapshots").select("time_range, rank, synced_at").eq("user_id", userId).eq("artist_id", artistId).order("synced_at", { ascending: false }).limit(6),
    supabase
      .from("event_artists")
      .select("event_id, event:events!inner(starts_at)")
      .eq("artist_id", artistId)
      .gte("match_confidence", 0.7)
      .or(`starts_at.gte.${new Date().toISOString()},starts_at.is.null`, { referencedTable: "event" }),
    // RLS returns only accepted friends whose fan list is visible to us.
    supabase.from("user_artists").select("user_id, interest_level").eq("artist_id", artistId).neq("user_id", userId).eq("is_dismissed", false),
  ]);

  let friends: (FriendFace & { interest: InterestLevel })[] = [];
  if (friendRows?.length) {
    const { data: profiles } = await supabase.rpc("get_profiles", { p_ids: friendRows.map((f) => f.user_id) });
    const level = new Map(friendRows.map((f) => [f.user_id, f.interest_level as InterestLevel]));
    friends = (profiles ?? [])
      .map((p) => ({ id: p.id, name: p.display_name, avatarUrl: p.avatar_url, interest: level.get(p.id) ?? "like" }))
      .sort((a, b) => Number(b.interest === "love") - Number(a.interest === "love"));
  }

  const events = await getEventSummaries(supabase, userId, (eventLinks ?? []).map((e) => e.event_id));
  events.sort((a, b) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity));

  // Most recent rank per time range.
  const latestRanks = new Map<string, number>();
  for (const r of ranks ?? []) if (!latestRanks.has(r.time_range)) latestRanks.set(r.time_range, r.rank);

  const spotify = providers?.find((p) => p.provider === "spotify");
  return {
    artist,
    spotifyUrl: spotify?.external_url ?? (spotify ? `https://open.spotify.com/artist/${spotify.external_artist_id}` : null),
    ticketmaster: providers?.find((p) => p.provider === "ticketmaster") ?? null,
    mine: mine && !mine.is_dismissed ? mine : null,
    wasRemoved: Boolean(mine?.is_dismissed),
    ranks: latestRanks,
    events,
    friends,
  };
}
