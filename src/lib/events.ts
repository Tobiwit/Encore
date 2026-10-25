/**
 * Event display model. Lifecycle (event_lifecycle_status) and sale phases (event_sales) stay
 * separate in storage; this module derives what the UI should say right now.
 */

export type Lifecycle =
  | "announced"
  | "presale_scheduled"
  | "general_sale_scheduled"
  | "on_sale"
  | "offsale"
  | "postponed"
  | "rescheduled"
  | "cancelled"
  | "ended"
  | "unknown";

export type SalePhase = {
  id: string;
  sale_type: "presale" | "general" | "other";
  sale_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_time_unknown: boolean;
  is_primary?: boolean;
};

export type SaleState =
  | { kind: "inactive"; lifecycle: "cancelled" | "postponed" | "ended" | "offsale" }
  | { kind: "upcoming"; sale: SalePhase; startsAt: Date }
  | { kind: "open"; sale: SalePhase | null; endsAt: Date | null }
  | { kind: "unknown" };

/** Collapse identical phases from package/VIP variant listings, preferring the primary listing. */
export function dedupeSales(sales: SalePhase[]): SalePhase[] {
  const hasPrimary = sales.some((s) => s.is_primary);
  const pool = hasPrimary ? sales.filter((s) => s.is_primary) : sales;
  const seen = new Map<string, SalePhase>();
  for (const s of pool) {
    const key = `${s.sale_type}|${s.starts_at ?? "?"}|${s.sale_name ?? ""}`;
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()].sort((a, b) => {
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return Date.parse(a.starts_at) - Date.parse(b.starts_at);
  });
}

export function deriveSaleState(lifecycle: Lifecycle, sales: SalePhase[], now = new Date()): SaleState {
  if (lifecycle === "cancelled" || lifecycle === "postponed" || lifecycle === "ended" || lifecycle === "offsale") {
    return { kind: "inactive", lifecycle };
  }
  const t = now.getTime();
  const phases = dedupeSales(sales);

  const upcoming = phases.find((s) => s.starts_at && !s.start_time_unknown && Date.parse(s.starts_at) > t);
  const open = phases.find(
    (s) => s.starts_at && Date.parse(s.starts_at) <= t && (!s.ends_at || Date.parse(s.ends_at) > t),
  );

  // A general sale that is running outranks a future presale for a different audience.
  if (open && open.sale_type === "general") {
    return { kind: "open", sale: open, endsAt: open.ends_at ? new Date(open.ends_at) : null };
  }
  if (upcoming) return { kind: "upcoming", sale: upcoming, startsAt: new Date(upcoming.starts_at!) };
  if (open) return { kind: "open", sale: open, endsAt: open.ends_at ? new Date(open.ends_at) : null };
  if (lifecycle === "on_sale") return { kind: "open", sale: null, endsAt: null };
  return { kind: "unknown" };
}

export function nextSaleStart(lifecycle: Lifecycle, sales: SalePhase[], now = new Date()): Date | null {
  const state = deriveSaleState(lifecycle, sales, now);
  return state.kind === "upcoming" ? state.startsAt : null;
}

/** Externally sourced facts older than this are flagged as possibly outdated. */
export const STALE_AFTER_MS = 3 * 24 * 3600 * 1000;

export function isStale(lastVerifiedAt: string | null, now = new Date()) {
  return !lastVerifiedAt || now.getTime() - Date.parse(lastVerifiedAt) > STALE_AFTER_MS;
}
