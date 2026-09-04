import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import { buildSavedMatch, safeTitle, validSide } from "@/lib/match-persistence";
import { readMatchToken } from "@/lib/match-security";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });

export async function GET() {
  try {
    const { owner, signedIn } = await identity();
    const { data, error } = await admin()
      .from("match_results")
      .select("id,title,source,score,created_at,payload")
      .eq("owner_key", owner)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return json({
      matches: data.map((row) => ({
        id: row.id,
        title: row.title,
        source: row.source,
        score: row.score,
        createdAt: row.created_at,
        teams: row.payload?.result?.profiles?.map((team: any[]) =>
          team.slice(0, 3).map((player) => player.name),
        ),
      })),
    });
  } catch (error) {
    console.error("Match history failed", error);
    return json({ error: "Unable to load match history." }, 503);
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
    if (raw.length > 8192) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    if (
      !Array.isArray(body.sides) ||
      body.sides.length !== 2 ||
      body.sides.some((side: unknown) => !validSide(side))
    )
      return json({ error: "Invalid lineups or rotation minutes." }, 400);
    const token = readMatchToken(body.simulationToken);
    if (!token)
      return json(
        { error: "This match expired. Simulate it again before saving." },
        400,
      );
    const { owner, signedIn } = await identity();
    const era = body.era === "alltime" ? "alltime" : "current";
    const result = await buildSavedMatch(body.sides, token.seed, era);
    const payload = { setup: body.sides, result, era };
    const { data, error } = await admin()
      .from("match_results")
      .insert({
        owner_key: owner,
        source: "simulation",
        title: safeTitle(body.title),
        score: result.score,
        payload,
      })
      .select("id")
      .single();
    if (error) throw error;
    return json({ id: data.id, signedIn }, 201);
  } catch (error) {
    console.error("Save match failed", error);
    return json({ error: "Unable to save this match." }, 503);
  }
}
