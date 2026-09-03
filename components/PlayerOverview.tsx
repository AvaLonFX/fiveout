"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
export default function PlayerOverview({
  id,
  signedIn,
  onCompare,
  onAdd,
  inTeam,
  saving,
}: {
  id: number;
  signedIn: boolean;
  onCompare: () => void;
  onAdd: () => void;
  inTeam: boolean;
  saving: boolean;
}) {
  const [stats, setStats] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [followed, setFollowed] = useState(false),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setStats(null);
    setFollowed(false);
    createClient()
      .from("verified_current_stats")
      .select("*")
      .eq("PLAYER_ID", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          setStats(data);
          setLoading(false);
          if (error) setError("Season statistics are temporarily unavailable.");
        }
      });
    if (signedIn)
      fetch("/api/fan/watchlist")
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d) => {
          if (active) setFollowed(d.players.some((p: any) => p.id === id));
        })
        .catch(() => {
          if (active)
            setError(
              "Could not check your watchlist. You can retry by following this player.",
            );
        });
    return () => {
      active = false;
    };
  }, [id, signedIn]);
  async function follow() {
    if (!signedIn) {
      router.push("/sign-in?redirect=" + encodeURIComponent("/player/" + id));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/fan/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: followed ? "remove" : "add",
          playerId: id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to save");
      setFollowed(d.players.some((p: any) => p.id === id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border p-5 mb-6 space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={follow}
          disabled={busy}
          className="rounded-lg border px-4 py-2 disabled:opacity-40"
        >
          {busy ? "Saving…" : followed ? "Unfollow player" : "Follow player"}
        </button>
        <button onClick={onCompare} className="rounded-lg border px-4 py-2">
          Compare player
        </button>
        <button
          onClick={onAdd}
          disabled={inTeam || saving}
          className="rounded-lg border px-4 py-2 disabled:opacity-40"
        >
          {saving
            ? "Saving…"
            : inTeam
              ? "In your Dream Team"
              : "Add to Dream Team"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-amber-500">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading season stats…</p>
      ) : stats ? (
        <>
          <h2 className="font-semibold">
            {stats.season} regular season · {stats.TEAM_ABBREVIATION}
          </h2>
          <div className="flex flex-wrap gap-6">
            {[
              ["PTS", stats.PTS],
              ["REB", stats.REB],
              ["AST", stats.AST],
              ["Games", stats.GP],
              [
                "FG%",
                stats.FG_PCT == null ? "N/A" : (stats.FG_PCT * 100).toFixed(1),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <strong className="text-xl">{value ?? "N/A"}</strong>
                <p className="text-xs text-foreground/60">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-foreground/60">
            Source: NBA Stats / LeagueDashPlayerStats · per-game averages ·
            synced {new Date(stats.synced_at).toLocaleString("en-US")}. Team is the
            season-statistics team and may differ from the latest roster.
          </p>
        </>
      ) : (
        <p className="text-sm text-foreground/60">
          No verified current-season statistics for this player. Historical
          data, when available, appears below.
        </p>
      )}
    </section>
  );
}
