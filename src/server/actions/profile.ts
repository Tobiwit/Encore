"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import { syncSpotifyAccount } from "@/server/spotify/sync";
import type { ActionResult } from "./events";

const visibility = z.enum(["friends", "private"]);

const profileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(60).optional(),
    fan_list_visibility: visibility.optional(),
    default_intention_visibility: visibility.optional(),
  })
  .strict();

export async function updateProfile(patch: z.input<typeof profileSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields." };
  const supabase = await createClient();
  const { error } = await supabase.from("users").update(parsed.data).eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your profile." };
  revalidatePath("/profile");
  return { ok: true };
}

const locationSchema = z.object({ cityId: z.uuid(), radiusKm: z.number().int().min(5).max(500) });

export async function addLocation(input: z.input<typeof locationSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a city and a radius between 5 and 500 km." };
  const supabase = await createClient();

  const { count } = await supabase.from("user_locations").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 5) return { ok: false, error: "You can follow up to five cities." };

  const { data: location, error } = await supabase
    .from("user_locations")
    .upsert({ user_id: user.id, city_id: parsed.data.cityId, radius_km: parsed.data.radiusKm }, { onConflict: "user_id,city_id" })
    .select("id")
    .single();
  if (error || !location) return { ok: false, error: "Could not save this city." };

  const { data: profile } = await supabase.from("users").select("home_location_id").eq("id", user.id).single();
  if (!profile?.home_location_id) {
    await supabase.from("users").update({ home_location_id: location.id }).eq("id", user.id);
  }
  revalidatePath("/profile");
  revalidatePath("/discover");
  return { ok: true };
}

export async function updateLocationRadius(locationId: string, radiusKm: number): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ id: z.uuid(), r: z.number().int().min(5).max(500) }).safeParse({ id: locationId, r: radiusKm });
  if (!parsed.success) return { ok: false, error: "Radius must be between 5 and 500 km." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_locations").update({ radius_km: parsed.data.r }).eq("id", parsed.data.id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not update the radius." };
  revalidatePath("/profile");
  revalidatePath("/discover");
  return { ok: true };
}

export async function setHomeLocation(locationId: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.uuid().safeParse(locationId);
  if (!id.success) return { ok: false, error: "Invalid location" };
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ home_location_id: id.data }).eq("id", user.id);
  if (error) return { ok: false, error: "Could not set your home city." };
  revalidatePath("/profile");
  revalidatePath("/discover");
  return { ok: true };
}

export async function removeLocation(locationId: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.uuid().safeParse(locationId);
  if (!id.success) return { ok: false, error: "Invalid location" };
  const supabase = await createClient();
  const { error } = await supabase.from("user_locations").delete().eq("id", id.data).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not remove this city." };
  const { data: remaining } = await supabase.from("user_locations").select("id").eq("user_id", user.id).limit(1);
  const { data: profile } = await supabase.from("users").select("home_location_id").eq("id", user.id).single();
  if (!profile?.home_location_id && remaining?.[0]) {
    await supabase.from("users").update({ home_location_id: remaining[0].id }).eq("id", user.id);
  }
  revalidatePath("/profile");
  revalidatePath("/discover");
  return { ok: true };
}

const prefsSchema = z
  .object({
    presale_reminders_enabled: z.boolean().optional(),
    general_sale_reminders_enabled: z.boolean().optional(),
    new_event_alerts_enabled: z.boolean().optional(),
    friend_activity_enabled: z.boolean().optional(),
    push_enabled: z.boolean().optional(),
    reminder_lead_minutes: z.number().int().min(5).max(1440).optional(),
    quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((p) => (p.quiet_hours_start === undefined) === (p.quiet_hours_end === undefined), "Set both quiet-hour bounds together");

export async function updateNotificationPreferences(patch: z.input<typeof prefsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = prefsSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid notification settings." };
  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
    } catch {
      return { ok: false, error: "Unknown time zone." };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").update(parsed.data).eq("user_id", user.id);
  if (error) return { ok: false, error: "Could not save notification settings." };
  revalidatePath("/profile");
  return { ok: true };
}

const pushSchema = z.object({
  endpoint: z.url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscription(subscription: unknown, userAgent: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = pushSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "This browser returned an invalid push subscription." };
  const supabase = await createClient();
  // An endpoint previously registered by another account on this device is replaced server-side.
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).neq("user_id", user.id);
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent?.slice(0, 200) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: "Could not register this device for notifications." };
  await supabase.from("notification_preferences").update({ push_enabled: true }).eq("user_id", user.id);
  revalidatePath("/profile");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  revalidatePath("/profile");
  return { ok: true };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
  revalidatePath("/profile");
  return { ok: true };
}

export async function completeOnboarding(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("users").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", user.id);
  redirect("/discover");
}

const MANUAL_SYNC_COOLDOWN_MS = 10 * 60_000;

/** Manual refresh, rate-limited per account to respect Spotify quotas. */
export async function refreshSpotifyNow(): Promise<
  { ok: true; newArtists: number; ranges: Record<string, number | "failed"> } | { ok: false; error: string; reconnect?: boolean }
> {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("connected_accounts")
    .select("id, user_id, access_token_encrypted, refresh_token_encrypted, expires_at, status, last_sync_attempt_at, last_successful_sync_at")
    .eq("user_id", user.id)
    .eq("provider", "spotify")
    .maybeSingle();
  if (!account || account.status === "revoked") return { ok: false, error: "Spotify is not connected.", reconnect: true };

  const lastAttempt = account.last_sync_attempt_at ? Date.parse(account.last_sync_attempt_at) : 0;
  // The first import (no successful sync yet) is never throttled.
  if (account.last_successful_sync_at && Date.now() - lastAttempt < MANUAL_SYNC_COOLDOWN_MS) {
    return { ok: false, error: "Your music was refreshed a few minutes ago. Try again shortly." };
  }
  await admin.from("connected_accounts").update({ last_sync_attempt_at: new Date().toISOString() }).eq("id", account.id);

  const outcome = await syncSpotifyAccount(admin, account);
  revalidatePath("/artists");
  revalidatePath("/profile");
  if (!outcome.ok) {
    return outcome.revoked
      ? { ok: false, error: "Spotify access was revoked. Reconnect to keep your artists up to date.", reconnect: true }
      : { ok: false, error: "Spotify could not be reached. Your existing artists are unchanged; try again later." };
  }
  return { ok: true, newArtists: outcome.newArtists, ranges: outcome.ranges };
}

/**
 * Deletes stored Spotify credentials. Spotify offers no token-revocation endpoint, so the user is
 * pointed to their Spotify account page to remove app access there as well.
 */
export async function disconnectSpotify(): Promise<ActionResult> {
  const user = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("connected_accounts")
    .update({ access_token_encrypted: null, refresh_token_encrypted: null, expires_at: null, status: "revoked" })
    .eq("user_id", user.id)
    .eq("provider", "spotify");
  if (error) return { ok: false, error: "Could not disconnect Spotify." };
  revalidatePath("/profile");
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Account deletion: removes the auth user, which cascades to every user-owned row (profile,
 * fan list, intentions, saved events, friendships, blocks, tokens, notifications and scheduled
 * jobs). Canonical artists and events are shared catalogue data and are kept.
 */
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  const user = await requireUser();
  if (confirmation.trim().toUpperCase() !== "DELETE") return { ok: false, error: 'Type "DELETE" to confirm.' };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: "Could not delete your account. Please contact support." };
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
