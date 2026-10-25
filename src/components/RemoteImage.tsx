"use client";

import { useState } from "react";
import { IconMusic } from "./icons";
import { cn } from "./ui";

/**
 * Provider artwork with graceful handling of missing, broken and slow images.
 * Plain <img> on purpose: provider CDNs vary and must not break rendering when unknown.
 * The placeholder uses the warm dark palette rather than a colour overlay on the photo.
 */
export function RemoteImage({
  src,
  alt,
  className,
  rounded = "rounded-md",
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const show = Boolean(src) && !failed;

  return (
    <div className={cn("relative overflow-hidden bg-surface-elevated", rounded, className)}>
      {!loaded || !show ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(120%_90%_at_20%_0%,#3a2f33_0%,#211d1f_60%)] text-fg-muted">
          <IconMusic size={28} />
        </div>
      ) : null}
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
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
