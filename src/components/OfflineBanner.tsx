"use client";

import { useSyncExternalStore } from "react";
import { IconWifiOff } from "./icons";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Announces lost connectivity; content already on screen stays readable. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-surface-elevated px-4 py-2 text-support text-fg-secondary">
      <IconWifiOff size={18} /> You&apos;re offline. Showing what was already loaded; changes will need a connection.
    </div>
  );
}
