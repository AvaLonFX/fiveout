"use client";

import { useEffect, useMemo, useState } from "react";
import type { Simulation } from "@/lib/match-simulation";

type Point = { x: number; y: number };

const attack: Point[] = [
  { x: 67, y: 50 },
  { x: 76, y: 22 },
  { x: 76, y: 78 },
  { x: 87, y: 34 },
  { x: 89, y: 64 },
];
const defend: Point[] = [
  { x: 70, y: 50 },
  { x: 78, y: 28 },
  { x: 78, y: 72 },
  { x: 85, y: 41 },
  { x: 85, y: 59 },
];
const offenses: Record<string, Point[]> = {
  "Pick & roll": attack,
  Isolation: [
    { x: 67, y: 50 }, { x: 76, y: 16 }, { x: 76, y: 84 }, { x: 89, y: 23 }, { x: 89, y: 77 },
  ],
  "Drive & kick": [
    { x: 68, y: 50 }, { x: 77, y: 17 }, { x: 77, y: 83 }, { x: 91, y: 24 }, { x: 88, y: 66 },
  ],
  "Post up": [
    { x: 68, y: 50 }, { x: 77, y: 18 }, { x: 77, y: 82 }, { x: 88, y: 34 }, { x: 91, y: 53 },
  ],
  "Motion offense": [
    { x: 65, y: 50 }, { x: 74, y: 23 }, { x: 79, y: 78 }, { x: 88, y: 31 }, { x: 87, y: 64 },
  ],
  Transition: [
    { x: 58, y: 50 }, { x: 69, y: 22 }, { x: 70, y: 78 }, { x: 82, y: 36 }, { x: 86, y: 62 },
  ],
};
const mirror = (point: Point): Point => ({ x: 100 - point.x, y: point.y });
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

function actionLabel(event?: string, text?: string) {
  if (!event) return "Waiting for tip-off";
  if (event === "basket" && /three/i.test(text || "")) return "THREE-POINTER";
  return ({
    basket: "SHOT MADE",
    miss: "MISSED SHOT",
    block: "BLOCK",
    steal: "STEAL",
    turnover: "TURNOVER",
    "free-throws": "FREE THROWS",
    "offensive-rebound": "OFFENSIVE REBOUND",
  } as Record<string, string>)[event] || "LIVE POSSESSION";
}

