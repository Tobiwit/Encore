import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-hover active:bg-accent-hover",
  secondary: "bg-surface-elevated text-fg ring-1 ring-inset ring-line hover:ring-line-strong",
  ghost: "text-fg-secondary hover:text-fg hover:bg-surface",
  danger: "bg-transparent text-error ring-1 ring-inset ring-error/60 hover:bg-error/10",
};
// All sizes keep a ≥44px touch target (WCAG 2.2 target size, comfortably above the 24px minimum).
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-4 text-support",
  md: "min-h-12 px-5 text-body",
  lg: "min-h-14 px-6 text-card",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function IconButton({ label, className, children, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-surface-elevated hover:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionHeader({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 id={id} className="text-section font-semibold text-fg">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 pt-6">
      <div className="min-w-0">
        <h1 className="text-page font-semibold text-fg">{title}</h1>
        {subtitle ? <p className="mt-1 text-support text-fg-secondary">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "error"; className?: string }) {
  const tones = {
    neutral: "bg-surface-elevated text-fg-secondary",
    accent: "bg-accent-muted text-fg",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    error: "bg-error/15 text-error",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
