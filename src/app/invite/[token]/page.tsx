import type { Metadata } from "next";
import { GeometricBackground } from "@/components/GeometricBackground";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";
import { Avatar } from "@/components/RemoteImage";
import { Button, ButtonLink } from "@/components/ui";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signInWithSpotify } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const valid = /^[a-f0-9]{36}$/.test(token);
  const user = await getSessionUser();

  let inviter: { inviter_id: string; display_name: string; avatar_url: string | null; expired: boolean } | null = null;
  if (user && valid) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_invite", { p_token: token });
    inviter = data?.[0] ?? null;
  }

  return (
    <main id="main" className="relative isolate flex min-h-dvh items-center px-4 pt-safe">
      <GeometricBackground className="-z-10" />
      <div className="mx-auto w-full max-w-sm space-y-6 text-center">
        <p className="text-section font-semibold">Encore</p>
        {!valid ? (
          <p className="text-fg-secondary">This invitation link isn&apos;t valid.</p>
        ) : !user ? (
          <>
            <h1 className="text-page font-semibold">You&apos;ve been invited to Encore</h1>
            <p className="text-fg-secondary">Sign in to see who invited you and connect. Your friend won&apos;t see anything until you accept.</p>
            <form action={signInWithSpotify}>
              <input type="hidden" name="next" value={`/invite/${token}`} />
              <Button size="lg" className="w-full">
                Continue with Spotify
              </Button>
            </form>
          </>
        ) : !inviter ? (
          <>
            <h1 className="text-page font-semibold">Invitation not found</h1>
            <p className="text-fg-secondary">It may have been withdrawn. Ask your friend for a new link.</p>
            <ButtonLink href="/discover" variant="secondary">
              Go to Encore
            </ButtonLink>
          </>
        ) : inviter.inviter_id === user.id ? (
          <>
            <h1 className="text-page font-semibold">This is your own invite</h1>
            <p className="text-fg-secondary">Share it with a friend so they can connect with you.</p>
            <ButtonLink href="/friends" variant="secondary">
              Back to Friends
            </ButtonLink>
          </>
        ) : inviter.expired ? (
          <>
            <h1 className="text-page font-semibold">This invitation has expired</h1>
            <p className="text-fg-secondary">Ask {inviter.display_name} for a new link.</p>
          </>
        ) : (
          <>
            <Avatar src={inviter.avatar_url} name={inviter.display_name} size={88} className="mx-auto" />
            <h1 className="text-page font-semibold">{inviter.display_name} wants to connect</h1>
            <p className="text-fg-secondary">Friends can see shared artists and each other&apos;s concert plans, based on each person&apos;s privacy settings.</p>
            <AcceptInviteButton token={token} />
          </>
        )}
      </div>
    </main>
  );
}
