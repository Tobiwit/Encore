import { useId, type ReactNode } from "react";
import { cn } from "./ui";

/**
 * Repeated concentric arcs — the "fractal glass" contour motif. Static (no perpetual animation),
 * aria-hidden, and drawn behind content at low contrast so it never competes with text.
 */
export function GeometricBackground({ className, variant = "arcs" }: { className?: string; variant?: "arcs" | "rings" }) {
  const id = useId().replace(/:/g, "");
  const arcs = Array.from({ length: 9 }, (_, i) => 60 + i * 34);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d98288" stopOpacity="0.38" />
          <stop offset="1" stopColor="#d98288" stopOpacity="0.04" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.85" cy="0.1" r="0.8">
          <stop offset="0" stopColor="#70474b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#171516" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${id}-glow)`} />
      {variant === "arcs"
        ? arcs.map((r) => <circle key={r} cx="380" cy="0" r={r} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="1" />)
        : arcs.map((r) => <circle key={r} cx="200" cy="200" r={r * 0.6} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="1" />)}
    </svg>
  );
}

/** Translucent layered panel. Reserve for hero and taste surfaces — not every card. */
export function GlassPanel({ children, className, decorative = true }: { children: ReactNode; className?: string; decorative?: boolean }) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-xl bg-surface", className)}>
      {decorative ? <GeometricBackground /> : null}
      <div className="glass relative rounded-xl">{children}</div>
    </section>
  );
}
