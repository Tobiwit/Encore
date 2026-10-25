"use client";

import { useId, useOptimistic, useTransition } from "react";
import { cn } from "./ui";

/** Switch row. role="switch" with a visible label and description; whole row is the target. */
export function NotificationPreferenceRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => Promise<unknown>;
  disabled?: boolean;
}) {
  const id = useId();
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold text-fg">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="text-support text-fg-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setOptimistic(!optimistic);
            await onChange(!optimistic);
          })
        }
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-50",
          optimistic ? "bg-accent" : "bg-surface-elevated ring-1 ring-inset ring-line-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-6 rounded-full transition-transform duration-150", optimistic ? "translate-x-6 bg-bg" : "translate-x-0 bg-fg-secondary")}
        />
      </button>
    </div>
  );
}
