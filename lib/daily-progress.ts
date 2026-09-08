export function dailyStreak(days: string[], today: string, allowYesterday = true) {
  const completed = new Set(days);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (allowYesterday && !completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function bestDailyStreak(days: string[]) {
  const unique = Array.from(new Set(days)).sort();
  let best = 0, current = 0, previous = "";
  for (const day of unique) {
    const expected = previous ? new Date(`${previous}T00:00:00Z`) : null;
    expected?.setUTCDate(expected.getUTCDate() + 1);
    current = expected?.toISOString().slice(0, 10) === day ? current + 1 : 1;
    best = Math.max(best, current);
    previous = day;
  }
  return best;
}

export const dailyBadges = (bestStreak: number) => [
  { days: 3, name: "Three-Peat", description: "Played three days in a row", unlocked: bestStreak >= 3 },
  { days: 7, name: "Weekly Grinder", description: "Played seven days in a row", unlocked: bestStreak >= 7 },
  { days: 30, name: "Iron Coach", description: "Played 30 days in a row", unlocked: bestStreak >= 30 },
];
