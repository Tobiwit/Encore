/**
 * Spotify listening ranks per time range, and the status derived from them. The status rule
 * mirrors public.apply_listening_insights(), which is what actually changes interest levels.
 */

export const RANGES = ["short_term", "medium_term", "long_term"] as const;
export type TimeRange = (typeof RANGES)[number];
export type Ranks = Partial<Record<TimeRange, number>>;

export const RANGE_LABEL: Record<TimeRange, string> = {
  short_term: "Last 4 weeks",
  medium_term: "Last 6 months",
  long_term: "All time",
};
export const RANGE_SHORT: Record<TimeRange, string> = { short_term: "4W", medium_term: "6M", long_term: "All" };

export type ListeningStatus = "long_time" | "steady" | "rotation" | "unranked";

type SnapshotRow = { artist_id: string; time_range: TimeRange; rank: number; batch_id: string; synced_at: string };

/**
 * Latest rank per artist and range. Each range uses its own most recent batch, so a range that
 * failed in the last sync falls back to the previous one instead of disappearing.
 */
export function latestRanks(rows: SnapshotRow[]): Map<string, Ranks> {
  const latestBatch = new Map<TimeRange, { batch: string; at: string }>();
  for (const r of rows) {
    const cur = latestBatch.get(r.time_range);
    if (!cur || r.synced_at > cur.at) latestBatch.set(r.time_range, { batch: r.batch_id, at: r.synced_at });
  }
  const out = new Map<string, Ranks>();
  for (const r of rows) {
    if (latestBatch.get(r.time_range)?.batch !== r.batch_id) continue;
    out.set(r.artist_id, { ...out.get(r.artist_id), [r.time_range]: r.rank });
  }
  return out;
}

export function listeningStatus(ranks: Ranks | undefined, longTimeFanSince: string | null): ListeningStatus {
  if (longTimeFanSince) return "long_time";
  if (!ranks) return "unranked";
  if (ranks.long_term && (ranks.medium_term || ranks.short_term)) return "long_time";
  if (ranks.medium_term || ranks.long_term) return "steady";
  if (ranks.short_term) return "rotation";
  return "unranked";
}

/** Plain-language description of where an artist ranks, for screen readers and tooltips. */
export function describeRanks(ranks: Ranks | undefined): string {
  const parts = RANGES.filter((r) => ranks?.[r]).map((r) => `#${ranks![r]} ${RANGE_LABEL[r].toLowerCase()}`);
  return parts.length ? `Your Spotify top artists: ${parts.join(", ")}` : "Not in your current Spotify top artists";
}
