"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { followArtist, removeArtist, restoreArtist, updateArtistPreference } from "@/server/actions/artists";
import { BottomSheet } from "./BottomSheet";
import { IconBell, IconPin, IconPlus } from "./icons";
import { InlineNotice } from "./states";
import { Button, cn } from "./ui";

export function PinToggle({ artistId, pinned }: { artistId: string; pinned: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(pinned);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await updateArtistPreference(artistId, { is_pinned: !optimistic });
        })
      }
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ring-1 ring-inset transition-colors",
        optimistic ? "bg-accent-muted text-fg ring-accent" : "bg-surface text-fg-secondary ring-line hover:text-fg",
      )}
    >
      <IconPin size={18} /> {optimistic ? "Pinned" : "Pin"}
    </button>
  );
}

export function NotifyToggle({ artistId, enabled }: { artistId: string; enabled: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await updateArtistPreference(artistId, { notify_enabled: !optimistic });
        })
      }
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ring-1 ring-inset transition-colors",
        optimistic ? "bg-surface text-fg ring-line-strong" : "bg-surface text-fg-muted ring-line",
      )}
    >
      <IconBell size={18} /> {optimistic ? "Alerts on" : "Alerts off"}
    </button>
  );
}

export function RemoveArtistButton({ artistId, name }: { artistId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Remove from fan list
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Remove ${name}?`} description="You won't get alerts for this artist, and future Spotify imports won't add them back. You can restore them later from your Artists page.">
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Keep
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removeArtist(artistId);
                if (!r.ok) return setError(r.error);
                setOpen(false);
                router.push("/artists");
              })
            }
          >
            Remove
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}

export function RestoreArtistButton({ artistId, name }: { artistId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" size="sm" disabled={pending} aria-label={`Restore ${name}`} onClick={() => start(async () => void (await restoreArtist(artistId)))}>
      Restore
    </Button>
  );
}

export function FollowArtistButton({ artistId, source = "discovery" }: { artistId: string; source?: "friend_suggestion" | "discovery" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await followArtist(artistId, source);
            if (!r.ok) setError(r.error);
          })
        }
      >
        <IconPlus size={18} /> Add to fan list
      </Button>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </div>
  );
}
