export type Role = "G" | "F" | "C";
export const lineupSlots: Role[] = ["G", "G", "F", "F", "C"];
export function roles(position?: string): Role[] {
  return (position || "")
    .toUpperCase()
    .split(/[-/\s]+/)
    .filter((p): p is Role => ["G", "F", "C"].includes(p));
}

// Returns whether a partial eight-player roster can still contain a legal
// G / G / F / F / C five once its remaining draft spots are filled.
export function canCompleteLineup<T extends { id: number; position?: string }>(
  players: T[],
  rosterSize = 8,
): boolean {
  if (players.length > rosterSize || new Set(players.map((p) => p.id)).size !== players.length)
    return false;
  let best = 0;
  function visit(index: number, usedSlots: Set<number>) {
    best = Math.max(best, usedSlots.size);
    if (index === players.length) return;
    visit(index + 1, usedSlots);
    lineupSlots.forEach((slot, slotIndex) => {
      if (!usedSlots.has(slotIndex) && roles(players[index].position).includes(slot)) {
        visit(index + 1, new Set([...Array.from(usedSlots), slotIndex]));
      }
    });
  }
  visit(0, new Set());
  return 5 - best <= rosterSize - players.length;
}
// Backtracking handles multi-position players without counting anyone twice.
export function assignLineup<T extends { id: number; position?: string }>(
  players: T[],
): T[] | null {
  if (players.length !== 5 || new Set(players.map((p) => p.id)).size !== 5)
    return null;
  function visit(slot: number, used: Set<number>): T[] | null {
    if (slot === 5) return [];
    for (const p of players)
      if (!used.has(p.id) && roles(p.position).includes(lineupSlots[slot])) {
        const tail = visit(slot + 1, new Set([...Array.from(used), p.id]));
        if (tail) return [p, ...tail];
      }
    return null;
  }
  return visit(0, new Set());
}
export function pickLegalFive<T extends { id: number; position?: string }>(
  pool: T[],
): T[] {
  function visit(slot: number, used: Set<number>): T[] | null {
    if (slot === 5) return [];
    for (const p of pool)
      if (!used.has(p.id) && roles(p.position).includes(lineupSlots[slot])) {
        const tail = visit(slot + 1, new Set([...Array.from(used), p.id]));
        if (tail) return [p, ...tail];
      }
    return null;
  }
  return visit(0, new Set()) || [];
}
