import { describe, expect, it } from "vitest";
import { decide, quietMinutesRemaining, type DecisionContext } from "@/server/notifications/decide";

const NOW = new Date("2026-10-25T10:00:00Z"); // 11:00 in Berlin (CET after DST ends)
const SALE_AT = "2026-10-25T11:00:00.000Z";

function ctx(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    job: { id: "j", notification_type: "general_sale_starting_soon", scheduled_at: NOW.toISOString(), sale_starts_at_snapshot: SALE_AT, attempt_count: 1 },
    event: {
      id: "e1",
      title: "Band One",
      lifecycle_status: "announced",
      starts_at: "2027-03-14T19:00:00Z",
      start_time_tba: false,
      timezone: "Europe/Berlin",
      venue_name: "Uber Arena",
      city: "Berlin",
    },
    sale: { sale_type: "general", sale_name: "General sale", starts_at: SALE_AT, start_time_unknown: false },
    preferences: {
      presale_reminders_enabled: true,
      general_sale_reminders_enabled: true,
      new_event_alerts_enabled: true,
      friend_activity_enabled: true,
      quiet_hours_start: null,
      quiet_hours_end: null,
      timezone: "Europe/Berlin",
    },
    actor: null,
    intention: null,
    ...overrides,
  };
}

describe("decide", () => {
  it("delivers a valid reminder with a deep link to the event", () => {
    const d = decide(ctx(), NOW);
    expect(d).toMatchObject({ kind: "deliver", push: true, deepLink: "/events/e1", title: "General sale starts in 60 minutes" });
    expect(d.kind === "deliver" && d.body).toBe("Band One · Uber Arena, Berlin");
  });

  it("suppresses reminders for cancelled or postponed events", () => {
    for (const status of ["cancelled", "postponed", "offsale"]) {
      expect(decide(ctx({ event: { ...ctx().event!, lifecycle_status: status } }), NOW)).toMatchObject({ kind: "suppress" });
    }
  });

  it("suppresses when the sale time moved since scheduling", () => {
    const moved = ctx({ sale: { ...ctx().sale!, starts_at: "2026-10-26T11:00:00.000Z" } });
    expect(decide(moved, NOW)).toEqual({ kind: "suppress", reason: "sale time changed; a new reminder was scheduled" });
    expect(decide(ctx({ sale: { ...ctx().sale!, start_time_unknown: true } }), NOW)).toMatchObject({ kind: "suppress" });
    expect(decide(ctx({ sale: null }), NOW)).toMatchObject({ kind: "suppress" });
  });

  it("suppresses late reminders and stale sale-open alerts", () => {
    expect(decide(ctx(), new Date("2026-10-25T11:05:00Z"))).toMatchObject({ kind: "suppress", reason: "reminder is too late" });
    const open = ctx({ job: { ...ctx().job, notification_type: "sale_open" } });
    expect(decide(open, new Date("2026-10-25T11:05:00Z"))).toMatchObject({ kind: "deliver", title: "General sale is open now" });
    expect(decide(open, new Date("2026-10-25T14:00:00Z"))).toMatchObject({ kind: "suppress" });
  });

  it("respects per-type preferences at delivery time", () => {
    const prefs = { ...ctx().preferences!, general_sale_reminders_enabled: false };
    expect(decide(ctx({ preferences: prefs }), NOW)).toMatchObject({ kind: "suppress" });
    expect(decide(ctx({ preferences: prefs, job: { ...ctx().job, notification_type: "sale_open" } }), new Date("2026-10-25T11:01:00Z"))).toMatchObject({ kind: "suppress" });
  });

  it("keeps time-critical alerts in the inbox but skips push during quiet hours", () => {
    const quiet = { ...ctx().preferences!, quiet_hours_start: "10:30", quiet_hours_end: "12:00" };
    expect(decide(ctx({ preferences: quiet }), NOW)).toMatchObject({ kind: "deliver", push: false });
  });

  it("defers non-urgent alerts until quiet hours end", () => {
    const quiet = { ...ctx().preferences!, quiet_hours_start: "22:00", quiet_hours_end: "12:00" };
    const d = decide(ctx({ preferences: quiet, job: { ...ctx().job, notification_type: "new_event", sale_starts_at_snapshot: null }, sale: null }), NOW);
    expect(d.kind).toBe("defer");
    expect(d.kind === "defer" && d.until.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("drops social notifications once the relationship ended or the plan was withdrawn", () => {
    const base = ctx({ job: { ...ctx().job, notification_type: "friend_interest", sale_starts_at_snapshot: null }, sale: null, intention: "going" });
    expect(decide({ ...base, actor: { display_name: "Sam", still_connected: true } }, NOW)).toMatchObject({ kind: "deliver", title: "Sam is going to a show" });
    expect(decide({ ...base, actor: { display_name: "Sam", still_connected: false } }, NOW)).toMatchObject({ kind: "suppress" });
    expect(decide({ ...base, actor: { display_name: "Sam", still_connected: true }, preferences: { ...base.preferences!, friend_activity_enabled: false } }, NOW)).toMatchObject({
      kind: "suppress",
    });
  });

  it("routes friend requests to the friends screen", () => {
    const d = decide(ctx({ job: { ...ctx().job, notification_type: "friend_request" }, event: null, sale: null, actor: { display_name: "Sam", still_connected: true } }), NOW);
    expect(d).toMatchObject({ kind: "deliver", deepLink: "/friends" });
  });
});

describe("quietMinutesRemaining", () => {
  it("handles same-day and overnight windows in the user's zone", () => {
    expect(quietMinutesRemaining(NOW, "10:30", "12:00", "Europe/Berlin")).toBe(60);
    expect(quietMinutesRemaining(NOW, "22:00", "07:00", "Europe/Berlin")).toBe(0);
    expect(quietMinutesRemaining(new Date("2026-10-25T23:30:00Z"), "22:00", "07:00", "Europe/Berlin")).toBe(6 * 60 + 30);
    expect(quietMinutesRemaining(NOW, null, null, "Europe/Berlin")).toBe(0);
  });
});
