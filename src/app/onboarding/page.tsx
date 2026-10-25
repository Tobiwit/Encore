import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GeometricBackground } from "@/components/GeometricBackground";
import { LocationEditor } from "@/components/LocationEditor";
import { ImportStep, OnboardingArtistRow } from "@/components/onboarding";
import { NotificationSettings, PrivacySettings } from "@/components/settings";
import { Button, ButtonLink, cn } from "@/components/ui";
import { publicEnv, pushConfig } from "@/lib/env";
import { createClient, requireUser } from "@/lib/supabase/server";
import { completeOnboarding } from "@/server/actions/profile";
import { getMyArtists } from "@/server/data/artists";
import { getUserLocations } from "@/server/data/events";

export const metadata: Metadata = { title: "Welcome" };
// Server actions on this page (Spotify import) continue a concert search via after().
export const maxDuration = 300;

const STEPS = ["import", "artists", "location", "alerts", "privacy"] as const;
type Step = (typeof STEPS)[number];

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { step: raw } = await searchParams;
  const step: Step = STEPS.includes(raw as Step) ? (raw as Step) : "import";
  const index = STEPS.indexOf(step);
  const next = STEPS[index + 1];
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("users").select("display_name, fan_list_visibility, default_intention_visibility, onboarding_completed_at").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/");

  return (
    <main id="main" className="relative isolate min-h-dvh px-4 pb-12 pt-safe sm:px-6">
      <GeometricBackground className="-z-10 opacity-60" />
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-4 pt-6">
          <p className="text-section font-semibold">Encore</p>
          <p className="tabular text-support text-fg-secondary">
            Step {index + 1} of {STEPS.length}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-1 rounded-full", i <= index ? "bg-accent" : "bg-line")} />
          ))}
        </div>

        <div className="pt-10">
          {step === "import" ? (
            <>
              <h1 className="text-page font-semibold">Hi {profile.display_name.split(" ")[0]} — let&apos;s find your artists</h1>
              <p className="mt-2 text-fg-secondary">
                We&apos;re reading your Spotify top artists from the last 4 weeks, 6 months and all time. You decide who stays on your list.
              </p>
              <div className="mt-8">
                <ImportStep nextHref="/onboarding?step=artists" />
              </div>
            </>
          ) : null}

          {step === "artists" ? <ArtistsStep userId={user.id} /> : null}

          {step === "location" ? <LocationStep userId={user.id} /> : null}

          {step === "alerts" ? <AlertsStep userId={user.id} /> : null}

          {step === "privacy" ? (
            <>
              <h1 className="text-page font-semibold">Your privacy</h1>
              <p className="mt-2 text-fg-secondary">
                By default, only friends you accept can see your artists and concert plans. Nothing is public, and your listening ranks are never shared.
              </p>
              <div className="mt-6 rounded-lg bg-surface px-4 py-2">
                <PrivacySettings fanList={profile.fan_list_visibility} intentions={profile.default_intention_visibility} />
              </div>
              <form action={completeOnboarding} className="mt-8">
                <Button size="lg" className="w-full">
                  Start discovering
                </Button>
              </form>
            </>
          ) : null}

          {next && step !== "import" ? (
            <div className="mt-8 flex flex-col gap-2">
              <ButtonLink href={`/onboarding?step=${next}`} size="lg" className="w-full">
                Continue
              </ButtonLink>
              {step === "location" || step === "alerts" ? (
                <Link href={`/onboarding?step=${next}`} className="inline-flex min-h-11 items-center justify-center text-support font-semibold text-fg-secondary">
                  Set this up later
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

async function ArtistsStep({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { active } = await getMyArtists(supabase, userId);
  return (
    <>
      <h1 className="text-page font-semibold">Curate your fan list</h1>
      <p className="mt-2 text-fg-secondary">
        Pin the artists you never want to miss and remove anyone who doesn&apos;t belong. You can fine-tune everything later.
      </p>
      {active.length ? (
        <ul className="mt-6 divide-y divide-line">
          {active.map((a) => (
            <OnboardingArtistRow key={a.id} artist={a} />
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg bg-surface p-5">
          <p className="font-semibold">No artists yet</p>
          <p className="mt-1 text-support text-fg-secondary">Spotify didn&apos;t return any top artists — this happens with new or rarely used accounts. You can add artists by hand after setup.</p>
        </div>
      )}
    </>
  );
}

async function LocationStep({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data: cities }, locations] = await Promise.all([
    supabase.from("cities").select("id, name, country_code").order("country_code").order("name"),
    getUserLocations(supabase, userId),
  ]);
  return (
    <>
      <h1 className="text-page font-semibold">Where do you go to concerts?</h1>
      <p className="mt-2 text-fg-secondary">Pick a home city and how far you&apos;d travel. Add more cities if you often go elsewhere.</p>
      <div className="mt-6">
        <LocationEditor compact cities={cities ?? []} locations={locations} />
      </div>
    </>
  );
}

async function AlertsStep({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).single();
  return (
    <>
      <h1 className="text-page font-semibold">Never miss a sale</h1>
      <p className="mt-2 text-fg-secondary">
        We&apos;ll remind you before presales and general sales for artists you follow near you. Every alert also appears in your in-app inbox, so push is optional.
      </p>
      <div className="mt-6 rounded-lg bg-surface px-4 py-2">
        {prefs ? <NotificationSettings prefs={prefs} pushAvailable={Boolean(pushConfig())} vapidKey={publicEnv.vapidPublicKey} /> : null}
      </div>
    </>
  );
}
