import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { IconBell } from "@/components/icons";
import { MarkReadOnView } from "@/components/MarkReadOnView";
import { EmptyState } from "@/components/states";
import { cn, PageHeader } from "@/components/ui";
import { formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/text";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("notifications")
    .select("id, title, body, deep_link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const hasUnread = items?.some((n) => !n.read_at) ?? false;

  return (
    <div>
      <div className="pt-4">
        <BackLink fallback="/discover" />
      </div>
      <PageHeader title="Notifications" subtitle="Every alert lands here, even when push is off." />
      {hasUnread ? <MarkReadOnView /> : null}
      {items?.length ? (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={safeRedirectPath(n.deep_link, "/discover")}
                className={cn("flex gap-3 rounded-lg p-4 transition-colors hover:bg-surface-elevated", n.read_at ? "bg-surface" : "bg-surface ring-1 ring-inset ring-accent/50")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">
                    {!n.read_at ? <span className="sr-only">Unread: </span> : null}
                    {n.title}
                  </span>
                  <span className="block text-support text-fg-secondary">{n.body}</span>
                  <span className="mt-1 block text-meta text-fg-muted">{formatRelativePast(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<IconBell />} title="No notifications yet" body="Sale reminders, new concerts and friend activity will appear here." />
      )}
    </div>
  );
}
