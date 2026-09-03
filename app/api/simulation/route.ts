import { NextRequest, NextResponse } from "next/server";
import { simulationPlayers } from "@/lib/simulation-data";
import { assignLineup } from "@/lib/lineup-roles";
import { simulate, tactics, type Tactic } from "@/lib/match-simulation";
import {
  matchToken,
  newMatchSeed,
  readMatchToken,
  seededRandom,
} from "@/lib/match-security";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== req.nextUrl.origin
  )
    return reply({ error: "Invalid request origin." }, 403);
  if (!req.headers.get("content-type")?.includes("application/json"))
    return reply({ error: "JSON required." }, 415);
  let input;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: "Request too large." }, 413);
    input = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON." }, 400);
  }
  const { a, b, plans, secondHalfPlans, simulationToken, rotations, era } =
    input || {};
  if (
    [a, b].some(
      (ids) =>
        !Array.isArray(ids) ||
        ids.length < 5 ||
        ids.length > 8 ||
        new Set(ids).size !== ids.length ||
        ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0),
    ) ||
    !Array.isArray(plans) ||
    plans.length !== 2 ||
    plans.some((t) => !tactics.includes(t)) ||
    (secondHalfPlans !== undefined &&
      (!Array.isArray(secondHalfPlans) ||
        secondHalfPlans.length !== 2 ||
        secondHalfPlans.some((t) => !tactics.includes(t)))) ||
    !Array.isArray(rotations) ||
    rotations.length !== 2 ||
    rotations.some(
      (minutes, side) =>
        !Array.isArray(minutes) ||
        minutes.length !== [a, b][side].length ||
        minutes.some(
          (value) => !Number.isFinite(value) || value < 0 || value > 48,
        ) ||
        Math.abs(minutes.reduce((sum, value) => sum + value, 0) - 240) > 0.05,
    )
  )
    return reply(
      {
        error:
          "Choose five starters and up to three different bench players per side, plus valid tactics.",
      },
      400,
    );
  const tokenData =
    simulationToken === undefined ? null : readMatchToken(simulationToken);
  if (simulationToken !== undefined && !tokenData)
    return reply(
      {
        error:
          "This halftime session expired or is invalid. Start a new match.",
      },
      400,
    );
  try {
    const simulationEra = era === "alltime" ? "alltime" : "current";
    const dataset = await simulationPlayers(Array.from(new Set([...a, ...b])), simulationEra);
    const players = new Map(dataset.players.map((p) => [p.id, p]));
    if ([...a, ...b].some((id) => !players.has(id)))
      return reply(
        {
          error:
            "Some players lack complete season data or a known position. Replace them and try again.",
        },
        400,
      );
    const teams = [
      a.map((id: number) => players.get(id)!),
      b.map((id: number) => players.get(id)!),
    ];
    if (teams.some((t) => !assignLineup(t.slice(0, 5))))
      return reply(
        {
          error:
            "Each lineup must cover two guards, two forwards and one center. Multi-position players can fill one matching slot.",
        },
        400,
      );
    const seed = tokenData?.seed ?? newMatchSeed(),
      issued = tokenData?.issued ?? Date.now();
    const result = simulate(
      [
        a.map((id: number) => players.get(id)!),
        b.map((id: number) => players.get(id)!),
      ],
      plans as Tactic[],
      seededRandom(seed),
      (secondHalfPlans || plans) as Tactic[],
      rotations,
    );
    return reply({
      ...result,
      season: dataset.season,
      syncedAt: dataset.syncedAt,
      simulationToken: matchToken(seed, issued),
      era: simulationEra,
    });
  } catch (e) {
    console.error(
      "Simulation failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return reply(
      { error: "Unable to simulate the match. Please try again." },
      503,
    );
  }
}
