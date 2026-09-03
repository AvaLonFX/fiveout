import { NextResponse } from "next/server";
import { admin, identity } from "@/lib/guesser-server";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id))
      return json({ error: "Match not found." }, 404);
    const { owner } = await identity();
    const { data, error } = await admin()
      .from("match_results")
      .select("id,title,source,score,created_at,payload")
      .eq("id", id)
      .eq("owner_key", owner)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Match not found." }, 404);
    return json({
      id: data.id,
      title: data.title,
      source: data.source,
      score: data.score,
      createdAt: data.created_at,
      ...data.payload,
    });
  } catch (error) {
    console.error("Saved match failed", error);
    return json({ error: "Unable to load this match." }, 503);
  }
}
