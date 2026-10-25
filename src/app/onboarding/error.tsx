"use client";

import { RouteError } from "@/components/RouteError";

export default function OnboardingError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 pb-12 sm:px-6">
      <RouteError {...props} title="This setup step couldn't load" fallback={{ href: "/onboarding", label: "Back to the first step" }} />
    </main>
  );
}
