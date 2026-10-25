"use client";

import { useEffect, useRef, useState } from "react";
import { IconExternal, IconPause, IconPlay } from "./icons";

/**
 * Plays an authorised provider preview when one exists; otherwise renders an explicit link to
 * the artist on Spotify. Audio is streamed from the provider and never cached or re-hosted.
 */
export function MusicPreviewPlayer({
  previewUrl,
  trackName,
  spotifyUrl,
  artistName,
}: {
  previewUrl: string | null;
  trackName?: string | null;
  spotifyUrl: string | null;
  artistName: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => audio.current?.pause(), []);

  if (!previewUrl) {
    if (!spotifyUrl) return null;
    return (
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-elevated px-4 text-support font-semibold text-fg ring-1 ring-inset ring-line hover:ring-line-strong"
      >
        Listen to {artistName} on Spotify <IconExternal size={16} />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-full bg-surface-elevated py-1.5 pl-1.5 pr-4">
      <button
        type="button"
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (el.paused) void el.play();
          else el.pause();
        }}
        aria-label={playing ? "Pause preview" : `Play preview${trackName ? ` of ${trackName}` : ""}`}
        className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-bg"
      >
        {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
      </button>
      <div className="min-w-0">
        <p className="truncate text-support font-semibold text-fg">{trackName ?? "Preview"}</p>
        <p className="text-meta text-fg-muted">Preview from Spotify</p>
      </div>
      {playing ? (
        <span aria-hidden="true" className="ml-auto flex h-4 items-end gap-0.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-0.5 origin-bottom rounded bg-accent [animation:wave_0.9s_ease-in-out_infinite]" style={{ height: "100%", animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      ) : null}
      <audio ref={audio} src={previewUrl} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </div>
  );
}
