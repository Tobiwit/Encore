import Link from "next/link";
import { redirect } from "next/navigation";
import { GeometricBackground } from "@/components/GeometricBackground";
import { IconMusic, IconTicket, IconFriends } from "@/components/icons";
import { InlineNotice } from "@/components/states";
import { Button } from "@/components/ui";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/text";
import { signInWithSpotify } from "@/server/actions/auth";

const ERRORS: Record<string, string> = {
  denied: "Spotify access was not granted. Encore needs it to know which artists to follow — you can try again any time.",
  oauth: "Signing in with Spotify didn't complete. Please try again.",
  oauth_start: "We couldn't reach Spotify. Please try again in a moment.",
  account: "Signed in, but we couldn't save your Spotify connection. Please try again.",
};

export default async function Landing({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("users").select("onboarding_completed_at").eq("id", user.id).maybeSingle();
    redirect(profile?.onboarding_completed_at ? "/discover" : "/onboarding");
  }

  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null, "/onboarding");
  const deleted = params.deleted === "1";

  return (
    <main id="main" className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 pb-10 pt-safe sm:px-6">
      <GeometricBackground className="-z-10 opacity-90" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <p className="pt-8 text-section font-semibold tracking-tight">Encore</p>

        <div className="mt-auto pb-8 pt-24">
          <h1 className="text-display font-semibold text-fg">
            Find your artists.
            <br />
            Catch the moment.
            <br />
            <span className="text-accent">Go together.</span>
          </h1>
          <p className="mt-4 max-w-sm text-body text-fg-secondary">
            Encore turns the music you love into concerts you don&apos;t miss — with reminders before tickets go on sale and friends to go with.
          </p>

          <ul className="mt-8 space-y-3 text-support text-fg-secondary">
            <li className="flex items-center gap-3">
              <IconMusic size={20} className="shrink-0 text-accent" /> Your top artists, imported from Spotify and curated by you
            </li>
            <li className="flex items-center gap-3">
              <IconTicket size={20} className="shrink-0 text-accent" /> Presale and general-sale reminders from official providers
            </li>
            <li className="flex items-center gap-3">
              <IconFriends size={20} className="shrink-0 text-accent" /> See which friends share your taste — only if you both agree
            </li>
          </ul>

          <div className="mt-8 space-y-3">
            {deleted ? <InlineNotice tone="neutral">Your account has been deleted.</InlineNotice> : null}
            {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
            <form action={signInWithSpotify}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit" size="lg" className="w-full">
                Continue with Spotify
              </Button>
            </form>
            <p className="text-meta text-fg-muted">
              We ask only to read your top artists (<code className="text-fg-secondary">user-top-read</code>) plus your basic Spotify profile to sign you in. We never
              post to Spotify or see your playback. Read our{" "}
              <Link href="/legal" className="text-fg-secondary underline underline-offset-2">
                privacy notes
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
