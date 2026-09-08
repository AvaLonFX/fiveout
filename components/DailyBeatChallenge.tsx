"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PlayerImage from "@/components/PlayerImage";
import MatchSimulation from "@/components/MatchSimulation";
import { assignLineup, roles } from "@/lib/lineup-roles";
import { trackEvent } from "@/lib/gtag";
import type { Tactic } from "@/lib/match-simulation";

type Player = { id: number; name: string; team: string; position: string; pts: number; reb: number; ast: number; cost: number; score: number; games: number };
type Attempt = { attempt_number: number; score_for: number; score_against: number; won: boolean; margin: number; spent: number };
type BoardRow = { rank: number; name: string; value: number; score?: string; spent?: number; you: boolean };
type State = { day: string; budget: number; opponentCost: number; difficulty: string; minBenchMinutes: number; maxAttempts: number; attempts: Attempt[]; streak: number; signedIn: boolean; community: { participants: number; beatRate: number | null }; opponent: Array<{ id: number; name: string; position: string }>; players: Player[]; leaderboards: { daily: BoardRow[]; streaks: BoardRow[] }; result?: any };
const tactics: Array<[Tactic, string]> = [["balanced", "Balanced"], ["perimeter", "More threes"], ["inside", "Play through the center"], ["fast", "Push the pace"], ["pressure", "Defensive pressure"]];

