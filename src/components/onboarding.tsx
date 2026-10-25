"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ArtistSummary } from "@/lib/types";
import { removeArtist, restoreArtist, updateArtistPreference } from "@/server/actions/artists";
import { refreshSpotifyNow } from "@/server/actions/profile";
import { IconCheck, IconPin } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { ErrorState } from "./states";
import { Button, ButtonLink, cn } from "./ui";

const RANGE_LABEL: Record<string, string> = { short_term: "Last 4 weeks", medium_term: "Last 6 months", long_term: "All time" };

type ImportResult = Awaited<ReturnType<typeof refreshSpotifyNow>>;

export function ImportStep({ nextHref, alreadyImported = null }: { nextHref: string; alreadyImported?: number | null }) {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(alreadyImported !== null);

  const run = () =>
    start(async () => {
      setResult(await refreshSpotifyNow());
    });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, []);

  if (alreadyImported !== null && !result && !pending) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-surface p-5">
          <p className="flex items-center gap-2 font-semibold text-success">
            <IconCheck /> Already imported
          </p>
          <p className="mt-1 text-support text-fg-secondary">
            {alreadyImported} artist{alreadyImported === 1 ? " is" : "s are"} on your fan list. Weekly refreshes keep it up to date.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={() => router.push(nextHref)}>
          Continue
        </Button>
      </div>
    );
  }

  if (pending || !result) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-4 rounded-lg bg-surface p-5">
        <span aria-hidden="true" className="flex h-8 items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="w-1 origin-bottom rounded bg-accent [animation:wave_1s_ease-in-out_infinite]" style={{ height: "100%", animationDelay: `${i * 0.1}s` }} />
          ))}
        </span>
        <div>
          <p className="font-semibold">Importing from Spotify…</p>
          <p className="text-support text-fg-secondary">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  if (!result.ok && result.cooldown) {
    return (
      <div className="space-y-6">
        <p className="rounded-lg bg-surface p-5 text-support text-fg-secondary">Your artists were imported a moment ago, so there&apos;s nothing new yet.</p>
        <Button size="lg" className="w-full" onClick={() => router.push(nextHref)}>
          Continue
        </Button>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <ErrorState
          title={result.reconnect ? "Spotify needs reconnecting" : "Import didn't finish"}
          body={result.error}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={run}>
                Try again
              </Button>
              <ButtonLink href={nextHref} size="sm" variant="ghost">
                Continue without importing
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const failedRanges = Object.entries(result.ranges).filter(([, v]) => v === "failed");
  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold text-success">
          <IconCheck /> Import complete
        </p>
        <ul className="tabular mt-3 space-y-1 text-support text-fg-secondary">
          {Object.entries(result.ranges).map(([range, v]) => (
            <li key={range} className="flex justify-between">
              <span>{RANGE_LABEL[range] ?? range}</span>
              <span className={v === "failed" ? "text-warning" : "text-fg"}>{v === "failed" ? "unavailable" : `${v} artists`}</span>
            </li>
          ))}
        </ul>
        {failedRanges.length ? <p className="mt-3 text-meta text-fg-muted">Some ranges couldn&apos;t be loaded; we&apos;ll retry during the weekly refresh.</p> : null}
      </div>
      <Button size="lg" className="w-full" onClick={() => router.push(nextHref)}>
        Continue
      </Button>
    </div>
  );
}

export function OnboardingArtistRow({ artist }: { artist: ArtistSummary }) {
  const [pinned, setPinned] = useState(artist.pinned);
  const [removed, setRemoved] = useState(false);
  const [, start] = useTransition();

  return (
    <li className={cn("flex items-center gap-3 py-2.5 transition-opacity", removed && "opacity-50")}>
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-full" className="size-12 shrink-0" />
      <p className={cn("min-w-0 flex-1 truncate font-semibold", removed && "line-through")}>{artist.name}</p>
      {!removed ? (
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${artist.name}` : `Pin ${artist.name}`}
          onClick={() =>
            start(async () => {
              setPinned(!pinned);
              await updateArtistPreference(artist.id, { is_pinned: !pinned, ...(pinned ? {} : { interest_level: "love" as const }) });
            })
          }
          className={cn("inline-flex size-11 items-center justify-center rounded-full", pinned ? "bg-accent-muted text-accent" : "text-fg-muted hover:bg-surface hover:text-fg")}
        >
          <IconPin size={20} />
        </button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        aria-label={removed ? `Undo removing ${artist.name}` : `Remove ${artist.name}`}
        onClick={() =>
          start(async () => {
            setRemoved(!removed);
            await (removed ? restoreArtist(artist.id) : removeArtist(artist.id));
          })
        }
      >
        {removed ? "Undo" : "Remove"}
      </Button>
    </li>
  );
}
