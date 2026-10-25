import type { ReactNode } from "react";
import { GeometricBackground } from "./GeometricBackground";
import { IconAlert, IconWifiOff } from "./icons";
import { cn } from "./ui";

export function EmptyState({
  title,
  body,
  action,
  decorative = false,
  icon,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  decorative?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface px-6 py-10 text-center">
      {decorative ? <GeometricBackground className="opacity-70" /> : null}
      <div className="relative mx-auto max-w-sm">
        {icon ? <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-elevated text-accent">{icon}</div> : null}
        <h3 className="text-card font-semibold text-fg">{title}</h3>
        {body ? <p className="mt-2 text-support text-fg-secondary">{body}</p> : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  action,
  kind = "error",
}: {
  title?: string;
  body?: ReactNode;
  action?: ReactNode;
  kind?: "error" | "offline" | "warning";
}) {
  const tone = kind === "warning" ? "text-warning" : kind === "offline" ? "text-fg-secondary" : "text-error";
  return (
    <div role="alert" className="rounded-lg bg-surface px-5 py-6">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5", tone)}>{kind === "offline" ? <IconWifiOff /> : <IconAlert />}</span>
        <div className="min-w-0">
          <h3 className="text-card font-semibold text-fg">{title}</h3>
          {body ? <p className="mt-1 text-support text-fg-secondary">{body}</p> : null}
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function InlineNotice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "neutral" | "error" }) {
  const tones = {
    warning: "bg-warning/10 text-warning",
    neutral: "bg-surface-elevated text-fg-secondary",
    error: "bg-error/10 text-error",
  };
  return <p className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-support", tones[tone])}>{children}</p>;
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-md bg-surface-elevated [animation:skeleton-pulse_1.6s_ease-in-out_infinite]", className)} />;
}

export function EventCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-lg bg-surface p-3">
      <LoadingSkeleton className="size-24 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <LoadingSkeleton className="h-4 w-3/4" />
        <LoadingSkeleton className="h-3 w-1/2" />
        <LoadingSkeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}
