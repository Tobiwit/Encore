import { deriveSaleState, isStale, type Lifecycle, type SalePhase } from "@/lib/events";
import { formatDateTime } from "@/lib/format";
import { IconAlert, IconCheck, IconClock, IconClose, IconTicket } from "./icons";
import { Pill } from "./ui";

/**
 * Event + sale state as a labelled badge. Each state pairs a word and an icon with its colour,
 * so status never depends on colour alone. "On sale" reflects the schedule only — it never
 * claims tickets are still available.
 */
export function EventStatus({
  lifecycle,
  sales,
  timezone,
  lastVerifiedAt,
  compact = false,
}: {
  lifecycle: Lifecycle;
  sales: SalePhase[];
  timezone: string | null;
  lastVerifiedAt: string | null;
  compact?: boolean;
}) {
  if (lifecycle === "rescheduled") {
    return (
      <Pill tone="warning">
        <IconAlert size={14} /> Rescheduled
      </Pill>
    );
  }

  const state = deriveSaleState(lifecycle, sales);
  if (state.kind === "inactive") {
    const label = { cancelled: "Cancelled", postponed: "Postponed", ended: "Ended", offsale: "Off sale" }[state.lifecycle];
    return (
      <Pill tone={state.lifecycle === "cancelled" ? "error" : state.lifecycle === "postponed" ? "warning" : "neutral"}>
        <IconClose size={14} /> {label}
      </Pill>
    );
  }

  if (isStale(lastVerifiedAt) && state.kind !== "unknown") {
    return (
      <Pill tone="warning">
        <IconAlert size={14} /> Sale info may be outdated
      </Pill>
    );
  }

  if (state.kind === "upcoming") {
    const what = state.sale.sale_type === "presale" ? "Presale" : "On sale";
    return (
      <Pill tone="accent">
        <IconClock size={14} />
        <span className="tabular">
          {what} {compact ? formatDateTime(state.startsAt.toISOString(), timezone, false) : formatDateTime(state.startsAt.toISOString(), timezone)}
        </span>
      </Pill>
    );
  }
  if (state.kind === "open") {
    return (
      <Pill tone="success">
        {state.sale?.sale_type === "presale" ? <IconTicket size={14} /> : <IconCheck size={14} />}
        {state.sale?.sale_type === "presale" ? "Presale open" : "On sale"}
      </Pill>
    );
  }
  return (
    <Pill tone="neutral">
      <IconClock size={14} /> Sale date not announced
    </Pill>
  );
}
