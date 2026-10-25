"use client";

import { useEffect } from "react";
import { ErrorState } from "./states";
import { Button, ButtonLink } from "./ui";

/** Shared body for route error boundaries: explains, offers recovery, shows a support reference. */
export function RouteError({
  error,
  reset,
  title = "This screen couldn't load",
  fallback,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  fallback?: { href: string; label: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="pt-10">
      <ErrorState
        kind={offline ? "offline" : "error"}
        title={offline ? "You're offline" : title}
        body={
          offline
            ? "Reconnect to see the latest concerts and sale times."
            : "Something went wrong on our side. Your saved artists and plans are safe — try again in a moment."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              Try again
            </Button>
            {fallback ? (
              <ButtonLink href={fallback.href} variant="ghost" size="sm">
                {fallback.label}
              </ButtonLink>
            ) : null}
          </div>
        }
      />
      {error.digest ? <p className="mt-3 text-meta text-fg-muted">Reference for support: {error.digest}</p> : null}
    </div>
  );
}
