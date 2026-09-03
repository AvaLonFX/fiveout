import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import { simulationPlayers } from "@/lib/simulation-data";
import { defaultRotation } from "@/lib/match-simulation";
import { canCompleteLineup, pickLegalFive } from "@/lib/lineup-roles";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  const { code } = await context.params;
  if (!/^[0-9a-f]{36}$/.test(code)) return json({ error: "Challenge not found." }, 404);
  try {
    const raw = await req.text();
    if (raw.length > 512) return json({ error: "Request too large." }, 413);
    const playerId = Number(JSON.parse(raw).playerId);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) return json({ error: "Choose a valid player." }, 400);
    const { owner } = await identity();
    const db = admin();
    const select = "id,status,mode,era,creator_key,opponent_key,creator_setup,opponent_setup,draft_first,version";
    const { data: challenge, error } = await db.from("match_challenges").select(select).eq("share_code", code).maybeSingle();
    if (error) throw error;
    if (!challenge) return json({ error: "Challenge not found." }, 404);
    if (challenge.status !== "drafting" || challenge.mode !== "draft") return json({ error: "This draft is not active." }, 409);
    const side = owner === challenge.creator_key ? 0 : owner === challenge.opponent_key ? 1 : -1;
    if (side < 0) return json({ error: "You are not a participant in this draft." }, 403);
    const setups = [challenge.creator_setup, challenge.opponent_setup];
    const totalPicks = setups[0].ids.length + setups[1].ids.length;
    const turn = (challenge.draft_first + totalPicks) % 2;
    if (side !== turn) return json({ error: "Wait for the other coach's pick." }, 409);
    if (setups[0].ids.includes(playerId) || setups[1].ids.includes(playerId)) return json({ error: "That player has already been drafted." }, 409);
    if (setups[side].ids.length >= 8) return json({ error: "Your roster is already complete." }, 409);
    const era = challenge.era === "alltime" ? "alltime" : "current";
    const currentIds = setups[side].ids;
    const dataset = await simulationPlayers([...currentIds, playerId], era);
    const player = dataset.players.find(candidate => candidate.id === playerId);
    if (!player) return json({ error: "That player is unavailable." }, 400);
    const draftedPlayers = [...currentIds, playerId].map(id => dataset.players.find(candidate => candidate.id === id)).filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate);
    if (draftedPlayers.length !== currentIds.length + 1) return json({ error: "One of the drafted players is unavailable." }, 400);
    if (!canCompleteLineup(draftedPlayers)) return json({ error: "That pick would leave too few roster spots for 2 guards, 2 forwards, and 1 center." }, 400);
    let ids = [...currentIds, playerId];
    if (ids.length === 8) {
      const starters = pickLegalFive(draftedPlayers);
      if (starters.length !== 5) return json({ error: "Your final roster must contain a legal five: 2 guards, 2 forwards, and 1 center." }, 400);
      const starterIds = starters.map(candidate => candidate.id);
      ids = [...starterIds, ...ids.filter(id => !starterIds.includes(id))];
    }
    setups[side] = { ...setups[side], ids, minutes: ids.length === 8 ? defaultRotation(ids.map(id => ({ id } as any))) : [] };
    const complete = setups.every(setup => setup.ids.length === 8);
    const changes = side === 0 ? { creator_setup: setups[0] } : { opponent_setup: setups[1] };
    const { data: updated, error: updateError } = await db.from("match_challenges").update({ ...changes, status: complete ? "coaching" : "drafting", draft_pick_started_at: complete ? null : new Date().toISOString(), version: challenge.version + 1 }).eq("id", challenge.id).eq("version", challenge.version).eq("status", "drafting").select(select).maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json({ error: "The draft changed. Try your pick again." }, 409);
    const nextTotal = updated.creator_setup.ids.length + updated.opponent_setup.ids.length;
    return json({ status: updated.status, creator: updated.creator_setup, opponent: updated.opponent_setup, draftFirst: updated.draft_first, draftTurn: complete ? null : (updated.draft_first + nextTotal) % 2, draftPickStartedAt: complete ? null : new Date().toISOString() });
  } catch (error) {
    console.error("Challenge draft pick failed", error);
    return json({ error: "Unable to save this draft pick." }, 503);
  }
}
