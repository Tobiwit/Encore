import type { Metadata } from "next";
import Link from "next/link";
import { GlassPanel } from "@/components/GeometricBackground";
import { IconBell, IconChevronRight, IconMapPin } from "@/components/icons";
import { Avatar } from "@/components/RemoteImage";
import {
  DeleteAccountButton,
  DisconnectSpotifyButton,
  DisplayNameForm,
  NotificationSettings,
  PrivacySettings,
} from "@/components/settings";
import { SpotifyRefreshButton } from "@/components/SpotifyRefreshButton";
import { InlineNotice } from "@/components/states";
import { Button, PageHeader, SectionHeader } from "@/components/ui";
import { publicEnv, pushConfig } from "@/lib/env";
import { formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { signInWithSpotify } from "@/server/actions/auth";
import { signOut } from "@/server/actions/profile";
import { getUserLocations } from "@/server/data/events";

export const metadata: Metadata = { title: "Profile" };

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-surface px-4 py-2">{children}</div>;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: account }, { data: prefs }, locations, { count: unread }] = await Promise.all([
    supabase.from("users").select("display_name, avatar_url, fan_list_visibility, default_intention_visibility").eq("id", user.id).single(),
    supabase.from("connected_accounts").select("status, last_successful_sync_at, last_sync_error, connected_at").eq("user_id", user.id).eq("provider", "spotify").maybeSingle(),
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).single(),
    getUserLocations(supabase, user.id),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (!profile || !prefs) throw new Error("Profile not found");

  return (
    <div className="space-y-8 pb-6">
      <PageHeader title="Profile" />

      <GlassPanel>
        <div className="flex items-center gap-4 p-5">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={64} />
          <div className="min-w-0">
            <p className="truncate text-section font-semibold">{profile.display_name}</p>
            <p className="text-support text-fg-secondary">Signed in with Spotify</p>
          </div>
        </div>
      </GlassPanel>

      <Link href="/notifications" className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 font-semibold text-fg hover:bg-surface-elevated">
        <IconBell /> Notifications
        {unread ? <span className="tabular rounded-full bg-accent px-2 py-0.5 text-meta text-bg">{unread} new</span> : null}
        <IconChevronRight className="ml-auto text-fg-muted" />
      </Link>

      <section aria-labelledby="spotify">
        <SectionHeader id="spotify" title="Spotify" />
        <Card>
          <div className="py-3">
            {account?.status === "active" ? (
              <>
                <p className="font-semibold text-success">Connected</p>
                <p className="text-support text-fg-secondary">
                  {account.last_successful_sync_at ? `Last synced ${formatRelativePast(account.last_successful_sync_at)} · refreshes weekly` : "First import pending"}
                </p>
              </>
            ) : account?.status === "error" ? (
              <>
                <p className="font-semibold text-warning">Sync paused</p>
                <p className="text-support text-fg-secondary">We couldn&apos;t reach Spotify several times. Try a manual refresh or reconnect.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-fg-secondary">Not connected</p>
                <p className="text-support text-fg-secondary">Your fan list is kept. Reconnect to resume weekly imports.</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line py-3">
            {account?.status === "active" || account?.status === "error" ? (
              <>
                <SpotifyRefreshButton compact />
                <DisconnectSpotifyButton />
              </>
            ) : (
              <form action={signInWithSpotify}>
                <input type="hidden" name="next" value="/profile" />
                <Button size="sm">Reconnect Spotify</Button>
              </form>
            )}
          </div>
        </Card>
      </section>

      <section aria-labelledby="locations">
        <SectionHeader id="locations" title="Locations" />
        <Link href="/profile/locations" className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 hover:bg-surface-elevated">
          <IconMapPin className="text-fg-secondary" />
          <span className="min-w-0 flex-1">
            {locations.length ? (
              <>
                <span className="block font-semibold text-fg">{locations.map((l) => l.cityName).join(", ")}</span>
                <span className="block text-meta text-fg-secondary">Home radius {locations[0].radiusKm} km</span>
              </>
            ) : (
              <span className="font-semibold text-fg">Add your city</span>
            )}
          </span>
          <IconChevronRight className="text-fg-muted" />
        </Link>
      </section>

      <section aria-labelledby="notifications">
        <SectionHeader id="notifications" title="Alerts" />
        <Card>
          <NotificationSettings prefs={prefs} pushAvailable={Boolean(pushConfig())} vapidKey={publicEnv.vapidPublicKey} />
        </Card>
      </section>

      <section aria-labelledby="privacy">
        <SectionHeader
          id="privacy"
          title="Privacy"
          action={
            <Link href="/profile/privacy" className="inline-flex min-h-11 items-center text-support font-semibold text-accent">
              Blocked accounts
            </Link>
          }
        />
        <Card>
          <PrivacySettings fanList={profile.fan_list_visibility} intentions={profile.default_intention_visibility} />
        </Card>
      </section>

      <section aria-labelledby="account">
        <SectionHeader id="account" title="Account" />
        <Card>
          <div className="py-3">
            <DisplayNameForm name={profile.display_name} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line py-3">
            <form action={signOut}>
              <Button size="sm" variant="secondary">
                Sign out
              </Button>
            </form>
            <DeleteAccountButton />
          </div>
        </Card>
        {account?.last_sync_error && account.status !== "active" ? (
          <div className="mt-3">
            <InlineNotice tone="neutral">Last Spotify error: {account.last_sync_error.slice(0, 160)}</InlineNotice>
          </div>
        ) : null}
      </section>

      <footer className="space-y-1 text-center text-meta text-fg-muted">
        <p>
          <Link href="/legal" className="underline underline-offset-2">
            Privacy, terms &amp; attribution
          </Link>
        </p>
        <p>Artist data from Spotify. Event data from Ticketmaster.</p>
      </footer>
    </div>
  );
}
