import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function POST(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  const { code } = await context.params;
  try {
    const body = JSON.parse(await req.text()); const { owner } = await identity(); const db = admin();
    const select = "id,creator_key,opponent_key,status,creator_halftime_ready,opponent_halftime_ready,version";
    const { data: challenge, error } = await db.from("match_challenges").select(select).eq("share_code", code).maybeSingle();
    if (error) throw error; if (!challenge) return json({ error: "Challenge not found." }, 404);
    if (!["playing_first_half", "halftime"].includes(challenge.status)) return json({ error: "This game is not at halftime." }, 409);
    let role: "creator" | "opponent";
    if (owner === challenge.creator_key && owner === challenge.opponent_key) role = body.role === "opponent" ? "opponent" : "creator";
    else if (owner === challenge.creator_key) role = "creator"; else if (owner === challenge.opponent_key) role = "opponent"; else return json({ error: "You are not a participant." }, 403);
    const changes = role === "creator" ? { creator_halftime_ready: true } : { opponent_halftime_ready: true };
    const { data: updated, error: updateError } = await db.from("match_challenges").update({ ...changes, status: "halftime", version: challenge.version + 1 }).eq("id", challenge.id).eq("version", challenge.version).select(select).maybeSingle();
    if (updateError) throw updateError; if (!updated) return json({ error: "Lobby changed. Try again." }, 409);
    if (!updated.creator_halftime_ready || !updated.opponent_halftime_ready) return json({ status: "halftime", halftimeReady: [updated.creator_halftime_ready, updated.opponent_halftime_ready] });
    const halftimeStartedAt = new Date().toISOString();
    const { error: startError } = await db.from("match_challenges").update({ status: "playing_second_half", halftime_started_at: halftimeStartedAt, version: updated.version + 1 }).eq("id", updated.id).eq("version", updated.version);
    if (startError) throw startError;
    return json({ status: "playing_second_half", halftimeReady: [true, true], halftimeStartedAt });
  } catch (error) { console.error("Challenge halftime failed", error); return json({ error: "Unable to update halftime readiness." }, 503); }
}

