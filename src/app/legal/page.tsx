import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { InlineNotice } from "@/components/states";

export const metadata: Metadata = { title: "Privacy & attribution" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-section font-semibold">{title}</h2>
      <div className="space-y-2 text-fg-secondary">{children}</div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-safe sm:px-6">
      <div className="pt-4">
        <BackLink fallback="/" />
      </div>
      <h1 className="text-page font-semibold">Privacy, terms &amp; attribution</h1>
      <InlineNotice tone="neutral">
        Draft product notes for development. A reviewed privacy policy, imprint (Impressum) and terms must replace this page before public launch.
      </InlineNotice>

      <Section title="What we store">
        <p>
          Your Spotify profile identifier, display name and avatar; your fan list and preferences; the cities and radius you choose; saved concerts and plans; friendships and
          blocks; and notifications we sent you. We keep only the three most recent snapshots of your Spotify top-artist ranks.
        </p>
        <p>We never store your precise location. Location is based on the city centres you pick.</p>
      </Section>

      <Section title="Spotify access">
        <p>
          We request <code>user-top-read</code> to import your top artists, plus basic profile access to sign you in. Access and refresh tokens are encrypted and kept on our
          servers only. Disconnecting deletes the stored tokens; you can also revoke Encore in your Spotify account settings.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          Nothing is public. Accepted friends can see your fan list (unless you hide it) and the concert plans you share with friends. Plans marked &ldquo;only me&rdquo; are
          visible to nobody else. Blocking hides everything between you and the other person.
        </p>
        <p>&ldquo;Going&rdquo; is your stated plan. Encore never verifies or claims that you hold a ticket.</p>
      </Section>

      <Section title="Tickets and prices">
        <p>
          Encore doesn&apos;t sell tickets. Event details, sale dates and price ranges come from ticket providers and are shown with the time they were last updated. A
          scheduled sale doesn&apos;t mean tickets are available, and provider price ranges may not include every category or fee. If any commercial or affiliate links are
          introduced, they will be labelled and will never affect the order of results.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          Deleting your account removes your profile, fan list, plans, saved concerts, friendships, notifications, scheduled reminders and stored tokens from Encore. Shared
          catalogue data (artists and events) is kept. We can&apos;t delete data held by Spotify or ticket providers; their own policies apply.
        </p>
      </Section>

      <Section title="Attribution">
        <p>Artist names, images and links: Spotify. Event, venue, sale and price data: Ticketmaster Discovery API.</p>
      </Section>
    </main>
  );
}
