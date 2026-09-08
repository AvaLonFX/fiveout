import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { admin, identity } from "@/lib/guesser-server";
import { roster } from "@/lib/fan-server";
import { simulationPlayers } from "@/lib/simulation-data";
import { assignLineup, pickLegalFive } from "@/lib/lineup-roles";
import { defaultRotation, simulate, tactics, type SimPlayer, type Tactic } from "@/lib/match-simulation";
import { seededRandom } from "@/lib/match-security";

export const runtime = "nodejs";
const BUDGET = 155;
const OPPONENT_BUDGET = 180;
const MIN_BENCH_MINUTES = 12;
const ATTEMPTS = 3;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
const daySeed = (day: string, suffix: string) => createHash("sha256").update(`fiveout-daily:${day}:${suffix}`).digest().readUInt32BE(0);

async function dailyPool() {
  const [fan, dataset] = await Promise.all([roster(), simulationPlayers(undefined, "current")]);
  const profiles = new Map(dataset.players.map(player => [player.id, player]));
  const players = fan.filter(player => profiles.has(player.id)).map(player => ({ ...player, position: profiles.get(player.id)!.position, games: profiles.get(player.id)!.games })).sort((a, b) => b.score - a.score).slice(0, 200);
  return { players, profiles, dataset };
}

function dailyRotation(team: SimPlayer[]) {
  const base = defaultRotation(team);
  if (base.length !== 8) return base;
  const bench = base.slice(5).map(minutes => Math.max(MIN_BENCH_MINUTES, minutes));
  const starterPool = 240 - bench.reduce((sum, minutes) => sum + minutes, 0);
  const starterBase = base.slice(0, 5);
  const starterBaseTotal = starterBase.reduce((sum, minutes) => sum + minutes, 0);
  const starters = starterBase.map(minutes => Math.round(minutes / starterBaseTotal * starterPool * 10) / 10);
  starters[4] = Math.round((starters[4] + 240 - [...starters, ...bench].reduce((sum, minutes) => sum + minutes, 0)) * 10) / 10;
  return [...starters, ...bench];
}

function difficultyFor(opponentCost: number) {
  const gap = opponentCost - BUDGET;
  if (gap <= 0) return "Easy";
  if (gap <= 10) return "Competitive";
  if (gap <= 30) return "Hard";
  return "Nightmare";
}

function makeOpponent(players: Awaited<ReturnType<typeof dailyPool>>["players"], profiles: Map<number, SimPlayer>, day: string) {
  const seed = daySeed(day, "opponent");
  const candidates = players.slice(0, 42).map((player, index) => ({ player, rank: index + (((seed >>> (index % 24)) & 15) / 18) })).sort((a, b) => a.rank - b.rank).map(item => item.player);
  let best: typeof candidates | null = null;
  let bestScore = -Infinity;
  for (let ceiling = 28; ceiling >= 14; ceiling--) {
    const starters = pickLegalFive(candidates.filter(player => player.cost <= ceiling));
    if (starters.length !== 5) continue;
    const starterIds = new Set(starters.map(player => player.id));
    const available = candidates.filter(player => !starterIds.has(player.id));
    const starterCost = starters.reduce((sum, player) => sum + player.cost, 0);
    for (let a = 0; a < available.length - 2; a++) for (let b = a + 1; b < available.length - 1; b++) for (let c = b + 1; c < available.length; c++) {
      const roster = [...starters, available[a], available[b], available[c]];
      const cost = starterCost + available[a].cost + available[b].cost + available[c].cost;
      if (cost > OPPONENT_BUDGET) continue;
      const score = roster.reduce((sum, player) => sum + player.score, 0) + cost / 100;
      if (score > bestScore) { best = roster; bestScore = score; }
    }
  }
  if (!best) throw new Error("Unable to create today's opponent.");
  const cost = best.reduce((sum, player) => sum + player.cost, 0);
  return { team: best.map(player => profiles.get(player.id)!).filter(Boolean), cost, difficulty: difficultyFor(cost) };
}

