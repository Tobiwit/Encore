"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewTrack } from "@/server/providers/deezer";
import { IconExternal, IconPause, IconPlay } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { cn } from "./ui";

/**
 * Popular tracks with 30-second previews. One shared <audio> element, so starting a track stops
 * the previous one. Audio streams from the provider; nothing is downloaded or cached by us.
 */
export function TopTracksPlayer({ tracks, artistName, artistLink }: { tracks: PreviewTrack[]; artistName: string; artistLink: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = (track: PreviewTrack) => {
    const el = audio.current;
    if (!el) return;
    if (current === track.id) {
      if (el.paused) void el.play().catch(() => markFailed(track.id));
      else el.pause();
      return;
    }
    el.src = track.previewUrl;
    setCurrent(track.id);
    setProgress(0);
    void el.play().catch(() => markFailed(track.id));
  };

  const markFailed = (id: string) => {
    setFailed((f) => new Set(f).add(id));
    setPlaying(false);
  };

  return (
    <div>
      <ol className="space-y-2">
        {tracks.map((t, i) => {
          const active = current === t.id;
          const isPlaying = active && playing;
          const broken = failed.has(t.id);
          return (
            <li key={t.id} className={cn("relative overflow-hidden rounded-lg bg-surface p-2 pr-3", active && "ring-1 ring-inset ring-accent/60")}>
              <div className="flex items-center gap-3">
                <span className="tabular w-5 shrink-0 text-center text-support font-semibold text-fg-muted">{i + 1}</span>
                <RemoteImage src={t.coverUrl} alt="" rounded="rounded-sm" className="size-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{t.title}</p>
                  <p className="truncate text-meta text-fg-muted">
                    {broken ? "Preview unavailable right now" : t.album ? `${t.album} · 30 s preview` : "30 s preview"}
                  </p>
                </div>
                {t.link ? (
                  <a
                    href={t.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${t.title} on Deezer (new tab)`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-elevated hover:text-fg"
                  >
                    <IconExternal size={18} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  disabled={broken}
                  aria-pressed={isPlaying}
                  aria-label={isPlaying ? `Pause ${t.title}` : `Play preview of ${t.title} by ${artistName}`}
                  className={cn(
                    "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                    isPlaying ? "bg-accent text-bg" : "bg-surface-elevated text-fg hover:bg-accent hover:text-bg",
                  )}
                >
                  {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                </button>
              </div>
              {active ? (
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-elevated">
                  <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-meta text-fg-muted">
        Previews courtesy of{" "}
        {artistLink ? (
          <a href={artistLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg-secondary">
            Deezer
          </a>
        ) : (
          "Deezer"
        )}
        .
      </p>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
        onError={() => current && markFailed(current)}
      />
    </div>
  );
}
