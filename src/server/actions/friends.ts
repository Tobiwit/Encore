"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { ActionResult } from "./events";

function friendlyError(code: string | undefined, fallback: string) {
  if (code === "P0429") return "You're doing that a lot. Please wait a little and try again.";
  if (code === "P0002") return "That person or invitation could not be found.";
  return fallback;
}

export async function createInviteLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_friend_invite");
  if (error || !data) return { ok: false, error: friendlyError(error?.code, "Could not create an invite link.") };
  return { ok: true, url: `${publicEnv.appUrl}/invite/${data}` };
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  await requireUser();
  const t = z.string().regex(/^[a-f0-9]{36}$/).safeParse(token);
  if (!t.success) return { ok: false, error: "This invitation link is not valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_friend_invite", { p_token: t.data });
  if (error) return { ok: false, error: friendlyError(error.code, "Could not send the friend request.") };
  revalidatePath("/friends");
  return { ok: true };
}

export async function respondToRequest(friendshipId: string, accept: boolean): Promise<ActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(friendshipId);
  if (!id.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_friend_request", { p_friendship_id: id.data, p_accept: accept });
  if (error) return { ok: false, error: friendlyError(error.code, "Could not update the request.") };
  revalidatePath("/friends");
  return { ok: true };
}

export async function removeFriend(userId: string): Promise<ActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_friend", { p_other: id.data });
  if (error) return { ok: false, error: "Could not remove this friend." };
  revalidatePath("/friends");
  return { ok: true };
}

export async function blockUser(userId: string): Promise<ActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", { p_other: id.data });
  if (error) return { ok: false, error: friendlyError(error.code, "Could not block this account.") };
  revalidatePath("/friends");
  return { ok: true };
}

export async function unblockUser(userId: string): Promise<ActionResult> {
  await requireUser();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", { p_other: id.data });
  if (error) return { ok: false, error: "Could not unblock this account." };
  revalidatePath("/profile/privacy");
  return { ok: true };
}
