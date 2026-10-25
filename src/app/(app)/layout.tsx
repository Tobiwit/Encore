import { redirect } from "next/navigation";
import { BottomNavigation } from "@/components/BottomNavigation";
import { OfflineBanner } from "@/components/OfflineBanner";
import { createClient, requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { count: unread }] = await Promise.all([
    supabase.from("users").select("onboarding_completed_at").eq("id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  return (
    <div className="min-h-dvh md:pl-20 lg:pl-56">
      <OfflineBanner />
      <main id="main" className="mx-auto w-full max-w-2xl px-4 pb-nav pt-safe sm:px-6 md:pb-12">
        {children}
      </main>
      <BottomNavigation unread={unread ?? 0} />
    </div>
  );
}
