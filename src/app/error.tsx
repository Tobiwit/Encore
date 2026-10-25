"use client";

import { RouteError } from "@/components/RouteError";

/** Fallback boundary for pages outside the app shell (landing, invites, legal). */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 pb-12 sm:px-6">
      <RouteError {...props} title="This page couldn't load" fallback={{ href: "/", label: "Back to start" }} />
    </main>
  );
}
