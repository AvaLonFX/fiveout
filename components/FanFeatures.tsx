"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowRight, Check, Copy, GripVertical, HelpCircle, Play, Sparkles, Swords, Users, X } from "lucide-react";
import Link from "next/link";
import { canCompleteLineup, pickLegalFive, roles } from "@/lib/lineup-roles";
import MatchSimulation from "@/components/MatchSimulation";
import PlayerImage from "@/components/PlayerImage";
import FiveOutBall from "@/components/FiveOutBall";
import SearchPlayers from "@/components/nba_comp/SearchPlayers";
import { FanPlayer, total } from "@/lib/fan-rules";
const links = [
  ["matchups", "Match simulator"],
  ["daily-five", "Daily Five"],
  ["watchlist", "Watchlist"],
  ["history", "Challenge history"],
  ["matches", "Match history"],
  ["profile", "Arena profile"],
];
const panel = "rounded-2xl border bg-card p-5";
const button =
  "rounded-lg border px-3 py-2 hover:bg-foreground/10 disabled:opacity-40";

function ChallengeSetupWizard({ era, format, mode, onEra, onFormat, onMode, onContinue }: {
  era: "current" | "alltime";
  format: number;
  mode: "classic" | "draft";
  onEra: (era: "current" | "alltime") => void;
  onFormat: (format: number) => void;
  onMode: (mode: "classic" | "draft") => void;
  onContinue: () => void;
}) {
  const choice = "rounded-2xl border p-5 text-left transition hover:border-white/30";
  return <section className="overflow-hidden rounded-[1.75rem] border border-violet-400/25 bg-[radial-gradient(circle_at_90%_0%,rgba(139,92,246,.17),transparent_35%),#0a1020]">
    <div className="border-b border-white/10 p-6 sm:p-7"><p className="text-xs font-black uppercase tracking-[.25em] text-violet-300">Friend challenge setup</p><h2 className="mt-2 text-3xl font-black">Choose how you want to play.</h2><p className="mt-2 text-sm text-slate-400">These rules lock when you create the invite.</p></div>
    <div className="grid gap-7 p-6 sm:p-7">
      <div><p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">1 · Player era</p><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => onEra("current")} className={`${choice} ${era === "current" ? "border-cyan-300 bg-cyan-300/10 ring-1 ring-cyan-300/30" : "border-white/10"}`}><b className="text-lg">Current</b><span className="mt-1 block text-sm text-slate-400">Active players with the latest verified season stats.</span></button><button onClick={() => onEra("alltime")} className={`${choice} ${era === "alltime" ? "border-violet-400 bg-violet-400/10 ring-1 ring-violet-400/30" : "border-white/10"}`}><b className="text-lg">All-Time</b><span className="mt-1 block text-sm text-slate-400">Every historical player available in the database.</span></button></div></div>
      <div><p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">2 · Roster format</p><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => onMode("classic")} className={`${choice} ${mode === "classic" ? "border-cyan-300 bg-cyan-300/10" : "border-white/10"}`}><b className="text-lg">Classic challenge</b><span className="mt-1 block text-sm text-slate-400">Build your team. Your friend builds theirs from the invite.</span></button><button onClick={() => onMode("draft")} className={`${choice} ${mode === "draft" ? "border-violet-400 bg-violet-400/10" : "border-white/10"}`}><b className="text-lg">Live Draft</b><span className="mt-1 block text-sm text-slate-400">Both start at zero and alternate picks from one pool.</span></button></div></div>
      <div><p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">3 · Series length</p><div className="flex flex-wrap gap-2">{[1,3,5,7].map((value) => <button key={value} onClick={() => onFormat(value)} className={`rounded-xl border px-5 py-3 text-sm font-black ${format === value ? "border-violet-300 bg-violet-400 text-[#080811]" : "border-white/10 hover:bg-white/5"}`}>BO{value}</button>)}</div></div>
      <button className="rounded-xl bg-violet-400 px-5 py-3 font-black text-[#080811] hover:bg-violet-300" onClick={onContinue}>Continue with {mode === "draft" ? "Live Draft" : "Classic"}</button>
    </div>
  </section>;
}
export default function FanFeatures({ kind, standalone = false }: { kind: string; standalone?: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState("");
  const [a, setA] = useState<number[]>([]),
    [b, setB] = useState<number[]>([]),
    [side, setSide] = useState<"a" | "b">("a"),
    [query, setQuery] = useState(""),
    [matchEra, setMatchEra] = useState<"current" | "alltime">("current");
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const lock = useRef(false);
  const [sharedLink, setSharedLink] = useState("");
  const [matchChallenge, setMatchChallenge] = useState<any>(null);
  const [matchActive, setMatchActive] = useState(false);
  const [positionFilter, setPositionFilter] = useState("all");
  const [standaloneMode, setStandaloneMode] = useState<"quick" | "challenge" | null>(null);
  const [challengeChoice, setChallengeChoice] = useState<"classic" | "draft">("classic");
  const [challengeRule, setChallengeRule] = useState<"classic" | "draft" | null>(null);
  const [challengeFormat, setChallengeFormat] = useState(1);
  const [eraLoading, setEraLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [draggedPlayer, setDraggedPlayer] = useState<{ lineup: "a" | "b"; index: number } | null>(null);
  const eraChangedAt = useRef(0);
  useEffect(() => {
    if (!standalone || kind !== "matchups") return;
    if (!window.localStorage.getItem("fiveout-guide-seen")) setShowGuide(true);
  }, [standalone, kind]);
  const endpoint = "/api/fan/" + (kind === "matchups" ? `roster?era=${matchEra}` : kind);
  async function load(payload?: any) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: payload ? "POST" : "GET",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Unable to load.");
      setData(d);
      if (d.result) setA(d.result.player_ids);
      return d;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (kind === "matchups" && eraChangedAt.current) {
        const remaining = 650 - (Date.now() - eraChangedAt.current);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
        eraChangedAt.current = 0;
        setEraLoading(false);
      }
      lock.current = false;
      setBusy(false);
    }
  }
  function changeEra(next: "current" | "alltime") {
    if (next === matchEra || eraLoading) return;
    eraChangedAt.current = Date.now();
    setEraLoading(true);
    setData(null);
    setMatchEra(next);
    setA([]);
    setB([]);
    setQuery("");
    setMatchActive(false);
  }
  useEffect(() => {
    void load().then(async (d) => {
      if (kind === "matchups" && d) {
        const params = new URLSearchParams(window.location.search);
        const challengeCode = params.get("challenge");
        if (challengeCode) {
          setStandaloneMode("challenge");
          const response = await fetch(
            `/api/match-challenges?code=${encodeURIComponent(challengeCode)}`,
            { cache: "no-store" },
          );
          const challenge = await response.json();
          if (!response.ok) {
            setError(challenge.error || "Unable to load challenge.");
            return;
          }
          setMatchChallenge(challenge);
          setMatchEra(challenge.era === "alltime" ? "alltime" : "current");
          setSide(challenge.role === "creator" ? "a" : "b");
          if (challenge.result) {
            setA(challenge.result.profiles[0].map((p: any) => p.id));
            setB(challenge.result.profiles[1].map((p: any) => p.id));
          } else {
            setA(challenge.creator.ids);
            setB(challenge.opponent?.ids || []);
          }
          return;
        }
        const read = (key: string) =>
          Array.from(new Set((params.get(key) || "").split(",").map(Number)))
            .filter((id) => d.players.some((p: FanPlayer) => p.id === id))
            .slice(0, kind === "matchups" ? 8 : 5);
        setA(read("a"));
        setB(read("b"));
      }
    });
  }, [kind, matchEra]);
  const pool: FanPlayer[] = data?.pool || data?.players || [];
  const showMatchupBuilder =
    kind !== "matchups" ||
    (!matchActive && (!matchChallenge || ["open", "drafting"].includes(matchChallenge.status))) &&
    !(standalone && standaloneMode === "challenge" && !matchChallenge && (!challengeRule || challengeRule === "draft")) &&
    !(matchChallenge?.mode === "draft" && matchChallenge.status === "open");
  const liveDraft = kind === "matchups" && matchChallenge?.mode === "draft" && matchChallenge.status === "drafting";
  const classicOpponentBuilding = kind === "matchups" && matchChallenge?.mode !== "draft" && matchChallenge?.status === "open" && matchChallenge?.role === "opponent";
  const canConfigureBuilder = !matchChallenge || classicOpponentBuilding;
  const showPlayerPool = showMatchupBuilder && (canConfigureBuilder || liveDraft);
  const myDraftSide = matchChallenge?.role === "creator" ? 0 : matchChallenge?.role === "opponent" ? 1 : -1;
  const draftTimeline = liveDraft ? Array.from({ length: a.length + b.length }, (_, index) => {
    const draftSide = ((matchChallenge.draftFirst || 0) + index) % 2;
    const sideIndex = Math.floor(index / 2);
    const id = (draftSide === 0 ? a : b)[sideIndex];
    return { side: draftSide, player: pool.find((player) => player.id === id) };
  }).filter((pick) => pick.player) : [];
  const selected = (ids: number[]) =>
    ids
      .map((id) => pool.find((p) => p.id === id))
      .filter(Boolean) as FanPlayer[];
  function recommendedLineup(exclude: number[] = []) {
    const ranked = [...pool]
      .filter((player) => player.fga > 3 && !exclude.includes(player.id))
      .sort((x, y) => y.score - x.score);
    const starters = pickLegalFive(ranked);
    const bench = ranked.filter((player) => !starters.some((starter) => starter.id === player.id)).slice(0, 3);
    return [...starters, ...bench].map((player) => player.id);
  }
  function smartFill(target: "a" | "b" | "both") {
    const first = recommendedLineup(target === "b" ? a : []);
    if (target === "a") setA(first);
    if (target === "b") setB(first);
    if (target === "both") {
      setA(first);
      setB(recommendedLineup(first));
    }
    setNote(target === "both" ? "Two balanced rotations are ready. You can still swap any player." : `Lineup ${target.toUpperCase()} is ready. You can still swap any player.`);
  }
  function reorderLineup(lineup: "a" | "b", targetIndex: number) {
    if (!draggedPlayer || draggedPlayer.lineup !== lineup || draggedPlayer.index === targetIndex) return;
    const ids = lineup === "a" ? a : b;
    const next = [...ids];
    const [moved] = next.splice(draggedPlayer.index, 1);
    next.splice(targetIndex, 0, moved);
    (lineup === "a" ? setA : setB)(next);
    setDraggedPlayer(null);
    setNote(`${next.slice(0, 5).map((id) => pool.find((player) => player.id === id)?.name).filter(Boolean).join(", ")} are now the starters.`);
  }
  async function toggle(id: number) {
    setNote("");
    if (liveDraft) {
      if (myDraftSide < 0 || matchChallenge.draftTurn !== myDraftSide) return;
      setBusy(true);
      try {
        const response = await fetch(`/api/match-challenges/${matchChallenge.code}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: id }) });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || "Unable to save this pick.");
        const merged = { ...matchChallenge, ...next };
        setMatchChallenge(merged);
        setA(merged.creator.ids);
        setB(merged.opponent.ids);
      } catch (event) { setNote((event as Error).message); }
      finally { setBusy(false); }
      return;
    }
    const ids = side === "a" || kind === "daily-five" ? a : b;
    const setter = side === "a" || kind === "daily-five" ? setA : setB;
    const otherIds = side === "a" ? b : a;
    if (matchChallenge?.mode === "draft" && otherIds.includes(id)) {
      setNote("That player has already been drafted by the other lineup.");
      return;
    }
    if (ids.includes(id)) setter(ids.filter((x) => x !== id));
    else if (ids.length < (kind === "matchups" ? 8 : 5)) setter([...ids, id]);
    else
      setNote(
        `${kind === "matchups" ? "Eight" : "Five"} players selected. Remove one before adding another.`,
      );
  }
  async function share() {
    const origin = standalone
      ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "")
      : window.location.origin;
    const url = new URL(standalone ? "/full-court/play" : "/matchups", origin);
    url.searchParams.set("a", a.join(","));
    url.searchParams.set("b", b.join(","));
    setSharedLink(url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      setNote(
        "Lineup link copied. It contains only the selected player IDs, not your account.",
      );
    } catch {
      setNote(url.toString());
    }
  }
  const lineup = (ids: number[], label: string) => standalone && kind === "matchups" ? (() => {
    const players = selected(ids);
    const starters = players.slice(0, 5);
    const coverage = { G: 0, F: 0, C: 0 };
    starters.forEach((player) => roles(player.position).forEach((role) => { coverage[role] += 1; }));
    const legal = starters.length === 5 && canCompleteLineup(starters);
    const accent = label === "Lineup A" ? "cyan" : "violet";
    const lineupKey: "a" | "b" = label === "Lineup A" ? "a" : "b";
    const canReorder = !busy && !data?.result && !liveDraft && (!matchChallenge || (label === "Lineup B" && matchChallenge.status === "open"));
    return <section className={`overflow-hidden rounded-2xl border bg-[#090f1d]/95 shadow-xl backdrop-blur ${accent === "cyan" ? "border-cyan-300/20" : "border-violet-400/20"}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div><p className={`text-[10px] font-black uppercase tracking-[.22em] ${accent === "cyan" ? "text-cyan-300" : "text-violet-300"}`}>{label === "Lineup A" ? "Home five" : "Away five"}</p><h2 className="mt-0.5 font-black">{label} <span className="text-slate-500">{ids.length}/8</span></h2></div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${legal ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>{legal && <Check size={11}/>} {legal ? "STARTERS VALID" : `${Math.max(0, 5 - starters.length)} STARTERS LEFT`}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 border-b border-white/10 p-3">
        {(["G", "G", "F", "F", "C"] as const).map((role, index) => <span key={`${role}-${index}`} className={`rounded-md border px-1 py-1 text-center text-[9px] font-black ${coverage[role] > index - (["G","G","F","F","C"].indexOf(role)) ? "border-emerald-400/25 text-emerald-300" : "border-white/10 text-slate-500"}`}>{role}</span>)}
      </div>
      {players.length > 1 && canReorder && <p className="border-b border-white/[.07] px-4 py-2 text-[10px] text-slate-500">Drag players to change starters, bench, or lineup order.</p>}
      <div className="p-2">
        {Array.from({ length: 8 }, (_, index) => {
          const p = players[index];
          if (!p) return <div key={`empty-${index}`} className="flex h-11 items-center gap-3 border-b border-dashed border-white/[.07] px-2 text-xs text-slate-600"><span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-white/10">{index + 1}</span><span>{index < 5 ? "Open starter slot" : "Open bench slot"}</span></div>;
          return <div key={p.id} draggable={canReorder} onDragStart={(event: DragEvent<HTMLDivElement>) => { setDraggedPlayer({ lineup: lineupKey, index }); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event: DragEvent<HTMLDivElement>) => { if (draggedPlayer?.lineup === lineupKey) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); reorderLineup(lineupKey, index); }} onDragEnd={() => setDraggedPlayer(null)} className={`group flex h-11 items-center justify-between border-b border-white/[.07] px-2 last:border-0 ${canReorder ? "cursor-grab active:cursor-grabbing" : ""} ${draggedPlayer?.lineup === lineupKey && draggedPlayer.index === index ? "opacity-40" : ""}`}>
            <div className="flex min-w-0 items-center gap-2.5">{canReorder && <GripVertical size={14} className="shrink-0 text-slate-600 transition group-hover:text-slate-300" aria-hidden="true"/>}<PlayerImage playerId={p.id} alt={p.name} className="h-8 w-8 shrink-0 object-contain"/><div className="min-w-0"><p className="truncate text-xs font-bold">{p.name}</p><p className="text-[10px] text-slate-500">{p.position} · {index < 5 ? "Starter" : "Bench"} · {p.pts} PPG</p></div></div>
            <button aria-label={`Remove ${p.name} from ${label}`} disabled={busy || !!data?.result || liveDraft || (!!matchChallenge && (label === "Lineup A" || matchChallenge.status !== "open"))} onClick={() => label === "Lineup B" ? setB(b.filter((id) => id !== p.id)) : setA(a.filter((id) => id !== p.id))} className="rounded-md px-2 py-1 text-[10px] font-bold text-slate-400 transition hover:bg-red-400/10 hover:text-red-300 disabled:hidden sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">Remove</button>
          </div>;
        })}
      </div>
    </section>;
  })() : (
    <div className={panel}>
      <h2 className="text-lg font-semibold">
        {label} · {ids.length}/{kind === "matchups" ? 8 : 5}
      </h2>
      {selected(ids).map((p, index) => (
        <div
          key={p.id}
          className="flex justify-between items-center border-b py-2"
        >
          <div className="flex items-center gap-2">
            <PlayerImage
              playerId={p.id}
              alt={p.name}
              className="w-12 h-12 object-contain"
            />
            <span>
              {p.name}
              {kind === "matchups" && (
                <span className="ml-2 text-xs text-foreground/50">
                  {p.position}
                  {index >= 5 ? " · Bench" : " · Starter"}
                </span>
              )}
            </span>
          </div>
          <button
            aria-label={`Remove ${p.name} from ${label}`}
            disabled={
              busy ||
              !!data?.result ||
               liveDraft ||
               (!!matchChallenge &&
                (label === "Lineup A" || matchChallenge.status !== "open"))
            }
            onClick={() =>
              label === "Lineup B"
                ? setB(b.filter((id) => id !== p.id))
                : setA(a.filter((id) => id !== p.id))
            }
            className={button}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
  const header = links.find((l) => l[0] === kind)?.[1] || "";
  return (
    <main className={`mx-auto max-w-6xl space-y-6 ${standalone ? "py-5" : "py-8"}`}>
      {showGuide && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#030611]/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="fiveout-guide-title">
          <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[#09101e] p-6 shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:p-9">
            <button aria-label="Close guide" className="absolute right-5 top-5 rounded-full border border-white/10 p-2 text-slate-400 hover:text-white" onClick={() => { window.localStorage.setItem("fiveout-guide-seen", "1"); setShowGuide(false); }}><X size={18}/></button>
            <FiveOutBall className="h-14 w-14" />
            <p className="mt-6 text-xs font-black uppercase tracking-[.26em] text-cyan-300">Welcome to FIVEOUT</p>
            <h2 id="fiveout-guide-title" className="mt-2 text-3xl font-black">Build it. Coach it. Watch it play out.</h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[['1','Pick an era','Use today’s league or build across NBA history.'],['2','Build two rotations','Choose five starters and up to three bench players.'],['3','Run the game','Set minutes and tactics, then watch every possession.']].map(([number,title,copy]) => <div key={number} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><span className="text-xs font-black text-violet-300">0{number}</span><h3 className="mt-2 font-black">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-400">{copy}</p></div>)}
            </div>
            <button className="mt-7 w-full rounded-xl bg-cyan-300 px-5 py-3 font-black text-[#06101a] hover:bg-cyan-200" onClick={() => { window.localStorage.setItem("fiveout-guide-seen", "1"); setShowGuide(false); }}>Enter the lab</button>
          </section>
        </div>
      )}
      {!standalone && <nav className="flex flex-wrap gap-3">
        {links.map(([path, label]) => (
          <Link
            key={path}
            href={"/" + path}
            className={`${button} ${path === kind ? "bg-foreground/10 font-semibold" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>}
      {!standalone && <h1 className="text-3xl font-bold">{header}</h1>}
      {error && (
        <div role="alert" className={`${panel} border-amber-300/25 bg-amber-300/[.045]`}>
          <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">We could not load the court</p>
          <h2 className="mt-2 text-xl font-black">Something interrupted the connection.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => void load()} disabled={busy} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-[#06101a] hover:bg-cyan-200 disabled:opacity-50">
              {busy ? "Trying again…" : "Try again"}
            </button>
            {kind === "watchlist" && (
              <Link href="/sign-in" className={button}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
      {(eraLoading || (busy && !data)) && standalone && <div className="fiveout-loading" role="status" aria-live="polite">
        <div className="fiveout-loading-court" aria-hidden="true">
          <FiveOutBall className="fiveout-loading-ball" />
          <span className="fiveout-loading-shadow" />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[.28em] text-cyan-300">Switching the floor</p>
        <h2 className="mt-2 text-2xl font-black">Loading {matchEra === "alltime" ? "every era" : "today’s league"}…</h2>
        <p className="mt-2 text-sm text-slate-400">Preparing player profiles and verified stats.</p>
      </div>}
      {busy && !data && !standalone && <p role="status">Loading…</p>}
      {standalone && kind === "matchups" && data && !matchChallenge && !standaloneMode && (
        <section className="grid gap-4 md:grid-cols-2">
          <button onClick={() => setStandaloneMode("quick")} className="group relative min-h-64 overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,.16),transparent_38%),#0a1120] p-7 text-left transition hover:-translate-y-1 hover:border-cyan-300/55">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-300"><Play size={21} fill="currentColor" /></span>
            <span className="mt-8 block text-xs font-black uppercase tracking-[.24em] text-cyan-300">Solo lab</span><h2 className="mt-2 text-3xl font-black">Quick Match</h2><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Build both rotations, test tactics, and replay the matchup with a fresh outcome.</p>
            <span className="absolute bottom-7 right-7 grid h-10 w-10 place-items-center rounded-full border border-white/10 transition group-hover:bg-cyan-300 group-hover:text-[#06101a]"><ArrowRight size={18}/></span>
          </button>
          <button onClick={() => setStandaloneMode("challenge")} className="group relative min-h-64 overflow-hidden rounded-[1.75rem] border border-violet-400/25 bg-[radial-gradient(circle_at_80%_0%,rgba(139,92,246,.18),transparent_38%),#0d1020] p-7 text-left transition hover:-translate-y-1 hover:border-violet-400/55">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/30 bg-violet-400/10 text-violet-300"><Swords size={22} /></span>
            <span className="mt-8 block text-xs font-black uppercase tracking-[.24em] text-violet-300">Head to head</span><h2 className="mt-2 text-3xl font-black">Challenge a Friend</h2><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Open a shared lobby, choose the series, then build separately or alternate picks in a live draft.</p>
            <span className="absolute bottom-7 right-7 grid h-10 w-10 place-items-center rounded-full border border-white/10 transition group-hover:bg-violet-400 group-hover:text-[#06101a]"><Users size={18}/></span>
          </button>
          <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.025] px-5 py-4 text-sm text-slate-400"><span className="flex items-center gap-3"><Copy size={17} className="text-cyan-300"/><span><b className="text-slate-200">Joining someone?</b> Open their invite link and FIVEOUT takes you straight to the shared lobby.</span></span><button className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 hover:text-white" onClick={() => setShowGuide(true)}><HelpCircle size={16}/> How it works</button></div>
        </section>
      )}
      {kind === "matchups" && data && (!standalone || !!standaloneMode || !!matchChallenge) && (
        <>
          {standalone && !matchChallenge && standaloneMode && <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.025] px-4 py-3"><p className="text-sm"><span className="font-black text-cyan-300">{standaloneMode === "quick" ? "QUICK MATCH" : "FRIEND CHALLENGE"}</span><span className="ml-3 text-slate-400">{standaloneMode === "quick" ? "Choose an era, then build your roster." : challengeRule ? `${challengeRule === "draft" ? "Live Draft" : "Classic"} · ${matchEra === "alltime" ? "All-Time" : "Current"} · BO${challengeFormat}` : "Set the room rules before building."}</span></p><button className={button} onClick={() => { setStandaloneMode(null); setChallengeRule(null); setA([]); setB([]); }}>Change mode</button></div>}
          {standalone && standaloneMode === "challenge" && !matchChallenge && !challengeRule && (
            <ChallengeSetupWizard era={matchEra} format={challengeFormat} mode={challengeChoice} onEra={changeEra} onFormat={setChallengeFormat} onMode={setChallengeChoice} onContinue={() => { setChallengeRule(challengeChoice); setA([]); setB([]); setSide("a"); }} />
          )}
          {!matchChallenge && !(standalone && standaloneMode === "challenge") && <div className={`inline-flex rounded-xl border p-1 ${standalone ? "border-white/10 bg-[#080e1b]" : "bg-background/50"}`} role="tablist" aria-label="Player era"><button role="tab" aria-selected={matchEra === "current"} className={`${button} ${matchEra === "current" ? standalone ? "border-cyan-300/30 bg-cyan-300 text-[#06101a]" : "bg-orange-500 text-black" : "border-transparent"}`} onClick={() => changeEra("current")}>Current</button><button role="tab" aria-selected={matchEra === "alltime"} className={`${button} ${matchEra === "alltime" ? standalone ? "border-violet-400/30 bg-violet-400 text-[#080811]" : "bg-orange-500 text-black" : "border-transparent"}`} onClick={() => changeEra("alltime")}>All-time</button></div>}
          {!(standalone && standaloneMode === "challenge" && !challengeRule) && <p className="text-foreground/60">
            {standalone && standaloneMode === "challenge" && !matchChallenge
              ? challengeRule === "draft" ? "Create the lobby now. Both coaches will draft from an empty roster." : "Build your team first. Your friend will build the opponent after opening the invite."
              : matchEra === "current" ? "Build two lineups from the latest verified season." : "Build lineups from stabilized career profiles across NBA history. Role, volume, efficiency, playmaking, and defense all affect the matchup."}
          </p>}
          {standalone && showMatchupBuilder && !liveDraft && standaloneMode === "quick" && (
            <section aria-label="Match setup progress" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Match setup</p><p className="mt-1 text-sm font-bold">{a.length < 5 ? "Build Lineup A’s starting five" : b.length < 5 ? "Build Lineup B’s starting five" : a.length < 8 || b.length < 8 ? "Add bench depth or continue with five" : "Both rotations are ready"}</p></div>
                <p className="text-xs text-slate-400"><b className="text-cyan-300">A {a.length}/8</b><span className="mx-2 text-slate-600">·</span><b className="text-violet-300">B {b.length}/8</b></p>
              </div>
              <div className="h-1 bg-white/5"><div className="h-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-[width] duration-300" style={{ width: `${Math.min(100, ((a.length + b.length) / 16) * 100)}%` }} /></div>
            </section>
          )}
          {liveDraft && <section className="overflow-hidden rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-500/15 via-card to-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-500/20 p-5">
              <div><p className="text-xs font-black uppercase tracking-[.25em] text-violet-400">Live draft room</p><h2 className="mt-1 text-2xl font-black">Pick {a.length + b.length + 1} of 16</h2><p className="mt-1 text-sm text-foreground/60">Lineup {matchChallenge.draftFirst === 0 ? "A" : "B"} won the opening pick. Turns alternate after every selection.</p></div>
              <div className={`rounded-xl border px-5 py-3 text-center ${matchChallenge.draftTurn === myDraftSide ? "border-emerald-500/50 bg-emerald-500/15" : "border-amber-500/40 bg-amber-500/10"}`}><p className="text-xs uppercase tracking-widest text-foreground/60">Current turn</p><p className="font-black">{matchChallenge.draftTurn === 0 ? "LINEUP A" : "LINEUP B"}</p><p className="text-xs">{matchChallenge.draftTurn === myDraftSide ? "Your pick" : "Waiting for the other coach"}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border/50"><div className={`p-4 ${matchChallenge.draftTurn === 0 ? "bg-cyan-300/10" : "bg-card"}`}><p className="font-black text-cyan-300">LINEUP A · {a.length}/8</p><p className="text-xs text-foreground/60">Pick anyone · finish with 2G · 2F · 1C</p></div><div className={`p-4 ${matchChallenge.draftTurn === 1 ? "bg-violet-400/10" : "bg-card"}`}><p className="font-black text-violet-300">LINEUP B · {b.length}/8</p><p className="text-xs text-foreground/60">Pick anyone · finish with 2G · 2F · 1C</p></div></div>
            {draftTimeline.length > 0 && <div className="border-t border-violet-500/20 p-4"><p className="mb-3 text-[10px] font-black uppercase tracking-[.22em] text-foreground/50">Draft trail</p><div className="flex gap-2 overflow-x-auto pb-1">{draftTimeline.map((pick, index) => <span key={`${pick.player!.id}-${index}`} className={`shrink-0 rounded-lg border px-3 py-2 text-xs ${pick.side === 0 ? "border-cyan-300/20 bg-cyan-300/10" : "border-violet-400/20 bg-violet-400/10"}`}><b className={pick.side === 0 ? "text-cyan-300" : "text-violet-300"}>#{index + 1} · {pick.side === 0 ? "A" : "B"}</b><span className="ml-2">{pick.player!.name}</span></span>)}</div></div>}
          </section>}
          {showMatchupBuilder && !liveDraft && canConfigureBuilder && <div className={`flex flex-wrap gap-2 ${standalone ? "rounded-2xl border border-white/10 bg-[#090f1d] p-3" : "gap-3"}`}>
            {standalone && <button className={`${button} border-cyan-300/30 bg-cyan-300 text-[#06101a]`} disabled={!!matchChallenge} onClick={() => smartFill(standaloneMode === "quick" ? "both" : "a")}><Sparkles size={16} className="mr-2 inline"/>Smart fill {standaloneMode === "quick" ? "both" : "Lineup A"}</button>}
            {standaloneMode !== "challenge" && <button
              className={`${button} ${standalone ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : ""}`}
              disabled={!!matchChallenge}
              onClick={() => {
                const ranked = [...pool]
                  .filter((p) => p.fga > 3)
                  .sort((x, y) => y.score - x.score);
                const first = pickLegalFive(ranked);
                const second = pickLegalFive(
                  ranked.filter((p) => !first.some((x) => x.id === p.id)),
                );
                const firstBench = ranked
                  .filter(
                    (p) =>
                      !first.some((x) => x.id === p.id) &&
                      !second.some((x) => x.id === p.id),
                  )
                  .slice(0, 3);
                const secondBench = ranked
                  .filter(
                    (p) =>
                      !first.some((x) => x.id === p.id) &&
                      !second.some((x) => x.id === p.id) &&
                      !firstBench.some((x) => x.id === p.id),
                  )
                  .slice(0, 3);
                setA([...first, ...firstBench].map((p) => p.id));
                setB([...second, ...secondBench].map((p) => p.id));
                setNote(
                  "Demo loaded: each side has five legal starters and three bench players. The first five entries are the starters.",
                );
              }}
            >
              Load demo matchup
            </button>}
            <button
              className={`${button} ${standalone && side === "a" ? "border-cyan-300/40 bg-cyan-300 text-[#06101a]" : ""}`}
              disabled={!!matchChallenge}
              onClick={() => setSide("a")}
            >
              Editing {side === "a" ? "✓ " : ""}Lineup A
            </button>
            {(standaloneMode !== "challenge" || (matchChallenge?.status === "open" && matchChallenge?.role === "opponent" && matchChallenge?.mode !== "draft")) && <button className={`${button} ${standalone && side === "b" ? "border-violet-400/40 bg-violet-400 text-[#080811]" : ""}`} onClick={() => setSide("b")}>
              Editing {side === "b" ? "✓ " : ""}Lineup B
            </button>}
            <button
              className={button}
              disabled={!data.signedIn || !!matchChallenge}
              onClick={() => {
                const eligible = data.dreamIds.filter((id: number) =>
                  pool.some((p) => p.id === id),
                );
                setA(eligible.slice(0, 8));
                setNote(
                  `Imported ${Math.min(8, eligible.length)} players into A, in your saved Dream Team order. The first five must form a legal starting lineup.`,
                );
              }}
            >
              Import Dream Team into A
            </button>
            {standaloneMode !== "challenge" && <button disabled={!a.length} className={button} onClick={share}>
              Copy lineup link
            </button>}
          </div>}
          {showMatchupBuilder && <div className="grid gap-4 md:grid-cols-2">
            {lineup(a, "Lineup A")}
            {(standaloneMode !== "challenge" || !!matchChallenge) && lineup(b, "Lineup B")}
          </div>}
          {showMatchupBuilder && a.length >= 5 && b.length >= 5 && (
            <div className={panel}>
              <h2 className="font-semibold mb-1">Starter comparison</h2>
              <p className="text-xs text-foreground/50 mb-3">
                Raw season averages for the first five entries; the simulation
                applies its own 240-minute rotation.
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Lineup A</th>
                    <th>Lineup B</th>
                    <th>Higher value</th>
                  </tr>
                </thead>
                <tbody>
                  {(["pts", "reb", "ast", "fg"] as const).map((key) => {
                    const x = total(selected(a).slice(0, 5))[key],
                      y = total(selected(b).slice(0, 5))[key];
                    return (
                      <tr key={key} className="border-t">
                        <th className="py-3">
                          {key === "fg" ? "FG%" : key.toUpperCase()}
                        </th>
                        <td>{x === null ? "N/A" : x.toFixed(1)}</td>
                        <td>{y === null ? "N/A" : y.toFixed(1)}</td>
                        <td>
                          {x === null || y === null
                            ? "Unknown"
                            : Math.abs(x - y) < 0.0001
                              ? "Equal"
                              : x > y
                                ? "A"
                                : "B"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-sm text-foreground/60 mt-3">
                This table compares starter season averages, not the simulated
                result. Shared links use the latest stored stats when opened.
              </p>
            </div>
          )}
          {(standaloneMode !== "challenge" || !!challengeRule || !!matchChallenge) &&
            (!standalone ? a.length >= 5 && b.length >= 5 : !!matchChallenge || liveDraft || (standaloneMode === "quick" ? a.length >= 5 && b.length >= 5 : a.length >= 5)) && <MatchSimulation
            key={matchEra + "|" + a.join(",") + "|" + b.join(",")}
            a={a}
            b={b}
            teams={[selected(a), selected(b)]}
            era={matchEra}
            standalone={standalone}
            experience={standaloneMode || (matchChallenge ? "challenge" : undefined)}
            presetChallengeMode={challengeRule || undefined}
            presetBestOf={challengeFormat}
            challengeCode={matchChallenge?.code}
            challengeCreator={matchChallenge?.creator}
            challengeResult={matchChallenge?.result}
            challengeBestOf={matchChallenge?.bestOf}
            challengeSeries={matchChallenge?.series}
            challengeState={matchChallenge}
            onSimulationActiveChange={setMatchActive}
            onChallengeUpdate={(next) => {
              setMatchChallenge(next);
              if (next.creator?.ids) setA(next.creator.ids);
              if (next.opponent?.ids) setB(next.opponent.ids);
            }}
          />}
        </>
      )}
      {kind === "daily-five" && data && (
        <>
          <div className={panel}>
            <p className="font-semibold">
              {data.day} · Budget {data.budget} · Five players · resets 00:00
              UTC
            </p>
            <p className="text-sm text-foreground/60 mt-2">
              Score = PTS + 1.2 × REB + 1.5 × AST, using today’s frozen per-game
              dataset. Each player’s score is rounded to one decimal. Price =
              round(score ÷ 2), with a minimum of 8 and maximum of 28. This is a
              lineup puzzle, not live fantasy scoring. No position restrictions.
            </p>
            <p className="mt-2">
              Choose your best five, then lock your only submission for today.
            </p>
            <p className="text-sm text-foreground/60">
              {data.signedIn
                ? "Your result is saved to your account."
                : "Guest results belong to this browser. Sign in before playing for account-based history; guest results stay separate."}
            </p>
          </div>
          {lineup(a, "Your five")}
          <div className={panel}>
            <p
              className={
                total(selected(a)).cost > data.budget ? "text-red-400" : ""
              }
            >
              Spent: {total(selected(a)).cost}/{data.budget} · Score:{" "}
              {total(selected(a)).score.toFixed(1)}
            </p>
            {!data.result ? (
              <button
                className={button + " mt-3"}
                disabled={
                  busy ||
                  a.length !== 5 ||
                  total(selected(a)).cost > data.budget
                }
                onClick={() => void load({ ids: a, day: data.day })}
              >
                Lock today’s lineup
              </button>
            ) : (
              <div className="mt-3">
                <h2 className="text-xl font-bold">
                  Saved score: {Number(data.result.score).toFixed(1)}
                </h2>
                <p>
                  Best possible today: {data.best.score.toFixed(1)} · Your
                  efficiency:{" "}
                  {(
                    (Number(data.result.score) / data.best.score) *
                    100
                  ).toFixed(1)}
                  %
                </p>
                <p className="text-sm mt-2">
                  One optimal lineup:{" "}
                  {data.best.ids
                    .map((id: number) => pool.find((p) => p.id === id)?.name)
                    .join(", ")}
                </p>
                <Link href="/history" className="underline">
                  View history and achievements
                </Link>
              </div>
            )}
          </div>
        </>
      )}
      {(kind === "matchups" || kind === "daily-five") &&
        data &&
        (!standalone || kind !== "matchups" || !!standaloneMode || !!matchChallenge) &&
        (kind !== "matchups" || showPlayerPool) &&
        !(kind === "daily-five" && data.result) && (
          <section className={`${panel} ${standalone ? "border-white/10 bg-[#0a1020]" : ""}`}>
            <h2 className="font-semibold">
              {kind === "matchups"
                ? liveDraft ? matchChallenge.draftTurn === myDraftSide ? "Your pick · choose any available player" : "Draft board · waiting for the other coach" : `Add players to Lineup ${side.toUpperCase()}`
                : "Today’s player pool"}
            </h2>
            <input
              aria-label="Filter players"
              placeholder="Search by player name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-3 w-full rounded border bg-background p-3"
            />
            {kind === "matchups" && (
              <div className="mb-3 flex flex-wrap gap-4">
              <label className="block text-sm">
                Position{" "}
                <select
                  aria-label="Filter players by position"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="ml-2 rounded border bg-background p-2"
                >
                  <option value="all">All positions</option>
                  <option value="G">Guard</option>
                  <option value="F">Forward</option>
                  <option value="C">Center</option>
                </select>
              </label>
              </div>
            )}
            <div className={`grid sm:grid-cols-2 gap-3 mt-4 max-h-[600px] overflow-auto ${standalone ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
              {pool
                .filter(
                  (p) =>
                    kind !== "matchups" ||
                    positionFilter === "all" ||
                    roles(p.position).some((role) => role === positionFilter),
                )
                .filter((p) =>
                  (p.name + " " + p.team)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .sort((x, y) => y.score - x.score)
                .slice(0, matchEra === "alltime" ? 180 : 1000)
                .map((p) => {
                  const draftedBy = liveDraft ? (a.includes(p.id) ? "A" : b.includes(p.id) ? "B" : null) : null;
                  const ownDraftIds = myDraftSide === 0 ? a : b;
                  const impossibleDraftPick = liveDraft && !draftedBy && !canCompleteLineup([...selected(ownDraftIds), p]);
                  const chosen = (
                    kind === "daily-five" || side === "a" ? a : b
                  ).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      aria-pressed={chosen}
                       disabled={busy || (liveDraft && (matchChallenge.draftTurn !== myDraftSide || !!draftedBy || impossibleDraftPick))}
                       onClick={() => void toggle(p.id)}
                      className={`${standalone ? "rounded-xl border border-white/10 bg-white/[.025] p-3" : panel} relative text-left transition ${chosen ? "ring-2 ring-cyan-400" : ""} ${draftedBy ? "opacity-50" : liveDraft && matchChallenge.draftTurn === myDraftSide ? "hover:-translate-y-0.5 hover:border-violet-400" : "hover:border-cyan-300/35"}`}
                    >
                      {draftedBy && <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-black ${draftedBy === "A" ? "bg-orange-500 text-black" : "bg-sky-500 text-black"}`}>DRAFTED · {draftedBy}</span>}
                      <div className="flex gap-2 items-center">
                        <PlayerImage
                          playerId={p.id}
                          alt={p.name}
                          className="w-14 h-14 object-contain"
                        />
                        <div>
                          <p className="font-semibold">
                            {chosen ? "✓ " : ""}
                            {p.name}
                          </p>
                          <p className="text-xs text-foreground/60">
                            {p.team}
                            {kind === "matchups"
                              ? ` · ${p.position} · ${p.games} GP`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs mt-2">
                        {p.pts} PTS · {p.reb} REB · {p.ast} AST
                      </p>
                      {kind === "daily-five" && (
                        <p className="mt-2 font-semibold">
                          Price {p.cost} · Score {p.score}
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          </section>
        )}
      {kind === "watchlist" && data && (
        <>
          <p className="text-foreground/60">
            Your private list. Follow players to see their stored stats and next
            scheduled team game. A team’s game does not confirm player
            availability.
          </p>
          <fieldset
            disabled={busy}
            className={busy ? "pointer-events-none opacity-50" : ""}
          >
            <SearchPlayers
              onPlayerClick={(p) =>
                void load({ action: "add", playerId: Number(p.PERSON_ID) })
              }
            />
          </fieldset>
          {!data.players.length && (
            <p className={panel}>
              No followed players yet. Search above to add your first player.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {data.players.map((p: any) => (
              <article key={p.id} className={panel}>
                <div className="flex items-center gap-3">
                  <PlayerImage
                    playerId={p.id}
                    alt={p.name}
                    className="w-20 h-20 object-contain"
                  />
                  <div>
                    <Link
                      href={`/player/${p.id}`}
                      className="font-bold underline"
                    >
                      {p.name}
                    </Link>
                    <p>{p.team}</p>
                  </div>
                </div>
                <p className="mt-3">
                  {p.stats
                    ? `${p.stats.pts} PTS · ${p.stats.reb} REB · ${p.stats.ast} AST`
                    : "No current-season stats available."}
                </p>
                <p className="text-sm text-foreground/60 my-3">
                  {p.nextGame
                    ? `${p.nextGame.awayTeam} at ${p.nextGame.homeTeam} · ${new Date(p.nextGame.startTime).toLocaleString("en-US")}`
                    : "No upcoming game available in the stored schedule."}
                </p>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void load({ action: "remove", playerId: p.id })
                  }
                >
                  Unfollow {p.name}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {kind === "history" && data && (
        <>
          <p className="text-foreground/60">
            {data.signedIn ? "Account history" : "This browser’s guest history"}{" "}
            · Dates use UTC. Previous browser-only games are not imported.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.achievements.map((x: any) => (
              <div
                key={x.name}
                className={
                  panel + (x.unlocked ? " border-emerald-500" : " opacity-60")
                }
              >
                <h2 className="font-semibold">
                  {x.unlocked ? "🏆" : "🔒"} {x.name}
                </h2>
                <p className="text-sm">{x.description}</p>
              </div>
            ))}
          </div>
          <section className={panel}>
            <label className="font-semibold">
              Challenge calendar{" "}
              <input
                aria-label="Calendar month"
                type="month"
                value={month}
                max={data.day.slice(0, 7)}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value))
                    setMonth(e.target.value);
                }}
                className="rounded border bg-background p-2 ml-3"
              />
            </label>
            <p className="text-xs text-foreground/60 mt-2">
              ✓ Won · × Lost · … In progress · — Not played · Five = submitted
              score
            </p>
            <div className="grid grid-cols-7 gap-2 mt-4">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="text-xs text-center">
                  {d}
                </div>
              ))}
              {Array.from(
                {
                  length:
                    (new Date(month + "-01T00:00:00Z").getUTCDay() + 6) % 7,
                },
                (_, i) => (
                  <div key={"blank" + i} />
                ),
              )}
              {Array.from(
                {
                  length: new Date(
                    Number(month.slice(0, 4)),
                    Number(month.slice(5, 7)),
                    0,
                  ).getDate(),
                },
                (_, i) => {
                  const date = month + "-" + String(i + 1).padStart(2, "0");
                  const records = data.guesser.filter(
                    (r: any) => r.day === date,
                  );
                  const five = data.dailyFive.find((r: any) => r.day === date);
                  return (
                    <div
                      key={date}
                      className="border rounded-lg p-2 text-xs min-h-24"
                    >
                      <p className="font-bold mb-2">{i + 1}</p>
                      {(["current", "alltime"] as const).map((era) => {
                        const r = records.find((r: any) => r.era === era);
                        return (
                          <p key={era}>
                            {era === "current" ? "Current" : "All-Time"}:{" "}
                            {r
                              ? r.status === "won"
                                ? `✓ ${r.attempts}/6`
                                : r.status === "expired"
                                  ? "Expired"
                                  : r.status === "lost"
                                    ? "×"
                                    : `… ${r.attempts}/6`
                              : "—"}
                          </p>
                        );
                      })}
                      {five && (
                        <p className="text-emerald-500">
                          Five: {Number(five.score).toFixed(1)}
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </section>
        </>
      )}
      {note && (
        <p role="status" className="break-all">
          {note}
        </p>
      )}
      {sharedLink && (
        <a href={sharedLink} className="block underline">
          Open shared lineups
        </a>
      )}
    </main>
  );
}
