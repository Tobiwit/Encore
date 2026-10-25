"use client";

import { RouteError } from "@/components/RouteError";

/** Segment error boundary for every authenticated screen. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} fallback={{ href: "/discover", label: "Go to Discover" }} />;
}
