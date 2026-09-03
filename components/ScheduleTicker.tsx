"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Game = {
  nba_game_id: string;
  startTime?: string;
  homeTeam: string; // "LAL"
  awayTeam: string; // "DEN"
  status: string; // "7:30 pm ET" / "Final" / "Live"
};

type Props = {
  variant?: "header" | "full";
  linkHref?: string; // optional if later you want click to schedule page
};

const teamAbbreviationToId: Record<string, number> = {
  ATL: 1610612737,
  BOS: 1610612738,
  BKN: 1610612751,
  CHA: 1610612766,
  CHI: 1610612741,
  CLE: 1610612739,
  DAL: 1610612742,
  DEN: 1610612743,
  DET: 1610612765,
  GSW: 1610612744,
  HOU: 1610612745,
  IND: 1610612754,
  LAC: 1610612746,
  LAL: 1610612747,
  MEM: 1610612763,
  MIA: 1610612748,
  MIL: 1610612749,
  MIN: 1610612750,
  NOP: 1610612740,
  NYK: 1610612752,
  OKC: 1610612760,
  ORL: 1610612753,
  PHI: 1610612755,
  PHX: 1610612756,
  POR: 1610612757,
  SAC: 1610612758,
  SAS: 1610612759,
  TOR: 1610612761,
  UTA: 1610612762,
  WAS: 1610612764,
};

function logoUrl(tricode: string) {
  const id = teamAbbreviationToId[tricode];
  if (!id) return null;
  return `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;
}

function fmtDate(iso?: string) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtTime(game: Game) {
  if (!game.startTime || Number.isNaN(new Date(game.startTime).getTime())) return game.status;
  return new Date(game.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function ScheduleTicker({ variant = "header" }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/nba-schedule", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error("Schedule unavailable");
        if (!mounted) return;
        setGames(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("ScheduleTicker fetch error:", e);
        if (mounted) setGames([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  // OVDI odredujes koliko utakmica prikazujes u tickeru:
  const MAX_GAMES = 12;
  const visible = useMemo(() => games.slice(0, MAX_GAMES), [games]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 360, behavior: "smooth" });
  };

  // nothing to show
  if (!loading && visible.length === 0) return null;

  const isHeader = variant === "header";

  const skeletonCount = 6;
  const listToRender: Array<Game | null> =
    loading && visible.length === 0 ? Array.from({ length: skeletonCount }).map(() => null) : visible;

  return (
    <div className={isHeader ? "w-full min-w-0" : "w-full"}>
      {/* header variant: compact, no big title */}
      {!isHeader && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground/80">
              NBA Schedule
            </span>
            <span className="hidden sm:inline text-xs text-foreground/50">
              (upcoming)
            </span>
          </div>
        </div>
      )}

      <div className="relative w-full min-w-0">
        {/* DESKTOP ARROWS */}
        <button
          type="button"
          onClick={() => scrollByCards(-1)}
          className="
            hidden md:flex
            absolute left-0 top-1/2 -translate-y-1/2 z-10
            h-8 w-8 items-center justify-center
            rounded-xl border border-white/10 bg-background/70 backdrop-blur
            hover:bg-white/10 transition
          "
          aria-label="Scroll left"
        >
          ←
        </button>

        <button
          type="button"
          onClick={() => scrollByCards(1)}
          className="
            hidden md:flex
            absolute right-0 top-1/2 -translate-y-1/2 z-10
            h-8 w-8 items-center justify-center
            rounded-xl border border-white/10 bg-background/70 backdrop-blur
            hover:bg-white/10 transition
          "
          aria-label="Scroll right"
        >
          →
        </button>

        <div
          ref={scrollerRef}
          className={`
            flex gap-2 overflow-x-auto no-scrollbar
            ${isHeader ? "px-10" : "px-0"}  /* room for arrows */
            ${isHeader ? "" : "pb-1"}
          `}
        >
          {listToRender.map((g, idx) => {
            // SKELETON
            if (!g) {
              return (
                <div
                  key={`sk-${idx}`}
                  className={`
                    shrink-0 rounded-2xl border border-white/10 bg-white/5 animate-pulse
                    ${isHeader ? "h-10 w-[220px]" : "h-12 w-[260px]"}
                  `}
                />
              );
            }

            const homeLogo = logoUrl(g.homeTeam);
            const awayLogo = logoUrl(g.awayTeam);

            // KEY FIX: unikatan key (izbjegne duplikate i warning)
            const safeKey = `${g.nba_game_id ?? "game"}-${idx}`;

            return (
              <div
                key={safeKey}
                className={`
                  shrink-0 rounded-2xl border border-white/10
                  bg-white/5 hover:bg-white/10 transition
                  ${isHeader ? "w-[240px] py-2 px-3" : "w-[260px] py-2 px-3"}
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* DATUM SAD VIDIŠ I U HEADERU */}
                  <div className="text-[11px] text-foreground/60 truncate">
                    {fmtDate(g.startTime)}
                  </div>
                  <div className="text-[11px] font-semibold text-foreground/70">
                    {fmtTime(g)}
                  </div>
                </div>

                <div className="mt-1 grid grid-cols-2 gap-2 items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    {awayLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={awayLogo}
                        alt={g.awayTeam}
                        className="h-5 w-5 opacity-90"
                      />
                    ) : (
                      <div className="h-5 w-5 rounded bg-white/10" />
                    )}
                    <div className="text-sm font-bold truncate">{g.awayTeam}</div>
                  </div>

                  <div className="flex items-center justify-end gap-2 min-w-0">
                    <div className="text-sm font-bold truncate">{g.homeTeam}</div>
                    {homeLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={homeLogo}
                        alt={g.homeTeam}
                        className="h-5 w-5 opacity-90"
                      />
                    ) : (
                      <div className="h-5 w-5 rounded bg-white/10" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isHeader && (
        <div className="mt-1 text-[11px] text-foreground/40">
          Tip: swipe left or right on mobile.
        </div>
      )}
    </div>
  );
}
