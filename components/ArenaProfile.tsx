"use client";
import { useEffect, useState } from "react";

type Profile = { slug: string; displayName: string; isPublic: boolean; own: boolean; stats: { wins: number; losses: number; seriesPlayed: number; games: number; pointsFor: number; pointsAgainst: number; winRate: number } };
const button = "rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-foreground/10 disabled:opacity-40";
export default function ArenaProfile({ slug }: { slug?: string }) {
  const [profile, setProfile] = useState<Profile | null>(null), [name, setName] = useState(""), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  useEffect(() => { fetch(`/api/arena-profile${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`, { cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error); setProfile(data); setName(data.displayName); }).catch(e => setError(e.message)); }, [slug]);
  async function save() { setError(""); setSaved(false); const response = await fetch("/api/arena-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, isPublic: profile?.isPublic }) }); const data = await response.json(); if (!response.ok) return setError(data.error); setProfile(p => p ? { ...p, ...data } : p); setSaved(true); }
  if (error) return <main className="mx-auto max-w-4xl py-10"><p role="alert">{error}</p></main>;
  if (!profile) return <main className="mx-auto max-w-4xl py-10"><p>Loading arena profile…</p></main>;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/arena/${profile.slug}`;
  return <main className="mx-auto max-w-4xl py-10 space-y-6">
    <section className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-card to-card p-8">
      <p className="text-xs font-bold uppercase tracking-[.25em] text-orange-500">QNBA Arena profile</p><h1 className="mt-2 text-4xl font-black">{profile.displayName}</h1><p className="mt-2 text-foreground/60">Competitive BO series record</p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Series", profile.stats.seriesPlayed], ["Record", `${profile.stats.wins}–${profile.stats.losses}`], ["Win rate", `${profile.stats.winRate}%`], ["Games", profile.stats.games]].map(([label, value]) => <div key={label} className="rounded-2xl border bg-background/60 p-4"><p className="text-xs uppercase text-foreground/50">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div>
      <p className="mt-5 text-sm text-foreground/60">Total points: {profile.stats.pointsFor} for · {profile.stats.pointsAgainst} against</p>
    </section>
    {profile.own && <section className="rounded-2xl border p-5 space-y-4"><h2 className="text-xl font-bold">Profile settings</h2><label className="block text-sm font-semibold">Coach name<input className="mt-2 block w-full rounded-xl border bg-background p-3" value={name} onChange={e => setName(e.target.value)} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={profile.isPublic} onChange={e => setProfile({ ...profile, isPublic: e.target.checked })} /> Public profile</label><div className="flex flex-wrap gap-3"><button className={button} onClick={() => void save()}>Save profile</button><button className={button} disabled={!profile.isPublic} onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy public link</button></div>{saved && <p className="text-sm text-emerald-500">Profile saved.</p>}</section>}
  </main>;
}

