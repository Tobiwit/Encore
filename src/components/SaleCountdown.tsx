"use client";

import { useEffect, useState } from "react";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { cn } from "./ui";

/**
 * Countdown to a verified sale start. Updates every 30 s (not every second: no perpetual motion,
 * and minute precision is what matters). The absolute time in the event's zone is always shown.
 */
export function SaleCountdown({
  startsAt,
  timezone,
  label,
  emphasis = false,
}: {
  startsAt: string;
  timezone: string | null;
  label: string;
  emphasis?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0); // client-only: avoids a server/client time mismatch
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const target = new Date(startsAt);
  const started = now ? target.getTime() <= now.getTime() : false;

  return (
    <div className={cn("rounded-md px-4 py-3", emphasis ? "bg-accent-muted" : "bg-surface-elevated")}>
      <p className="text-meta font-semibold uppercase tracking-wide text-fg-secondary">{label}</p>
      <p className="tabular mt-1 text-section font-semibold text-fg" aria-live="off">
        {now ? (started ? "Started" : formatCountdown(target, now)) : " "}
      </p>
      <p className="tabular mt-0.5 text-support text-fg-secondary">{formatDateTime(startsAt, timezone)}</p>
    </div>
  );
}
