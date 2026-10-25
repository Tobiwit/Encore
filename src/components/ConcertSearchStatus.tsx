import { formatRelativePast } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "./AutoRefresh";
import { IconAlert, IconTicket } from "./icons";
import { cn } from "./ui";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getConcertSearchStatus(supabase: Client) {
  const { data } = await supabase.rpc("get_concert_search_status");
  return data?.[0] ?? null;
}

export type ConcertSearchStatusData = NonNullable<Awaited<ReturnType<typeof getConcertSearchStatus>>>;

/**
 * How far the Ticketmaster lookup has got for this user's artists, and whether the last run had a
 * problem. Makes "no concerts yet" distinguishable from "still checking" and "provider failing".
 */
export function ConcertSearchStatus({ status, className }: { status: ConcertSearchStatusData; className?: string }) {
  const { followed, checked, found, verified, refreshed, running } = status;
  if (followed === 0) return null;

  const percent = Math.round((checked / followed) * 100);
  const complete = checked >= followed;
  const nameOnly = found - verified;
  const problem = status.last_run_problem;

  return (
    <section aria-labelledby="concert-search" className={cn("rounded-lg bg-surface p-4", className)}>
      {running ? <AutoRefresh everyMs={15_000} /> : null}
      <div className="flex items-center justify-between gap-3">
        <h2 id="concert-search" className="flex items-center gap-2 font-semibold text-fg">
          <IconTicket size={18} className="text-accent" /> Concert search
        </h2>
        <span className="tabular text-support text-fg-secondary">
          {checked} / {followed} artists checked
        </span>
      </div>

      <div
        role="progressbar"
        aria-labelledby="concert-search"
        aria-valuemin={0}
        aria-valuemax={followed}
        aria-valuenow={checked}
        aria-valuetext={`${checked} of ${followed} artists checked on Ticketmaster`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", complete ? "bg-success" : "bg-accent")} style={{ width: `${percent}%` }} />
      </div>

      <p className="mt-3 text-support text-fg-secondary">
        <span className="text-fg">{found}</span> found on Ticketmaster
        {nameOnly > 0 ? ` (${nameOnly} matched by name only, no automatic alerts)` : ""} · concert lists fetched for{" "}
        <span className="text-fg">{refreshed}</span>
      </p>

      <p role="status" aria-live="polite" className="mt-1 text-meta text-fg-muted">
        {running
          ? "Checking now… this page updates automatically."
          : status.last_run_at
            ? `Last checked ${formatRelativePast(status.last_run_at)}. ${complete ? "Concert lists refresh daily." : "Remaining artists are checked in the next daily run."}`
            : "Not checked yet. Artists are looked up after each Spotify import and once a day."}
      </p>

      {problem && !running ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-support text-warning">
          <IconAlert size={18} className="mt-0.5 shrink-0" />
          <span>Last check reported a problem: {problem}</span>
        </p>
      ) : null}
    </section>
  );
}
