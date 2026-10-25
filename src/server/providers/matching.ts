import { normalizeName } from "@/lib/text";
import type { ArtistMatch, ProviderAttraction } from "./types";

/** Confidence at or above which a match may trigger notifications (mirrors event_audience()). */
export const NOTIFY_CONFIDENCE = 0.9;
const NAME_ONLY_CONFIDENCE = 0.7;

function spotifyIdFromUrl(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]{22})/);
  return m?.[1] ?? null;
}

/**
 * Match a canonical artist to a provider attraction. A Spotify link on the attraction is
 * authoritative. A normalised-name match is only a fallback, and only when it is unique;
 * it is stored below the notification threshold so it never triggers alerts by itself.
 */
export function matchAttraction(
  artist: { name: string; spotifyId: string | null },
  candidates: ProviderAttraction[],
): ArtistMatch {
  if (candidates.length === 0) return { kind: "none", reason: "no_candidates" };

  if (artist.spotifyId) {
    const linked = candidates.filter((c) => c.spotifyUrls.some((u) => spotifyIdFromUrl(u) === artist.spotifyId));
    if (linked.length === 1) {
      return { kind: "linked", attraction: linked[0], method: "provider_link", confidence: 1 };
    }
    if (linked.length > 1) return { kind: "none", reason: "ambiguous" };
  }

  const target = normalizeName(artist.name);
  const sameName = candidates.filter((c) => target !== null && normalizeName(c.name) === target);
  if (sameName.length === 0) return { kind: "none", reason: "no_exact_match" };
  if (sameName.length > 1) return { kind: "none", reason: "ambiguous" };

  // A same-name attraction that links to a *different* Spotify artist is not our artist.
  const other = sameName[0].spotifyUrls.map(spotifyIdFromUrl).filter(Boolean);
  if (artist.spotifyId && other.length > 0 && !other.includes(artist.spotifyId)) {
    return { kind: "none", reason: "no_exact_match" };
  }

  return { kind: "linked", attraction: sameName[0], method: "exact_name", confidence: NAME_ONLY_CONFIDENCE };
}
