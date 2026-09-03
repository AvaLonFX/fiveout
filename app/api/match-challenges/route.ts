import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import { validSide, validateChallengeRules } from "@/lib/match-persistence";
import { createHash } from "node:crypto";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });

const coachName = (key?: string | null) => {
  if (!key) return null;
  const adjectives = ["Clutch", "Baseline", "Fastbreak", "Lockdown", "Downtown", "Sixth Man", "Full Court", "Buzzer"];
  const names = ["Architect", "General", "Coach", "Captain", "Strategist", "Maestro", "Shot Caller", "Playmaker"];
  const bytes = createHash("sha256").update(key).digest();
  return `${adjectives[bytes[0] % adjectives.length]} ${names[bytes[1] % names.length]}`;
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  if (!/^[0-9a-f]{36}$/.test(code))
    return json({ error: "Challenge not found." }, 404);
  try {
    const { owner } = await identity();
    const { data, error } = await admin()
      .from("match_challenges")
      .select(
        "share_code,status,best_of,mode,era,creator_key,opponent_key,creator_setup,opponent_setup,draft_first,draft_pick_started_at,creator_ready,opponent_ready,creator_halftime_ready,opponent_halftime_ready,current_game,game_started_at,halftime_started_at,wins,games,result_id,match_results(payload,title,created_at)",
      )
      .eq("share_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Challenge not found." }, 404);
    const saved = Array.isArray(data.match_results)
      ? data.match_results[0]
      : data.match_results;
    return json({
      code: data.share_code,
      status: data.status,
      bestOf: data.best_of,
      mode: data.mode,
      era: data.era || "current",
      role:
        owner === data.creator_key
          ? "creator"
          : owner === data.opponent_key
            ? "opponent"
            : data.status === "open"
              ? "opponent"
              : "spectator",
      coachNames: [coachName(data.creator_key), coachName(data.opponent_key)],
      creator: data.creator_setup,
      opponent: data.opponent_setup,
      draftFirst: data.draft_first,
      draftTurn: data.draft_first == null ? null : (data.draft_first + ((data.creator_setup?.ids?.length || 0) + (data.opponent_setup?.ids?.length || 0))) % 2,
      draftPickStartedAt: data.draft_pick_started_at,
      ready: [data.creator_ready, data.opponent_ready],
      halftimeReady: [data.creator_halftime_ready, data.opponent_halftime_ready],
      currentGame: data.current_game,
      gameStartedAt: data.game_started_at,
      halftimeStartedAt: data.halftime_started_at,
      wins: data.wins,
      games: data.games,
      result: saved?.payload?.result || null,
      series: saved?.payload?.series || null,
      title: saved?.title || "QNBA challenge",
      completedAt: saved?.created_at || null,
    });
  } catch (error) {
    console.error("Challenge load failed", error);
    return json({ error: "Unable to load this challenge." }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== req.nextUrl.origin
  )
    return json({ error: "Invalid request origin." }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    const bestOf = Number(body.bestOf);
    const mode = String(body.mode || "classic");
    const era = body.era === "alltime" ? "alltime" : "current";
    if (mode !== "draft" && !validSide(body.creator))
      return json(
        {
          error:
            "Choose a legal starting five and exactly 240 rotation minutes.",
        },
        400,
      );
    if (![1, 3, 5, 7].includes(bestOf))
      return json({ error: "Choose BO1, BO3, BO5 or BO7." }, 400);
    if (!["classic", "salary", "draft"].includes(mode))
      return json({ error: "Choose a valid challenge mode." }, 400);
    if (era === "alltime" && mode === "salary")
      return json({ error: "All-time challenges currently support Classic and Draft modes." }, 400);
    if (mode !== "draft") await validateChallengeRules(mode, [body.creator]);
    const { owner } = await identity();
    const { data, error } = await admin()
      .from("match_challenges")
      .insert({
        creator_key: owner,
        creator_setup: mode === "draft" ? { ids: [], minutes: [], tactic: "balanced", secondHalfTactic: "balanced" } : body.creator,
        best_of: bestOf,
        mode,
        era,
      })
      .select("share_code")
      .single();
    if (error) throw error;
    return json({ code: data.share_code }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Salary cap")) return json({ error: message }, 400);
    console.error("Challenge create failed", error);
    return json({ error: "Unable to create a challenge." }, 503);
  }
}
