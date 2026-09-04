import { NextRequest, NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
async function profileStats(ownerKey: string) {
  const { data, error } = await admin().from("match_results").select("payload,source").eq("owner_key", ownerKey).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  let wins = 0, losses = 0, games = 0, pointsFor = 0, pointsAgainst = 0;
  for (const row of data || []) {
    if (row.source !== "challenge" || !row.payload?.series?.games?.length) continue;
    const side = row.payload.viewerSide === 1 ? 1 : 0;
    games += row.payload.series.games.length;
    for (const game of row.payload.series.games) { pointsFor += game.score[side]; pointsAgainst += game.score[1 - side]; }
    if (row.payload.series.winner === side) wins++; else losses++;
  }
  return { wins, losses, seriesPlayed: wins + losses, games, savedMatches: (data || []).length, pointsFor, pointsAgainst, winRate: wins + losses ? Math.round(1000 * wins / (wins + losses)) / 10 : 0 };
}
export async function GET(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams.get("slug");
    const current = await identity();
    if (!requested && !current.signedIn) return json({ error: "Sign in to view your account." }, 401);
    let query = admin().from("match_profiles").select("owner_key,public_slug,display_name,is_public");
    query = requested ? query.eq("public_slug", requested).eq("is_public", true) : query.eq("owner_key", current.owner);
    let { data: profile, error } = await query.maybeSingle();
    if (error) throw error;
    if (!profile && !requested) {
      const inserted = await admin().from("match_profiles").insert({ owner_key: current.owner, display_name: "FIVEOUT Coach" }).select("owner_key,public_slug,display_name,is_public").single();
      if (inserted.error) throw inserted.error; profile = inserted.data;
    }
    if (!profile) return json({ error: "Coach profile not found." }, 404);
    return json({ slug: profile.public_slug, displayName: profile.display_name, isPublic: profile.is_public, stats: await profileStats(profile.owner_key), own: !requested });
  } catch (error) { console.error("Profile load failed", error); return json({ error: "Unable to load your profile." }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid request origin." }, 403);
  try {
    const current = await identity();
    if (!current.signedIn) return json({ error: "Sign in to edit your profile." }, 401);
    const body = JSON.parse(await req.text()); const displayName = String(body.displayName || "").trim().slice(0, 32);
    if (displayName.length < 2) return json({ error: "Coach name must have at least two characters." }, 400);
    const { data, error } = await admin().from("match_profiles").upsert({ owner_key: current.owner, display_name: displayName, is_public: body.isPublic === true, updated_at: new Date().toISOString() }, { onConflict: "owner_key" }).select("public_slug,display_name,is_public").single();
    if (error) throw error;
    return json({ slug: data.public_slug, displayName: data.display_name, isPublic: data.is_public });
  } catch (error) { console.error("Profile update failed", error); return json({ error: "Unable to save your profile." }, 503); }
}
