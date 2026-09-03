import type { Answer, GameSummary, Move } from "./guesser-types";

const clean = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
function height(v: string | null) {
  const m = v?.match(/^(\d+)-(\d+)$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}
export function feedback(
  target: Answer,
  guess: Answer,
): Record<string, string> {
  const same = (a: string | null, b: string | null) =>
    !clean(a) || !clean(b)
      ? "Unknown"
      : clean(a) === clean(b)
        ? "Match"
        : "Different";
  const direction = (
    a: number | null,
    b: number | null,
    up: string,
    down: string,
  ) =>
    a === null || b === null
      ? "Unknown"
      : a === b
        ? "Match"
        : a > b
          ? up
          : down;
  const year = (v: string | null) =>
    /^\d{4}(?:\.0+)?$/.test(v || "") ? Number(v) : null;
  return {
    Team: same(target.team, guess.team),
    Position: same(target.position, guess.position),
    Country: same(target.country, guess.country),
    Height: direction(
      height(target.height),
      height(guess.height),
      "Taller ↑",
      "Shorter ↓",
    ),
    Draft: direction(
      year(target.draftYear),
      year(guess.draftYear),
      "Later ↑",
      "Earlier ↓",
    ),
  };
}
export function hintText(a: Answer, n: number) {
  return [
    `Position: ${a.position || "Unknown"}`,
    `Team: ${a.team || "Unknown"}`,
    `Country / height: ${a.country || "Unknown"} / ${a.height || "Unknown"}`,
    `Draft year: ${a.draftYear?.replace(/\.0+$/, "") || "Unknown"}`,
  ][n];
}
export function summarize(
  rows: { day: string; status: string; moves: Move[] }[],
  today: string,
): GameSummary {
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const distribution = Array(6).fill(0);
  let wins = 0,
    run = 0,
    bestStreak = 0,
    last = "";
  for (const r of ordered) {
    const previous = new Date(`${r.day}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    if (r.status === "won") {
      wins++;
      distribution[r.moves.length - 1]++;
      run = last === previous.toISOString().slice(0, 10) ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
    } else run = 0;
    last = r.day;
  }
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const completed = ordered.filter((r) => r.status !== "playing");
  // An unfinished challenge today does not break yesterday's winning streak.
  const eligible = ordered.filter(
    (r) => r.day !== today || r.status !== "playing",
  );
  let streak = 0,
    cursor = today;
  if (!eligible.some((r) => r.day === today))
    cursor = yesterday.toISOString().slice(0, 10);
  for (const r of [...eligible].reverse()) {
    if (r.day !== cursor || r.status !== "won") break;
    streak++;
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  const current = ordered.find((r) => r.day === today);
  return {
    played: completed.length,
    wins,
    winRate: completed.length ? Math.round((wins / completed.length) * 100) : 0,
    streak,
    bestStreak,
    distribution,
    today: current
      ? { status: current.status, attempts: current.moves.length }
      : null,
  };
}
