import "server-only";
import { simulationPlayers, type SimulationEra } from "./simulation-data";
import { assignLineup } from "./lineup-roles";
import { simulate, tactics, type Tactic } from "./match-simulation";
import { seededRandom } from "./match-security";
import { roster } from "./fan-server";

export const MATCH_SALARY_CAP = 160;

export type SavedSide = {
  ids: number[];
  minutes: number[];
  tactic: Tactic;
  secondHalfTactic: Tactic;
};

export function validSide(value: unknown): value is SavedSide {
  if (!value || typeof value !== "object") return false;
  const side = value as SavedSide;
  return (
    Array.isArray(side.ids) &&
    side.ids.length >= 5 &&
    side.ids.length <= 8 &&
    new Set(side.ids).size === side.ids.length &&
    side.ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
    Array.isArray(side.minutes) &&
    side.minutes.length === side.ids.length &&
    side.minutes.every(
      (minute) => Number.isFinite(minute) && minute >= 0 && minute <= 48,
    ) &&
    Math.abs(side.minutes.reduce((sum, minute) => sum + minute, 0) - 240) <
      0.05 &&
    tactics.includes(side.tactic) &&
    tactics.includes(side.secondHalfTactic)
  );
}

export async function prepareSavedMatch(sides: SavedSide[], era: SimulationEra = "current") {
  if (sides.length !== 2 || sides.some((side) => !validSide(side)))
    throw new Error("Invalid saved match setup");
  const ids = Array.from(new Set(sides.flatMap((side) => side.ids)));
  const dataset = await simulationPlayers(ids, era);
  const players = new Map(dataset.players.map((player) => [player.id, player]));
  if (ids.some((id) => !players.has(id)))
    throw new Error("A selected player is no longer available");
  const teams = sides.map((side) => side.ids.map((id) => players.get(id)!));
  if (teams.some((team) => !assignLineup(team.slice(0, 5))))
    throw new Error("Invalid starting lineup");
  return (seed: number) => {
    const result = simulate(
      teams,
      sides.map((side) => side.tactic),
      seededRandom(seed),
      sides.map((side) => side.secondHalfTactic),
      sides.map((side) => side.minutes),
    );
    return {
      ...result,
      season: dataset.season,
      syncedAt: dataset.syncedAt,
      era,
    };
  };
}

export async function buildSavedMatch(
  sides: SavedSide[],
  seed: number,
  era: SimulationEra = "current",
) {
  return (await prepareSavedMatch(sides, era))(seed);
}

export function safeTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return title || "QNBA match";
}

export async function validateChallengeRules(
  mode: string,
  sides: SavedSide[],
) {
  if (mode === "draft") {
    const first = new Set(sides[0].ids);
    if (sides[1]?.ids.some((id) => first.has(id)))
      throw new Error("Draft teams cannot select the same player");
  }
  if (mode === "salary") {
    const costs = new Map((await roster()).map((player) => [player.id, player.cost]));
    for (const side of sides) {
      const total = side.ids.reduce((sum, id) => sum + (costs.get(id) || 999), 0);
      if (total > MATCH_SALARY_CAP)
        throw new Error(`Salary cap exceeded: ${total}/${MATCH_SALARY_CAP}`);
    }
  }
}
