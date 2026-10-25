import "server-only";
import { spotifyConfig } from "@/lib/env";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { deliverDueNotifications } from "@/server/notifications/deliver";
import { syncSpotifyAccount } from "@/server/spotify/sync";
import { matchArtistsToProvider, refreshArtistEvents, searchConcerts } from "./events";

async function spotifySync(admin: AdminClient, deadline = Infinity) {
  if (!spotifyConfig()) return { skipped: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured" };
  const { data: accounts, error } = await admin.rpc("claim_spotify_sync_accounts", { p_limit: 20 });
  if (error) throw new Error(error.message);
  const stats = { accounts: accounts?.length ?? 0, succeeded: 0, failed: 0, revoked: 0 };
  for (const account of accounts ?? []) {
    if (Date.now() > deadline) break; // unprocessed accounts are re-leased after 30 minutes
    const outcome = await syncSpotifyAccount(admin, account);
    if (outcome.ok) stats.succeeded++;
    else if (outcome.revoked) stats.revoked++;
    else stats.failed++;
  }
  return stats;
}

async function retention(admin: AdminClient) {
  const { data, error } = await admin.rpc("run_retention");
  if (error) throw new Error(error.message);
  return data;
}

/** Serverless functions on Vercel Hobby/Pro stop at 300 s; keep a safety margin. */
const RUN_BUDGET_MS = 270_000;

/**
 * Once a day (Vercel cron): fetch fresh data, then deliver anything already due. Reminders that
 * fall due later are delivered by the frequent `notifications-deliver` trigger (pg_cron).
 */
async function daily(admin: AdminClient) {
  const start = Date.now();
  const spotify = await spotifySync(admin, start + 60_000);
  const { matching, refresh } = await searchConcerts(admin, start + RUN_BUDGET_MS - 20_000);
  const delivery = await deliverDueNotifications(admin);
  const cleanup = await retention(admin);
  return { spotify, matching, refresh, delivery, retention: cleanup };
}

/** Right after a Spotify import: match the new artists and fetch their concerts immediately. */
async function concertSearch(admin: AdminClient) {
  const result = await searchConcerts(admin, Date.now() + RUN_BUDGET_MS - 30_000);
  const delivery = await deliverDueNotifications(admin);
  return { ...result, delivery };
}

/**
 * `everyMs` is the cadence used by the long-running `pnpm worker`; jobs without one are only
 * triggered explicitly (hosted cron, `after()` or `--job=`).
 */
export type JobName = "daily" | "concert-search" | "spotify-sync" | "artist-matching" | "event-refresh" | "notifications-deliver" | "retention";
type JobDefinition = { run: (admin: AdminClient) => Promise<unknown>; everyMs?: number };

export const JOBS: Record<JobName, JobDefinition> = {
  daily: { run: daily },
  "concert-search": { run: concertSearch },
  "spotify-sync": { run: (a) => spotifySync(a), everyMs: 15 * 60_000 },
  "artist-matching": { run: (a) => matchArtistsToProvider(a), everyMs: 30 * 60_000 },
  "event-refresh": { run: (a) => refreshArtistEvents(a), everyMs: 30 * 60_000 },
  "notifications-deliver": { run: (a) => deliverDueNotifications(a), everyMs: 60_000 },
  retention: { run: retention, everyMs: 24 * 3600_000 },
};

export function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

/** Runs a job and records the outcome in job_runs for inspection. */
export async function runJob(name: JobName, client?: AdminClient) {
  const started = Date.now();
  let admin: AdminClient;
  try {
    admin = client ?? createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", job: name, status: "failed", error: message }));
    return { ok: false as const, error: message };
  }
  const { data: run } = await admin.from("job_runs").insert({ job_name: name }).select("id").single();
  try {
    const details = await JOBS[name].run(admin);
    await admin
      .from("job_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), details: { ...(details as object), ms: Date.now() - started } })
      .eq("id", run!.id);
    console.log(JSON.stringify({ level: "info", job: name, status: "succeeded", ms: Date.now() - started, details }));
    return { ok: true as const, details };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (run) {
      await admin.from("job_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: message }).eq("id", run.id);
    }
    console.error(JSON.stringify({ level: "error", job: name, status: "failed", error: message }));
    return { ok: false as const, error: message };
  }
}
