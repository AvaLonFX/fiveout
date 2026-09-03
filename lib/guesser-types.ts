export type Era = "current" | "alltime";
export type Mode = "daily" | "practice";
export type Answer = {
  id: number;
  name: string;
  team: string | null;
  position: string | null;
  country: string | null;
  height: string | null;
  draftYear: string | null;
  stats: { pts: number; reb: number; ast: number };
};
export type Move = {
  type: "guess" | "hint";
  id?: number;
  name?: string;
  correct?: boolean;
  feedback?: Record<string, string>;
  hint?: string;
};
export type Game = {
  id: string;
  era: Era;
  mode: Mode;
  day: string;
  version: number;
  status: "playing" | "won" | "lost";
  moves: Move[];
  stats: Answer["stats"];
  player: Answer | null;
};
export type GameSummary = {
  played: number;
  wins: number;
  winRate: number;
  streak: number;
  bestStreak: number;
  distribution: number[];
  today: { status: string; attempts: number } | null;
};
