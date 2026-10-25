import { describe, expect, it } from "vitest";
import { dedupeSales, deriveSaleState, type SalePhase } from "@/lib/events";
import { rankEvent, rankEvents, type RankInput } from "@/lib/ranking";
import { normalizeName, safeRedirectPath } from "@/lib/text";
import { matchAttraction, NOTIFY_CONFIDENCE } from "@/server/providers/matching";

const SPOTIFY_ID = "4Z8W4fKeB5YxbusRsdQVPb";

describe("matchAttraction", () => {
  it("prefers an attraction that links to the same Spotify artist", () => {
    const m = matchAttraction({ name: "Radiohead", spotifyId: SPOTIFY_ID }, [
      { id: "A", name: "Radiohead Tribute", url: null, spotifyUrls: [] },
      { id: "B", name: "Radiohead", url: null, spotifyUrls: [`https://open.spotify.com/artist/${SPOTIFY_ID}?si=x`] },
    ]);
    expect(m).toMatchObject({ kind: "linked", method: "provider_link", confidence: 1 });
    expect(m.kind === "linked" && m.attraction.id).toBe("B");
  });

  it("accepts a unique exact-name match only below the notification threshold", () => {
    const m = matchAttraction({ name: "Sigur Rós", spotifyId: SPOTIFY_ID }, [{ id: "C", name: "Sigur Ros", url: null, spotifyUrls: [] }]);
    expect(m).toMatchObject({ kind: "linked", method: "exact_name" });
    expect(m.kind === "linked" && m.confidence).toBeLessThan(NOTIFY_CONFIDENCE);
  });

  it("refuses ambiguous or mismatched names", () => {
    expect(
      matchAttraction({ name: "Phoenix", spotifyId: null }, [
        { id: "1", name: "Phoenix", url: null, spotifyUrls: [] },
        { id: "2", name: "PHOENIX", url: null, spotifyUrls: [] },
      ]),
    ).toEqual({ kind: "none", reason: "ambiguous" });
    expect(matchAttraction({ name: "Phoenix", spotifyId: SPOTIFY_ID }, [{ id: "1", name: "Phoenix", url: null, spotifyUrls: ["https://open.spotify.com/artist/0000000000000000000000"] }])).toEqual({
      kind: "none",
      reason: "no_exact_match",
    });
    expect(matchAttraction({ name: "Phoenix", spotifyId: null }, [{ id: "1", name: "Phoenix Foundation", url: null, spotifyUrls: [] }])).toEqual({ kind: "none", reason: "no_exact_match" });
    expect(matchAttraction({ name: "X", spotifyId: null }, [])).toEqual({ kind: "none", reason: "no_candidates" });
  });
});

