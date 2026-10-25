import "server-only";
import { spotifyConfig } from "@/lib/env";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { deliverDueNotifications } from "@/server/notifications/deliver";
import { syncSpotifyAccount } from "@/server/spotify/sync";
import { matchArtistsToProvider, refreshArtistEvents } from "./events";

async function spotifySync(admin: AdminClient) {
  if (!spotifyConfig()) return { skipped: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not configured" };
  const { data: accounts, error } = await admin.rpc("claim_spotify_sync_accounts", { p_limit: 20 });
  if (error) throw new Error(error.message);
  const stats = { accounts: accounts?.length ?? 0, succeeded: 0, failed: 0, revoked: 0 };
  for (const account of accounts ?? []) {
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

export const JOBS = {
  "spotify-sync": { run: spotifySync, everyMs: 15 * 60_000 },
  "artist-matching": { run: (a: AdminClient) => matchArtistsToProvider(a), everyMs: 30 * 60_000 },
  "event-refresh": { run: (a: AdminClient) => refreshArtistEvents(a), everyMs: 30 * 60_000 },
  "notifications-deliver": { run: (a: AdminClient) => deliverDueNotifications(a), everyMs: 60_000 },
  retention: { run: retention, everyMs: 24 * 3600_000 },
} as const;

export type JobName = keyof typeof JOBS;

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
