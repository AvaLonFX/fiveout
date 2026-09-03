export type FanPlayer = {
  position?: string;
  games?: number;
  minutes?: number;
  confidence?: string;
  id: number;
  name: string;
  team: string;
  teamId: string;
  pts: number;
  reb: number;
  ast: number;
  fgm: number;
  fga: number;
  cost: number;
  score: number;
};
export const BUDGET = 80;
export function total(players: FanPlayer[]) {
  const sum = (key: "pts" | "reb" | "ast" | "fgm" | "fga" | "cost" | "score") =>
    players.reduce((n, p) => n + p[key], 0);
  return {
    pts: sum("pts"),
    reb: sum("reb"),
    ast: sum("ast"),
    fg: sum("fga") ? (100 * sum("fgm")) / sum("fga") : null,
    cost: sum("cost"),
    score: Math.round(sum("score") * 10) / 10,
  };
}
export function validateFive(
  ids: unknown,
  pool: FanPlayer[],
  budget = BUDGET,
): FanPlayer[] {
  if (
    !Array.isArray(ids) ||
    ids.length !== 5 ||
    ids.some((id) => !Number.isSafeInteger(id)) ||
    new Set(ids).size !== 5
  )
    throw new Error("Choose five different players.");
  const selected = ids.map((id) => pool.find((p) => p.id === id));
  if (selected.some((p) => !p))
    throw new Error("A selected player is not in today’s pool.");
  const players = selected as FanPlayer[];
  if (total(players).cost > budget)
    throw new Error("Your lineup exceeds the budget.");
  return players;
}
export function optimum(pool: FanPlayer[], budget = BUDGET) {
  let best = -1,
    bestIds: number[] = [];
  const visit = (start: number, chosen: FanPlayer[], cost: number) => {
    if (chosen.length === 5) {
      const score = total(chosen).score;
      if (score > best) {
        best = score;
        bestIds = chosen.map((p) => p.id);
      }
      return;
    }
    for (let i = start; i <= pool.length - (5 - chosen.length); i++)
      if (cost + pool[i].cost <= budget)
        visit(i + 1, [...chosen, pool[i]], cost + pool[i].cost);
  };
  visit(0, [], 0);
  return { score: best, ids: bestIds };
}
