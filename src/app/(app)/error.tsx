"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui";

/** Segment error boundary for every authenticated screen. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="pt-10">
      <ErrorState
        kind={offline ? "offline" : "error"}
        title={offline ? "You're offline" : "This screen couldn't load"}
        body={
          offline
            ? "Reconnect to see the latest concerts and sale times."
            : "Something went wrong while loading your data. Your saved artists and plans are safe."
        }
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      />
      {error.digest ? <p className="mt-3 text-meta text-fg-muted">Reference: {error.digest}</p> : null}
    </div>
  );
}
