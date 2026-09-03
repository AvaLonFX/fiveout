"use client";

import { useEffect, useState } from "react";

const teamAbbreviationToId: Record<string, string> = {
  ATL: "1610612737",
  BOS: "1610612738",
  BKN: "1610612751",
  CHA: "1610612766",
  CHI: "1610612741",
  CLE: "1610612739",
  DAL: "1610612742",
  DEN: "1610612743",
  DET: "1610612765",
  GSW: "1610612744",
  HOU: "1610612745",
  IND: "1610612754",
  LAC: "1610612746",
  LAL: "1610612747",
  MEM: "1610612763",
  MIA: "1610612748",
  MIL: "1610612749",
  MIN: "1610612750",
  NOP: "1610612740",
  NYK: "1610612752",
  OKC: "1610612760",
  ORL: "1610612753",
  PHI: "1610612755",
  PHX: "1610612756",
  POR: "1610612757",
  SAC: "1610612758",
  SAS: "1610612759",
  TOR: "1610612761",
  UTA: "1610612762",
  WAS: "1610612764",
};

interface Game {
  nba_game_id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  startTime?: string | null;

  // odds (optional)
  odds_home_decimal?: number | null;
  odds_away_decimal?: number | null;
  p_home?: number | null;
  model_name?: string | null;
}

type ModelName = "lr_moneyline_final" | "xgb_moneyline_final";

export default function NBASchedule() {
  const [games, setGames] = useState<Game[]>([]);
  const [model, setModel] = useState<ModelName>("lr_moneyline_final");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);
      setGames([]);
      try {
        const res = await fetch(`/api/nba-schedule?model=${model}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error("Schedule unavailable");
        setGames(Array.isArray(data) ? data : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setError("Could not load the schedule.");
        setGames([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchSchedule();
    return () => controller.abort();
  }, [model, retry]);

  const getLogoUrl = (tricode: string) => {
    const teamId = teamAbbreviationToId[tricode];
    return teamId
      ? `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`
      : null;
  };

  const formatDate = (d?: string) => {
    if (!d) return "TBD";
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? "TBD" : dt.toLocaleDateString("en-US");
  };

  const formatTime = (iso?: string | null, fallback?: string) => {
    // prefer startTime if present; otherwise show status
    if (iso) {
      const dt = new Date(iso);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      }
    }
    return fallback || "TBD";
  };

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-3 text-center">NBA Schedule</h2>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-500">
          {loading ? "Loading..." : `${games.length} upcoming games`}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Model:</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelName)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="xgb_moneyline_final">XGBoost</option>
            <option value="lr_moneyline_final">LogReg</option>
            
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <p className="mb-3 text-xs text-foreground/60">Model estimates are generated for regular-season games within the next seven days when data is available. Times are shown in your local time zone.</p>
        {error && <p role="alert" className="mb-3 text-sm text-red-500">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
        <table className="min-w-full border border-gray-300 text-sm shadow-md rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="py-3 px-4 text-left">Date</th>
              <th className="py-3 px-4 text-left">Home</th>
              <th className="py-3 px-4 text-left">Away</th>
              <th className="py-3 px-4 text-left">Time</th>
              <th className="py-3 px-4 text-left">Odds</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white">
            {games.map((game) => {
              const dateStr = formatDate(game.startTime || game.date);
              const timeStr = formatTime(game.startTime, game.status);

              const homeLogo = getLogoUrl(game.homeTeam);
              const awayLogo = getLogoUrl(game.awayTeam);

              const hasOdds =
                game.odds_home_decimal != null && game.odds_away_decimal != null;

              return (
                <tr key={game.nba_game_id} className="hover:bg-gray-50 transition">
                  <td className="py-2 px-4 font-medium text-gray-800">
                    {dateStr}
                  </td>

                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      {homeLogo && (
                        <img
                          src={homeLogo}
                          alt={game.homeTeam}
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <span>{game.homeTeam}</span>
                    </div>
                  </td>

                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      {awayLogo && (
                        <img
                          src={awayLogo}
                          alt={game.awayTeam}
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <span>{game.awayTeam}</span>
                    </div>
                  </td>

                  <td className="py-2 px-4 text-gray-600">{timeStr}</td>

                  <td className="py-2 px-4 text-gray-700">
                    {hasOdds ? (
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium">
                          {game.homeTeam}: {Number(game.odds_home_decimal).toFixed(2)}
                        </span>
                        <span className="font-medium">
                          {game.awayTeam}: {Number(game.odds_away_decimal).toFixed(2)}
                        </span>
                        {game.p_home != null && (
                          <span className="text-xs text-gray-500">
                            p(home) {(Number(game.p_home) * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!loading && !error && games.length === 0 && (
              <tr>
                <td className="py-4 px-4 text-gray-500" colSpan={5}>
                  No upcoming games are stored yet. The schedule may need refreshing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
