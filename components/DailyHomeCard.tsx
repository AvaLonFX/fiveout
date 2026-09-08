"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PlayerImage from "@/components/PlayerImage";
import { trackEvent } from "@/lib/gtag";

type Summary = {
  budget: number;
  opponentCost: number;
  difficulty: string;
  maxAttempts: number;
  attempts: Array<{ won: boolean }>;
  streak: number;
  community: { participants: number; beatRate: number | null };
  opponent: Array<{ id: number; name: string }>;
};

export default function DailyHomeCard() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/daily-beat?summary=1", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(body => {
        setData(body);
        trackEvent("daily_home_card_viewed", { played_today: body.attempts.length ? "yes" : "no", streak: body.streak });
      })
      .catch(() => {});
  }, []);

  if (!data) return null;
  const won = data.attempts.some(attempt => attempt.won);
  const left = data.maxAttempts - data.attempts.length;

  return (
    <section className="mx-auto max-w-7xl px-5 pt-16">
      <div className="overflow-hidden rounded-[1.75rem] border border-violet-400/25 bg-[radial-gradient(circle_at_88%_0%,rgba(139,92,246,.22),transparent_38%),#0a1020]">
        <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[.28em] text-violet-300">Today · Beat this team</p>
            <h2 className="mt-3 text-3xl font-black">{won ? "You beat today’s team." : left ? "Three tries. One shared target." : "Today’s run is complete."}</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-400">Build under the {data.budget}-point cap and compare your best margin with every coach playing today.</p>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-slate-400">
              <span><b className="block text-xl text-white">{left}</b>tries left</span>
              <span><b className="block text-xl text-white">{data.streak}</b>day streak</span>
              <span><b className="block text-xl text-white">{data.community.beatRate == null ? "—" : `${data.community.beatRate}%`}</b>beat rate</span>
              <span><b className="block text-xl text-white">{data.community.participants}</b>coaches today</span>
              <span><b className="block text-xl text-white">{data.opponentCost}</b>{data.difficulty} opponent</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="flex -space-x-3">
              {data.opponent.slice(0, 5).map(player => (
                <div key={player.id} title={player.name} className="grid h-14 w-14 place-items-center rounded-full border-2 border-[#0a1020] bg-slate-900">
                  <PlayerImage playerId={player.id} alt={player.name} className="h-12 w-12 object-contain" />
                </div>
              ))}
            </div>
            <Link href="/full-court/daily" onClick={() => trackEvent("daily_home_card_clicked", { state: won ? "won" : left ? "open" : "complete" })} className="rounded-xl bg-violet-400 px-6 py-3 font-black text-[#080811] hover:bg-violet-300">
              {data.attempts.length ? "View today’s challenge →" : "Play today’s challenge →"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
