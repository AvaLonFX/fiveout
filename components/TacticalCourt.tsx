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
    <section className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#070b13] shadow-[0_24px_70px_rgba(0,0,0,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#090e19] via-[#101827] to-[#090e19] px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-300">FIVEOUT · Live court</p>
          <div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-sm font-black tracking-wide">{actionLabel(play?.event, play?.text)}</p><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.08] px-2 py-0.5 text-[10px] font-bold text-cyan-100">{actionType}</span>{play && phase > 0 && phase <= passCount && <span className="rounded-full border border-white/10 bg-white/[.06] px-2 py-0.5 text-[10px] font-bold text-white/70">PASS {phase}/{passCount}</span>}{shotEvent && phase === passCount + 1 && <span className="text-[10px] font-black text-amber-300">SHOT IN FLIGHT</span>}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-center"><p className="text-[9px] uppercase tracking-widest text-slate-500">Game clock</p><p className="font-mono text-sm font-black text-white">{play ? `${play.period <= 4 ? `Q${play.period}` : `OT${play.period - 4}`} · ${play.clock}` : "TIP-OFF"}</p></div>
          <div className="hidden items-center gap-3 text-xs sm:flex">
            <span className={`flex items-center gap-1.5 ${offense === 0 ? "font-bold text-white" : "text-slate-400"}`}><i className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_10px_#f97316]" /> A {play?.score?.[0] ?? 0}</span>
            <span className={`flex items-center gap-1.5 ${offense === 1 ? "font-bold text-white" : "text-slate-400"}`}><i className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_10px_#0ea5e9]" /> B {play?.score?.[1] ?? 0}</span>
          </div>
        </div>
      </div>
      <div data-testid="tactical-court" data-phase={phase} className="relative aspect-[2/1] min-h-[230px] w-full overflow-hidden border-[6px] border-[#15100c] bg-[#ba713d] ring-1 ring-inset ring-white/10" aria-label="Animated tactical view of the current possession">
        <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d59a65" />
              <stop offset=".48" stopColor="#bb7543" />
              <stop offset="1" stopColor="#ce8b55" />
            </linearGradient>
            <pattern id="boards" width="8" height="10" patternUnits="userSpaceOnUse">
              <rect width="8" height="10" fill="url(#wood)" />
              <path d="M8 0V10M0 5H8" stroke="#7b431f" strokeOpacity=".2" strokeWidth=".12" />
              <path d="M.5 1.2C2.2.8 4.2 1.7 7.5 1.1M.4 7.7C3.1 7.1 5.2 8.1 7.6 7.5" fill="none" stroke="#fff" strokeOpacity=".055" strokeWidth=".12" />
            </pattern>
            <radialGradient id="courtLight"><stop offset="0" stopColor="#fff" stopOpacity=".14"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
          </defs>
          <rect width="100" height="50" fill="url(#boards)" />
          <rect width="100" height="50" fill="url(#courtLight)" />
          <rect x="1" y="1" width="98" height="48" rx=".65" fill="none" stroke="#fff8e9" strokeWidth=".38" />
          <line x1="50" y1="1" x2="50" y2="49" stroke="#fff8e9" strokeWidth=".3" />
          <circle cx="50" cy="25" r="6" fill="rgba(59,32,18,.1)" stroke="#fff8e9" strokeWidth=".3" />
          <circle cx="50" cy="25" r="1" fill="#fff4df" opacity=".65" />

          <rect x="1" y="17" width="18" height="16" fill="rgba(34,211,238,.10)" stroke="#fff8e9" strokeWidth=".32" />
          <rect x="81" y="17" width="18" height="16" fill="rgba(139,92,246,.11)" stroke="#fff8e9" strokeWidth=".32" />
          <circle cx="19" cy="25" r="6" fill="none" stroke="#fff4df" strokeWidth=".35" />
          <circle cx="81" cy="25" r="6" fill="none" stroke="#fff4df" strokeWidth=".35" />
          <path d="M19 19 A6 6 0 0 1 19 31" fill="none" stroke="#fff4df" strokeDasharray=".8 .8" strokeWidth=".28" />
          <path d="M81 19 A6 6 0 0 0 81 31" fill="none" stroke="#fff4df" strokeDasharray=".8 .8" strokeWidth=".28" />

          <path d="M1 3 L15.2 3 A25.4 23.75 0 0 1 15.2 47 L1 47" fill="none" stroke="#fff4df" strokeWidth=".42" />
          <path d="M99 3 L84.8 3 A25.4 23.75 0 0 0 84.8 47 L99 47" fill="none" stroke="#fff4df" strokeWidth=".42" />
          <path d="M5.7 21.6 A4 4 0 0 1 5.7 28.4" fill="none" stroke="#fff4df" strokeWidth=".28" />
          <path d="M94.3 21.6 A4 4 0 0 0 94.3 28.4" fill="none" stroke="#fff4df" strokeWidth=".28" />

          <g aria-label="Left basket">
            <rect x="1.55" y="22.9" width="2.25" height="4.2" rx=".35" fill="#111827" stroke="#334155" strokeWidth=".16" />
            <rect x="1.85" y="23.35" width="1.65" height="3.3" rx=".22" fill="#1e293b" />
            <path d="M3.8 25H4.75" stroke="#64748b" strokeWidth=".48" strokeLinecap="round" />
            <rect x="4.55" y="21.55" width=".62" height="6.9" rx=".18" fill="#dbeafe" fillOpacity=".72" stroke="#ffffff" strokeWidth=".2" />
            <path d="M5.15 25H5.62" stroke="#f97316" strokeWidth=".34" strokeLinecap="round" />
            <circle cx="6.28" cy="25" r=".86" fill="#7c2d12" fillOpacity=".18" stroke="#fb641c" strokeWidth=".42" />
            <circle cx="6.28" cy="25" r=".58" fill="none" stroke="#fff7ed" strokeOpacity=".88" strokeWidth=".12" />
            <path d="M5.78 24.62L6.05 25.48M6.28 24.43V25.57M6.78 24.62L6.51 25.48M5.72 25H6.84" stroke="#fff7ed" strokeOpacity=".72" strokeWidth=".1" />
          </g>
          <g aria-label="Right basket">
            <rect x="96.2" y="22.9" width="2.25" height="4.2" rx=".35" fill="#111827" stroke="#334155" strokeWidth=".16" />
            <rect x="96.5" y="23.35" width="1.65" height="3.3" rx=".22" fill="#1e293b" />
            <path d="M96.2 25H95.25" stroke="#64748b" strokeWidth=".48" strokeLinecap="round" />
            <rect x="94.83" y="21.55" width=".62" height="6.9" rx=".18" fill="#dbeafe" fillOpacity=".72" stroke="#ffffff" strokeWidth=".2" />
            <path d="M94.85 25H94.38" stroke="#f97316" strokeWidth=".34" strokeLinecap="round" />
            <circle cx="93.72" cy="25" r=".86" fill="#7c2d12" fillOpacity=".18" stroke="#fb641c" strokeWidth=".42" />
            <circle cx="93.72" cy="25" r=".58" fill="none" stroke="#fff7ed" strokeOpacity=".88" strokeWidth=".12" />
            <path d="M93.22 24.62L93.49 25.48M93.72 24.43V25.57M94.22 24.62L93.95 25.48M93.16 25H94.28" stroke="#fff7ed" strokeOpacity=".72" strokeWidth=".1" />
          </g>
        </svg>
        {play && phase > 0 && phase <= passCount && (
          <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true">
            <line x1={actorPoint.x} y1={actorPoint.y / 2} x2={receiverPoint.x} y2={receiverPoint.y / 2} stroke="white" strokeOpacity=".28" strokeWidth=".22" strokeDasharray=".8 .8" />
          </svg>
        )}
        <div className={`pointer-events-none absolute left-3 top-3 z-20 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest backdrop-blur ${offense === 0 ? "border-orange-300/30 bg-orange-950/60 text-orange-200" : "border-sky-300/30 bg-sky-950/60 text-sky-200"}`}>Lineup {offense === 0 ? "A" : "B"} possession</div>
        {courtTeams.map((team, side) =>
          team.map((player, index) => {
            const point = playerPoint(side, index);
            const active = (side === offense && index === currentReceiver) || (phase > passCount && actor?.side === side && actor.index === index);
            return (
              <div data-court-side={side} data-player-id={player.id} key={`${side}-${player.id}`} className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-all ease-in-out" style={{ left: `${point.x}%`, top: `${point.y}%`, transitionDuration: `${transitionMs}ms` }}>
                <span className="absolute left-1/2 top-[82%] h-2.5 w-8 -translate-x-1/2 rounded-full bg-black/30 blur-sm sm:w-10" />
                <div className={`relative grid h-8 w-8 place-items-center rounded-full border text-[10px] font-black text-white shadow-[0_5px_12px_rgba(0,0,0,.45),inset_0_1px_1px_rgba(255,255,255,.35)] sm:h-10 sm:w-10 sm:text-xs ${side === 0 ? "border-orange-100 bg-gradient-to-br from-orange-400 to-orange-600" : "border-sky-100 bg-gradient-to-br from-sky-400 to-sky-600"} ${active ? "scale-110 ring-4 ring-white/30" : ""}`}>{initials(player.name)}{side === offense && index === currentReceiver && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-amber-400 shadow-[0_0_8px_#f59e0b]"/>}</div>
                <p className={`absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#05070c]/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-lg backdrop-blur ${active ? "block" : "hidden group-hover:block"}`}>{player.name.split(" ").at(-1)}</p>
              </div>
            );
          }),
        )}
        <div data-testid="tactical-ball" className="absolute z-20 grid h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full border border-orange-100 bg-orange-500 shadow-[0_2px_5px_rgba(0,0,0,.5),0_0_12px_rgba(249,115,22,.75)] transition-all ease-in-out" style={{ left: `${ballPoint.x}%`, top: `${ballPoint.y}%`, transitionDuration: `${transitionMs}ms` }}><span className="h-full w-px rotate-45 bg-[#49200d]/80"/><span className="absolute h-px w-full -rotate-12 bg-[#49200d]/80"/></div>
        {play && phase === finalPhase && shot && (
          <div className={`pointer-events-none absolute z-20 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[8px] font-black shadow-2xl ring-4 ring-black/15 ${play.event === "basket" ? "border-emerald-100 bg-emerald-400/90 text-emerald-950" : play.event === "block" ? "border-violet-100 bg-violet-500/90 text-white" : "border-red-100 bg-red-500/85 text-white"}`} style={{ left: `${hoop.x}%`, top: `${hoop.y}%` }}>{play.event === "basket" ? "GOOD" : play.event === "block" ? "BLOCK" : "MISS"}</div>
        )}
        {play && <div className="absolute bottom-3 left-1/2 z-30 max-w-[92%] -translate-x-1/2 rounded-lg border border-white/10 bg-[#05070c]/85 px-3 py-1.5 text-center text-xs text-white shadow-xl backdrop-blur-md">{play.text}</div>}
      </div>
    </section>
  );
}
