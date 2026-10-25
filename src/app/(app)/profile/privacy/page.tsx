import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { UnblockButton } from "@/components/settings";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Blocked accounts" };

export default async function PrivacyPage() {
  const user = await requireUser();
  const supabase = await createClient();
  // RLS: only the caller's own blocks are returned.
  const { data: blocks } = await supabase.from("user_blocks").select("blocked_id, created_at").eq("blocker_id", user.id);

  // get_profiles() hides blocked users by design, so read just the names server-side for this list.
  let names = new Map<string, string>();
  if (blocks?.length) {
    const admin = createAdminClient();
    const { data } = await admin.from("users").select("id, display_name").in("id", blocks.map((b) => b.blocked_id));
    names = new Map((data ?? []).map((u) => [u.id, u.display_name]));
  }

  return (
    <div>
      <div className="pt-4">
        <BackLink fallback="/profile" />
      </div>
      <PageHeader title="Blocked accounts" subtitle="Blocked people can't see your profile, artists or plans, or send you requests." />
      {blocks?.length ? (
        <ul className="divide-y divide-line rounded-lg bg-surface px-4">
          {blocks.map((b) => {
            const name = names.get(b.blocked_id) ?? "Deleted account";
            return (
              <li key={b.blocked_id} className="flex items-center justify-between gap-3 py-3">
                <span className="font-semibold text-fg">{name}</span>
                <UnblockButton userId={b.blocked_id} name={name} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-support text-fg-secondary">You haven&apos;t blocked anyone.</p>
      )}
    </div>
  );
}
