"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PlayerImage from "@/components/PlayerImage";
import MatchSimulation from "@/components/MatchSimulation";
import { assignLineup, pickLegalFive, roles } from "@/lib/lineup-roles";
import { trackEvent } from "@/lib/gtag";
import type { Tactic } from "@/lib/match-simulation";

type Player = { id: number; name: string; team: string; position: string; pts: number; reb: number; ast: number; cost: number; score: number; games: number };
type Attempt = { attempt_number: number; score_for: number; score_against: number; won: boolean; margin: number };
type State = { day: string; budget: number; maxAttempts: number; attempts: Attempt[]; streak: number; signedIn: boolean; community: { participants: number; beatRate: number | null }; opponent: Array<{ id: number; name: string; position: string }>; players: Player[]; result?: any };
const tactics: Array<[Tactic, string]> = [["balanced", "Balanced"], ["perimeter", "More threes"], ["inside", "Play through the center"], ["fast", "Push the pace"], ["pressure", "Defensive pressure"]];

export default function DailyBeatChallenge() {
  const [data, setData] = useState<State | null>(null), [ids, setIds] = useState<number[]>([]), [tactic, setTactic] = useState<Tactic>("balanced"), [query, setQuery] = useState(""), [position, setPosition] = useState("all"), [busy, setBusy] = useState(true), [error, setError] = useState("");
  useEffect(() => { fetch("/api/daily-beat", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error); setData(body); trackEvent("daily_challenge_viewed"); }).catch(event => setError(event.message)).finally(() => setBusy(false)); }, []);
  const selected = useMemo(() => ids.map(id => data?.players.find(player => player.id === id)).filter(Boolean) as Player[], [data, ids]);
  const spent = selected.reduce((sum, player) => sum + player.cost, 0);
  const legal = ids.length === 8 && spent <= (data?.budget || 0) && !!assignLineup(selected.slice(0, 5));
  const visible = (data?.players || []).filter(player => position === "all" || roles(player.position).includes(position as "G" | "F" | "C")).filter(player => `${player.name} ${player.team}`.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: number) {
    if (ids.includes(id)) setIds(current => current.filter(value => value !== id));
    else if (ids.length < 8) setIds(current => [...current, id]);
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= ids.length) return;
    setIds(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function smartBuild() {
    if (!data) return;
    for (let ceiling = 24; ceiling >= 8; ceiling--) {
      const candidates = data.players.filter(player => player.cost <= ceiling).sort((a, b) => b.score - a.score);
      const starters = pickLegalFive(candidates);
      if (starters.length !== 5) continue;
      const starterIds = starters.map(player => player.id), starterCost = starters.reduce((sum, player) => sum + player.cost, 0);
      const bench = candidates.filter(player => !starterIds.includes(player.id)).sort((a, b) => (b.score / b.cost) - (a.score / a.cost)).filter((player, index, list) => starterCost + player.cost + [...list].filter(other => other.id !== player.id).sort((a,b) => a.cost-b.cost).slice(0, 2).reduce((sum, other) => sum + other.cost, 0) <= data.budget).slice(0, 3);
      if (bench.length === 3 && starterCost + bench.reduce((sum, player) => sum + player.cost, 0) <= data.budget) { setIds([...starterIds, ...bench.map(player => player.id)]); trackEvent("daily_smart_build_used"); return; }
    }
    setError("Unable to create a legal rotation automatically.");
  }
  async function play() {
    if (!data || !legal || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/daily-beat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: data.day, ids, tactic }) });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      setData(body); trackEvent("daily_attempt_completed", { attempt: body.attempts.length, won: body.attempts.at(-1)?.won ? "yes" : "no" });
    } catch (event) { setError((event as Error).message); } finally { setBusy(false); }
  }

  if (busy && !data) return <div className="rounded-3xl border border-white/10 bg-white/[.025] p-10 text-center"><p className="text-cyan-300">Preparing today’s challenge…</p></div>;
  if (!data) return <div className="rounded-3xl border border-red-400/20 p-6"><p role="alert" className="text-red-200">{error || "Unable to load today’s challenge."}</p><button onClick={() => location.reload()} className="mt-4 rounded-xl border px-4 py-2">Try again</button></div>;
  const best = data.attempts.length ? [...data.attempts].sort((a,b) => b.margin-a.margin)[0] : null;
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[1.75rem] border border-violet-400/25 bg-[radial-gradient(circle_at_90%_0%,rgba(139,92,246,.18),transparent_36%),#0a1020]">
      <div className="border-b border-white/10 p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.25em] text-violet-300">Daily challenge · {data.day}</p><h1 className="mt-2 text-4xl font-black">Beat this team.</h1><p className="mt-3 max-w-2xl text-slate-400">Build eight players within {data.budget} points. Your first five must cover 2G · 2F · 1C. You get the same three daily simulations as everyone else.</p></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.maxAttempts-data.attempts.length}</b>tries left</div><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.streak}</b>day streak</div><div className="rounded-xl border border-white/10 p-3"><b className="block text-xl text-white">{data.community.beatRate == null ? "—" : `${data.community.beatRate}%`}</b>beat it</div></div></div></div>
      <div className="p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Today’s opponent</p><div className="mt-3 grid gap-2 sm:grid-cols-4">{data.opponent.map((player, index) => <div key={player.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-3"><PlayerImage playerId={player.id} alt={player.name} className="h-11 w-11 object-contain"/><div><p className="text-sm font-bold">{player.name}</p><p className="text-xs text-slate-500">{index < 5 ? "Starter" : "Bench"} · {player.position}</p></div></div>)}</div></div>
    </section>
    {!!data.attempts.length && <section className="grid gap-3 sm:grid-cols-3">{data.attempts.map(attempt => <div key={attempt.attempt_number} className={`rounded-2xl border p-4 ${attempt.won ? "border-emerald-400/30 bg-emerald-400/[.06]" : "border-white/10 bg-white/[.025]"}`}><p className="text-xs uppercase text-slate-500">Attempt {attempt.attempt_number}</p><p className="mt-1 text-2xl font-black">{attempt.score_for}–{attempt.score_against}</p><p className={attempt.won ? "text-emerald-300" : "text-slate-400"}>{attempt.margin >= 10 ? "Dominated" : attempt.won ? "Beat them" : attempt.margin >= -10 ? "Survived" : "Defeated"}</p></div>)}</section>}
    {data.attempts.length < data.maxAttempts && <><section className="rounded-2xl border border-white/10 bg-[#0a1020] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-300">Your rotation · {ids.length}/8</p><p className={`mt-1 text-xl font-black ${spent > data.budget ? "text-red-300" : ""}`}>{spent}/{data.budget} points</p></div><div className="flex gap-2"><button onClick={smartBuild} className="rounded-xl border border-cyan-300/25 px-4 py-2 text-sm font-bold text-cyan-200">Smart build</button><select value={tactic} onChange={event => setTactic(event.target.value as Tactic)} className="rounded-xl border border-white/15 bg-[#060914] px-3 py-2 text-sm">{tactics.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {!!selected.length && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selected.map((player,index) => <div key={player.id} className="rounded-xl border border-white/10 p-3"><div className="flex justify-between gap-2"><div><p className="text-sm font-bold">{index+1}. {player.name}</p><p className="text-xs text-slate-500">{index<5?"Starter":"Bench"} · {player.position} · {player.cost} pts</p></div><button onClick={() => toggle(player.id)} className="text-xs text-red-300">Remove</button></div><div className="mt-2 flex gap-2"><button aria-label={`Move ${player.name} up`} onClick={() => move(index,-1)} disabled={index===0} className="text-xs disabled:opacity-20">←</button><button aria-label={`Move ${player.name} down`} onClick={() => move(index,1)} disabled={index===ids.length-1} className="text-xs disabled:opacity-20">→</button></div></div>)}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={!legal||busy} onClick={() => void play()} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-[#06101a] disabled:opacity-40">{busy?"Simulating…":`Play attempt ${data.attempts.length+1}`}</button><span className={`text-sm ${legal?"text-emerald-300":"text-amber-300"}`}>{legal?"Rotation ready":ids.length!==8?"Choose exactly eight players":spent>data.budget?"Over budget":"First five need 2G · 2F · 1C"}</span></div>{error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</section>
      <section className="rounded-2xl border border-white/10 bg-[#0a1020] p-5"><div className="flex flex-wrap gap-3"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search players…" className="min-w-64 flex-1 rounded-xl border border-white/15 bg-[#060914] p-3"/><select value={position} onChange={event=>setPosition(event.target.value)} className="rounded-xl border border-white/15 bg-[#060914] px-3"><option value="all">All positions</option><option value="G">Guards</option><option value="F">Forwards</option><option value="C">Centers</option></select></div><div className="mt-4 grid max-h-[650px] gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-4">{visible.map(player=><button key={player.id} disabled={!ids.includes(player.id)&&ids.length>=8} onClick={()=>toggle(player.id)} className={`flex gap-3 rounded-xl border p-3 text-left disabled:opacity-35 ${ids.includes(player.id)?"border-cyan-300 bg-cyan-300/10":"border-white/10 bg-white/[.025]"}`}><PlayerImage playerId={player.id} alt={player.name} className="h-12 w-12 object-contain"/><span><b className="block text-sm">{player.name}</b><span className="text-xs text-slate-500">{player.position} · {player.cost} pts</span><span className="mt-1 block text-xs text-slate-400">{player.pts} PTS · {player.reb} REB · {player.ast} AST</span></span></button>)}</div></section></>}
    {data.result && <MatchSimulation key={`daily-${data.attempts.length}`} a={data.result.profiles[0].map((player:any)=>player.id)} b={data.result.profiles[1].map((player:any)=>player.id)} teams={data.result.profiles} challengeResult={data.result} era="current" standalone experience="quick" />}
    {data.attempts.length >= data.maxAttempts && <section className="rounded-2xl border border-white/10 p-6 text-center"><h2 className="text-2xl font-black">Daily complete.</h2><p className="mt-2 text-slate-400">Best result: {best?.score_for}–{best?.score_against}. Come back after 00:00 UTC for a new opponent.</p>{!data.signedIn&&<Link href="/full-court/account" className="mt-4 inline-block text-cyan-300 underline">Sign in to keep your streak across devices</Link>}</section>}
  </div>;
}