describe("normalizeName / safeRedirectPath", () => {
  it("normalises accents, ß and punctuation consistently", () => {
    expect(normalizeName("Die Ärzte")).toBe("die arzte");
    expect(normalizeName("Straßenjungs!")).toBe("strassenjungs");
    expect(normalizeName("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(normalizeName("   ")).toBeNull();
  });

  it("only allows same-origin relative redirects", () => {
    expect(safeRedirectPath("/events/1?x=1")).toBe("/events/1?x=1");
    expect(safeRedirectPath("//evil.example")).toBe("/discover");
    expect(safeRedirectPath("/\\evil.example")).toBe("/discover");
    expect(safeRedirectPath("https://evil.example")).toBe("/discover");
    expect(safeRedirectPath(null, "/onboarding")).toBe("/onboarding");
  });
});

const NOW = new Date("2026-10-25T10:00:00Z");
const day = 24 * 3600_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const sale = (startsIn: number, type: SalePhase["sale_type"] = "general", extra: Partial<SalePhase> = {}): SalePhase => ({
  id: `${type}-${startsIn}`,
  sale_type: type,
  sale_name: type === "presale" ? "Presale" : "General sale",
  starts_at: iso(startsIn),
  ends_at: null,
  start_time_unknown: false,
  ...extra,
});

function input(overrides: Partial<RankInput> = {}): RankInput {
  return {
    eventId: "e1",
    lifecycle: "announced",
    startsAt: iso(60 * day),
    createdAt: iso(-30 * day),
    lastVerifiedAt: iso(-3600_000),
    sales: [],
    artists: [{ interest: "like", pinned: false, matchConfidence: 1 }],
    distanceKm: 10,
    radiusKm: 50,
    friendCount: 0,
    saved: false,
    dismissed: false,
    ...overrides,
  };
}

describe("deriveSaleState", () => {
  it("returns the next upcoming phase and never claims availability for inactive events", () => {
    expect(deriveSaleState("announced", [sale(2 * day), sale(1 * day, "presale")], NOW)).toMatchObject({ kind: "upcoming", sale: { sale_type: "presale" } });
    expect(deriveSaleState("cancelled", [sale(day)], NOW)).toEqual({ kind: "inactive", lifecycle: "cancelled" });
    expect(deriveSaleState("announced", [sale(day, "general", { start_time_unknown: true, starts_at: null })], NOW)).toEqual({ kind: "unknown" });
    expect(deriveSaleState("announced", [sale(-day), sale(day, "presale")], NOW)).toMatchObject({ kind: "open", sale: { sale_type: "general" } });
  });

  it("collapses duplicate phases from variant listings", () => {
    const phases = dedupeSales([
      { ...sale(day), id: "a", is_primary: true },
      { ...sale(day), id: "b", is_primary: false },
      { ...sale(2 * day, "presale"), id: "c", is_primary: false },
    ]);
    expect(phases.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("rankEvent", () => {
  it("explains every score and rewards urgency, love and pins", () => {
    const urgent = rankEvent(input({ sales: [sale(day)], artists: [{ interest: "love", pinned: true, matchConfidence: 1 }] }), NOW)!;
    const relaxed = rankEvent(input(), NOW)!;
    expect(urgent.score).toBeGreaterThan(relaxed.score);
    expect(urgent.section).toBe("sale_soon");
    expect(urgent.reasons).toEqual(expect.arrayContaining(["An artist you love", "Pinned artist", "Tickets go on sale within 48 hours"]));
  });

  it("puts cancelled and postponed events last regardless of relevance", () => {
    const ranked = rankEvents(
      [
        input({ eventId: "cancelled", lifecycle: "cancelled", artists: [{ interest: "love", pinned: true, matchConfidence: 1 }], sales: [sale(day)] }),
        input({ eventId: "plain", artists: [{ interest: "curious", pinned: false, matchConfidence: 1 }] }),
      ],
      NOW,
    );
    expect(ranked.map((r) => r.eventId)).toEqual(["plain", "cancelled"]);
    expect(ranked[1].section).toBe("inactive");
  });

  it("ignores sale urgency when the data is stale", () => {
    const stale = rankEvent(input({ sales: [sale(day)], lastVerifiedAt: iso(-5 * day) }), NOW)!;
    expect(stale.nextSale).toBeNull();
    expect(stale.section).not.toBe("sale_soon");
    expect(stale.reasons).toContain("Sale information may be outdated");
  });

  it("penalises name-only artist matches and drops dismissed events", () => {
    const verified = rankEvent(input(), NOW)!;
    const nameOnly = rankEvent(input({ artists: [{ interest: "like", pinned: false, matchConfidence: 0.7 }] }), NOW)!;
    expect(nameOnly.score).toBeLessThan(verified.score);
    expect(rankEvent(input({ dismissed: true }), NOW)).toBeNull();
  });

  it("does not let friend activity bury an imminent sale", () => {
    const social = rankEvent(input({ eventId: "s", friendCount: 10 }), NOW)!;
    const sale48h = rankEvent(input({ eventId: "u", sales: [sale(day)] }), NOW)!;
    expect(sale48h.score).toBeGreaterThan(social.score);
  });
});
