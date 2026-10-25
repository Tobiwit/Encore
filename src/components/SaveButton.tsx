"use client";

import { useOptimistic, useTransition } from "react";
import { toggleSavedEvent } from "@/server/actions/events";
import { IconSaved, IconSavedFilled } from "./icons";
import { cn } from "./ui";

export function SaveButton({ eventId, saved, title, withLabel = false }: { eventId: string; saved: boolean; title: string; withLabel?: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={withLabel ? undefined : optimistic ? `Remove ${title} from saved` : `Save ${title}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleSavedEvent(eventId, !optimistic);
        })
      }
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-colors",
        withLabel ? "bg-surface-elevated px-4 font-semibold ring-1 ring-inset ring-line hover:ring-line-strong" : "hover:bg-surface-elevated",
        optimistic ? "text-accent" : "text-fg-secondary hover:text-fg",
      )}
    >
      {optimistic ? <IconSavedFilled /> : <IconSaved />}
      {withLabel ? <span className="text-fg">{optimistic ? "Saved" : "Save"}</span> : null}
    </button>
  );
}
