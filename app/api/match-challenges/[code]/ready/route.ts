import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import {
  prepareSavedMatch,
  validSide,
  validateChallengeRules,
} from "@/lib/match-persistence";
import { newMatchSeed } from "@/lib/match-security";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin)
    return json({ error: "Invalid request origin." }, 403);
  const { code } = await context.params;
  if (!/^[0-9a-f]{36}$/.test(code)) return json({ error: "Challenge not found." }, 404);
  try {
    const body = JSON.parse(await req.text());
    if (!validSide(body.setup)) return json({ error: "Invalid coaching setup." }, 400);
    const { owner } = await identity();
    const db = admin();
    const select =
      "id,creator_key,opponent_key,creator_setup,opponent_setup,status,mode,era,best_of,wins,games,creator_ready,opponent_ready,version";
    const { data: challenge, error } = await db
      .from("match_challenges")
      .select(select)
      .eq("share_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!challenge) return json({ error: "Challenge not found." }, 404);
    if (challenge.status === "completed") return json({ error: "Series already completed." }, 409);
    if (challenge.status !== "coaching" || !validSide(challenge.opponent_setup))
      return json({ error: "Waiting for an opponent." }, 409);
    let role: "creator" | "opponent";
    if (owner === challenge.creator_key && owner === challenge.opponent_key)
      role = body.role === "opponent" ? "opponent" : "creator";
    else if (owner === challenge.creator_key) role = "creator";
    else if (owner === challenge.opponent_key) role = "opponent";
    else return json({ error: "You are not a participant in this challenge." }, 403);
    const existing = role === "creator" ? challenge.creator_setup : challenge.opponent_setup;
    if (!sameIds(existing.ids, body.setup.ids))
      return json({ error: "Players are locked during the series; adjust minutes or tactics." }, 400);
    const sides = role === "creator"
      ? [body.setup, challenge.opponent_setup]
      : [challenge.creator_setup, body.setup];
    await validateChallengeRules(challenge.mode, sides);
    const changes = role === "creator"
      ? { creator_setup: body.setup, creator_ready: true }
      : { opponent_setup: body.setup, opponent_ready: true };
    const { data: updated, error: updateError } = await db
      .from("match_challenges")
      .update({ ...changes, version: challenge.version + 1 })
      .eq("id", challenge.id)
      .eq("version", challenge.version)
      .select(select)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json({ error: "Lobby changed. Refresh and try again." }, 409);
    if (!updated.creator_ready || !updated.opponent_ready)
      return json({ status: "coaching", ready: [updated.creator_ready, updated.opponent_ready] });

    const { data: claimed, error: claimError } = await db
      .from("match_challenges")
      .update({
        creator_ready: false,
        opponent_ready: false,
        version: updated.version + 1,
      })
      .eq("id", updated.id)
      .eq("version", updated.version)
      .eq("creator_ready", true)
      .eq("opponent_ready", true)
      .select(select)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ status: "generating" }, 202);

    const currentSides = [claimed.creator_setup, claimed.opponent_setup];
    const play = await prepareSavedMatch(currentSides, challenge.era === "alltime" ? "alltime" : "current");
    const game = play(newMatchSeed());
    const startedAt = new Date().toISOString();
    const { error: gameError } = await db
      .from("match_challenges")
      .update({
        status: "playing_first_half",
        current_game: game,
        game_started_at: startedAt,
        halftime_started_at: null,
        creator_halftime_ready: false,
        opponent_halftime_ready: false,
        version: claimed.version + 1,
      })
      .eq("id", claimed.id)
      .eq("version", claimed.version);
    if (gameError) throw gameError;
    return json({ status: "playing_first_half", game, gameStartedAt: startedAt, games: claimed.games, wins: claimed.wins }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Salary cap") || message.startsWith("Draft teams"))
      return json({ error: message }, 400);
    console.error("Challenge ready failed", error);
    return json({ error: "Unable to update the lobby." }, 503);
  }
}
