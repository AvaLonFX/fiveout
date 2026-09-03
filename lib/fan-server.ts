import "server-only";
import { simulationPlayers } from "./simulation-data";
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { admin, identity } from "./guesser-server";
import { BUDGET, FanPlayer, optimum, total, validateFive } from "./fan-rules";
import { summarize } from "./guesser-rules";
class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function roster(): Promise<FanPlayer[]> {
  const { data, error } = await admin()
    .from("verified_current_stats")
    .select(
      "PLAYER_ID,PLAYER_NAME,TEAM_ID,TEAM_ABBREVIATION,PTS,REB,AST,FGM,FGA,GP",
    )
    .gt("GP", 0)
    .order("PLAYER_ID")
    .limit(1000);
  if (error) throw error;
  return data
    .filter((p) =>
      [p.PTS, p.REB, p.AST, p.FGM, p.FGA].every(
        (v) => v !== null && v !== "" && Number.isFinite(Number(v)),
      ),
    )
    .map((p) => {
      const pts = Number(p.PTS),
        reb = Number(p.REB),
        ast = Number(p.AST);
      const score = Math.round((pts + 1.2 * reb + 1.5 * ast) * 10) / 10;
      return {
        id: Number(p.PLAYER_ID),
        name: p.PLAYER_NAME,
        team: p.TEAM_ABBREVIATION || "",
        teamId: String(p.TEAM_ID || ""),
        pts,
        reb,
        ast,
        fgm: Number(p.FGM),
        fga: Number(p.FGA),
        score,
        cost: Math.max(8, Math.min(28, Math.round(score / 2))),
      };
    });
}
async function challenge(day: string) {
  const db = admin();
  const old = await db
    .from("daily_five_challenges")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (old.error) throw old.error;
  if (old.data) return old.data;
  const players = (await roster())
    .filter((p) => p.pts >= 5)
    .sort((a, b) => b.score - a.score);
  if (players.length < 20) throw new Error("Insufficient players");
  const pool: FanPlayer[] = [];
  for (let tier = 0; tier < 4; tier++) {
    const group = players.slice(
      Math.floor((tier * players.length) / 4),
      Math.floor(((tier + 1) * players.length) / 4),
    );
    for (let i = 0; i < 5; i++) {
      const j = randomInt(group.length);
      pool.push(group.splice(j, 1)[0]);
    }
  }
  // Five cheapest must always fit, so every challenge is playable.
  if (optimum(pool).score < 0) throw new Error("No valid lineup");
  const inserted = await db
    .from("daily_five_challenges")
    .insert({ day, pool, budget: BUDGET });
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  const saved = await db
    .from("daily_five_challenges")
    .select("*")
    .eq("day", day)
    .single();
  if (saved.error) throw saved.error;
  return saved.data;
}
async function body(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== req.nextUrl.origin
  )
    throw new InputError("Invalid request origin", 403);
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new InputError("JSON required", 415);
  const raw = await req.text();
  if (raw.length > 2048) throw new InputError("Request too large", 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new InputError("Invalid JSON");
  }
}
export async function fanRoute(req: NextRequest, kind: string) {
  try {
    const { owner, signedIn } = await identity();
    const db = admin();
    const day = new Date().toISOString().slice(0, 10);
    if (kind === "roster") {
      if (req.method !== "GET") throw new InputError("Method not allowed", 405);
      let dreamIds: number[] = [];
      if (signedIn) {
        const { data, error } = await db
          .from("UserDreamTeams")
          .select("player_id")
          .eq("user_id", owner.slice(5))
          .is("archived_at", null)
          .order("position");
        if (error) throw error;
        dreamIds = data.map((p) => Number(p.player_id));
      }
      const era = req.nextUrl.searchParams.get("era") === "alltime" ? "alltime" : "current";
      let base = await roster();
      if (era === "alltime") {
        const rows: any[] = [];
        for (let offset = 0; ; offset += 1000) {
          const page = await db.from("FullStats_NBA").select("PERSON_ID,PLAYER_NAME,GP,PTS,REB,AST,FGM,FGA").gt("GP", 0).order("PERSON_ID").range(offset, offset + 999);
          if (page.error) throw page.error;
          rows.push(...(page.data || []));
          if ((page.data || []).length < 1000) break;
        }
        base = rows.map((p) => {
          const gp = Number(p.GP), pts = Number(p.PTS) / gp, reb = Number(p.REB) / gp, ast = Number(p.AST) / gp;
          const score = Math.round((pts + 1.2 * reb + 1.5 * ast) * 10) / 10;
          return { id: Number(p.PERSON_ID), name: p.PLAYER_NAME, team: "Career", teamId: "", pts: Math.round(pts * 10) / 10, reb: Math.round(reb * 10) / 10, ast: Math.round(ast * 10) / 10, fgm: Number(p.FGM) / gp, fga: Number(p.FGA) / gp, score, cost: Math.max(8, Math.min(28, Math.round(score / 2))) };
        });
      }
      const sim = await simulationPlayers(undefined, era);
      const usable = new Map(sim.players.map((p) => [p.id, p]));
      return json({
        players: base
          .filter((p) => usable.has(p.id))
          .map((p) => {
            const details = usable.get(p.id)!;
            return {
              ...p,
              position: details.position,
              games: details.games,
              minutes: details.minutes,
              confidence: details.confidence,
            };
          }),
        dreamIds: era === "current" ? dreamIds : [],
        signedIn,
        era,
      });
    }
    if (kind === "watchlist") {
      if (!signedIn)
        throw new InputError("Sign in to save and view your watchlist.", 401);
      const userId = owner.slice(5);
      if (req.method === "POST") {
        const b = await body(req);
        if (
          !Number.isSafeInteger(b.playerId) ||
          b.playerId <= 0 ||
          !["add", "remove"].includes(b.action)
        )
          throw new InputError("Invalid player or action");
        if (b.action === "add") {
          const { data: p, error: pe } = await db
            .from("Osnovno_NBA")
            .select("PERSON_ID")
            .eq("PERSON_ID", b.playerId)
            .maybeSingle();
          if (pe) throw pe;
          if (!p) throw new InputError("Player not found");
          const { error } = await db
            .from("player_watchlist")
            .upsert(
              { user_id: userId, player_id: b.playerId },
              { onConflict: "user_id,player_id", ignoreDuplicates: true },
            );
          if (error) throw error;
        } else {
          const { error } = await db
            .from("player_watchlist")
            .delete()
            .eq("user_id", userId)
            .eq("player_id", b.playerId);
          if (error) throw error;
        }
      }
      const { data: rows, error } = await db
        .from("player_watchlist")
        .select("player_id")
        .eq("user_id", userId)
        .order("created_at");
      if (error) throw error;
      const ids = rows.map((r) => Number(r.player_id));
      if (!ids.length) return json({ players: [], games: [] });
      const { data: bios, error: be } = await db
        .from("Osnovno_NBA")
        .select("PERSON_ID,player_full_name,TEAM_NAME,TEAM_ID")
        .in("PERSON_ID", ids);
      if (be) throw be;
      const current = await roster();
      const players = ids.map((id) => {
        const bio = bios.find((b) => Number(b.PERSON_ID) === id);
        return {
          id,
          name: bio?.player_full_name || "Unknown player",
          team: bio?.TEAM_NAME || "",
          teamId: String(bio?.TEAM_ID || ""),
          stats: current.find((p) => p.id === id) || null,
        };
      });
      const teamIds = Array.from(
        new Set(
          players
            .filter((p) => p.stats)
            .map((p) => p.teamId)
            .filter((t) => /^\d+$/.test(t) && t !== "0"),
        ),
      );
      let games: any[] = [];
      if (teamIds.length) {
        const { data, error: ge } = await db
          .from("GameSchedule")
          .select(
            "nba_game_id,homeTeam,awayTeam,startTime,home_team_id,away_team_id",
          )
          .gte("date", day)
          .or(
            `home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`,
          )
          .order("date")
          .order("startTime")
          .limit(1000);
        if (ge) throw ge;
        games = (data || []).filter(
          (g) => Date.parse(g.startTime) > Date.now(),
        );
      }
      return json({
        players: players.map((p) => ({
          ...p,
          nextGame:
            games.find(
              (g) => g.home_team_id === p.teamId || g.away_team_id === p.teamId,
            ) || null,
        })),
      });
    }
    if (kind === "daily-five") {
      const c = await challenge(day);
      if (req.method === "POST") {
        const b = await body(req);
        if (b.day !== day)
          throw new InputError(
            "The daily challenge changed. Reload before submitting.",
            409,
          );
        let chosen: FanPlayer[];
        try {
          chosen = validateFive(b.ids, c.pool, c.budget);
        } catch (e) {
          throw new InputError((e as Error).message);
        }
        const { error } = await db.from("daily_five_results").insert({
          owner_key: owner,
          day,
          player_ids: chosen.map((p) => p.id),
          score: total(chosen).score,
        });
        if (error && error.code !== "23505") throw error;
      }
      const { data: result, error } = await db
        .from("daily_five_results")
        .select("day,player_ids,score")
        .eq("owner_key", owner)
        .eq("day", day)
        .maybeSingle();
      if (error) throw error;
      return json({
        day,
        pool: c.pool,
        budget: c.budget,
        result,
        signedIn,
        best: result ? optimum(c.pool, c.budget) : null,
      });
    }
    if (kind === "history") {
      if (req.method !== "GET") throw new InputError("Method not allowed", 405);
      const rows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from("guesser_sessions")
          .select("era,day,status,moves")
          .eq("owner_key", owner)
          .eq("mode", "daily")
          .order("day", { ascending: false })
          .order("era")
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const fives: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db
          .from("daily_five_results")
          .select("day,score")
          .eq("owner_key", owner)
          .order("day", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        fives.push(...data);
        if (data.length < 1000) break;
      }
      const wins = rows.filter((r) => r.status === "won");
      const bestStreak = Math.max(
        ...["current", "alltime"].map(
          (era) =>
            summarize(
              rows.filter((r) => r.era === era),
              day,
            ).bestStreak,
        ),
      );
      return json({
        day,
        signedIn,
        guesser: rows.map((r) => ({
          day: r.day,
          era: r.era,
          status: r.status === "playing" && r.day < day ? "expired" : r.status,
          attempts: r.moves.length,
        })),
        dailyFive: fives,
        achievements: [
          {
            name: "First win",
            description: "Win a daily Guesser",
            unlocked: wins.length > 0,
          },
          {
            name: "On a roll",
            description: "Win three days in a row in one era",
            unlocked: bestStreak >= 3,
          },
          {
            name: "No hints needed",
            description: "Win a daily Guesser without hints",
            unlocked: wins.some((r) =>
              r.moves.every((m: any) => m.type === "guess"),
            ),
          },
          {
            name: "Double daily",
            description: "Win both eras on the same UTC day",
            unlocked: wins.some((r) =>
              wins.some((s) => s.day === r.day && s.era !== r.era),
            ),
          },
          {
            name: "Team architect",
            description: "Submit your first Daily Five",
            unlocked: fives.length > 0,
          },
        ],
      });
    }
    throw new InputError("Not found", 404);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, e.status);
    console.error("Fan feature failed", e);
    return json({ error: "Temporarily unavailable. Please retry." }, 503);
  }
}
