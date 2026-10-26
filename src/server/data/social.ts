import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type FriendFan = { id: string; name: string; avatarUrl: string | null; interest: "love" | "like" };

/**
 * Friends who love or like each of the given artists. RLS only returns rows of accepted,
 * unblocked friends who share their fan list, so this never leaks private taste.
 */
export async function friendFansByArtist(supabase: Client, userId: string, artistIds: string[]): Promise<Map<string, FriendFan[]>> {
  const map = new Map<string, FriendFan[]>();
  const ids = [...new Set(artistIds)];
  if (!ids.length) return map;

  const rows: { user_id: string; artist_id: string; interest_level: string }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("user_artists")
      .select("user_id, artist_id, interest_level")
      .in("artist_id", ids.slice(i, i + 100))
      .neq("user_id", userId)
      .eq("is_dismissed", false)
      .in("interest_level", ["love", "like"]);
    rows.push(...(data ?? []));
  }
  if (!rows.length) return map;

  const { data: profiles } = await supabase.rpc("get_profiles", { p_ids: [...new Set(rows.map((r) => r.user_id))] });
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  for (const r of rows) {
    const p = byId.get(r.user_id);
    if (!p) continue;
    const list = map.get(r.artist_id) ?? [];
    list.push({ id: p.id, name: p.display_name, avatarUrl: p.avatar_url, interest: r.interest_level as FriendFan["interest"] });
    map.set(r.artist_id, list);
  }
  // Loves first: they read as the stronger signal.
  for (const list of map.values()) list.sort((a, b) => Number(b.interest === "love") - Number(a.interest === "love"));
  return map;
}
