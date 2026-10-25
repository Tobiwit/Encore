import { normalizeName } from "@/lib/text";
import { fetchWithRetry } from "@/server/http";

/**
 * Deezer public API, used only for popular tracks and their 30-second previews (Spotify no longer
 * offers either to apps in development mode). No key needed. Audio streams straight from
 * Deezer's CDN and is never stored; preview URLs are signed and expire, so they are fetched at
 * render time (cached briefly) rather than persisted. Attribution and links back are required.
 */

export type DeezerArtistCandidate = { id: number; name: string; nb_fan?: number; link?: string };

export type PreviewTrack = {
  id: string;
  title: string;
  album: string | null;
  coverUrl: string | null;
  previewUrl: string;
  link: string | null;
  durationSec: number | null;
};

export type TopTracksResult =
  | { status: "ok"; tracks: PreviewTrack[]; artistLink: string | null }
  | { status: "not_found" | "unavailable" };

/** A clear winner is required: an exact (normalised) name with ≥3× the fans of any namesake. */
const DOMINANCE = 3;

export function chooseDeezerArtist(name: string, candidates: DeezerArtistCandidate[]): DeezerArtistCandidate | null {
  const target = normalizeName(name);
  if (!target) return null;
  const exact = candidates.filter((c) => normalizeName(c.name) === target).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
  if (exact.length === 0) return null;
  if (exact.length === 1) return exact[0];
  const [first, second] = exact;
  return (first.nb_fan ?? 0) >= DOMINANCE * Math.max(1, second.nb_fan ?? 0) ? first : null;
}

type DeezerTrack = {
  id: number;
  title?: string;
  title_short?: string;
  preview?: string;
  link?: string;
  duration?: number;
  album?: { title?: string; cover_small?: string; cover_medium?: string };
};

export function normalizeTopTracks(data: DeezerTrack[] | undefined, limit: number): PreviewTrack[] {
  const tracks: PreviewTrack[] = [];
  for (const t of data ?? []) {
    if (!t.preview?.startsWith("https://") || !(t.title_short || t.title)) continue;
    tracks.push({
      id: String(t.id),
      title: t.title_short || t.title!,
      album: t.album?.title ?? null,
      coverUrl: t.album?.cover_medium ?? t.album?.cover_small ?? null,
      previewUrl: t.preview,
      link: t.link ?? null,
      durationSec: typeof t.duration === "number" ? t.duration : null,
    });
    if (tracks.length >= limit) break;
  }
  return tracks;
}

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetchWithRetry(
      `https://api.deezer.com${path}`,
      { headers: { accept: "application/json" }, next: { revalidate } } as RequestInit,
      { provider: "deezer", maxAttempts: 2, timeoutMs: 6000 },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as T & { error?: unknown };
    return json.error ? null : json; // Deezer reports errors (incl. quota) with HTTP 200
  } catch {
    return null;
  }
}

export async function getTopTracks(artistName: string, limit = 3): Promise<TopTracksResult> {
  const search = await get<{ data?: DeezerArtistCandidate[] }>(`/search/artist?q=${encodeURIComponent(artistName)}&limit=10`, 7 * 24 * 3600);
  if (!search) return { status: "unavailable" };
  const artist = chooseDeezerArtist(artistName, search.data ?? []);
  if (!artist) return { status: "not_found" };

  // Fetch a few extra in case some tracks have no preview. Short cache: preview URLs expire.
  const top = await get<{ data?: DeezerTrack[] }>(`/artist/${artist.id}/top?limit=${limit + 3}`, 30 * 60);
  if (!top) return { status: "unavailable" };
  const tracks = normalizeTopTracks(top.data, limit);
  return tracks.length ? { status: "ok", tracks, artistLink: artist.link ?? null } : { status: "not_found" };
}
