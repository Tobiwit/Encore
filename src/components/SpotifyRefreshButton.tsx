"use client";

import { useState, useTransition } from "react";
import { refreshSpotifyNow } from "@/server/actions/profile";
import { IconRefresh } from "./icons";
import { Button, cn } from "./ui";

export function SpotifyRefreshButton({ compact = false, label = "Refresh from Spotify" }: { compact?: boolean; label?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  return (
    <div className={cn("flex flex-col items-end gap-1", !compact && "items-center")}>
      <Button
        variant={compact ? "ghost" : "primary"}
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const r = await refreshSpotifyNow();
            setMessage(
              r.ok
                ? { tone: "ok", text: r.newArtists ? `Added ${r.newArtists} new artist${r.newArtists === 1 ? "" : "s"}.` : "Up to date — no new artists." }
                : { tone: "error", text: r.error },
            );
          })
        }
      >
        <IconRefresh size={18} className={cn(pending && "animate-spin")} />
        {pending ? "Refreshing…" : compact ? "Refresh" : label}
      </Button>
      <p role="status" aria-live="polite" className={cn("text-meta", message?.tone === "error" ? "text-error" : "text-fg-secondary")}>
        {message?.text}
      </p>
    </div>
  );
}
