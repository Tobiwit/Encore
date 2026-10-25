"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUser } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.uuid();

export async function toggleSavedEvent(eventId: string, save: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const id = uuid.safeParse(eventId);
  if (!id.success) return { ok: false, error: "Invalid event" };
  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("saved_events").upsert({ user_id: user.id, event_id: id.data }, { onConflict: "user_id,event_id", ignoreDuplicates: true })
    : await supabase.from("saved_events").delete().eq("user_id", user.id).eq("event_id", id.data);
  if (error) return { ok: false, error: "Could not update saved events. Please try again." };
  revalidatePath("/saved");
  return { ok: true };
}

const intentionSchema = z.object({
  eventId: z.uuid(),
  intention: z.enum(["interested", "going", "looking_for_company"]).nullable(),
  visibility: z.enum(["friends", "private"]),
});

/** Social intention, stored separately from "saved". `null` withdraws it. */
export async function setEventIntention(input: z.input<typeof intentionSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = intentionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { eventId, intention, visibility } = parsed.data;
  const supabase = await createClient();

  const { error } =
    intention === null
      ? await supabase.from("event_interests").delete().eq("user_id", user.id).eq("event_id", eventId)
      : await supabase
          .from("event_interests")
          .upsert({ user_id: user.id, event_id: eventId, intention, visibility }, { onConflict: "user_id,event_id" });
  if (error) return { ok: false, error: "Could not update your plans. Please try again." };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/saved");
  return { ok: true };
}

export async function dismissEvent(eventId: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = uuid.safeParse(eventId);
  if (!id.success) return { ok: false, error: "Invalid event" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_dismissals")
    .upsert({ user_id: user.id, event_id: id.data }, { onConflict: "user_id,event_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Could not hide this event." };
  revalidatePath("/discover");
  return { ok: true };
}