function streakFromDays(days: string[], today: string, allowYesterday = true) {
  const completed = new Set(days);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (allowYesterday && !completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

type BoardEntry = { owner: string; value: number; score?: string; spent: number; createdAt: string };

async function leaderboards(owner: string, day: string, costs: Map<number, number>) {
  const db = admin();
  const [{ data: todayRows, error: todayError }, { data: recentRows, error: recentError }] = await Promise.all([
    db.from("daily_beat_attempts").select("owner_key,margin,score_for,score_against,player_ids,created_at").eq("day", day).limit(5000),
    db.from("daily_beat_attempts").select("owner_key,day").order("day", { ascending: false }).limit(10000),
  ]);
  if (todayError || recentError) throw todayError || recentError;

  const bestByOwner = new Map<string, BoardEntry>();
  for (const row of todayRows || []) {
    const entry = { owner: row.owner_key, value: row.margin, score: `${row.score_for}–${row.score_against}`, spent: (row.player_ids || []).reduce((sum: number, id: number) => sum + (costs.get(id) || 0), 0), createdAt: row.created_at };
    const previous = bestByOwner.get(row.owner_key);
    if (!previous || entry.value > previous.value || (entry.value === previous.value && (entry.spent < previous.spent || (entry.spent === previous.spent && entry.createdAt < previous.createdAt)))) bestByOwner.set(row.owner_key, entry);
  }
  const daysByOwner = new Map<string, Set<string>>();
  for (const row of recentRows || []) {
    if (!daysByOwner.has(row.owner_key)) daysByOwner.set(row.owner_key, new Set());
    daysByOwner.get(row.owner_key)!.add(row.day);
  }
  const streaks: BoardEntry[] = Array.from(daysByOwner).map(([key, days]) => ({ owner: key, value: streakFromDays(Array.from(days), day), spent: 0, createdAt: "" })).filter(entry => entry.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const daily = Array.from(bestByOwner.values()).sort((a, b) => b.value - a.value || a.spent - b.spent || a.createdAt.localeCompare(b.createdAt)).slice(0, 10);
  const owners = Array.from(new Set([...daily, ...streaks].map(entry => entry.owner).filter(key => key.startsWith("user:"))));
  const { data: profiles, error: profileError } = owners.length
    ? await db.from("match_profiles").select("owner_key,display_name,is_public").in("owner_key", owners)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const names = new Map((profiles || []).filter(profile => profile.is_public).map(profile => [profile.owner_key, profile.display_name]));
  const present = (entries: BoardEntry[]) => entries.map((entry, index) => ({
    rank: index + 1,
    name: entry.owner === owner ? "You" : names.get(entry.owner) || "Anonymous coach",
    value: entry.value,
    score: entry.score,
    spent: entry.spent || undefined,
    you: entry.owner === owner,
  }));
  return { daily: present(daily), streaks: present(streaks) };
}

async function state(owner: string, day: string, opponent: ReturnType<typeof makeOpponent>, pool: Awaited<ReturnType<typeof dailyPool>>, summary = false) {
  const db = admin();
  const costs = new Map(pool.players.map(player => [player.id, player.cost]));
  const [{ data: attempts, error }, { data: history, error: historyError }, { data: todayRows, error: todayError }, boards] = await Promise.all([
    db.from("daily_beat_attempts").select("attempt_number,score_for,score_against,won,margin,player_ids,tactic,created_at").eq("owner_key", owner).eq("day", day).order("attempt_number"),
    db.from("daily_beat_attempts").select("day").eq("owner_key", owner).order("day", { ascending: false }).limit(400),
    db.from("daily_beat_attempts").select("owner_key,won").eq("day", day).limit(5000),
    leaderboards(owner, day, costs),
  ]);
  if (error || historyError || todayError) throw error || historyError || todayError;
  const participants = new Map<string, boolean>();
  for (const row of todayRows || []) participants.set(row.owner_key, (participants.get(row.owner_key) || false) || row.won);
  const winners = Array.from(participants.values()).filter(Boolean).length;
  const base = {
    day,
    budget: BUDGET,
    maxAttempts: ATTEMPTS,
    attempts: (attempts || []).map(attempt => ({ ...attempt, spent: (attempt.player_ids || []).reduce((sum: number, id: number) => sum + (costs.get(id) || 0), 0) })),
    streak: streakFromDays((history || []).map(row => row.day), day),
    community: { participants: participants.size, beatRate: participants.size ? Math.round(1000 * winners / participants.size) / 10 : null },
    opponent: opponent.team.map(player => ({ id: player.id, name: player.name, position: player.position })),
    opponentCost: opponent.cost,
    difficulty: opponent.difficulty,
    minBenchMinutes: MIN_BENCH_MINUTES,
    leaderboards: boards,
  };
  if (summary) return base;
  const players = pool.players.map(({ id, name, team, position, pts, reb, ast, cost, score, games }) => ({ id, name, team, position, pts, reb, ast, cost, score, games }));
  return { ...base, players };
}

export async function GET(req: NextRequest) {
  try {
    const { owner, signedIn } = await identity();
    const day = new Date().toISOString().slice(0, 10);
    const pool = await dailyPool();
    const opponent = makeOpponent(pool.players, pool.profiles, day);
    return json({ ...(await state(owner, day, opponent, pool, req.nextUrl.searchParams.get("summary") === "1")), signedIn });
  } catch (error) {
    console.error("Daily challenge load failed", error);
    return json({ error: "Unable to load today's challenge." }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  try {
    const { owner, signedIn } = await identity();
    const day = new Date().toISOString().slice(0, 10);
    const input = await req.json();
    if (input.day !== day) return json({ error: "A new daily challenge is available. Reload first." }, 409);
    if (!Array.isArray(input.ids) || input.ids.length !== 8 || new Set(input.ids).size !== 8 || input.ids.some((id: unknown) => !Number.isSafeInteger(id))) return json({ error: "Choose exactly eight different players." }, 400);
    const tactic: Tactic = tactics.includes(input.tactic) ? input.tactic : "balanced";
    const pool = await dailyPool();
    const chosen = input.ids.map((id: number) => pool.players.find(player => player.id === id));
    if (chosen.some((player: unknown) => !player)) return json({ error: "Every player must come from today's pool." }, 400);
    if (chosen.reduce((sum: number, player: any) => sum + player.cost, 0) > BUDGET) return json({ error: `Your rotation exceeds the ${BUDGET}-point budget.` }, 400);
    const userTeam = input.ids.map((id: number) => pool.profiles.get(id)!).filter(Boolean);
    if (!assignLineup(userTeam.slice(0, 5))) return json({ error: "Your first five must cover two guards, two forwards and one center." }, 400);
    const db = admin();
    const { count, error: countError } = await db.from("daily_beat_attempts").select("id", { count: "exact", head: true }).eq("owner_key", owner).eq("day", day);
    if (countError) throw countError;
    const attemptNumber = (count || 0) + 1;
    if (attemptNumber > ATTEMPTS) return json({ error: "All three attempts have been used today." }, 409);
    const opponent = makeOpponent(pool.players, pool.profiles, day);
    const result = simulate([userTeam, opponent.team], [tactic, "balanced"], seededRandom(daySeed(day, `attempt:${attemptNumber}`)), [tactic, "balanced"], [dailyRotation(userTeam), dailyRotation(opponent.team)]);
    const margin = result.score[0] - result.score[1];
    const { error } = await db.from("daily_beat_attempts").insert({ owner_key: owner, day, attempt_number: attemptNumber, player_ids: input.ids, tactic, score_for: result.score[0], score_against: result.score[1], won: margin > 0, margin });
    if (error?.code === "23505") return json({ error: "That attempt was already submitted. Reload the challenge." }, 409);
    if (error) throw error;
    return json({ result: { ...result, season: pool.dataset.season, syncedAt: pool.dataset.syncedAt, era: "current" }, ...(await state(owner, day, opponent, pool)), signedIn });
  } catch (error) {
    console.error("Daily challenge attempt failed", error);
    return json({ error: "Unable to run this daily attempt." }, 503);
  }
}
