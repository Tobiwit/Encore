"use client";

import { useState, useTransition } from "react";
import { setEventIntention } from "@/server/actions/events";
import { BottomSheet } from "./BottomSheet";
import { IconCheck } from "./icons";
import { InlineNotice } from "./states";
import { Button, cn } from "./ui";

type Intention = "interested" | "going" | "looking_for_company";
type Visibility = "friends" | "private";

const OPTIONS: { value: Intention; label: string; detail: string }[] = [
  { value: "interested", label: "Interested", detail: "You're keeping an eye on it." },
  { value: "going", label: "Going", detail: "You plan to go. This doesn't mean we've checked a ticket." },
  { value: "looking_for_company", label: "Looking for company", detail: "Let friends know you'd like someone to go with." },
];

export function IntentionControl({
  eventId,
  current,
  defaultVisibility,
  disabled,
}: {
  eventId: string;
  current: { intention: Intention; visibility: Visibility } | null;
  defaultVisibility: Visibility;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [intention, setIntention] = useState<Intention | null>(current?.intention ?? null);
  const [visibility, setVisibility] = useState<Visibility>(current?.visibility ?? defaultVisibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: Intention | null) =>
    start(async () => {
      setError(null);
      const result = await setEventIntention({ eventId, intention: next, visibility });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIntention(next);
      setOpen(false);
    });

  const label = OPTIONS.find((o) => o.value === current?.intention)?.label;

  return (
    <>
      <Button variant={current ? "secondary" : "primary"} onClick={() => setOpen(true)} disabled={disabled} className="flex-1">
        {current ? (
          <>
            <IconCheck size={18} /> {label}
            <span className="font-normal text-fg-muted">· {current.visibility === "friends" ? "Friends" : "Only you"}</span>
          </>
        ) : (
          "I'm interested…"
        )}
      </Button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Your plans" description="Separate from Saved — this is what friends can see.">
        <fieldset>
          <legend className="sr-only">Your intention</legend>
          <div className="space-y-2">
            {OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex min-h-14 cursor-pointer items-start gap-3 rounded-md px-4 py-3 ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                  intention === o.value ? "bg-accent-muted ring-accent" : "bg-surface ring-line hover:ring-line-strong",
                )}
              >
                <input type="radio" name="intention" value={o.value} checked={intention === o.value} onChange={() => setIntention(o.value)} className="sr-only" />
                <span
                  aria-hidden="true"
                  className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-2", intention === o.value ? "bg-accent ring-accent text-bg" : "ring-line-strong")}
                >
                  {intention === o.value ? <IconCheck size={14} /> : null}
                </span>
                <span>
                  <span className="block font-semibold text-fg">{o.label}</span>
                  <span className="block text-support text-fg-secondary">{o.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-support font-semibold text-fg">Who can see this</legend>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1">
            {(["friends", "private"] as const).map((v) => (
              <label
                key={v}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-full text-support font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                  visibility === v ? "bg-surface-elevated text-fg ring-1 ring-line-strong" : "text-fg-secondary",
                )}
              >
                <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
                {v === "friends" ? "Accepted friends" : "Only me"}
              </label>
            ))}
          </div>
          <p className="mt-2 text-meta text-fg-muted">
            {visibility === "friends"
              ? "Your accepted friends will see this on the event and in their feed. Blocked people never will."
              : "Nobody else can see this, not even friends."}
          </p>
        </fieldset>

        {error ? (
          <div className="mt-4">
            <InlineNotice tone="error">{error}</InlineNotice>
          </div>
        ) : null}

        <div className="mt-6 flex gap-2">
          {current ? (
            <Button variant="ghost" onClick={() => save(null)} disabled={pending}>
              Remove
            </Button>
          ) : null}
          <Button className="flex-1" onClick={() => intention && save(intention)} disabled={!intention || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
