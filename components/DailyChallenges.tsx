"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameSummary } from "@/lib/guesser-types";
export default function DailyChallenges() {
  const [data, setData] = useState<{
    day: string;
    current: GameSummary;
    alltime: GameSummary;
    dailyFive?: { score: number } | null;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/guess/summary", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d) => {
          if (active) {
            setData(d);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    void load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, []);
  return (
    <section className="mt-10 rounded-2xl border bg-card p-5">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Daily NBA challenge</h2>
        <span className="text-xs text-foreground/60">
          {data?.day} · resets 00:00 UTC
        </span>
      </div>
      <p className="text-sm text-foreground/60 mt-1">
        Two mystery players. Six attempts each. How well do you know the NBA?
      </p>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {(["current", "alltime"] as const).map((era) => {
          const s = data?.[era],
            t = s?.today;
          return (
            <Link
              key={era}
              href={`/guess/${era === "alltime" ? "all-time" : "current"}/daily`}
              className="rounded-xl border p-4 hover:bg-foreground/5"
            >
              <div className="font-semibold">
                {era === "current" ? "Current players" : "All-Time players"}
              </div>
              <p className="text-sm text-foreground/60 mt-2">
                {error
                  ? "Open challenge to check progress"
                  : !data
                    ? "Loading progress…"
                    : !t
                      ? "Not started"
                      : t.status === "won"
                        ? `Solved in ${t.attempts}/6`
                        : t.status === "lost"
                          ? "Completed · try again tomorrow"
                          : `In progress · ${t.attempts}/6 attempts`}
              </p>
              <div className="mt-3 text-sm font-semibold">
                {t && t.status !== "playing"
                  ? "View result"
                  : t
                    ? "Continue"
                    : "Play today"}{" "}
                →
              </div>
              {s && s.streak > 0 && (
                <p className="text-xs mt-2 text-orange-400">
                  🔥 {s.streak}-day win streak
                </p>
              )}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-sm font-semibold">
        <Link href="/daily-five" className="underline">
          {data?.dailyFive
            ? `Daily Five completed · ${Number(data.dailyFive.score).toFixed(1)} points →`
            : "Build today’s Daily Five →"}
        </Link>
        <Link href="/history" className="underline">
          Your calendar & achievements →
        </Link>
      </div>
    </section>
  );
}
