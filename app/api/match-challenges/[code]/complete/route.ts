import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import { validSide, validateChallengeRules } from "@/lib/match-persistence";
import { randomInt } from "node:crypto";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin)
    return json({ error: "Invalid request origin." }, 403);
  const { code } = await context.params;
  if (!/^[0-9a-f]{36}$/.test(code)) return json({ error: "Challenge not found." }, 404);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    const db = admin();
    const { data: challenge, error } = await db
      .from("match_challenges")
      .select("id,creator_setup,status,mode,version")
      .eq("share_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!challenge) return json({ error: "Challenge not found." }, 404);
    if (challenge.status !== "open")
      return json({ error: "This challenge already has an opponent." }, 409);
    const isDraft = challenge.mode === "draft";
    if (!isDraft && !validSide(body.opponent))
      return json({ error: "Choose a legal starting five and exactly 240 rotation minutes." }, 400);
    if (!isDraft && !validSide(challenge.creator_setup)) throw new Error("Stored challenge is invalid");
    if (!isDraft) await validateChallengeRules(challenge.mode, [challenge.creator_setup, body.opponent]);
    const { owner } = await identity();
    const emptyDraftSetup = { ids: [], minutes: [], tactic: "balanced", secondHalfTactic: "balanced" };
    const draftFirst = isDraft ? randomInt(2) : null;
    const { data: joined, error: updateError } = await db
      .from("match_challenges")
      .update({
        opponent_key: owner,
        opponent_setup: isDraft ? emptyDraftSetup : body.opponent,
        status: isDraft ? "drafting" : "coaching",
        ...(isDraft ? { draft_first: draftFirst, draft_pick_started_at: new Date().toISOString() } : {}),
        creator_ready: false,
        opponent_ready: false,
        version: challenge.version + 1,
      })
      .eq("id", challenge.id)
      .eq("status", "open")
      .eq("version", challenge.version)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!joined) return json({ error: "Another opponent joined first." }, 409);
    return json({ status: isDraft ? "drafting" : "coaching", role: "opponent", ...(isDraft ? { creator: challenge.creator_setup, opponent: emptyDraftSetup, draftFirst, draftTurn: draftFirst } : {}) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Salary cap") || message.startsWith("Draft teams"))
      return json({ error: message }, 400);
    console.error("Challenge join failed", error);
    return json({ error: "Unable to join this challenge." }, 503);
  }
}
