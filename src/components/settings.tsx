"use client";

import { useEffect, useState, useTransition } from "react";
import {
  deleteAccount,
  disconnectSpotify,
  removePushSubscription,
  savePushSubscription,
  updateNotificationPreferences,
  updateProfile,
} from "@/server/actions/profile";
import { unblockUser } from "@/server/actions/friends";
import { BottomSheet } from "./BottomSheet";
import { NotificationPreferenceRow } from "./NotificationPreferenceRow";
import { InlineNotice } from "./states";
import { Button, cn } from "./ui";

type Prefs = {
  presale_reminders_enabled: boolean;
  general_sale_reminders_enabled: boolean;
  new_event_alerts_enabled: boolean;
  friend_activity_enabled: boolean;
  push_enabled: boolean;
  reminder_lead_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

const LEAD_OPTIONS = [15, 30, 60, 180, 1440];

function leadLabel(m: number) {
  return m >= 1440 ? "1 day" : m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
}

export function NotificationSettings({ prefs, pushAvailable, vapidKey }: { prefs: Prefs; pushAvailable: boolean; vapidKey: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [quiet, setQuiet] = useState({ start: prefs.quiet_hours_start?.slice(0, 5) ?? "", end: prefs.quiet_hours_end?.slice(0, 5) ?? "" });

  const save = async (patch: Partial<Prefs>) => {
    setError(null);
    const r = await updateNotificationPreferences(patch);
    if (!r.ok) setError(r.error);
    return r;
  };

  return (
    <div>
      <div className="divide-y divide-line">
        <NotificationPreferenceRow label="Presale reminders" description="Before presales you can join" checked={prefs.presale_reminders_enabled} onChange={(v) => save({ presale_reminders_enabled: v })} />
        <NotificationPreferenceRow label="General sale reminders" description="Before public ticket sales start" checked={prefs.general_sale_reminders_enabled} onChange={(v) => save({ general_sale_reminders_enabled: v })} />
        <NotificationPreferenceRow label="New concerts" description="When an artist you follow announces a show near you" checked={prefs.new_event_alerts_enabled} onChange={(v) => save({ new_event_alerts_enabled: v })} />
        <NotificationPreferenceRow label="Friend activity" description="When friends are going or looking for company" checked={prefs.friend_activity_enabled} onChange={(v) => save({ friend_activity_enabled: v })} />
      </div>

      <div className="flex items-center justify-between gap-4 py-3">
        <label htmlFor="lead" className="font-semibold text-fg">
          Remind me
        </label>
        <select
          id="lead"
          defaultValue={prefs.reminder_lead_minutes}
          onChange={(e) => start(async () => void (await save({ reminder_lead_minutes: Number(e.target.value) })))}
          className="h-11 rounded-full bg-surface-elevated px-4 text-fg ring-1 ring-inset ring-line-strong"
        >
          {[...new Set([...LEAD_OPTIONS, prefs.reminder_lead_minutes])].sort((a, b) => a - b).map((m) => (
            <option key={m} value={m}>
              {leadLabel(m)} before
            </option>
          ))}
        </select>
      </div>

      <fieldset className="py-3">
        <legend className="font-semibold text-fg">Quiet hours</legend>
        <p className="text-support text-fg-secondary">No push notifications in this window ({prefs.timezone}). Sale alerts still appear in your inbox.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-support text-fg-secondary">
            From
            <input
              type="time"
              value={quiet.start}
              onChange={(e) => setQuiet((q) => ({ ...q, start: e.target.value }))}
              className="mt-1 block h-11 rounded-md bg-surface-elevated px-3 text-fg ring-1 ring-inset ring-line-strong"
            />
          </label>
          <label className="text-support text-fg-secondary">
            Until
            <input
              type="time"
              value={quiet.end}
              onChange={(e) => setQuiet((q) => ({ ...q, end: e.target.value }))}
              className="mt-1 block h-11 rounded-md bg-surface-elevated px-3 text-fg ring-1 ring-inset ring-line-strong"
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || (!quiet.start !== !quiet.end)}
            onClick={() =>
              start(async () => {
                await save({ quiet_hours_start: quiet.start || null, quiet_hours_end: quiet.end || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
              })
            }
          >
            Save
          </Button>
          {prefs.quiet_hours_start ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setQuiet({ start: "", end: "" });
                  await save({ quiet_hours_start: null, quiet_hours_end: null });
                })
              }
            >
              Turn off
            </Button>
          ) : null}
        </div>
      </fieldset>

      <PushSettings enabled={prefs.push_enabled} available={pushAvailable} vapidKey={vapidKey} onError={setError} />

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "checking" | "unsupported" | "denied" | "off" | "on" | "needs-install";

function PushSettings({ enabled, available, vapidKey, onError }: { enabled: boolean; available: boolean; vapidKey: string; onError: (e: string | null) => void }) {
  const [state, setState] = useState<PushState>("checking");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!available) return setState("unsupported");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iOS only supports web push for installed (home-screen) apps.
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        return setState(ios ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && enabled ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [available, enabled]);

  const enable = () =>
    start(async () => {
      onError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
        const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (!r.ok) return onError(r.error);
        setState("on");
      } catch {
        onError("This browser couldn't enable push notifications.");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      await updateNotificationPreferences({ push_enabled: false });
      setState("off");
    });

  const text: Record<PushState, string> = {
    checking: "Checking this device…",
    unsupported: "Push isn't available here. You'll still find every alert in your in-app inbox.",
    "needs-install": "On iPhone and iPad, add Encore to your Home Screen first, then enable push here.",
    denied: "Notifications are blocked for this site in your browser settings. Alerts still appear in your inbox.",
    off: "Get sale reminders on this device even when Encore is closed.",
    on: "This device receives push notifications.",
  };

  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-3">
      <div className="min-w-0">
        <p className="font-semibold text-fg">Push on this device</p>
        <p className="text-support text-fg-secondary">{text[state]}</p>
      </div>
      {state === "off" ? (
        <Button size="sm" onClick={enable} disabled={pending}>
          Enable
        </Button>
      ) : state === "on" ? (
        <Button size="sm" variant="secondary" onClick={disable} disabled={pending}>
          Disable
        </Button>
      ) : null}
    </div>
  );
}

