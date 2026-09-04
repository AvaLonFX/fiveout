import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";
import { validSide } from "@/lib/match-persistence";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });

export async function GET() {
  try {
    const { owner, signedIn } = await identity();
    if (!signedIn) return json({ error: "Sign in to view saved lineups." }, 401);
    const { data, error } = await admin().from("saved_lineups").select("id,name,era,player_ids,created_at").eq("owner_key", owner).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return json({ lineups: (data || []).map(row => ({ id: row.id, name: row.name, era: row.era, playerIds: row.player_ids, createdAt: row.created_at })) });
  } catch (error) {
    console.error("Saved lineups load failed", error);
    return json({ error: "Unable to load saved lineups." }, 503);
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  try {
    const { owner, signedIn } = await identity();
    if (!signedIn) return json({ error: "Sign in to save lineups." }, 401);
    const body = JSON.parse(await req.text());
    if (!validSide(body.side)) return json({ error: "Invalid lineup or rotation minutes." }, 400);
    const name = String(body.name || "Saved lineup").trim().slice(0, 48) || "Saved lineup";
    const era = body.era === "alltime" ? "alltime" : "current";
    const { data, error } = await admin().from("saved_lineups").insert({ owner_key: owner, name, era, player_ids: body.side.ids, setup: body.side }).select("id").single();
    if (error) throw error;
    return json({ id: data.id }, 201);
  } catch (error) {
    console.error("Saved lineup failed", error);
    return json({ error: "Unable to save this lineup." }, 503);
  }
}

export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Lineup not found." }, 404);
    const { owner, signedIn } = await identity();
    if (!signedIn) return json({ error: "Sign in to manage lineups." }, 401);
    const { error } = await admin().from("saved_lineups").delete().eq("id", id).eq("owner_key", owner);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error("Saved lineup delete failed", error);
    return json({ error: "Unable to remove this lineup." }, 503);
  }
}
