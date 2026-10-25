"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissEvent } from "@/server/actions/events";
import { Button } from "./ui";

export function DismissEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await dismissEvent(eventId);
          if (result.ok) router.push("/discover");
        })
      }
    >
      Not interested — hide from Discover
    </Button>
  );
}
