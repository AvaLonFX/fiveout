import { createClient } from "@/utils/supabase/client";

export async function updateSearchCount(playerId: number) {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await client.rpc("increment_search_count", { player_id_param: playerId });
}
