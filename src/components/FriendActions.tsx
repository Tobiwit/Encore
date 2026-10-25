"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockUser, createInviteLink, removeFriend, respondToRequest } from "@/server/actions/friends";
import { BottomSheet } from "./BottomSheet";
import { IconCheck, IconShare } from "./icons";
import { InlineNotice } from "./states";
import { Button } from "./ui";

export function InviteButton() {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const share = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Encore", text: "Let's find concerts to go to together.", url });
        return;
      } catch {
        // Share sheet dismissed: fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied. It works for 14 days.");
    } catch {
      setStatus("Copy the link below to share it.");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStatus(null);
            const r = link ? { ok: true as const, url: link } : await createInviteLink();
            if (!r.ok) return setStatus(r.error);
            setLink(r.url);
            await share(r.url);
          })
        }
      >
        <IconShare size={18} /> Invite a friend
      </Button>
      {link ? (
        <input
          readOnly
          value={link}
          aria-label="Invitation link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full rounded-md bg-surface px-3 text-support text-fg-secondary ring-1 ring-inset ring-line-strong"
        />
      ) : null}
      <p role="status" aria-live="polite" className="text-meta text-fg-secondary">
        {status}
      </p>
    </div>
  );
}

export function RequestResponse({ friendshipId, name }: { friendshipId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (accept: boolean) =>
    start(async () => {
      const r = await respondToRequest(friendshipId, accept);
      if (!r.ok) setError(r.error);
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => respond(false)} aria-label={`Decline ${name}`}>
          Decline
        </Button>
        <Button size="sm" disabled={pending} onClick={() => respond(true)} aria-label={`Accept ${name}`}>
          <IconCheck size={16} /> Accept
        </Button>
      </div>
      {error ? <p className="text-meta text-error">{error}</p> : null}
    </div>
  );
}

export function FriendManagement({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"remove" | "block" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setSheet(null);
      router.push("/friends");
    });

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setSheet("remove")}>
        Remove friend
      </Button>
      <Button variant="danger" size="sm" onClick={() => setSheet("block")}>
        Block
      </Button>
      <BottomSheet
        open={sheet === "remove"}
        onClose={() => setSheet(null)}
        title={`Remove ${name}?`}
        description="You'll stop seeing each other's artists and plans. They won't be notified."
      >
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <Button className="mt-4 w-full" variant="danger" disabled={pending} onClick={() => run(() => removeFriend(userId))}>
          Remove friend
        </Button>
      </BottomSheet>
      <BottomSheet
        open={sheet === "block"}
        onClose={() => setSheet(null)}
        title={`Block ${name}?`}
        description="Blocking removes the friendship and hides your profile, artists and plans from each other. They can't send you requests. You can unblock in Profile → Privacy."
      >
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <Button className="mt-4 w-full" variant="danger" disabled={pending} onClick={() => run(() => blockUser(userId))}>
          Block {name}
        </Button>
      </BottomSheet>
    </div>
  );
}
