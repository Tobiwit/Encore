"use client";

import { useOptimistic, useTransition } from "react";
import type { InterestLevel } from "@/lib/ranking";
import { updateArtistPreference } from "@/server/actions/artists";
import { cn } from "./ui";

const LEVELS: { value: InterestLevel; label: string; hint: string }[] = [
  { value: "love", label: "Love", hint: "Top priority for alerts" },
  { value: "like", label: "Like", hint: "Regular alerts" },
  { value: "curious", label: "Curious", hint: "Shown in discovery" },
];

/** Segmented radio group (arrow keys move selection, as native radios do). */
export function ArtistInterestControl({ artistId, artistName, value }: { artistId: string; artistName: string; value: InterestLevel }) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, start] = useTransition();

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Interest in {artistName}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-elevated p-1">
        {LEVELS.map((level) => (
          <label
            key={level.value}
            title={level.hint}
            className={cn(
              "relative flex min-h-10 cursor-pointer items-center justify-center rounded-full px-3 text-support font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
              optimistic === level.value ? "bg-accent text-bg" : "text-fg-secondary hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={`interest-${artistId}`}
              value={level.value}
              checked={optimistic === level.value}
              onChange={() =>
                start(async () => {
                  setOptimistic(level.value);
                  await updateArtistPreference(artistId, { interest_level: level.value });
                })
              }
              className="sr-only"
            />
            {level.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