export function PrivacySettings({ fanList, intentions }: { fanList: "friends" | "private"; intentions: "friends" | "private" }) {
  const [error, setError] = useState<string | null>(null);
  const set = async (patch: { fan_list_visibility?: "friends" | "private"; default_intention_visibility?: "friends" | "private" }) => {
    const r = await updateProfile(patch);
    if (!r.ok) setError(r.error);
  };
  return (
    <div className="divide-y divide-line">
      <NotificationPreferenceRow
        label="Share my fan list with friends"
        description="Lets accepted friends see your artists and shared overlap. Listening ranks are never shared."
        checked={fanList === "friends"}
        onChange={(v) => set({ fan_list_visibility: v ? "friends" : "private" })}
      />
      <NotificationPreferenceRow
        label="Share new plans with friends by default"
        description="You can still change visibility for each concert."
        checked={intentions === "friends"}
        onChange={(v) => set({ default_intention_visibility: v ? "friends" : "private" })}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </div>
  );
}

export function UnblockButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} aria-label={`Unblock ${name}`} onClick={() => start(async () => void (await unblockUser(userId)))}>
      Unblock
    </Button>
  );
}

export function DisplayNameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfile({ display_name: value });
          setStatus(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
        });
      }}
    >
      <label className="min-w-0 flex-1 text-support text-fg-secondary">
        Display name
        <input
          value={value}
          maxLength={60}
          required
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 block h-11 w-full rounded-md bg-surface-elevated px-3 text-body text-fg ring-1 ring-inset ring-line-strong"
        />
      </label>
      <Button size="sm" variant="secondary" disabled={pending || value.trim() === name}>
        Save
      </Button>
      <span role="status" className={cn("sr-only", status && "not-sr-only text-meta", status?.ok ? "text-success" : "text-error")}>
        {status?.text}
      </span>
    </form>
  );
}

export function DisconnectSpotifyButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Disconnect Spotify?"
        description="We'll delete your stored Spotify tokens and stop weekly imports. Your fan list stays. To fully revoke access, also remove Encore under Apps in your Spotify account settings."
      >
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <Button
          variant="danger"
          className="mt-4 w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await disconnectSpotify();
              if (!r.ok) return setError(r.error);
              setOpen(false);
            })
          }
        >
          Disconnect Spotify
        </Button>
      </BottomSheet>
    </>
  );
}

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        description="This permanently deletes your profile, fan list, saved concerts, plans, friendships, notifications and stored Spotify tokens. It can't be undone. Data already held by Spotify or ticket providers is governed by their own policies."
      >
        <label className="block text-support text-fg-secondary">
          Type DELETE to confirm
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="mt-1 block h-11 w-full rounded-md bg-surface px-3 text-fg ring-1 ring-inset ring-line-strong"
          />
        </label>
        {error ? (
          <div className="mt-3">
            <InlineNotice tone="error">{error}</InlineNotice>
          </div>
        ) : null}
        <Button
          variant="danger"
          className="mt-4 w-full"
          disabled={pending || confirm.trim().toUpperCase() !== "DELETE"}
          onClick={() =>
            start(async () => {
              const r = await deleteAccount(confirm);
              if (r && !r.ok) setError(r.error);
            })
          }
        >
          Permanently delete
        </Button>
      </BottomSheet>
    </>
  );
}
