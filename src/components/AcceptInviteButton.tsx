"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvite } from "@/server/actions/friends";
import { InlineNotice } from "./states";
import { Button } from "./ui";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvite(token);
            if (!r.ok) return setError(r.error);
            router.push("/friends");
          })
        }
      >
        {pending ? "Connecting…" : "Connect"}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => router.push("/discover")}>
        Not now
      </Button>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </div>
  );
}
