import type { SupabaseClient } from "@supabase/supabase-js";

export const DREAM_TEAM_LIMIT = 12;
export const DREAM_TEAM_SELECT = "player_id, position, FullStats_NBA(PLAYER_NAME, PTS, REB, AST, Player_Rating)";

export function dreamTeamError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "This player is already in your Dream Team.";
  if (error.code === "23514") return "Your Dream Team can contain up to 12 players.";
  if (error.code === "40001") return "Your team changed in another window. Please reload and try again.";
  if (error.code === "42501") return "Please sign in again to edit your Dream Team.";
  return "Could not save your Dream Team. Please try again.";
}

export async function addDreamTeamPlayer(client: SupabaseClient, playerId: number) {
  if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new Error("Invalid player.");
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Please sign in to save your Dream Team.");
  const { data, error } = await client.from("UserDreamTeams")
    .insert({ user_id: user.id, player_id: playerId })
    .select(DREAM_TEAM_SELECT).single();
  if (error) throw new Error(dreamTeamError(error));
  return data;
}