export default function TacticalCourt({ result, cursor, speed }: { result: Simulation; cursor: number; speed: number }) {
  const play = result.plays[cursor - 1];
  const shotEvent = !!play && ["basket", "miss", "block"].includes(play.event);
  const actionType = !play
    ? "Motion offense"
    : play.event === "steal" || play.event === "turnover"
      ? "Transition"
      : play.event === "offensive-rebound"
        ? "Post up"
        : ["Pick & roll", "Isolation", "Drive & kick", "Post up", "Motion offense"][(play.possession * 5 + play.period) % 5];
  const passCount = play
    ? shotEvent
      ? 1 + ((play.possession * 7 + play.period * 3) % 4)
      : 1 + (play.possession % 2)
    : 1;
  const finalPhase = passCount + (shotEvent ? 2 : 1);
  const [phase, setPhase] = useState(2);
  useEffect(() => {
    setPhase(0);
    const step = Math.max(24, (speed * .82) / finalPhase);
    const timers = Array.from({ length: finalPhase }, (_, index) =>
      window.setTimeout(() => setPhase(index + 1), step * (index + 1)),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [cursor, speed, finalPhase]);

  const courtTeams = useMemo(
    () =>
      result.profiles.map((team, side) => {
        const ids = play?.onCourt?.[side];
        if (!ids?.length) return team.slice(0, 5);
        const active = ids.map((id) => team.find((player) => player.id === id)).filter(Boolean) as typeof team;
        return [...active, ...team.filter((player) => !ids.includes(player.id))].slice(0, 5);
      }),
    [play, result.profiles],
  );

  const actor = useMemo(() => {
    if (!play) return null;
    if (play.participants) {
      const index = courtTeams[play.participants.primarySide].findIndex((player) => player.id === play.participants!.primaryId);
      if (index >= 0) return { side: play.participants.primarySide, index };
    }
    for (let side = 0; side < 2; side++) {
      const index = courtTeams[side].findIndex((player) => play.text.includes(player.name));
      if (index >= 0) return { side, index };
    }
    return { side: play.side, index: 0 };
  }, [courtTeams, play]);

  const offense = play?.side ?? 0;
  const hoop: Point = offense === 0 ? { x: 94, y: 50 } : { x: 6, y: 50 };
  const direction = offense === 0 ? 1 : -1;
  const structuredShooter = play?.participants
    ? courtTeams[offense].findIndex((player) => player.id === play.participants!.offensiveId)
    : -1;
  const shooterIndex = structuredShooter >= 0 ? structuredShooter : actor?.side === offense ? actor.index : 0;
  const passRoute = useMemo(() => {
    let start = play ? (play.possession + play.period + offense) % 5 : 0;
    if (start === shooterIndex) start = (start + 1) % 5;
    const route = [start];
    for (let step = 1; step < passCount; step++) {
      let next = (start + play!.possession + step * 2) % 5;
      if (next === route.at(-1) || next === shooterIndex) next = (next + 1) % 5;
      route.push(next);
    }
    route.push(shooterIndex);
    return route;
  }, [offense, passCount, play, shooterIndex]);
  const currentReceiver = phase <= passCount ? passRoute[Math.min(phase, passRoute.length - 1)] : shooterIndex;
  const playerPoint = (side: number, index: number): Point => {
    const attacking = side === offense;
    const active = side === offense && index === currentReceiver;
    const base = attacking ? offenses[actionType][index] : defend[index];
    const oriented = offense === 0 ? base : mirror(base);
    if (phase === 0) {
      return {
        x: oriented.x - direction * (attacking ? 5 : 2),
        y: oriented.y + (index % 2 ? 2 : -2),
      };
    }
    if (phase > 0 && phase <= passCount && !active) {
      const styleCut = actionType === "Isolation" ? -2 : actionType === "Drive & kick" ? 4 : actionType === "Motion offense" ? 3 : 1;
      const cut = attacking ? (index === 1 ? 3 + styleCut : index === 2 ? 2 : styleCut) : 1;
      return {
        x: oriented.x + direction * cut,
        y: oriented.y + (index % 2 ? -2.5 : 2.5) * (phase % 2 ? 1 : -1),
      };
    }
    if (actor?.side === side && actor.index === index) {
      if (play?.event === "basket" || play?.event === "miss" || play?.event === "block") {
        return { x: oriented.x + direction * (phase <= passCount ? 3 : 1), y: oriented.y };
      }
      if (play?.event === "steal") return { x: phase <= passCount ? 50 : 50 - direction * 8, y: oriented.y };
    }
    return oriented;
  };

  const actorPoint = actor ? playerPoint(actor.side, actor.index) : { x: 50, y: 50 };
  const shot = play && ["basket", "miss", "block", "free-throws"].includes(play.event);
  const receiverPoint = playerPoint(offense, passRoute[Math.min(phase, passCount)]);
  const ballPoint = !play
    ? { x: 50, y: 50 }
    : play.event === "offensive-rebound"
      ? phase <= passCount ? hoop : actorPoint
      : play.event === "steal"
        ? phase <= passCount ? receiverPoint : actorPoint
        : phase <= passCount
          ? receiverPoint
          : shotEvent && phase === passCount + 1
            ? { x: (actorPoint.x + hoop.x) / 2, y: Math.max(8, Math.min(actorPoint.y, hoop.y) - 14) }
          : shot
            ? hoop
            : actorPoint;
  const transitionMs = Math.max(70, Math.min(420, (speed * .72) / finalPhase));

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-700/40 bg-[#25130b] shadow-inner">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-400">2D tactical court · Alpha</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{actionLabel(play?.event, play?.text)}</p><span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">{actionType}</span>{play && phase > 0 && phase <= passCount && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">PASS {phase} OF {passCount}</span>}{shotEvent && phase === passCount + 1 && <span className="text-[10px] font-black text-white/70">SHOT IN THE AIR</span>}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Lineup A</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Lineup B</span>
        </div>
      </div>
      <div data-testid="tactical-court" data-phase={phase} className="relative aspect-[2/1] min-h-[230px] w-full overflow-hidden bg-[#b96f36]" aria-label="Animated tactical view of the current possession">
        <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9854d" />
              <stop offset=".5" stopColor="#ad612f" />
              <stop offset="1" stopColor="#c47c43" />
            </linearGradient>
            <pattern id="boards" width="12.5" height="50" patternUnits="userSpaceOnUse">
              <rect width="12.5" height="50" fill="url(#wood)" />
              <path d="M12.5 0V50" stroke="rgba(74,35,15,.22)" strokeWidth=".18" />
              <path d="M0 12.5H12.5M0 37.5H12.5" stroke="rgba(255,255,255,.07)" strokeWidth=".12" />
            </pattern>
          </defs>
          <rect width="100" height="50" fill="url(#boards)" />
          <rect x="1" y="1" width="98" height="48" rx=".5" fill="none" stroke="#fff4df" strokeWidth=".45" />
          <line x1="50" y1="1" x2="50" y2="49" stroke="#fff4df" strokeWidth=".35" />
          <circle cx="50" cy="25" r="6" fill="rgba(95,42,20,.12)" stroke="#fff4df" strokeWidth=".35" />
          <circle cx="50" cy="25" r="1" fill="#fff4df" opacity=".65" />

          <rect x="1" y="17" width="18" height="16" fill="rgba(93,43,25,.34)" stroke="#fff4df" strokeWidth=".35" />
          <rect x="81" y="17" width="18" height="16" fill="rgba(93,43,25,.34)" stroke="#fff4df" strokeWidth=".35" />
          <circle cx="19" cy="25" r="6" fill="none" stroke="#fff4df" strokeWidth=".35" />
          <circle cx="81" cy="25" r="6" fill="none" stroke="#fff4df" strokeWidth=".35" />
          <path d="M19 19 A6 6 0 0 1 19 31" fill="none" stroke="#fff4df" strokeDasharray=".8 .8" strokeWidth=".28" />
          <path d="M81 19 A6 6 0 0 0 81 31" fill="none" stroke="#fff4df" strokeDasharray=".8 .8" strokeWidth=".28" />

          <path d="M1 3 L15.2 3 A25.4 23.75 0 0 1 15.2 47 L1 47" fill="none" stroke="#fff4df" strokeWidth=".42" />
          <path d="M99 3 L84.8 3 A25.4 23.75 0 0 0 84.8 47 L99 47" fill="none" stroke="#fff4df" strokeWidth=".42" />
          <path d="M5.7 21.6 A4 4 0 0 1 5.7 28.4" fill="none" stroke="#fff4df" strokeWidth=".28" />
          <path d="M94.3 21.6 A4 4 0 0 0 94.3 28.4" fill="none" stroke="#fff4df" strokeWidth=".28" />

          <line x1="4.3" y1="22" x2="4.3" y2="28" stroke="#f7fbff" strokeWidth=".7" />
          <line x1="95.7" y1="22" x2="95.7" y2="28" stroke="#f7fbff" strokeWidth=".7" />
          <circle cx="5.8" cy="25" r=".85" fill="none" stroke="#ff6b1a" strokeWidth=".6" />
          <circle cx="94.2" cy="25" r=".85" fill="none" stroke="#ff6b1a" strokeWidth=".6" />
          <path d="M5.15 25.45 L5.45 27 L5.8 25.55 L6.15 27 L6.45 25.45" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth=".18" />
          <path d="M93.55 25.45 L93.85 27 L94.2 25.55 L94.55 27 L94.85 25.45" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth=".18" />
        </svg>
        {courtTeams.map((team, side) =>
          team.map((player, index) => {
            const point = playerPoint(side, index);
            const active = (side === offense && index === currentReceiver) || (phase > passCount && actor?.side === side && actor.index === index);
            return (
              <div data-court-side={side} data-player-id={player.id} key={`${side}-${player.id}`} className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-all ease-in-out" style={{ left: `${point.x}%`, top: `${point.y}%`, transitionDuration: `${transitionMs}ms` }}>
                <div className={`grid h-8 w-8 place-items-center rounded-full border-2 text-[10px] font-black text-white shadow-lg sm:h-10 sm:w-10 sm:text-xs ${side === 0 ? "border-orange-200 bg-orange-500" : "border-sky-200 bg-sky-500"} ${active ? "scale-110 ring-4 ring-white/25" : ""}`}>{initials(player.name)}</div>
                <p className={`absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white ${active ? "block" : "hidden group-hover:block"}`}>{player.name.split(" ").at(-1)}</p>
              </div>
            );
          }),
        )}
        <div data-testid="tactical-ball" className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100 bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,.9)] transition-all ease-in-out" style={{ left: `${ballPoint.x}%`, top: `${ballPoint.y}%`, transitionDuration: `${transitionMs}ms` }} />
        {play && phase === finalPhase && shot && (
          <div className={`pointer-events-none absolute z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[10px] font-black ${play.event === "basket" ? "animate-ping border-emerald-300 bg-emerald-400/30 text-emerald-950" : play.event === "block" ? "border-violet-200 bg-violet-500/60 text-white" : "border-red-200 bg-red-500/50 text-white"}`} style={{ left: `${hoop.x}%`, top: `${hoop.y}%` }}>{play.event === "basket" ? "GOOD" : play.event === "block" ? "BLOCK" : "MISS"}</div>
        )}
        {play && <div className="absolute bottom-3 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-center text-xs text-white backdrop-blur">{play.text}</div>}
      </div>
    </section>
  );
}
