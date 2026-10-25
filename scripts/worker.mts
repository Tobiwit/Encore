/**
 * Long-running background worker: `pnpm worker`.
 * Runs every job on its own cadence, never overlapping a job with itself. All state lives in
 * Postgres, so restarting the worker loses nothing (claimed-but-unfinished work is re-leased).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const { JOBS, runJob } = await import("@/server/jobs");
type JobName = import("@/server/jobs").JobName;

const running = new Set<JobName>();
let stopping = false;

async function tick(name: JobName) {
  if (running.has(name) || stopping) return;
  running.add(name);
  try {
    await runJob(name);
  } finally {
    running.delete(name);
  }
}

const once = process.argv.includes("--once");
const only = process.argv.find((a) => a.startsWith("--job="))?.slice("--job=".length) as JobName | undefined;
// Without --job, run the jobs that have a cadence (the composite `daily` job is for hosted cron).
const names = (Object.keys(JOBS) as JobName[]).filter((n) => (only ? n === only : JOBS[n].everyMs !== undefined));

if (once) {
  for (const name of names) await tick(name);
  process.exit(0);
}

console.log(JSON.stringify({ level: "info", msg: "worker started", jobs: names }));
const timers = names.map((name) => {
  void tick(name);
  return setInterval(() => void tick(name), JOBS[name].everyMs ?? 24 * 3600_000);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    stopping = true;
    timers.forEach(clearInterval);
    console.log(JSON.stringify({ level: "info", msg: "worker stopping", waitingFor: [...running] }));
    while (running.size) await new Promise((r) => setTimeout(r, 200));
    process.exit(0);
  });
}
