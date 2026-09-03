"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PlayerImage from "@/components/PlayerImage";
import type { Simulation } from "@/lib/match-simulation";

const button =
  "rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-foreground/10 disabled:opacity-40";
type Summary = {
  id: string;
  title: string;
  source: string;
  score: number[];
  createdAt: string;
  teams?: string[][];
};
type Detail = Summary & {
  result: Simulation;
  series?: {
    bestOf: number;
    needed: number;
    wins: number[];
    winner: number;
    games: Simulation[];
  };
};

export default function SavedMatches({ standalone = false }: { standalone?: boolean }) {
  const [matches, setMatches] = useState<Summary[]>([]),
    [selected, setSelected] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [cursor, setCursor] = useState(0),
    [running, setRunning] = useState(false),
    [seriesGame, setSeriesGame] = useState(0);
  const activeResult = selected?.series?.games[seriesGame] || selected?.result;
  useEffect(() => {
    void fetch("/api/matches", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Unable to load matches.");
        setMatches(data.matches);
      })
      .catch((event) => setError((event as Error).message))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!running || !activeResult) return;
    const timer = setInterval(
      () =>
        setCursor((value) => Math.min(value + 1, activeResult.plays.length)),
      70,
    );
    return () => clearInterval(timer);
  }, [running, activeResult]);
  useEffect(() => {
    if (activeResult && cursor >= activeResult.plays.length) setRunning(false);
  }, [cursor, activeResult]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/matches/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to open match.");
      setSelected(data);
      const gameIndex = data.series?.games?.length
        ? data.series.games.length - 1
        : 0;
      setSeriesGame(gameIndex);
      setCursor((data.series?.games?.[gameIndex] || data.result).plays.length);
      setRunning(false);
    } catch (event) {
      setError((event as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const play = activeResult?.plays[cursor - 1],
    score = play?.score || activeResult?.score || [0, 0],
    finished = !!activeResult && cursor === activeResult.plays.length;
  return (
    <main className="mx-auto max-w-6xl py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-orange-500 font-bold">
            {standalone ? "FIVEOUT Archive" : "QNBA Arena"}
          </p>
          <h1 className="text-3xl font-bold">Match history</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Saved simulations and completed challenges tied to this account or
            browser.
          </p>
        </div>
        <Link href={standalone ? "/full-court/play" : "/matchups"} className={button}>
          Back to simulator
        </Link>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 p-4 text-red-500"
        >
          {error}
        </p>
      )}
      {busy && !selected && <p>Loading matches…</p>}
      {!busy && !matches.length && (
        <section className="rounded-2xl border bg-card p-8 text-center">
          <h2 className="text-xl font-bold">No saved matches yet</h2>
          <p className="text-foreground/60 mt-2">
            Finish a simulation and choose Save match, or complete a shared
            challenge.
          </p>
        </section>
      )}
      {!!matches.length && (
        <div className="grid lg:grid-cols-[20rem_1fr] gap-5 items-start">
          <aside className="rounded-2xl border bg-card p-3 space-y-2">
            {matches.map((match) => (
              <button
                key={match.id}
                onClick={() => void open(match.id)}
                className={`w-full rounded-xl border p-3 text-left hover:bg-foreground/5 ${selected?.id === match.id ? "border-orange-500 bg-orange-500/10" : ""}`}
              >
                <span className="flex justify-between gap-2 font-bold">
                  <span className="truncate">{match.title}</span>
                  <span>{match.score.join("–")}</span>
                </span>
                <span className="block text-xs text-foreground/50 mt-1">
                  {match.source === "challenge" ? "Challenge" : "Simulation"} ·{" "}
                  {new Date(match.createdAt).toLocaleString("en-US")}
                </span>
              </button>
            ))}
          </aside>
          <section className="rounded-2xl border bg-card p-5 min-h-64">
            {!selected ? (
              <p className="text-foreground/60">
                Select a match to open its result.
              </p>
            ) : (
              <div className="space-y-5">
                {selected.series && (
                  <section className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
                    <p className="text-xs uppercase tracking-widest text-violet-500 font-bold">
                      BO{selected.series.bestOf} series · first to{" "}
                      {selected.series.needed}
                    </p>
                    <h2 className="text-xl font-bold mt-1">
                      Lineup A {selected.series.wins[0]}–
                      {selected.series.wins[1]} Lineup B
                    </h2>
                    <p className="text-sm text-foreground/60">
                      Lineup {selected.series.winner === 0 ? "A" : "B"} won the
                      series
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selected.series.games.map((game, index) => (
                        <button
                          key={index}
                          className={`${button} ${seriesGame === index ? "border-violet-500 bg-violet-500/15" : ""}`}
                          onClick={() => {
                            setSeriesGame(index);
                            setCursor(game.plays.length);
                            setRunning(false);
                          }}
                        >
                          Game {index + 1} · {game.score[0]}–{game.score[1]}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <div className="text-center rounded-xl border bg-background/50 p-5">
                  <p className="text-xs uppercase text-foreground/50">
                    {finished
                      ? "Final"
                      : play
                        ? `${play.period <= 4 ? `Q${play.period}` : `OT${play.period - 4}`} · ${play.clock}`
                        : "Tip-off"}
                  </p>
                  <p className="text-5xl font-black my-3 tabular-nums">
                    {score[0]} : {score[1]}
                  </p>
                  <p className="font-semibold min-h-6">
                    {finished
                      ? selected.title
                      : play?.text || "Ready for replay"}
                  </p>
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      className={button}
                      onClick={() => {
                        if (finished) setCursor(0);
                        setRunning(!running);
                      }}
                    >
                      {finished ? "Watch replay" : running ? "Pause" : "Resume"}
                    </button>
                    <button
                      className={button}
                      disabled={finished}
                      onClick={() => {
                        setCursor(activeResult!.plays.length);
                        setRunning(false);
                      }}
                    >
                      Skip to final
                    </button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {activeResult!.boxes.map((team, side) => (
                    <div
                      key={side}
                      className="overflow-x-auto rounded-xl border p-3"
                    >
                      <h2 className="font-bold mb-2">
                        Lineup {side === 0 ? "A" : "B"}
                      </h2>
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left">Player</th>
                            <th>MIN</th>
                            <th>PTS</th>
                            <th>REB</th>
                            <th>AST</th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.map((player) => (
                            <tr
                              key={player.id}
                              className="border-t text-center"
                            >
                              <td className="py-2 text-left">
                                <span className="flex items-center gap-2">
                                  <PlayerImage
                                    playerId={player.id}
                                    alt=""
                                    className="w-8 h-8 object-contain"
                                  />
                                  {player.name}
                                </span>
                              </td>
                              <td>{player.min.toFixed(1)}</td>
                              <td>{player.pts}</td>
                              <td>{player.reb}</td>
                              <td>{player.ast}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
