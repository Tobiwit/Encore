import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { decide, type DecisionContext, type JobType } from "./decide";
import { sendPush } from "./push";

type Job = {
  id: string;
  user_id: string;
  event_id: string | null;
  sale_id: string | null;
  actor_id: string | null;
  notification_type: JobType;
  scheduled_at: string;
  sale_starts_at_snapshot: string | null;
  attempt_count: number;
};

async function loadContext(admin: AdminClient, job: Job): Promise<DecisionContext> {
  const [event, sale, prefs, actor] = await Promise.all([
    job.event_id
      ? admin
          .from("events")
          .select("id, canonical_title, lifecycle_status, starts_at, start_time_tba, timezone, venue:venues(name, city)")
          .eq("id", job.event_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    job.sale_id
      ? admin.from("event_sales").select("sale_type, sale_name, starts_at, start_time_unknown").eq("id", job.sale_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("notification_preferences").select("*").eq("user_id", job.user_id).maybeSingle(),
    job.actor_id ? admin.from("users").select("display_name, deleted_at").eq("id", job.actor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let stillConnected = false;
  let intention: string | null = null;
  if (job.actor_id && actor.data && !actor.data.deleted_at) {
    const [{ data: blocked }, { data: friendship }] = await Promise.all([
      admin
        .from("user_blocks")
        .select("blocker_id")
        .or(`and(blocker_id.eq.${job.user_id},blocked_id.eq.${job.actor_id}),and(blocker_id.eq.${job.actor_id},blocked_id.eq.${job.user_id})`)
        .limit(1),
      admin
        .from("friendships")
        .select("status")
        .eq("user_low", job.user_id < job.actor_id ? job.user_id : job.actor_id)
        .eq("user_high", job.user_id < job.actor_id ? job.actor_id : job.user_id)
        .maybeSingle(),
    ]);
    const notBlocked = !blocked?.length;
    stillConnected =
      notBlocked &&
      (job.notification_type === "friend_request" ? friendship?.status === "pending" : friendship?.status === "accepted");

    if (job.notification_type === "friend_interest" && job.event_id) {
      const { data: interest } = await admin
        .from("event_interests")
        .select("intention, visibility")
        .eq("user_id", job.actor_id)
        .eq("event_id", job.event_id)
        .maybeSingle();
      // Respect a change of heart: withdrawn or hidden intentions are not announced.
      if (!interest || interest.visibility !== "friends" || interest.intention === "interested") stillConnected = false;
      intention = interest?.intention ?? null;
    }
  }

  const e = event.data as
    | { id: string; canonical_title: string; lifecycle_status: string; starts_at: string | null; start_time_tba: boolean; timezone: string | null; venue: { name: string; city: string | null } | null }
    | null;

  return {
    job,
    event: e
      ? {
          id: e.id,
          title: e.canonical_title,
          lifecycle_status: e.lifecycle_status,
          starts_at: e.starts_at,
          start_time_tba: e.start_time_tba,
          timezone: e.timezone,
          venue_name: e.venue?.name ?? null,
          city: e.venue?.city ?? null,
        }
      : null,
    sale: sale.data,
    preferences: prefs.data,
    actor: actor.data ? { display_name: actor.data.display_name, still_connected: stillConnected } : null,
    intention,
  };
}

export async function deliverDueNotifications(admin: AdminClient, batchSize = 100) {
  const { data: jobs, error } = await admin.rpc("claim_notification_jobs", { p_limit: batchSize });
  if (error) throw new Error(`claim_notification_jobs: ${error.message}`);

  const stats = { claimed: jobs?.length ?? 0, delivered: 0, suppressed: 0, deferred: 0, failed: 0, pushed: 0 };

  for (const job of (jobs ?? []) as Job[]) {
    try {
      const ctx = await loadContext(admin, job);
      const decision = decide(ctx);

      if (decision.kind === "suppress") {
        await admin.rpc("complete_notification_job", { p_job_id: job.id, p_outcome: "suppress", p_reason: decision.reason });
        stats.suppressed++;
        continue;
      }
      if (decision.kind === "defer") {
        await admin.rpc("complete_notification_job", {
          p_job_id: job.id,
          p_outcome: "defer",
          p_reason: decision.reason,
          p_defer_until: decision.until.toISOString(),
        });
        stats.deferred++;
        continue;
      }

      const { data: notificationId, error: completeError } = await admin.rpc("complete_notification_job", {
        p_job_id: job.id,
        p_outcome: "deliver",
        p_title: decision.title,
        p_body: decision.body,
        p_deep_link: decision.deepLink,
        p_payload: { event_id: job.event_id, sale_id: job.sale_id, actor_id: job.actor_id },
      });
      if (completeError) throw new Error(completeError.message);
      stats.delivered++;

      // Only push when a new in-app notification was actually created (dedup safe on retries).
      if (decision.push && notificationId) {
        const push = await sendPush(admin, job.user_id, {
          title: decision.title,
          body: decision.body,
          url: decision.deepLink,
          tag: `${job.notification_type}:${job.event_id ?? job.actor_id}`,
        });
        stats.pushed += push.sent;
      }
    } catch (error) {
      stats.failed++;
      await admin.rpc("complete_notification_job", { p_job_id: job.id, p_outcome: "fail", p_reason: String(error).slice(0, 500) });
    }
  }
  return stats;
}
