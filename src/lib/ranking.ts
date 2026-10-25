import { isStale, nextSaleStart, type Lifecycle, type SalePhase } from "./events";

/**
 * Transparent, rules-based ranking for Discover. Every point awarded carries a human-readable
 * reason so the feed can explain itself. Affiliate status is deliberately not an input.
 */

export type InterestLevel = "love" | "like" | "curious";

export type RankInput = {
  eventId: string;
  lifecycle: Lifecycle;
  startsAt: string | null;
  createdAt: string;
  lastVerifiedAt: string | null;
  sales: SalePhase[];
  artists: { interest: InterestLevel; pinned: boolean; matchConfidence: number }[];
  distanceKm: number | null;
  radiusKm: number | null;
  friendCount: number;
  saved: boolean;
  dismissed: boolean;
};

export type Ranked = {
  eventId: string;
  score: number;
  reasons: string[];
  section: "sale_soon" | "new" | "upcoming" | "inactive";
  nextSale: Date | null;
};

const DAY = 24 * 3600 * 1000;
const INTEREST_POINTS: Record<InterestLevel, number> = { love: 40, like: 25, curious: 10 };

export function rankEvent(e: RankInput, now = new Date()): Ranked | null {
  if (e.dismissed) return null;
  const t = now.getTime();
  const reasons: string[] = [];
  let score = 0;

  // Cancelled/postponed events and stale sale information always override relevance.
  if (e.lifecycle === "cancelled" || e.lifecycle === "postponed" || e.lifecycle === "ended") {
    return { eventId: e.eventId, score: -1000, reasons: [`Event ${e.lifecycle}`], section: "inactive", nextSale: null };
  }

  const best = [...e.artists].sort((a, b) => INTEREST_POINTS[b.interest] - INTEREST_POINTS[a.interest])[0];
  if (best) {
    score += INTEREST_POINTS[best.interest];
    reasons.push(best.interest === "love" ? "An artist you love" : best.interest === "like" ? "An artist you like" : "An artist you're curious about");
  }
  if (e.artists.some((a) => a.pinned)) {
    score += 15;
    reasons.push("Pinned artist");
  }

  const stale = isStale(e.lastVerifiedAt, now);
  const nextSale = stale ? null : nextSaleStart(e.lifecycle, e.sales, now);
  if (nextSale) {
    const until = nextSale.getTime() - t;
    if (until <= 2 * DAY) {
      score += 30;
      reasons.push("Tickets go on sale within 48 hours");
    } else if (until <= 7 * DAY) {
      score += 20;
      reasons.push("Tickets go on sale this week");
    } else if (until <= 14 * DAY) {
      score += 10;
      reasons.push("Tickets go on sale within two weeks");
    }
  }

  if (e.startsAt) {
    const until = Date.parse(e.startsAt) - t;
    if (until <= 30 * DAY) {
      score += 10;
      reasons.push("Happening within a month");
    } else if (until <= 90 * DAY) {
      score += 5;
    }
  }

  if (e.distanceKm !== null && e.radiusKm) {
    const closeness = Math.max(0, 1 - e.distanceKm / e.radiusKm);
    score += Math.round(10 * closeness);
    if (closeness > 0.7) reasons.push("Close to you");
  }

  if (e.friendCount > 0) {
    score += Math.min(15, e.friendCount * 5);
    reasons.push(e.friendCount === 1 ? "A friend is interested" : `${e.friendCount} friends are interested`);
  }

  if (e.saved) score += 5;

  if (stale) {
    score -= 20;
    reasons.push("Sale information may be outdated");
  }
  if (e.artists.length > 0 && e.artists.every((a) => a.matchConfidence < 0.9)) {
    score -= 15;
    reasons.push("Artist match not verified");
  }

  const section: Ranked["section"] =
    nextSale && nextSale.getTime() - t <= 14 * DAY
      ? "sale_soon"
      : t - Date.parse(e.createdAt) <= 7 * DAY
        ? "new"
        : "upcoming";

  return { eventId: e.eventId, score, reasons, section, nextSale };
}

export function rankEvents(inputs: RankInput[], now = new Date()): Ranked[] {
  return inputs
    .map((i) => rankEvent(i, now))
    .filter((r): r is Ranked => r !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: sooner sale first, then stable by id.
      const as = a.nextSale?.getTime() ?? Infinity;
      const bs = b.nextSale?.getTime() ?? Infinity;
      return as !== bs ? as - bs : a.eventId.localeCompare(b.eventId);
    });
}
