/**
 * Pure delivery decision for a claimed notification job. The scheduler already filtered by
 * preferences at scheduling time; this re-checks everything against the *current* state,
 * because sale times move, events get cancelled and people change their minds.
 */

export type JobType =
  | "presale_starting_soon"
  | "general_sale_starting_soon"
  | "sale_open"
  | "new_event"
  | "event_changed"
  | "friend_interest"
  | "friend_request";

export type DecisionContext = {
  job: {
    id: string;
    notification_type: JobType;
    scheduled_at: string;
    sale_starts_at_snapshot: string | null;
    attempt_count: number;
  };
  event: {
    id: string;
    title: string;
    lifecycle_status: string;
    starts_at: string | null;
    start_time_tba: boolean;
    timezone: string | null;
    venue_name: string | null;
    city: string | null;
  } | null;
  sale: { sale_type: string; sale_name: string | null; starts_at: string | null; start_time_unknown: boolean } | null;
  preferences: {
    presale_reminders_enabled: boolean;
    general_sale_reminders_enabled: boolean;
    new_event_alerts_enabled: boolean;
    friend_activity_enabled: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
  } | null;
  actor: { display_name: string; still_connected: boolean } | null;
  intention: string | null;
};

export type Decision =
  | { kind: "deliver"; push: boolean; title: string; body: string; deepLink: string }
  | { kind: "suppress"; reason: string }
  | { kind: "defer"; until: Date; reason: string };

const SALE_TYPES: JobType[] = ["presale_starting_soon", "general_sale_starting_soon", "sale_open"];
const INACTIVE = new Set(["cancelled", "postponed", "offsale", "ended"]);
const SALE_OPEN_GRACE_MS = 2 * 3600 * 1000;

function minutesOfDay(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function localMinutes(now: Date, timezone: string): number {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    tz = "Europe/Berlin";
  }
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Minutes until quiet hours end, or 0 when not currently in quiet hours. Handles overnight ranges. */
export function quietMinutesRemaining(now: Date, start: string | null, end: string | null, timezone: string): number {
  if (!start || !end) return 0;
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s === e) return 0;
  const cur = localMinutes(now, timezone);
  const inQuiet = s < e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inQuiet) return 0;
  return (e - cur + 1440) % 1440 || 1440;
}

function where(ctx: DecisionContext) {
  const e = ctx.event;
  if (!e) return "";
  return [e.venue_name, e.city].filter(Boolean).join(", ");
}

function saleLabel(ctx: DecisionContext) {
  const s = ctx.sale;
  if (!s) return "Ticket sale";
  if (s.sale_type === "presale") return s.sale_name && !/^presale$/i.test(s.sale_name) ? s.sale_name : "Presale";
  return "General sale";
}

