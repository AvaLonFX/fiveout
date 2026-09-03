import "server-only";
import { admin } from "./guesser-server";
import { profile } from "./match-simulation";
export type SimulationEra = "current" | "alltime";
export async function simulationPlayers(ids?: number[], era: SimulationEra = "current") {
  const db = admin();
  if (era === "alltime") {
    const data: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db.from("FullStats_NBA").select("PERSON_ID,PLAYER_NAME,GP,MIN,FGM,FGA,FG3M,FG3A,FTM,FTA,OREB,DREB,AST,TOV,STL,BLK,PF").gt("GP", 0).order("PERSON_ID").range(offset, offset + 999);
      if (ids) query = query.in("PERSON_ID", ids);
      const page = await query;
      if (page.error) throw page.error;
      data.push(...(page.data || []));
      if (ids || (page.data || []).length < 1000) break;
    }
    const bios: any[] = [];
    for (let offset = 0; offset < data.length; offset += 500) {
      const page = await db.from("Osnovno_NBA").select("PERSON_ID,POSITION").in("PERSON_ID", data.slice(offset, offset + 500).map((p) => p.PERSON_ID));
      if (page.error) throw page.error;
      bios.push(...(page.data || []));
    }
    const positions = new Map(bios.map((p) => [Number(p.PERSON_ID), String(p.POSITION || "")]));
    const totalKeys = ["MIN", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "AST", "TOV", "STL", "BLK", "PF"];
    const players = data.map((row) => {
      const gp = Number(row.GP);
      const raw: Record<string, unknown> = { PLAYER_ID: row.PERSON_ID, PLAYER_NAME: row.PLAYER_NAME, GP: gp };
      totalKeys.forEach((key) => { raw[key] = Number((row as Record<string, unknown>)[key]) / gp; });
      return profile(raw, positions.get(Number(row.PERSON_ID)) || "");
    }).filter((p): p is NonNullable<typeof p> => !!p);
    return { players, season: "All-time career archive", syncedAt: "" };
  }
  let query = db
    .from("nba_current_snapshot")
    .select("player_id,season,synced_at,payload")
    .order("player_id")
    .limit(1000);
  if (ids) query = query.in("player_id", ids);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length || new Set(data.map((p) => p.season)).size !== 1)
    throw Error("A consistent season snapshot is unavailable.");
  const { data: bios, error: be } = await db
    .from("Osnovno_NBA")
    .select("PERSON_ID,POSITION")
    .in(
      "PERSON_ID",
      data.map((p) => p.player_id),
    )
    .limit(1000);
  if (be) throw be;
  const positions = new Map(
    bios.map((p) => [Number(p.PERSON_ID), String(p.POSITION || "")]),
  );
  const players = data
    .map((row) =>
      profile(
        row.payload as Record<string, unknown>,
        positions.get(Number(row.player_id)) || "",
      ),
    )
    .filter((p): p is NonNullable<typeof p> => !!p);
  return { players, season: data[0].season, syncedAt: data[0].synced_at };
}
