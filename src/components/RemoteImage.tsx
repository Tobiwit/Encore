"use client";

import { useState, type CSSProperties } from "react";
import { IconMusic } from "./icons";
import { cn } from "./ui";

/** Band width of the sliced glass; scale with the rendered image size. */
const PRISM_BAND = { sm: "5px", md: "9px", lg: "14px" } as const;

const FADE_CLASS = {
  bottom: "image-fade-bottom",
  right: "image-fade-right",
} as const;

/**
 * Provider artwork with graceful handling of missing, broken and slow images.
 * Plain <img> on purpose: provider CDNs vary and must not break rendering when unknown.
 *
 * - `fade` dissolves one edge into whatever surface sits behind (borderless cards).
 * - `prism` adds the signature sliced-glass corner: the picture refracted through diagonal
 *   glass bands from the top-left, fading back into the clean image. It settles in when the
 *   picture loads and shimmers when the surrounding `.group` is hovered or focused.
 */
export function RemoteImage({
  src,
  alt,
  className,
  rounded = "rounded-md",
  priority = false,
  fade,
  prism,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
  fade?: keyof typeof FADE_CLASS;
  prism?: keyof typeof PRISM_BAND;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const show = Boolean(src) && !failed;

  return (
    <div className={cn("relative overflow-hidden bg-surface-elevated", rounded, fade && FADE_CLASS[fade], className)}>
      {!loaded || !show ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(120%_90%_at_20%_0%,#3a2f33_0%,#211d1f_60%)] text-fg-muted">
          <IconMusic size={28} />
        </div>
      ) : null}
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Images can finish loading before hydration, when React's onLoad has not been attached yet.
          ref={(el) => {
            if (!el?.complete) return;
            if (el.naturalWidth > 0) setLoaded(true);
            else setFailed(true);
          }}
          src={src!}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {prism && show && loaded ? <PrismGlass src={src!} band={PRISM_BAND[prism]} /> : null}
    </div>
  );
}

function PrismGlass({ src, band }: { src: string; band: string }) {
  const style = { "--prism-src": `url("${src.replace(/"/g, "%22")}")`, "--band": band } as CSSProperties;
  return (
    <div className="prism-glass" style={style} aria-hidden="true">
      <div className="prism-glass__slice prism-glass__slice--a" />
      <div className="prism-glass__slice prism-glass__slice--b" />
      <div className="prism-glass__sheen" />
    </div>
  );
}

export function Avatar({ src, name, size = 36, className }: { src: string | null | undefined; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-muted font-semibold text-fg ring-2 ring-bg", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden={!src || failed ? undefined : true}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials || "?"}</span>
      )}
    </span>
  );
}