export function decide(ctx: DecisionContext, now = new Date()): Decision {
  const { job, event, sale, preferences: prefs } = ctx;
  const type = job.notification_type;
  if (!prefs) return { kind: "suppress", reason: "user has no preferences (account deleted?)" };

  // --- Revalidation against current state -------------------------------------------
  if (SALE_TYPES.includes(type)) {
    if (!event) return { kind: "suppress", reason: "event no longer exists" };
    if (INACTIVE.has(event.lifecycle_status)) return { kind: "suppress", reason: `event ${event.lifecycle_status}` };
    if (!sale || !sale.starts_at || sale.start_time_unknown) return { kind: "suppress", reason: "sale no longer scheduled" };
    if (job.sale_starts_at_snapshot && Date.parse(sale.starts_at) !== Date.parse(job.sale_starts_at_snapshot)) {
      return { kind: "suppress", reason: "sale time changed; a new reminder was scheduled" };
    }
    const saleAt = Date.parse(sale.starts_at);
    if (type !== "sale_open" && now.getTime() >= saleAt) return { kind: "suppress", reason: "reminder is too late" };
    if (type === "sale_open" && now.getTime() > saleAt + SALE_OPEN_GRACE_MS) return { kind: "suppress", reason: "sale-open alert is stale" };
    if (type === "presale_starting_soon" && !prefs.presale_reminders_enabled) return { kind: "suppress", reason: "presale reminders disabled" };
    if (type === "general_sale_starting_soon" && !prefs.general_sale_reminders_enabled) return { kind: "suppress", reason: "general-sale reminders disabled" };
    if (type === "sale_open") {
      const enabled = sale.sale_type === "presale" ? prefs.presale_reminders_enabled : prefs.general_sale_reminders_enabled;
      if (!enabled) return { kind: "suppress", reason: "sale reminders disabled" };
    }
  }

  if (type === "new_event") {
    if (!event) return { kind: "suppress", reason: "event no longer exists" };
    if (INACTIVE.has(event.lifecycle_status)) return { kind: "suppress", reason: `event ${event.lifecycle_status}` };
    if (!prefs.new_event_alerts_enabled) return { kind: "suppress", reason: "new-event alerts disabled" };
  }

  if (type === "event_changed" && !event) return { kind: "suppress", reason: "event no longer exists" };

  if (type === "friend_interest" || type === "friend_request") {
    if (!ctx.actor || !ctx.actor.still_connected) return { kind: "suppress", reason: "no longer connected" };
    if (type === "friend_interest" && !prefs.friend_activity_enabled) return { kind: "suppress", reason: "friend activity disabled" };
    if (type === "friend_interest" && (!event || INACTIVE.has(event.lifecycle_status))) return { kind: "suppress", reason: "event inactive" };
  }

  // --- Quiet hours ---------------------------------------------------------------------
  // Time-critical sale alerts still land in the in-app inbox but skip push; everything else waits.
  const quiet = quietMinutesRemaining(now, prefs.quiet_hours_start, prefs.quiet_hours_end, prefs.timezone);
  const timeCritical = SALE_TYPES.includes(type) || type === "event_changed";
  if (quiet > 0 && !timeCritical) {
    return { kind: "defer", until: new Date(now.getTime() + quiet * 60000), reason: "quiet hours" };
  }
  const push = quiet === 0;

  // --- Content -----------------------------------------------------------------------------
  const title = event?.title ?? "";
  const place = where(ctx);
  const eventLink = event ? `/events/${event.id}` : "/discover";

  switch (type) {
    case "presale_starting_soon":
    case "general_sale_starting_soon": {
      const mins = Math.max(1, Math.round((Date.parse(sale!.starts_at!) - now.getTime()) / 60000));
      const lead = mins >= 90 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`;
      return { kind: "deliver", push, title: `${saleLabel(ctx)} starts in ${lead}`, body: [title, place].filter(Boolean).join(" · "), deepLink: eventLink };
    }
    case "sale_open":
      return { kind: "deliver", push, title: `${saleLabel(ctx)} is open now`, body: [title, place].filter(Boolean).join(" · "), deepLink: eventLink };
    case "new_event":
      return { kind: "deliver", push, title: "New concert announced", body: [title, place].filter(Boolean).join(" · "), deepLink: eventLink };
    case "event_changed": {
      const status = event!.lifecycle_status;
      const headline =
        status === "cancelled" ? "Event cancelled" : status === "postponed" ? "Event postponed" : status === "rescheduled" ? "Event rescheduled" : "Event details changed";
      return { kind: "deliver", push, title: headline, body: [title, place].filter(Boolean).join(" · "), deepLink: eventLink };
    }
    case "friend_interest": {
      const verb = ctx.intention === "looking_for_company" ? "is looking for company at" : "is going to";
      return { kind: "deliver", push, title: `${ctx.actor!.display_name} ${verb} a show`, body: title, deepLink: eventLink };
    }
    case "friend_request":
      return { kind: "deliver", push, title: "New friend request", body: `${ctx.actor!.display_name} wants to connect`, deepLink: "/friends" };
  }
}
