import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  const { code } = await context.params;
  try {
    const { owner } = await identity(); const db = admin();
    const select = "id,creator_key,opponent_key,creator_setup,opponent_setup,status,mode,era,best_of,wins,games,current_game,version";
    const { data: challenge, error } = await db.from("match_challenges").select(select).eq("share_code", code).maybeSingle();
    if (error) throw error; if (!challenge) return json({ error: "Challenge not found." }, 404);
    if (owner !== challenge.creator_key && owner !== challenge.opponent_key) return json({ error: "You are not a participant." }, 403);
    if (challenge.status === "coaching" || challenge.status === "completed") return json({ status: challenge.status, games: challenge.games, wins: challenge.wins });
    if (challenge.status !== "playing_second_half" || !challenge.current_game) return json({ error: "The second half has not started." }, 409);
    const games = [...challenge.games, challenge.current_game], wins = [...challenge.wins];
    if (challenge.current_game.score[0] > challenge.current_game.score[1]) wins[0]++; else wins[1]++;
    const needed = Math.floor(challenge.best_of / 2) + 1, complete = wins[0] >= needed || wins[1] >= needed;
    if (!complete) {
      const { error: updateError } = await db.from("match_challenges").update({ status: "coaching", games, wins, current_game: null, game_started_at: null, halftime_started_at: null, creator_halftime_ready: false, opponent_halftime_ready: false, version: challenge.version + 1 }).eq("id", challenge.id).eq("version", challenge.version);
      if (updateError) throw updateError; return json({ status: "coaching", games, wins });
    }
    const { data: claimed, error: claimError } = await db.from("match_challenges").update({ version: challenge.version + 1 }).eq("id", challenge.id).eq("version", challenge.version).eq("status", "playing_second_half").select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return json({ status: "syncing" }, 202);
    const series = { bestOf: challenge.best_of, needed, wins, winner: wins[0] > wins[1] ? 0 : 1, games };
    const setup = [challenge.creator_setup, challenge.opponent_setup], title = `QNBA BO${challenge.best_of} ${challenge.mode} challenge`;
    const creatorPayload = { setup, result: challenge.current_game, series, era: challenge.era || "current", viewerSide: 0 };
    const { data: saved, error: saveError } = await db.from("match_results").insert({ owner_key: challenge.creator_key, source: "challenge", title, score: wins, payload: creatorPayload }).select("id").single();
    if (saveError) throw saveError;
    const { error: finishError } = await db.from("match_challenges").update({ status: "completed", games, wins, result_id: saved.id, current_game: null, completed_at: new Date().toISOString(), version: challenge.version + 2 }).eq("id", challenge.id).eq("version", challenge.version + 1);
    if (finishError) throw finishError;
    if (challenge.opponent_key !== challenge.creator_key) await db.from("match_results").insert({ owner_key: challenge.opponent_key, source: "challenge", title, score: wins, payload: { ...creatorPayload, viewerSide: 1 } });
    return json({ status: "completed", games, wins, series });
  } catch (error) { console.error("Challenge finish failed", error); return json({ error: "Unable to finish this game." }, 503); }
}
