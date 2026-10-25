import { describe, expect, it } from "vitest";
import { describeRanks, latestRanks, listeningStatus } from "@/lib/listening";

const row = (artist_id: string, time_range: "short_term" | "medium_term" | "long_term", rank: number, batch_id: string, synced_at: string) => ({
  artist_id,
  time_range,
  rank,
  batch_id,
  synced_at,
});

describe("latestRanks", () => {
  it("uses each range's most recent batch and falls back when a range is missing", () => {
    const ranks = latestRanks([
      row("a", "short_term", 5, "old", "2026-10-01T00:00:00Z"),
      row("a", "long_term", 9, "old", "2026-10-01T00:00:00Z"),
      row("a", "short_term", 2, "new", "2026-10-20T00:00:00Z"), // long_term failed in the new batch
      row("b", "short_term", 1, "new", "2026-10-20T00:00:00Z"),
    ]);
    expect(ranks.get("a")).toEqual({ short_term: 2, long_term: 9 });
    expect(ranks.get("b")).toEqual({ short_term: 1 });
  });
});

describe("listeningStatus", () => {
  it("classifies like apply_listening_insights()", () => {
    expect(listeningStatus({ long_term: 3, medium_term: 4 }, null)).toBe("long_time");
    expect(listeningStatus({ long_term: 3, short_term: 4 }, null)).toBe("long_time");
    expect(listeningStatus({ long_term: 3 }, null)).toBe("steady");
    expect(listeningStatus({ medium_term: 3, short_term: 1 }, null)).toBe("steady");
    expect(listeningStatus({ short_term: 1 }, null)).toBe("rotation");
    expect(listeningStatus(undefined, null)).toBe("unranked");
  });

  it("keeps long-time fans long-time after they leave the rankings", () => {
    expect(listeningStatus(undefined, "2026-01-01T00:00:00Z")).toBe("long_time");
  });

  it("describes ranks for screen readers", () => {
    expect(describeRanks({ short_term: 2, long_term: 9 })).toBe("Your Spotify top artists: #2 last 4 weeks, #9 all time");
    expect(describeRanks(undefined)).toBe("Not in your current Spotify top artists");
  });
});
