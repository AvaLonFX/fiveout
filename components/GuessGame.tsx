"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GuessStatsChart } from "@/components/GuessStatsChart";
import SearchPlayers from "@/components/nba_comp/SearchPlayers";
import PlayerImage from "@/components/PlayerImage";
import { trackEvent } from "@/lib/gtag";
import type { Game, GameSummary } from "@/lib/guesser-types";

export default function GuessGame({
  apiPath,
  title,
  subtitle,
}: {
  apiPath: string;
  title: string;
  subtitle: string;
}) {
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [share, setShare] = useState("");
  const lock = useRef(false),
    generation = useRef(0);
  const era = apiPath.includes("alltime") ? "alltime" : "current";
  async function stats(gen: number) {
    try {
      const res = await fetch("/api/guess/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (gen === generation.current) {
        setSummary(data[era]);
        setSignedIn(data.signedIn);
      }
    } catch {
      /* Game remains playable if statistics are unavailable. */
    }
  }
  async function send(action: string, playerId?: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setShare("");
    const gen = generation.current;
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          playerId,
          id: game?.id,
          version: game?.version,
        }),
      });
      const data = await res.json();
      if (gen !== generation.current) return;
      if (data.game) {
        setGame(data.game);
        void stats(gen);
      }
      if (!res.ok)
        throw new Error(
          data.error || "Unable to save this attempt. Retry safely.",
        );
      if (action === "guess" || action === "hint") {
        const latest = data.game as Game;
        const move = latest.moves[latest.moves.length - 1];
        trackEvent(action === "guess" ? "guesser_guess" : "guesser_hint", {
          era: era === "alltime" ? "all_time" : era,
          mode: latest.mode,
          attempt: latest.moves.length,
          correct: move.correct === true,
        });
        if (latest.status !== "playing")
          trackEvent("guesser_end", {
            era: era === "alltime" ? "all_time" : era,
            mode: latest.mode,
            result: latest.status === "won" ? "win" : "lose",
            attempts_used: latest.moves.length,
          });
      }
    } catch (e) {
      if (gen === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Connection lost. Retry safely; saved attempts will not be counted twice.",
        );
    } finally {
      if (gen === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    const gen = ++generation.current;
    lock.current = true;
    setGame(null);
    setSummary(null);
    setBusy(true);
    setError("");
    const controller = new AbortController();
    (async () => {
      try {
        // POST start is idempotent and resumes an existing game; GET never creates games.
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load game.");
        if (gen === generation.current) {
          setGame(data.game);
          void stats(gen);
        }
      } catch (e) {
        if (!controller.signal.aborted && gen === generation.current)
          setError(e instanceof Error ? e.message : "Unable to load game.");
      } finally {
        if (gen === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    })();
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [apiPath]);
  async function shareResult() {
    if (!game || game.status === "playing") return;
    const marks = game.moves
      .map((m) => (m.type === "hint" ? "💡" : m.correct ? "🟩" : "⬛"))
      .join("");
    const text = `QNBA ${title}${game.mode === "daily" ? ` · ${game.day}` : " · Practice"}\n${game.status === "won" ? game.moves.length : "X"}/6 ${marks}\n${window.location.origin}/guess/${era === "alltime" ? "all-time" : "current"}/${game.mode}`;
    try {
      await navigator.clipboard.writeText(text);
      setShare("Result copied — no answer spoilers.");
    } catch {
      setShare(text);
    }
  }
  const finished = !!game && game.status !== "playing";
  const hints = game?.moves.filter((m) => m.type === "hint").length || 0;
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-10 flex justify-center">
      <div className="w-full max-w-4xl">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-slate-300">{subtitle}</p>
          <p className="mt-2 text-sm text-slate-400">
            Six attempts. Each hint uses one attempt. Daily challenges reset at
            00:00 UTC.
          </p>
        </header>
        {game && (
          <section className="grid md:grid-cols-2 gap-8 items-center mb-8">
            <div className="flex justify-center">
              {game.player ? (
                <PlayerImage
                  playerId={game.player.id}
                  alt={game.player.name}
                  className="h-64 w-64 object-contain"
                />
              ) : (
                <div
                  className="h-64 w-64 rounded-2xl border border-slate-700 bg-slate-900 flex flex-col items-center justify-center"
                  aria-label="Mystery player"
                >
                  <svg
                    width="110"
                    height="130"
                    viewBox="0 0 110 130"
                    aria-hidden="true"
                  >
                    <circle cx="55" cy="35" r="25" fill="#475569" />
                    <path d="M5 130v-20a50 50 0 0 1 100 0v20" fill="#475569" />
                  </svg>
                  <span className="mt-4 text-slate-300">
                    Who is this player?
                  </span>
                </div>
              )}
            </div>
            <div>
              <GuessStatsChart {...game.stats} />
              <p className="text-xs text-slate-400 mt-2">
                {era === "current"
                  ? "Per-game stats from the current stored season."
                  : "Stats from the historical player dataset; not necessarily career averages."}
              </p>
            </div>
          </section>
        )}
        <section
          className="bg-slate-900/80 rounded-xl p-5 space-y-4 border border-slate-700"
          aria-busy={busy}
        >
          {busy && !game && <p role="status">Loading your game…</p>}
          {game && !finished && (
            <fieldset
              disabled={busy}
              className={busy ? "pointer-events-none opacity-50" : ""}
            >
              <SearchPlayers
                onPlayerClick={(p) =>
                  void send("guess", Number(p.PERSON_ID ?? p.PLAYER_ID))
                }
              />
            </fieldset>
          )}
          {game && (
            <div className="flex justify-between text-sm">
              <span>Attempts: {game.moves.length} / 6</span>
              <button
                className="text-emerald-400 disabled:opacity-40"
                disabled={busy || finished || hints >= 4}
                onClick={() => void send("hint")}
              >
                Show hint ({hints}/4) · costs 1 attempt
              </button>
            </div>
          )}
          {game?.moves.map((m, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-700 bg-slate-800 p-3"
            >
              {m.type === "hint" ? (
                <p>💡 {m.hint}</p>
              ) : (
                <>
                  <p
                    className={
                      m.correct
                        ? "text-emerald-400 font-semibold"
                        : "font-semibold"
                    }
                  >
                    {i + 1}. {m.name} — {m.correct ? "Correct!" : "Incorrect"}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(m.feedback || {}).map(([label, value]) => (
                      <span
                        key={label}
                        className={`rounded px-2 py-1 text-xs ${value === "Match" ? "bg-emerald-950 text-emerald-300" : "bg-slate-900 text-slate-300"}`}
                      >
                        {label}: {value}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
          {game?.moves.some((m) => m.type === "guess") && (
            <p className="text-xs text-slate-400">
              Arrows describe the mystery player relative to your guess. Unknown
              means data is missing. Team refers to the stored team, not full
              career history.
            </p>
          )}
          {error && (
            <p role="alert" className="text-amber-300">
              {error}
            </p>
          )}
          {!game && !busy && (
            <button
              className="rounded-lg border px-4 py-2"
              onClick={() => void send("start")}
            >
              Retry loading
            </button>
          )}
          {finished && game?.player && (
            <div className="border border-emerald-700 rounded-xl p-4">
              <h2 className="font-bold text-xl">
                {game.status === "won" ? "You got it!" : "Out of attempts"} —{" "}
                {game.player.name}
              </h2>
              <p className="text-slate-300">
                {game.player.team} · {game.player.position}
              </p>
              <div className="flex gap-4 mt-4">
                <Link className="underline" href={`/player/${game.player.id}`}>
                  Player profile
                </Link>
                <button className="underline" onClick={shareResult}>
                  Copy result
                </button>
                {game.mode === "practice" && (
                  <button
                    disabled={busy}
                    className="underline disabled:opacity-40"
                    onClick={() => void send("new")}
                  >
                    New player
                  </button>
                )}
              </div>
              {game.mode === "daily" && (
                <p className="mt-3 text-sm text-slate-400">
                  Completed for {game.day}. Come back tomorrow for a new
                  challenge.
                </p>
              )}
            </div>
          )}
          {share && (
            <p
              role="status"
              className="whitespace-pre-wrap text-sm text-emerald-300"
            >
              {share}
            </p>
          )}
        </section>
        {summary && (
          <section className="mt-6 rounded-xl border border-slate-700 p-5">
            <h2 className="font-semibold">
              Your {era === "current" ? "Current" : "All-Time"} daily stats
            </h2>
            <div className="grid grid-cols-4 gap-4 my-4">
              {[
                ["Played", summary.played],
                ["Win rate", `${summary.winRate}%`],
                ["Win streak", summary.streak],
                ["Best streak", summary.bestStreak],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <h3 className="text-sm mb-2">Winning attempts (hints included)</h3>
            {summary.distribution.map((n, i) => (
              <div key={i} className="flex gap-3 items-center text-xs my-1">
                <span>{i + 1}</span>
                <div
                  className="bg-emerald-800 rounded px-2 py-1 min-w-6"
                  style={{
                    width: `${Math.max(4, (n / Math.max(1, ...summary.distribution)) * 85)}%`,
                  }}
                >
                  {n}
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400 mt-4">
              {signedIn
                ? "Saved to your account across devices."
                : "Guest progress belongs to this browser. Sign in before starting if you want account-based stats; guest games are kept separate."}{" "}
              Practice does not affect daily statistics.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
