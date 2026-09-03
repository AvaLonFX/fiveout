import { createClient } from "@/utils/supabase/client";
import { addDreamTeamPlayer } from "@/lib/dream-team";

// Funkcija za dodavanje igrača u Dream Team
export const addToDreamTeam = async (userId: string, playerId: number) => {
  try {
    await addDreamTeamPlayer(createClient(), playerId);
    return true;
  } catch (error) {
    console.error("Error adding player:", error);
    return false;
  }

};

// Funkcija za uklanjanje igrača iz Dream Team-a
export const removeFromDreamTeam = async (userId: string, playerId: number) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("UserDreamTeams")
    .delete()
    .eq("user_id", userId)
    .eq("player_id", playerId).select("player_id");

  if (error) {
    console.error("Error removing player:", error);
    return false;
  }

  return data?.length === 1;
};

// Funkcija za dohvaćanje korisnikovog Dream Team-a
export const fetchDreamTeam = async (userId: string) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("UserDreamTeams")
    .select("player_id")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching dream team:", error);
    return [];
  }

  return data.map((entry) => entry.player_id);
};
