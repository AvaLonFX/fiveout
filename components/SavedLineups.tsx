"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Lineup = { id: string; name: string; era: "current" | "alltime"; playerIds: number[]; createdAt: string };
const button = "rounded-xl border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/5";

export default function SavedLineups() {
  const [lineups, setLineups] = useState<Lineup[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/lineups", { cache: "no-store" }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); setLineups(d.lineups); }).catch(e => setError(e.message)); }, []);
  async function remove(id: string) {
    const response = await fetch(`/api/lineups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setLineups(items => items.filter(item => item.id !== id));
    else setError("Unable to remove this lineup.");
  }
  return <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-violet-300">Saved rotations</p><h2 className="mt-1 text-2xl font-black">Your lineups</h2></div><Link href="/full-court/play" className={button}>Build a lineup</Link></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {!error && !lineups.length && <p className="mt-4 text-sm text-slate-400">Save a rotation after a simulation and it will appear here.</p>}
    {!!lineups.length && <div className="mt-5 grid gap-3 sm:grid-cols-2">{lineups.map(lineup => <article key={lineup.id} className="rounded-xl border border-white/10 bg-[#060914] p-4"><div className="flex justify-between gap-3"><div><h3 className="font-bold">{lineup.name}</h3><p className="mt-1 text-xs text-slate-500">{lineup.era === "alltime" ? "All-Time" : "Current"} · {lineup.playerIds.length} players</p></div><button onClick={() => void remove(lineup.id)} className="text-xs text-slate-500 hover:text-red-300">Remove</button></div><Link href={`/full-court/play?${lineup.era === "alltime" ? "era=alltime&" : ""}a=${lineup.playerIds.join(",")}`} className="mt-4 inline-block text-sm font-bold text-cyan-300">Load as Lineup A →</Link></article>)}</div>}
  </section>;
}