function Leaderboard({ title, subtitle, rows, format }: { title: string; subtitle: string; rows: BoardRow[]; format: (row: BoardRow) => React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0a1020] p-5">
    <h2 className="text-xl font-black">{title}</h2>
    <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    {rows.length ? <ol className="mt-4 space-y-2">{rows.map(row => <li key={`${row.rank}-${row.name}`} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border p-3 ${row.you ? "border-cyan-300/30 bg-cyan-300/[.07]" : "border-white/10 bg-white/[.025]"}`}><span className="text-sm font-black text-slate-500">#{row.rank}</span><span className="truncate font-bold">{row.name}</span><span className="flex items-end gap-2 text-right">{format(row)}</span></li>)}</ol> : <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No scores yet. Set the first mark.</p>}
  </div>;
}

export default function DailyBeatChallenge() {
  const [data, setData] = useState<State | null>(null), [ids, setIds] = useState<number[]>([]), [tactic, setTactic] = useState<Tactic>("balanced"), [query, setQuery] = useState(""), [position, setPosition] = useState("all"), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const startedTracked = useRef(false), readyTracked = useRef(false);
  useEffect(() => { fetch("/api/daily-beat", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error); setData(body); trackEvent("daily_challenge_viewed", { played_today: body.attempts.length ? "yes" : "no", streak: body.streak }); if (body.streak >= 2) trackEvent("daily_returning_user", { streak: body.streak }); }).catch(event => setError(event.message)).finally(() => setBusy(false)); }, []);
  const selected = useMemo(() => ids.map(id => data?.players.find(player => player.id === id)).filter(Boolean) as Player[], [data, ids]);
  const spent = selected.reduce((sum, player) => sum + player.cost, 0);
  const legal = ids.length === 8 && spent <= (data?.budget || 0) && !!assignLineup(selected.slice(0, 5));
  const visible = (data?.players || []).filter(player => position === "all" || roles(player.position).includes(position as "G" | "F" | "C")).filter(player => `${player.name} ${player.team}`.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: number) {
    if (!startedTracked.current && !ids.includes(id)) { startedTracked.current = true; trackEvent("daily_lineup_started"); }
    if (ids.includes(id)) setIds(current => current.filter(value => value !== id));
    else if (ids.length < 8) setIds(current => [...current, id]);
  }
  useEffect(() => {
    if (legal && !readyTracked.current) { readyTracked.current = true; trackEvent("daily_lineup_ready", { budget_used: spent, tactic }); }
  }, [legal, spent, tactic]);
  function move(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= ids.length) return;
    setIds(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function smartBuild() {
    if (!data) return;
    let best: Player[] | null = null, bestValue = -Infinity;
    const targetStarterMin = data.budget * .7, targetStarterMax = data.budget * .75;
    const starterPool = [...data.players].sort((a, b) => b.score - a.score);
    const startersByCost = new Map<number, Player[]>();
    let states: Array<{ players: Player[]; cost: number; value: number }> = [{ players: [], cost: 0, value: 0 }];
    for (const role of ["G", "G", "F", "F", "C"] as const) {
      const choices = starterPool.filter(player => roles(player.position).includes(role)).slice(0, 45);
      states = states.flatMap(state => choices.filter(player => !state.players.some(existing => existing.id === player.id)).map(player => ({ players: [...state.players, player], cost: state.cost + player.cost, value: state.value + player.score }))).filter(state => state.cost <= targetStarterMax).sort((a, b) => b.value - a.value).slice(0, 1600);
    }
    for (const state of states) {
      if (state.cost < targetStarterMin) continue;
      const incumbent = startersByCost.get(state.cost);
      if (!incumbent || state.value > incumbent.reduce((sum, player) => sum + player.score, 0)) startersByCost.set(state.cost, state.players);
    }
    for (const [starterCost, starters] of Array.from(startersByCost.entries())) {
      const starterIds = starters.map(player => player.id);
      const eligible = data.players.filter(player => !starterIds.includes(player.id));
      const benchPool = Array.from(new Map([...eligible.slice(0, 40), ...[...eligible].sort((a, b) => a.cost - b.cost || b.score - a.score).slice(0, 30)].map(player => [player.id, player])).values());
      for (let a = 0; a < benchPool.length - 2; a++) for (let b = a + 1; b < benchPool.length - 1; b++) for (let c = b + 1; c < benchPool.length; c++) {
        const bench = [benchPool[a], benchPool[b], benchPool[c]];
        const totalCost = starterCost + bench.reduce((sum, player) => sum + player.cost, 0);
        if (totalCost > data.budget || totalCost < data.budget - 5) continue;
        const value = [...starters, ...bench].reduce((sum, player) => sum + player.score, 0) + totalCost / 100;
        if (value > bestValue) { best = [...starters, ...bench]; bestValue = value; }
      }
    }
    if (best) {
      setIds(best.map(player => player.id));
      trackEvent("daily_smart_build_used", { budget_used: best.reduce((sum, player) => sum + player.cost, 0) });
    } else setError("Unable to create a legal rotation automatically.");
  }
  async function play() {
    if (!data || !legal || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/daily-beat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: data.day, ids, tactic }) });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      setData(body); trackEvent("daily_attempt_completed", { attempt: body.attempts.length, won: body.attempts.at(-1)?.won ? "yes" : "no", budget_used: spent, margin: body.attempts.at(-1)?.margin });
    } catch (event) { setError((event as Error).message); } finally { setBusy(false); }
  }

  async function shareResult() {
    if (!data?.attempts.length) return;
    const best = [...data.attempts].sort((a, b) => b.margin - a.margin)[0];
    const url = `${window.location.origin}/full-court/daily`;
    const resultLine = best.won ? `Won by ${best.margin}` : best.margin === 0 ? "Draw" : `Lost by ${Math.abs(best.margin)}`;
    const text = `FIVEOUT Beat This Team · ${data.day}\n${best.score_for}–${best.score_against} · ${resultLine}\n${best.spent}/${data.budget} budget · 🔥 ${data.streak} day streak\n${url}`;
    trackEvent("daily_share_clicked", { won: best.won ? "yes" : "no", margin: best.margin, streak: data.streak });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      const background = context.createLinearGradient(0, 0, 1200, 630);
      background.addColorStop(0, "#050915");
      background.addColorStop(0.58, "#0a1020");
      background.addColorStop(1, "#21184d");
      context.fillStyle = background;
      context.fillRect(0, 0, 1200, 630);
      context.strokeStyle = "rgba(103,232,249,.35)";
      context.lineWidth = 2;
      context.strokeRect(42, 42, 1116, 546);
      context.fillStyle = "#67e8f9";
      context.font = "800 28px Arial";
      context.fillText("FIVEOUT · BEAT THIS TEAM", 88, 112);
      context.fillStyle = "#94a3b8";
      context.font = "600 24px Arial";
      context.fillText(data.day, 88, 155);
      context.fillStyle = "#f8fafc";
      context.font = "900 112px Arial";
      context.fillText(`${best.score_for} : ${best.score_against}`, 88, 310);
      context.fillStyle = best.won ? "#6ee7b7" : "#c4b5fd";
      context.font = "800 42px Arial";
      context.fillText(resultLine.toUpperCase(), 92, 382);
      context.fillStyle = "#f8fafc";
      context.font = "800 34px Arial";
      context.fillText(`🔥 ${data.streak} DAY STREAK`, 92, 463);
      context.fillStyle = "#94a3b8";
      context.font = "600 25px Arial";
      context.fillText(`${best.spent}/${data.budget} BUDGET  ·  fiveout.vercel.app/full-court/daily`, 92, 530);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      const file = blob ? new File([blob], `fiveout-daily-${data.day}.png`, { type: "image/png" }) : null;
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "FIVEOUT Daily Challenge" });
        setShareStatus("Shared!");
      } else {
        await navigator.clipboard.writeText(text);
        if (blob) {
          const download = document.createElement("a");
          download.href = URL.createObjectURL(blob);
          download.download = file!.name;
          download.click();
          setTimeout(() => URL.revokeObjectURL(download.href), 1000);
        }
        setShareStatus("Result copied and share card saved.");
      }
      trackEvent("daily_share_completed", { method: file && navigator.canShare?.({ files: [file] }) ? "native" : "copy_download" });
    } catch (event) {
      if ((event as Error).name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("Result copied.");
        trackEvent("daily_share_completed", { method: "copy" });
      } catch {
        setShareStatus("Could not share this result.");
      }
    }
  }

  if (busy && !data) return <div className="rounded-3xl border border-white/10 bg-white/[.025] p-10 text-center"><p className="text-cyan-300">Preparing today’s challenge…</p></div>;
  if (!data) return <div className="rounded-3xl border border-red-400/20 p-6"><p role="alert" className="text-red-200">{error || "Unable to load today’s challenge."}</p><button onClick={() => location.reload()} className="mt-4 rounded-xl border px-4 py-2">Try again</button></div>;
  const best = data.attempts.length ? [...data.attempts].sort((a,b) => b.margin-a.margin)[0] : null;
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[1.75rem] border border-violet-400/25 bg-[radial-gradient(circle_at_90%_0%,rgba(139,92,246,.18),transparent_36%),#0a1020]">
      <div className="border-b border-white/10 p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.25em] text-violet-300">Daily challenge · {data.day}</p><h1 className="mt-2 text-4xl font-black">Beat this team.</h1><p className="mt-3 max-w-2xl text-slate-400">Build eight players within {data.budget} points. Your first five must cover 2G · 2F · 1C, and every reserve plays at least {data.minBenchMinutes} minutes. You get the same three daily simulations as everyone else.</p></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.maxAttempts-data.attempts.length}</b>tries left</div><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.streak}</b>day streak</div><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.community.beatRate == null ? "—" : `${data.community.beatRate}%`}</b>beat it</div></div></div></div>
      <div className="p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Today’s opponent</p><div className="flex gap-2 text-xs font-black"><span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-violet-200">{data.difficulty}</span><span className="rounded-full border border-white/10 px-3 py-1 text-slate-300">{data.opponentCost} pts</span></div></div><div className="mt-3 grid gap-2 sm:grid-cols-4">{data.opponent.map((player, index) => <div key={player.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-3"><PlayerImage playerId={player.id} alt={player.name} className="h-11 w-11 object-contain"/><div><p className="text-sm font-bold">{player.name}</p><p className="text-xs text-slate-500">{index < 5 ? "Starter" : "Bench"} · {player.position}</p></div></div>)}</div></div>
    </section>
    {!!data.attempts.length && <section className="grid gap-3 sm:grid-cols-3">{data.attempts.map(attempt => <div key={attempt.attempt_number} className={`rounded-2xl border p-4 ${attempt.won ? "border-emerald-400/30 bg-emerald-400/[.06]" : "border-white/10 bg-white/[.025]"}`}><p className="text-xs uppercase text-slate-500">Attempt {attempt.attempt_number}</p><p className="mt-1 text-2xl font-black">{attempt.score_for}–{attempt.score_against}</p><p className={attempt.won ? "text-emerald-300" : "text-slate-400"}>{attempt.margin >= 10 ? "Dominated" : attempt.won ? "Beat them" : attempt.margin >= -10 ? "Survived" : "Defeated"}</p><p className="mt-2 text-xs text-slate-500">{attempt.spent}/{data.budget} used · {data.budget-attempt.spent} saved</p></div>)}</section>}
    <section className="grid gap-4 lg:grid-cols-2">
      <Leaderboard title="Daily Leaderboard" subtitle="Each coach’s best run today" rows={data.leaderboards.daily} format={row => <><b>{row.value > 0 ? `+${row.value}` : row.value}</b><span className="text-xs text-slate-500">{row.score} · {row.spent}/{data.budget}</span></>} />
      <Leaderboard title="Longest active streaks" subtitle="Consecutive daily appearances" rows={data.leaderboards.streaks} format={row => <b>{row.value} {row.value === 1 ? "day" : "days"}</b>} />
    </section>
    {!!data.attempts.length && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-400/20 bg-violet-400/[.055] p-5">
      <div><p className="font-black">Share your best run</p><p className="mt-1 text-sm text-slate-400">Creates a FIVEOUT result card and includes the Daily Challenge link.</p></div>
      <div className="flex flex-wrap items-center gap-3"><button onClick={() => void shareResult()} className="rounded-xl bg-violet-400 px-5 py-3 font-black text-[#080811] hover:bg-violet-300">Share result</button>{shareStatus && <span role="status" className="text-sm text-emerald-300">{shareStatus}</span>}</div>
    </section>}
    {data.attempts.length < data.maxAttempts && <><section className="rounded-2xl border border-white/10 bg-[#0a1020] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-300">Your rotation · {ids.length}/8</p><p className={`mt-1 text-xl font-black ${spent > data.budget ? "text-red-300" : ""}`}>{spent}/{data.budget} points</p></div><div className="flex gap-2"><button onClick={smartBuild} className="rounded-xl border border-cyan-300/25 px-4 py-2 text-sm font-bold text-cyan-200">Smart build</button><select value={tactic} onChange={event => setTactic(event.target.value as Tactic)} className="rounded-xl border border-white/15 bg-[#060914] px-3 py-2 text-sm">{tactics.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {!!selected.length && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selected.map((player,index) => <div key={player.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-2"><div><p className="text-sm font-bold">{index+1}. {player.name}</p><p className="text-xs text-slate-500">{index<5?"Starter":"Bench"} · {player.position} · {player.cost} pts</p></div><button onClick={() => toggle(player.id)} className="text-xs text-red-300">Remove</button></div><div className="mt-2 flex gap-2"><button aria-label={`Move ${player.name} up`} onClick={() => move(index,-1)} disabled={index===0} className="text-xs disabled:opacity-20">←</button><button aria-label={`Move ${player.name} down`} onClick={() => move(index,1)} disabled={index===ids.length-1} className="text-xs disabled:opacity-20">→</button></div></div>)}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={!legal||busy} onClick={() => void play()} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-[#06101a] disabled:opacity-40">{busy?"Simulating…":`Play attempt ${data.attempts.length+1}`}</button><span className={`text-sm ${legal?"text-emerald-300":"text-amber-300"}`}>{legal?"Rotation ready":ids.length!==8?"Choose exactly eight players":spent>data.budget?"Over budget":"First five need 2G · 2F · 1C"}</span></div>{error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</section>
      <section className="rounded-2xl border border-white/10 bg-[#0a1020] p-5"><div className="flex flex-wrap gap-3"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players…" className="min-w-64 flex-1 rounded-xl border border-white/15 bg-[#060914] p-3"/><select value={position} onChange={event=>setPosition(event.target.value)} className="rounded-xl border border-white/15 bg-[#060914] px-3"><option value="all">All positions</option><option value="G">Guards</option><option value="F">Forwards</option><option value="C">Centers</option></select></div><div className="mt-4 grid max-h-[650px] gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-4">{visible.map(player=><button key={player.id} disabled={!ids.includes(player.id)&&ids.length>=8} onClick={()=>toggle(player.id)} className={`flex gap-3 rounded-xl border p-3 text-left disabled:opacity-35 ${ids.includes(player.id)?"border-cyan-300 bg-cyan-300/10":"border-white/10 bg-white/[.025]"}`}><PlayerImage playerId={player.id} alt={player.name} className="h-12 w-12 object-contain"/><span><b className="block text-sm">{player.name}</b><span className="text-xs text-slate-500">{player.position} · {player.cost} pts</span><span className="mt-1 block text-xs text-slate-400">{player.pts} PTS · {player.reb} REB · {player.ast} AST</span></span></button>)}</div></section></>}
    {data.result && <MatchSimulation key={`daily-${data.attempts.length}`} a={data.result.profiles[0].map((player:any)=>player.id)} b={data.result.profiles[1].map((player:any)=>player.id)} teams={data.result.profiles} challengeResult={data.result} era="current" standalone experience="quick" />}
    {data.attempts.length >= data.maxAttempts && <section className="rounded-2xl border border-white/10 p-6 text-center"><h2 className="text-2xl font-black">Daily complete.</h2><p className="mt-2 text-slate-400">Best result: {best?.score_for}–{best?.score_against}. Come back after 00:00 UTC for a new opponent.</p>{!data.signedIn&&<Link href="/full-court/account" className="mt-4 inline-block text-cyan-300 underline">Sign in to keep your streak across devices</Link>}</section>}
  </div>;
}
