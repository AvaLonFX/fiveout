"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PlayerImage from "@/components/PlayerImage";
import { addDreamTeamPlayer } from "@/lib/dream-team";
import { createClient } from "@/utils/supabase/client";

type Rec = {
  id: string | number;
  name: string;
  team?: string | number | null;
  similarity?: number;
};

type ApiResp = { recommendations: Rec[] };

export default function Recommendations() {
  const supabase = useMemo(() => createClient(), []);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  const [data, setData] = useState<ApiResp | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dreamTeamIds, setDreamTeamIds] = useState<Set<string>>(new Set());
  const [loadingDreamTeam, setLoadingDreamTeam] = useState(false);

  const [addingId, setAddingId] = useState<string | null>(null);

  // 1) session (user)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data?.session?.user?.id ?? null);
    })();
  }, [supabase]);

  // 2) fetch recs ONLY when opened
  useEffect(() => {
    if (!open) return;
    if (data || loadingRecs) return;

    (async () => {
      setLoadingRecs(true);
      setError(null);

      try {
        const r = await fetch("/api/recommendations/players", {
          credentials: "include",
        });

        if (!r.ok) {
          const text = await r.text();
          setError(`${r.status} ${r.statusText}: ${text}`);
          setData({ recommendations: [] });
          return;
        }

        const json = (await r.json()) as ApiResp;
        setData(json);
      } catch (e: any) {
        setError(e?.message ?? "Fetch failed");
        setData({ recommendations: [] });
      } finally {
        setLoadingRecs(false);
      }
    })();
  }, [open, data, loadingRecs]);

  // 3) fetch dreamteam ids when opened + logged in
  useEffect(() => {
    if (!open) return;
    if (!userId) return;

    (async () => {
      setLoadingDreamTeam(true);
      try {
        const { data, error } = await supabase
          .from("UserDreamTeams")
          .select("player_id")
          .eq("user_id", userId);

        if (error) {
          console.error("Error fetching dream team:", error);
          return;
        }

        const setIds = new Set<string>((data ?? []).map((r: any) => String(r.player_id)));
        setDreamTeamIds(setIds);
      } finally {
        setLoadingDreamTeam(false);
      }
    })();
  }, [open, userId, supabase]);

  const items = data?.recommendations ?? [];

  const canShow = open && !error && items.length > 0;

  const scrollByCard = (dir: "prev" | "next") => {
    const el = scrollerRef.current;
    if (!el) return;

    const card = el.querySelector<HTMLElement>("[data-rec-card]");
    const step = (card?.offsetWidth ?? 320) + 16;

    el.scrollBy({
      left: dir === "next" ? step : -step,
      behavior: "smooth",
    });
  };

  const addToDreamTeam = async (playerId: string | number) => {
    if (!userId || addingId) return;

    const pid = String(playerId);

    // max 12
    if (dreamTeamIds.size >= 12) {
      alert("You have reached the maximum number of players (12) in your Dream Team!");
      return;
    }

    // already added
    if (dreamTeamIds.has(pid)) return;

    setAddingId(pid);
    try {
      await addDreamTeamPlayer(supabase, Number(pid));

      setDreamTeamIds((prev) => {
        const next = new Set(prev);
        next.add(pid);
        return next;
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add player.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto">
      {/* Header / Toggle */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white/90">Recommended players</h2>
          <p className="text-xs text-white/50">Personalized suggestions based on your activity</p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="
            ml-auto h-9 rounded-xl px-4 text-sm font-semibold
            bg-primary text-primary-foreground hover:bg-primary/90 transition
            shadow-sm
          "
        >
          {open ? "Hide recommendations" : "Show recommendations"}
        </button>
      </div>

      {/* Collapsible content */}
      {!open ? null : (
        <div
          className="
            rounded-2xl border border-white/10
            bg-white/[0.03] backdrop-blur
            p-4
            shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
        >
          {/* states */}
          {!userId ? (
            <p className="text-sm text-white/55">Please sign in to see recommendations.</p>
          ) : loadingRecs ? (
            <p className="text-sm text-white/55">Loading recommendations...</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-white/55">No recommendations yet (interact with players first).</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/45">Swipe or use arrows</p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => scrollByCard("prev")}
                    className="
                      h-9 w-9 rounded-full border border-white/10
                      bg-white/[0.04] hover:bg-white/[0.08]
                      text-white/80
                      flex items-center justify-center
                      transition
                    "
                    aria-label="Previous"
                    type="button"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => scrollByCard("next")}
                    className="
                      h-9 w-9 rounded-full border border-white/10
                      bg-white/[0.04] hover:bg-white/[0.08]
                      text-white/80
                      flex items-center justify-center
                      transition
                    "
                    aria-label="Next"
                    type="button"
                  >
                    →
                  </button>
                </div>
              </div>

              <div className="relative">
                <div
                  ref={scrollerRef}
                  className="
                    no-scrollbar
                    flex gap-4 overflow-x-auto pb-4
                    snap-x snap-mandatory scroll-smooth
                    [scrollbar-width:none] [-ms-overflow-style:none]
                  "
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="shrink-0 w-2 sm:w-10" />
                  {items.map((r, idx) => (
                    <RecCard
                      key={String(r.id)}
                      rec={r}
                      index={idx}
                      isInDreamTeam={dreamTeamIds.has(String(r.id))}
                      isAdding={addingId === String(r.id)}
                      dreamTeamLoading={loadingDreamTeam}
                      onAdd={() => addToDreamTeam(r.id)}
                    />
                  ))}
                  <div className="shrink-0 w-2 sm:w-10" />
                </div>

                {/* subtle fades that match dark bg */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-14 bg-gradient-to-r from-[#070b14] via-[#070b14]/70 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-14 bg-gradient-to-l from-[#070b14] via-[#070b14]/70 to-transparent" />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function RecCard({
  rec,
  isInDreamTeam,
  isAdding,
  dreamTeamLoading,
  onAdd,
}: {
  rec: Rec;
  index: number;
  isInDreamTeam: boolean;
  isAdding: boolean;
  dreamTeamLoading: boolean;
  onAdd: () => void;
}) {
  const teamLabel = rec.team ? `Team: ${rec.team}` : null;


  return (
    <article
      data-rec-card
      className="
        snap-center shrink-0
        w-[280px] sm:w-[340px] md:w-[380px]
        rounded-2xl
        border border-white/10
        bg-white/[0.04] backdrop-blur
        shadow-[0_10px_30px_rgba(0,0,0,0.35)]
        hover:bg-white/[0.06] hover:border-white/15
        transition
        overflow-hidden
      "
    >
      {/* Image area */}
      <div className="relative h-[190px] bg-gradient-to-b from-white/[0.06] to-transparent flex items-center justify-center">
        <PlayerImage
          playerId={rec.id}
          alt={rec.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />

        {typeof rec.similarity === "number" && (
          <div
            className="
              absolute top-3 right-3
              text-[11px] text-white/80
              bg-black/40 border border-white/10
              rounded-full px-2 py-1
              shadow-sm
            "
          >
            sim: <span className="font-semibold text-white">{rec.similarity.toFixed(3)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <Link
          href={`/player/${rec.id}`}
          className="block text-base sm:text-lg font-semibold text-white/90 truncate hover:underline"
        >
          {rec.name}
        </Link>

        <div className="mt-1 text-xs text-white/55">
          <div className="truncate">ID: {rec.id}</div>
          {teamLabel && <div className="truncate">{teamLabel}</div>}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link
            href={`/player/${rec.id}`}
            className="
              inline-flex items-center justify-center w-full
              rounded-xl border border-white/10
              bg-white/[0.03] hover:bg-white/[0.07]
              px-3 py-2 text-sm text-white/85
              transition
            "
          >
            View player →
          </Link>

          <button
            type="button"
            onClick={onAdd}
            disabled={dreamTeamLoading || isAdding || isInDreamTeam}
            className={[
              "inline-flex items-center justify-center w-full rounded-xl px-3 py-2 text-sm transition border",
              isInDreamTeam
                ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-200 cursor-not-allowed"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white/85",
              dreamTeamLoading || isAdding ? "opacity-60 cursor-wait" : "",
            ].join(" ")}
          >
            {isInDreamTeam ? "Added to Dream Team ✓" : isAdding ? "Adding..." : "Add to Dream Team"}
          </button>
        </div>
      </div>
    </article>
  );
}
