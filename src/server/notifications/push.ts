import "server-only";
import webpush from "web-push";
import { pushConfig } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url: string; tag: string };

/**
 * Best-effort Web Push. The in-app notification is the source of truth; push failures never
 * fail the job. Expired subscriptions (404/410) are removed.
 */
export async function sendPush(admin: AdminClient, userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const config = pushConfig();
  if (!config) return { sent: 0, failed: 0 };

  const { data: prefs } = await admin.from("notification_preferences").select("push_enabled").eq("user_id", userId).maybeSingle();
  if (!prefs?.push_enabled) return { sent: 0, failed: 0 };

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 3600, urgency: "high" },
      );
      sent++;
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", sub.id);
    } catch (error) {
      failed++;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  return { sent, failed };
}
