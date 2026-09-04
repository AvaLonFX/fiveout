"use client";
import { useEffect, useRef, useState } from "react";
import {
  defaultRotation,
  tacticInfo,
  type Simulation,
  type Tactic,
} from "@/lib/match-simulation";
import {
  MatchLineups,
  MatchInsights,
  HalftimeCoachingReport,
  FinalGameSummary,
  playPresentation,
  type PreviewPlayer,
} from "@/components/MatchInsights";
import { assignLineup } from "@/lib/lineup-roles";
import PlayerImage from "@/components/PlayerImage";
import TacticalCourt from "@/components/TacticalCourt";
import { trackEvent } from "@/lib/gtag";
const button =
  "rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-foreground/10 disabled:opacity-40";
const labels = Object.fromEntries(
  Object.entries(tacticInfo).map(([key, value]) => [key, value.label]),
) as Record<Tactic, string>;
type Result = Simulation & {
  season: string;
  syncedAt: string;
  simulationToken?: string;
};
type ChallengeSetup = {
  ids: number[];
  minutes: number[];
  tactic: Tactic;
  secondHalfTactic: Tactic;
};
type MatchSeries = {
  bestOf: number;
  needed: number;
  wins: number[];
  winner: number;
  games: Result[];
};
type ChallengeState = {
  code: string;
  status: "open" | "drafting" | "coaching" | "playing_first_half" | "halftime" | "playing_second_half" | "completed";
  role: "creator" | "opponent" | "spectator";
  bestOf: number;
  mode: "classic" | "salary" | "draft";
  era?: "current" | "alltime";
  creator: ChallengeSetup;
  opponent?: ChallengeSetup;
  draftFirst?: number | null;
  draftTurn?: number | null;
  draftPickStartedAt?: string | null;
  ready: boolean[];
  wins: number[];
  games: Result[];
  currentGame?: Result | null;
  gameStartedAt?: string | null;
  halftimeStartedAt?: string | null;
  halftimeReady?: boolean[];
  result?: Result | null;
  series?: MatchSeries | null;
  coachNames?: Array<string | null>;
};
const TIPOFF_COUNTDOWN_MS = 3000;
function seriesSummary(games: Result[]) {
  const players = new Map<string, { name: string; games: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number }>();
  let closest = 0, closestMargin = Infinity, totalMargin = 0;
  let bestGame: { name: string; pts: number; game: number } | null = null;
  games.forEach((game, gameIndex) => {
    const margin = Math.abs(game.score[0] - game.score[1]); totalMargin += margin; if (margin < closestMargin) { closestMargin = margin; closest = gameIndex; }
    game.boxes.flat().forEach(p => { if (!bestGame || p.pts > bestGame.pts) bestGame = { name: p.name, pts: p.pts, game: gameIndex + 1 }; const key = String(p.id); const row = players.get(key) || { name: p.name, games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 }; row.games++; row.pts += p.pts; row.reb += p.reb; row.ast += p.ast; row.stl += p.stl; row.blk += p.blk; row.tov += p.tov; players.set(key, row); });
  });
  const ranked = Array.from(players.values()).sort((a, b) => (b.pts + b.reb * .7 + b.ast * 1.2 + b.stl * 2 + b.blk * 2 - b.tov) / b.games - (a.pts + a.reb * .7 + a.ast * 1.2 + a.stl * 2 + a.blk * 2 - a.tov) / a.games);
  return { mvp: ranked[0], closest: games.length ? { number: closest + 1, margin: closestMargin } : null, averageMargin: games.length ? totalMargin / games.length : 0, bestGame: bestGame as { name: string; pts: number; game: number } | null };
}
export default function MatchSimulation({
  a,
  b,
  teams,
  challengeCode,
  challengeCreator,
  challengeResult,
  challengeBestOf,
  challengeSeries,
  challengeState,
  onSimulationActiveChange,
  onChallengeUpdate,
  era = "current",
  standalone = false,
  experience,
  presetChallengeMode,
  presetBestOf,
}: {
  a: number[];
  b: number[];
  teams: PreviewPlayer[][];
  challengeCode?: string;
  challengeCreator?: ChallengeSetup;
  challengeResult?: Result | null;
  challengeBestOf?: number;
  challengeSeries?: MatchSeries | null;
  challengeState?: ChallengeState | null;
  onSimulationActiveChange?: (active: boolean) => void;
  onChallengeUpdate?: (state: ChallengeState) => void;
  era?: "current" | "alltime";
  standalone?: boolean;
  experience?: "quick" | "challenge";
  presetChallengeMode?: "classic" | "draft";
  presetBestOf?: number;
}) {
  const [plans, setPlans] = useState<Tactic[]>([
    challengeCreator?.tactic || "balanced",
    challengeState?.opponent?.tactic || "balanced",
  ]);
  const [rotations, setRotations] = useState<number[][]>(() =>
    teams.map((team, side) =>
      side === 0 && challengeCreator
        ? challengeCreator.minutes
        : defaultRotation(team),
    ),
  );
  const [secondPlans, setSecondPlans] = useState<Tactic[]>([
    challengeCreator?.secondHalfTactic || "balanced",
    challengeState?.opponent?.secondHalfTactic || "balanced",
  ]);
  const [result, setResult] = useState<Result | null>(challengeResult || null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [running, setRunning] = useState(false),
    [cursor, setCursor] = useState(challengeResult?.plays.length || 0),
    [speed, setSpeed] = useState(1400),
    [halftimePending, setHalftimePending] = useState(false),
    [halftimeApplied, setHalftimeApplied] = useState(!!challengeResult),
    [savedId, setSavedId] = useState<string | null>(null),
    [savedToAccount, setSavedToAccount] = useState<boolean | null>(null),
    [lineupsSaved, setLineupsSaved] = useState(false),
    [shareUrl, setShareUrl] = useState(""),
    [shareCopied, setShareCopied] = useState(false),
    [showFullLineups, setShowFullLineups] = useState(false),
    [bestOf, setBestOf] = useState(challengeBestOf || presetBestOf || 1),
    [challengeMode, setChallengeMode] = useState<"classic" | "salary" | "draft">(presetChallengeMode || "classic"),
    [lobby, setLobby] = useState<ChallengeState | null>(challengeState || null),
    [participantRole, setParticipantRole] = useState<"creator" | "opponent" | "spectator">(challengeState?.role || "spectator"),
    [series, setSeries] = useState<MatchSeries | null>(challengeSeries || null),
    [seriesGame, setSeriesGame] = useState(
      challengeSeries?.games.length ? challengeSeries.games.length - 1 : 0,
    ),
    [syncState, setSyncState] = useState<"live" | "reconnecting" | "offline">("live"),
    [lobbyNotice, setLobbyNotice] = useState(""),
    [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const finishLock = useRef(false);
  const autoJoinLock = useRef(false);
  const autoSavedToken = useRef<string | null>(null);
  const previousLobby = useRef<ChallengeState | null>(challengeState || null);
  const completedResult = useRef<string | null>(null);
  const editableSide = !challengeCode
    ? -1
    : participantRole === "creator"
      ? 0
      : participantRole === "opponent"
        ? 1
        : -2;
  const coaching = !!challengeCode && lobby?.status === "coaching";
  const creatingStandaloneChallenge = standalone && experience === "challenge" && !challengeCode;
  const setupSides = creatingStandaloneChallenge
    ? challengeMode === "draft" ? [] : [0]
    : challengeCode && lobby?.status === "open"
      ? lobby.mode === "draft" ? [] : participantRole === "creator" ? [0] : participantRole === "opponent" ? [1] : []
      : [0, 1];
  const legalSides = teams.map(
    (team) =>
      team.length >= 5 && team.length <= 8 && !!assignLineup(team.slice(0, 5)),
  );
  const legal = legalSides.every(Boolean);
  const validMinuteSides = rotations.map(
    (minutes, side) =>
      minutes.length === teams[side].length &&
      minutes.every((value) => value >= 0 && value <= 48) &&
      Math.abs(minutes.reduce((sum, value) => sum + value, 0) - 240) < 0.05,
  );
  const validMinutes = validMinuteSides.every(Boolean);
  const halftimeIndex = result
    ? result.plays.findIndex((play) => play.period >= 3)
    : -1;
  useEffect(() => {
    if (challengeCode || !running || !result) return;
    const timer = setInterval(
      () =>
        setCursor((n) =>
          Math.min(
            n + 1,
            !halftimeApplied && halftimeIndex > 0
              ? halftimeIndex
              : result.plays.length,
          ),
        ),
      speed,
    );
    return () => clearInterval(timer);
  }, [challengeCode, running, result, speed, halftimeApplied, halftimeIndex]);
  useEffect(() => {
    if (result && cursor >= result.plays.length) setRunning(false);
  }, [cursor, result]);
  useEffect(() => {
    onSimulationActiveChange?.(!!result);
  }, [result, onSimulationActiveChange]);
  useEffect(() => {
    if (
      result &&
      !halftimeApplied &&
      halftimeIndex > 0 &&
      cursor >= halftimeIndex
    ) {
      setCursor(halftimeIndex);
      setRunning(false);
      setHalftimePending(true);
    }
  }, [cursor, result, halftimeApplied, halftimeIndex]);
  useEffect(() => {
    if (!challengeCode || lobby?.status === "completed") return;
    const refresh = async () => {
      try {
      const response = await fetch(`/api/match-challenges?code=${encodeURIComponent(challengeCode)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Lobby sync failed");
      const next = (await response.json()) as ChallengeState;
      setSyncState("live");
      const before = previousLobby.current;
      if (before?.status === "open" && next.status !== "open") setLobbyNotice("Opponent joined the lobby");
      const mySide = next.role === "creator" ? 0 : next.role === "opponent" ? 1 : -1;
      if (before && mySide >= 0 && !before.ready?.[1 - mySide] && next.ready?.[1 - mySide]) setLobbyNotice(`${next.coachNames?.[1 - mySide] || "Opponent"} is ready`);
      if (before && mySide >= 0 && !before.halftimeReady?.[1 - mySide] && next.halftimeReady?.[1 - mySide]) setLobbyNotice(`${next.coachNames?.[1 - mySide] || "Opponent"} is ready for the second half`);
      previousLobby.current = next;
      setLobby(next);
      onChallengeUpdate?.(next);
      if (participantRole === "spectator" && next.role !== "spectator") setParticipantRole(next.role);
      if (next.creator?.ids && next.opponent?.ids) {
        setRotations([next.creator.minutes || [], next.opponent.minutes || []]);
        setPlans([next.creator.tactic, next.opponent.tactic]);
      }
      if (next.currentGame) {
        setResult(next.currentGame);
        setHalftimeApplied(true);
      } else if (next.games?.length && next.games.length !== (lobby?.games?.length || 0)) {
        const game = next.games[next.games.length - 1];
        setResult(game);
        setCursor(game.plays.length);
        setSeriesGame(next.games.length - 1);
      }
      if (next.series) setSeries(next.series);
      } catch {
        setSyncState((current) => current === "reconnecting" ? "offline" : "reconnecting");
      }
    };
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [challengeCode, lobby?.status, lobby?.games?.length, onChallengeUpdate, participantRole]);
  useEffect(() => {
    if (!lobbyNotice) return;
    const timer = window.setTimeout(() => setLobbyNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [lobbyNotice]);
  useEffect(() => {
    if (!challengeCode || lobby?.status !== "playing_first_half") return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [challengeCode, lobby?.status]);
  useEffect(() => {
    if (
      !challengeCode ||
      lobby?.mode !== "draft" ||
      lobby.status !== "open" ||
      participantRole !== "opponent" ||
      autoJoinLock.current
    ) return;
    autoJoinLock.current = true;
    void start().finally(() => {
      autoJoinLock.current = false;
    });
  }, [challengeCode, lobby?.mode, lobby?.status, participantRole]);
  useEffect(() => {
    if (!challengeCode || !result || !lobby) return;
    const half = result.plays.findIndex((play) => play.period >= 3);
    const tick = () => {
      if (lobby.status === "playing_first_half" && lobby.gameStartedAt) {
        setCursor(Math.min(half, Math.max(0, Math.floor((Date.now() - new Date(lobby.gameStartedAt).getTime() - TIPOFF_COUNTDOWN_MS) / speed))));
      } else if (lobby.status === "halftime") setCursor(half);
      else if (lobby.status === "playing_second_half" && lobby.halftimeStartedAt) {
        const next = Math.min(result.plays.length, half + Math.max(0, Math.floor((Date.now() - new Date(lobby.halftimeStartedAt).getTime()) / speed)));
        setCursor(next);
        if (next >= result.plays.length && !finishLock.current) {
          finishLock.current = true;
          fetch(`/api/match-challenges/${challengeCode}/finish`, { method: "POST" }).then(async response => {
            const data = await response.json(); if (!response.ok) throw Error(data.error);
            if (data.status === "syncing") return;
            const refreshed = { ...lobby, ...data, currentGame: null } as ChallengeState; setLobby(refreshed); onChallengeUpdate?.(refreshed);
            if (data.series) setSeries(data.series);
          }).catch(event => setError(event.message)).finally(() => { finishLock.current = false; });
        }
      }
    };
    tick(); const timer = setInterval(tick, 100); return () => clearInterval(timer);
  }, [challengeCode, result, lobby, onChallengeUpdate, speed]);
  async function start(resumeAtHalftime = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setRunning(false);
    try {
      if (challengeCode && lobby?.status === "open") {
        const res = await fetch(
          `/api/match-challenges/${challengeCode}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ opponent: sideSetup(1) }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw Error(data.error || "Challenge failed.");
        const next = { ...lobby, ...data, opponent: data.opponent || sideSetup(1), role: "opponent", ready: [false, false] } as ChallengeState;
        setLobby(next);
        setParticipantRole("opponent");
        onChallengeUpdate?.(next);
        return;
      }
      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          a,
          b,
          plans,
          rotations,
          era,
          ...(resumeAtHalftime && result
            ? {
                secondHalfPlans: secondPlans,
                simulationToken: result.simulationToken,
              }
            : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw Error(d.error || "Simulation failed.");
      setResult(d);
      if (!resumeAtHalftime) trackEvent("simulation_started", { era, experience: experience || "embedded" });
      if (resumeAtHalftime) {
        const nextHalf = d.plays.findIndex(
          (play: Simulation["plays"][number]) => play.period >= 3,
        );
        setCursor(nextHalf);
        setHalftimeApplied(true);
        setHalftimePending(false);
      } else {
        setSecondPlans([...plans]);
        setCursor(0);
        setHalftimeApplied(false);
        setHalftimePending(false);
      }
      setRunning(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function markReady() {
    if (!challengeCode || editableSide < 0 || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/match-challenges/${challengeCode}/ready`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: sideSetup(editableSide), role: participantRole }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to update readiness.");
      if (data.game) {
        setResult(data.game); setCursor(0); setRunning(false);
        setSeriesGame((data.games || []).length);
      }
      if (data.series) setSeries(data.series);
      const next = { ...lobby!, ...data, currentGame: data.game || lobby?.currentGame, ready: data.ready || [false, false], games: data.games || data.series?.games || lobby?.games || [], wins: data.wins || data.series?.wins || lobby?.wins || [0, 0] };
      setLobby(next); onChallengeUpdate?.(next);
    } catch (event) { setError((event as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function markHalftimeReady() {
    if (!challengeCode || editableSide < 0 || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/match-challenges/${challengeCode}/halftime`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: participantRole }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to continue the game.");
      const next = { ...lobby!, ...data } as ChallengeState; setLobby(next); onChallengeUpdate?.(next);
    } catch (event) { setError((event as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  function sideSetup(side: number): ChallengeSetup {
    return {
      ids: side === 0 ? a : b,
      minutes: rotations[side],
      tactic: plans[side],
      secondHalfTactic:
        side === 0 && challengeCreator
          ? challengeCreator.secondHalfTactic
          : result
            ? secondPlans[side]
            : plans[side],
    };
  }
  async function createChallenge() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/match-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: sideSetup(0), bestOf, mode: challengeMode, era }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to create challenge.");
      trackEvent("challenge_created", { era, mode: challengeMode, best_of: bestOf });
      const origin = standalone ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "") : window.location.origin;
      const url = `${origin}${standalone ? "/full-court/play" : "/matchups"}?challenge=${data.code}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      // The creator must enter the shared lobby too. Staying on the plain
      // simulator leaves this tab without a participant role or Ready button.
      window.location.assign(url);
    } catch (event) {
      setError((event as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function copyInviteLink() {
    if (!challengeCode) return;
    const origin = standalone ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "") : window.location.origin;
    const url = `${origin}${standalone ? "/full-court/play" : "/matchups"}?challenge=${challengeCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setShareUrl(url);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2500);
  }
  async function saveMatch() {
    if (!result?.simulationToken || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sides: [sideSetup(0), sideSetup(1)],
          simulationToken: result.simulationToken,
          era,
          title: `${result.profiles[0][0].name} vs ${result.profiles[1][0].name}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "Unable to save match.");
      setSavedId(data.id);
      setSavedToAccount(data.signedIn === true);
      trackEvent("match_saved", { account: data.signedIn === true ? "signed_in" : "guest", era });
    } catch (event) {
      setError((event as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveLineups() {
    if (!result || lineupsSaved || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      for (const side of [0, 1]) {
        const response = await fetch("/api/lineups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Lineup ${side === 0 ? "A" : "B"} · ${result.profiles[side][0].name}`, era, side: sideSetup(side) }) });
        const data = await response.json(); if (!response.ok) throw Error(data.error || "Unable to save lineups.");
      }
      setLineupsSaved(true);
      trackEvent("lineups_saved", { era });
    } catch (event) { setError((event as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const current = result?.plays[cursor - 1],
    finished = !!result && cursor >= result.plays.length,
    score = finished && result ? result.score : current?.score || [0, 0];
  useEffect(() => {
    if (!finished || !result) return;
    const key = result.simulationToken || `${result.score[0]}-${result.score[1]}-${result.plays.length}`;
    if (completedResult.current === key) return;
    completedResult.current = key;
    const margin = Math.abs(result.score[0] - result.score[1]);
    trackEvent("simulation_completed", {
      era,
      experience: challengeCode ? "challenge" : experience || "embedded",
      margin_band: margin <= 5 ? "close" : margin <= 15 ? "medium" : "wide",
    });
  }, [challengeCode, era, experience, finished, result]);
  useEffect(() => {
    const token = result?.simulationToken;
    if (!standalone || challengeCode || !finished || !token || savedId || autoSavedToken.current === token) return;
    autoSavedToken.current = token;
    void saveMatch();
  }, [standalone, challengeCode, finished, result?.simulationToken, savedId]);
  const activeGames = series?.games || lobby?.games || [];
  const seriesStats = seriesSummary(activeGames);
  const drafting = !!challengeCode && lobby?.status === "drafting";
  const showSetup = (!result || coaching) && !drafting;
  const tipoffRemaining = challengeCode && lobby?.status === "playing_first_half" && lobby.gameStartedAt
    ? Math.max(0, Math.ceil((TIPOFF_COUNTDOWN_MS - (now - new Date(lobby.gameStartedAt).getTime())) / 1000))
    : 0;
  const sideLobbyStatus = (side: number) => {
    if (!lobby) return "WAITING";
    if (lobby.status === "drafting") return `${(side === 0 ? lobby.creator?.ids : lobby.opponent?.ids)?.length || 0}/8 PICKED`;
    if (lobby.status === "open") return side === 0 || lobby.opponent ? "JOINED" : "WAITING";
    return lobby.ready?.[side] ? "READY" : "WAITING";
  };
  const lobbyPhase = ({ open: "Waiting for opponent", drafting: "Live draft", coaching: "Between games", playing_first_half: "First half live", halftime: "Halftime", playing_second_half: "Second half live", completed: "Series complete" } as Record<string, string>)[lobby?.status || ""] || "Lobby ready";
  async function copyShareCard() {
    if (!activeGames.length) return;
    const wins = series?.wins || lobby?.wins || [0, 0], mvp = seriesStats.mvp;
    const origin = standalone ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "") : window.location.origin;
    const link = challengeCode ? `${origin}${standalone ? "/full-court/play" : "/matchups"}?challenge=${challengeCode}` : window.location.href;
    const text = [`🏀 ${standalone ? "FIVEOUT" : "QNBA Arena"} · BO${challengeBestOf || bestOf}`, `Lineup A ${wins[0]}–${wins[1]} Lineup B`, activeGames.map((g, i) => `G${i + 1}: ${g.score[0]}–${g.score[1]}`).join(" · "), mvp ? `⭐ Series MVP: ${mvp.name} — ${(mvp.pts / mvp.games).toFixed(1)} PPG, ${(mvp.reb / mvp.games).toFixed(1)} RPG, ${(mvp.ast / mvp.games).toFixed(1)} APG` : "", link].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text); setShareCopied(true); window.setTimeout(() => setShareCopied(false), 2500);
  }
  async function copyGameResult() {
    if (!result) return;
    if (activeGames.length) return copyShareCard();
    const winner = result.score[0] === result.score[1] ? "Draw" : `Lineup ${result.score[0] > result.score[1] ? "A" : "B"} wins`;
    const top = result.boxes.flat().sort((x, y) => y.pts - x.pts)[0];
    const text = [
      `🏀 ${standalone ? "FIVEOUT" : "QNBA Arena"}`,
      `FINAL · Lineup A ${result.score[0]}–${result.score[1]} Lineup B`,
      winner,
      top ? `⭐ Top scorer: ${top.name} · ${top.pts} PTS` : "",
      window.location.href,
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2500);
  }
  return (
    <section className={`rounded-2xl border p-6 space-y-5 ${standalone ? "border-cyan-300/20 bg-gradient-to-br from-cyan-400/[.07] via-[#0a1020] to-violet-500/[.06]" : "border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card to-card"}`}>
      {showSetup && <div className="flex justify-between items-start gap-4">
        <div>
          <p className={`text-xs uppercase tracking-widest font-bold ${standalone ? "text-cyan-300" : "text-orange-500"}`}>
            {standalone ? "FIVEOUT · Match setup" : "QNBA Arena · Experimental"}
          </p>
          <h2 className="text-2xl font-bold mt-1">
            {standalone ? (experience === "challenge" ? challengeCode && lobby?.mode === "draft" && lobby.status === "open" ? "Draft lobby ready. Send the invite." : creatingStandaloneChallenge && challengeMode === "draft" ? "Create the room. Draft together." : "Build your team. Send the invite." : "Build both sides. Set the plan. Tip off.") : "Your rotation. Their rotation. Tip-off."}
          </h2>
          <p className="text-sm text-foreground/60 mt-2">
            {challengeCode
              ? drafting ? `Live BO${challengeBestOf || bestOf} draft. Both coaches build their teams one pick at a time.` : lobby?.mode === "draft" && lobby.status === "open" ? "The room is empty and ready. The draft starts automatically when your friend opens the invite." : participantRole === "creator" && lobby?.status === "open" ? "Your team is locked in. Share the invite and wait for your opponent to finish theirs." : participantRole === "opponent" && lobby?.status === "open" ? "Build Lineup B, set the rotation, then join the shared lobby." : `A shared BO${challengeBestOf || bestOf} series both players can reopen.`
              : creatingStandaloneChallenge && challengeMode === "draft" ? "Create an empty lobby. The draft begins automatically when your friend opens the invite." : creatingStandaloneChallenge ? "Build only your lineup. Your friend builds the opponent after opening the invite." : "A statistical basketball sandbox, not a real-world prediction."}
          </p>
        </div>
        {challengeCode && !result && (
          <a
            href={standalone ? "/full-court/play" : "/matchups"}
            className={`${button} shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10`}
          >
            Leave challenge
          </a>
        )}
      </div>}
      {challengeCode && lobby && (
        <section className={`rounded-2xl border p-4 ${standalone ? "border-violet-400/30 bg-violet-400/[.08]" : "bg-background/40"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest"><span className="rounded-full border border-violet-400/30 px-2.5 py-1 text-violet-300">BO{challengeBestOf || bestOf}</span><span className="rounded-full border border-cyan-300/25 px-2.5 py-1 text-cyan-300">{lobby.mode || challengeMode}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-300">{era}</span></div>
              <h3 className="mt-3 text-lg font-black">{lobbyPhase}</h3>
              <p className="text-sm text-foreground/60">You control {participantRole === "creator" ? "Lineup A" : participantRole === "opponent" ? "Lineup B" : "spectator view"} · Game {(lobby.games?.length || 0) + (lobby.status === "completed" ? 0 : 1)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className={`h-2.5 w-2.5 rounded-full ${syncState === "live" ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : syncState === "reconnecting" ? "animate-pulse bg-amber-400" : "bg-red-400"}`}/><span className={syncState === "live" ? "text-emerald-300" : syncState === "reconnecting" ? "text-amber-300" : "text-red-300"}>{syncState === "live" ? "Live sync" : syncState === "reconnecting" ? "Reconnecting…" : "Connection lost"}</span><span className="text-slate-500">·</span><span className="text-cyan-300">{lobby.coachNames?.[0] || "Home Coach"}</span><span className="text-slate-500">vs</span><span className="text-violet-300">{lobby.coachNames?.[1] || (lobby.status === "open" ? "Waiting for opponent" : "Away Coach")}</span></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2"><div className="grid min-w-60 grid-cols-2 gap-2 text-center text-xs font-bold"><div className={`rounded-xl border p-3 ${lobby.ready?.[0] ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-slate-400"}`}>LINEUP A<br/>{sideLobbyStatus(0)}</div><div className={`rounded-xl border p-3 ${lobby.ready?.[1] ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-slate-400"}`}>LINEUP B<br/>{sideLobbyStatus(1)}</div></div>{lobby.status === "open" && participantRole === "creator" && <button className={`${button} border-violet-300/30 bg-violet-400 text-[#080811] font-black`} onClick={() => void copyInviteLink()}>{shareCopied ? "Invite copied!" : "Copy invite link"}</button>}</div>
          </div>
          {shareUrl && lobby.status === "open" && <p className="mt-3 break-all rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">{shareUrl}</p>}
        </section>
      )}
      {lobbyNotice && <div role="status" className="animate-pulse rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-300">✓ {lobbyNotice}</div>}
      {tipoffRemaining > 0 && <div className="fixed inset-0 z-50 grid place-items-center bg-[#050914]/80 backdrop-blur-sm"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.35em] text-cyan-300">Both coaches ready</p><p className="my-3 text-[8rem] font-black leading-none text-white drop-shadow-[0_0_35px_rgba(103,232,249,.55)]">{tipoffRemaining}</p><p className="text-xl font-black uppercase tracking-[.2em] text-violet-300">Tip-off</p></div></div>}
      {showSetup && !standalone && <MatchLineups teams={result ? result.profiles : teams} />}
      {showSetup && setupSides.length > 0 && (
        <section className="rounded-xl border bg-background/40 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Rotation minutes</h3>
              <p className="text-xs text-foreground/60">
                Set each player's role. Every side must total exactly 240
                minutes.
              </p>
            </div>
            <button
              className={button}
              onClick={() =>
                setRotations(
                  teams.map((team, side) =>
                    side === 0 && challengeCreator
                      ? challengeCreator.minutes
                      : defaultRotation(team),
                  ),
                )
              }
            >
              Auto-allocate minutes
            </button>
          </div>
          <div className={`grid gap-4 ${setupSides.length > 1 ? "md:grid-cols-2" : ""}`}>
            {setupSides.map((side) => {
              const team = teams[side];
              const total =
                rotations[side]?.reduce((sum, value) => sum + value, 0) || 0;
              return (
                <div key={side} className="rounded-xl border p-3">
                  <div className="flex justify-between mb-2">
                    <strong>Lineup {side === 0 ? "A" : "B"}</strong>
                    <span
                      className={
                        Math.abs(total - 240) < 0.05
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }
                    >
                      {total.toFixed(1)} / 240 MIN
                    </span>
                  </div>
                  {team.map((player, index) => {
                    const value = rotations[side]?.[index] || 0;
                    const unusual =
                      index < 5 ? value < 20 || value > 42 : value > 30;
                    return (
                      <label
                        key={player.id}
                        className="grid grid-cols-[1fr_5rem] items-center gap-3 border-t py-2 text-sm"
                      >
                        <span>
                          {player.name}
                          <span className="block text-xs text-foreground/50">
                            {index < 5 ? "Starter" : "Bench"}
                            {unusual ? " · unusual workload" : ""}
                          </span>
                        </span>
                        <input
                          aria-label={`${player.name} minutes`}
                          type="number"
                          min={0}
                          max={48}
                          step={0.5}
                          value={value}
                          disabled={!!challengeCode && side !== editableSide}
                          onChange={(event) => {
                            const next = rotations.map((row) => [...row]);
                            next[side][index] = Math.max(
                              0,
                              Math.min(48, Number(event.target.value)),
                            );
                            setRotations(next);
                          }}
                          className="rounded-lg border bg-background p-2 text-right"
                        />
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {showSetup && setupSides.length > 0 && <div className={`grid gap-4 ${setupSides.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {setupSides.map((side) => (
          <label key={side} className="text-sm font-semibold">
            Lineup {side === 0 ? "A" : "B"} tactic
            <select
              aria-label={`Lineup ${side === 0 ? "A" : "B"} tactic`}
              value={plans[side]}
              disabled={
                busy ||
                running ||
                halftimePending ||
                (!!challengeCode && side !== editableSide)
              }
              onChange={(e) =>
                setPlans(
                  plans.map((p, i) =>
                    i === side ? (e.target.value as Tactic) : p,
                  ),
                )
              }
              className="block w-full rounded-xl border bg-background p-3 mt-2"
            >
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-foreground/60 mt-2">
              {tacticInfo[plans[side]].description}
            </span>
          </label>
        ))}
      </div>}
      {showSetup && setupSides.length > 0 && <p className="text-xs text-foreground/60">
        The first five must cover G / G / F / F / C. Add up to three bench
        players; their season minutes determine an abstract 240-minute rotation.
      </p>}
      {drafting && <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-400">Live draft</p><h3 className="mt-1 text-xl font-black">The draft board is below</h3><p className="mt-1 text-sm text-foreground/60">Picks are saved by the server and appear on both screens automatically.</p></section>}
      <div className="flex flex-wrap gap-3 items-center">
        {(!challengeCode || !result || coaching) &&
        (!standalone || experience !== "challenge" || !!challengeCode) && <button
          className={`${button} ${standalone ? "bg-cyan-300 text-[#06101a] hover:bg-cyan-200" : "bg-orange-500 text-black hover:bg-orange-400"}`}
          disabled={
            busy ||
            running ||
            (lobby?.mode !== "draft" && (!legal || !validMinutes)) ||
            (challengeCode && lobby?.status === "open" && participantRole === "creator") ||
            (!!challengeCode && lobby?.status !== "open")
          }
          onClick={() => void start()}
        >
          {busy
            ? "Simulating…"
            : challengeCode
              ? lobby?.status === "open"
                ? participantRole === "creator" ? "Waiting for opponent…" : lobby.mode === "draft" ? "Joining draft…" : "Lock team & join lobby"
                : lobby?.status === "completed" ? "Challenge completed" : "Series in progress"
              : result
                ? "Simulate a new match"
                : "Simulate match"}
        </button>}
        {!challengeCode && !result && experience !== "quick" && (
          <div className={`${standalone ? "w-full rounded-2xl border border-violet-400/20 bg-violet-400/[.055] p-4" : "contents"}`}>
            {standalone && <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.24em] text-violet-300">Create the room</p><h3 className="mt-1 text-lg font-black">Your invite settings are locked in.</h3></div>}
            <div className="flex flex-wrap items-end gap-3">
            {!standalone && <label className="text-sm font-semibold">
              Series{" "}
              <select
                aria-label="Challenge format"
                className="rounded-lg border bg-background p-2"
                value={bestOf}
                onChange={(event) => setBestOf(Number(event.target.value))}
              >
                {[1, 3, 5, 7].map((value) => (
                  <option key={value} value={value}>
                    BO{value}
                  </option>
                ))}
              </select>
            </label>}
            {!standalone && <label className="text-sm font-semibold">
              Roster rules{" "}
              <select aria-label="Challenge mode" className="rounded-lg border bg-background p-2" value={challengeMode} onChange={(event) => setChallengeMode(event.target.value as typeof challengeMode)}>
                <option value="classic">Classic</option>
                {era === "current" && <option value="salary">Salary cap · 160</option>}
                <option value="draft">Draft · unique players</option>
              </select>
            </label>}
            {standalone && <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest"><span className="rounded-full border border-cyan-300/25 px-3 py-2 text-cyan-300">{era}</span><span className="rounded-full border border-violet-400/25 px-3 py-2 text-violet-300">{challengeMode === "draft" ? "Live Draft" : "Classic"}</span><span className="rounded-full border border-white/10 px-3 py-2">BO{bestOf}</span></div>}
            <button
              className={`${button} ${standalone ? "border-violet-300/30 bg-violet-400 text-[#080811] font-black" : ""}`}
              disabled={busy || (challengeMode !== "draft" && (!legalSides[0] || !validMinuteSides[0]))}
              onClick={() => void createChallenge()}
            >
              {challengeMode === "draft" ? "Create draft lobby & copy invite" : "Create challenge & copy invite"}
            </button>
            </div>
            {standalone && <p className="mt-3 text-xs text-slate-400">Classic starts from Lineup A. Live draft starts both coaches at zero and alternates every pick.</p>}
          </div>
        )}
        {result && !challengeCode && (
          <>
            <button
              className={button}
              disabled={busy || halftimePending}
              onClick={() => {
                if (finished) setCursor(0);
                setRunning(!running);
              }}
            >
              {finished
                ? "Watch this match again"
                : running
                  ? "Pause"
                  : "Resume"}
            </button>
            <button
              className={button}
              disabled={finished || busy}
              onClick={() => {
                if (!halftimeApplied && halftimeIndex > 0) {
                  setCursor(halftimeIndex);
                  setHalftimePending(true);
                } else {
                  setCursor(result.plays.length);
                  setRunning(false);
                }
              }}
            >
              {!halftimeApplied ? "Skip to halftime" : "Skip to final"}
            </button>
            <label className="text-sm">
              Playback{" "}
              <select
                aria-label="Playback speed"
                className="rounded border bg-background p-2"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={1400}>Very slow</option>
                <option value={500}>Slow</option>
                <option value={100}>Fast</option>
                <option value={25}>Instant pace</option>
              </select>
            </label>
          </>
        )}
      </div>
      {challengeCode && lobby?.status === "coaching" && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <div><p className="text-xs uppercase tracking-widest text-emerald-500 font-bold">Between-game coaching</p><h3 className="font-bold">Game {(lobby.games?.length || 0) + 1} · Lineup A {lobby.wins?.[0] || 0}–{lobby.wins?.[1] || 0} Lineup B</h3><p className="text-sm text-foreground/60">Players stay locked. Change minutes and tactics, then both coaches must be ready.</p></div>
            <div className="text-sm">A {lobby.ready?.[0] ? "✓ Ready" : "Waiting"} · B {lobby.ready?.[1] ? "✓ Ready" : "Waiting"}</div>
          </div>
          {editableSide >= 0 ? <button className={`${button} bg-emerald-500 text-black`} disabled={busy || !legalSides[editableSide] || !validMinuteSides[editableSide] || !!lobby.ready?.[editableSide]} onClick={() => void markReady()}>{lobby.ready?.[editableSide] ? "Waiting for the other coach…" : `Ready Lineup ${editableSide === 0 ? "A" : "B"}`}</button> : <p className="text-sm">Spectator view · this lobby updates automatically.</p>}
        </section>
      )}
      {challengeCode && result && (lobby?.status === "playing_first_half" || lobby?.status === "halftime") && cursor >= halftimeIndex && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
          <p className="text-xs uppercase tracking-widest text-amber-500 font-bold">Synchronized halftime</p><h3 className="text-xl font-bold">Both coaches must confirm the second half</h3><p className="text-sm text-foreground/60">The shared game is paused for everyone. The same second-half timeline starts for both screens only after A and B are ready.</p>
          <HalftimeCoachingReport result={result} />
          <p className="text-sm">A {lobby.halftimeReady?.[0] ? "✓ Ready" : "Waiting"} · B {lobby.halftimeReady?.[1] ? "✓ Ready" : "Waiting"}</p>
          {editableSide >= 0 && <button className={`${button} bg-amber-500 text-black`} disabled={busy || !!lobby.halftimeReady?.[editableSide]} onClick={() => void markHalftimeReady()}>{lobby.halftimeReady?.[editableSide] ? "Waiting for the other coach…" : `Ready Lineup ${editableSide === 0 ? "A" : "B"} for second half`}</button>}
        </section>
      )}
      {(lobby?.mode === "salary" || challengeMode === "salary") && (
        <div className="grid grid-cols-2 gap-3 text-sm">{teams.map((team, side) => { const cost = team.reduce((sum, player) => sum + (player.cost || 0), 0); return <p key={side} className={`rounded-xl border p-3 ${cost > 160 ? "text-red-500" : "text-emerald-500"}`}>Lineup {side === 0 ? "A" : "B"}: {cost}/160 salary</p>; })}</div>
      )}
      {shareUrl && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm break-all">
          Challenge link copied:{" "}
          <a className="underline" href={shareUrl}>
            {shareUrl}
          </a>
        </p>
      )}
      {result && halftimePending && !halftimeApplied && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-500 font-bold">
              Halftime adjustment
            </p>
            <h3 className="text-xl font-bold">Change the second-half plan</h3>
            <p className="text-sm text-foreground/60 mt-1">
              The first half is locked. Applying changes reruns only the same
              signed match timeline with your new second-half tactics.
            </p>
          </div>
          <HalftimeCoachingReport result={result} />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((side) => (
              <label key={side} className="text-sm font-semibold">
                Lineup {side === 0 ? "A" : "B"}
                <select
                  aria-label={`Lineup ${side === 0 ? "A" : "B"} second-half tactic`}
                  value={secondPlans[side]}
                  disabled={busy}
                  onChange={(e) =>
                    setSecondPlans(
                      secondPlans.map((plan, i) =>
                        i === side ? (e.target.value as Tactic) : plan,
                      ),
                    )
                  }
                  className="block w-full rounded-xl border bg-background p-3 mt-2"
                >
                  {Object.entries(labels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className={`${button} bg-amber-500 text-black hover:bg-amber-400`}
            disabled={busy}
            onClick={() => void start(true)}
          >
            {busy ? "Applying…" : "Start second half"}
          </button>
        </section>
      )}
      {result && !challengeCode && (
        <p className="text-xs text-foreground/60">
          Simulate a new match calculates a fresh outcome with your selected
          tactics. Watch this match again only replays the existing result.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
      {result && (
        <>
          {challengeCode && (
            <div className="flex justify-end">
              <a
                href={standalone ? "/full-court/play" : "/matchups"}
                className={`${button} border-red-500/30 text-red-400 hover:bg-red-500/10`}
              >
                Leave challenge
              </a>
            </div>
          )}
          {series && (
            <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-violet-500 font-bold">
                    BO{series.bestOf} series
                  </p>
                  <h3 className="text-xl font-bold">
                    Lineup A {series.wins[0]}–{series.wins[1]} Lineup B
                  </h3>
                  <p className="text-sm text-foreground/60">
                    Lineup {series.winner === 0 ? "A" : "B"} won the series ·
                    first to {series.needed}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {series.games.map((game, index) => (
                    <button
                      key={index}
                      className={`${button} ${seriesGame === index ? "border-violet-500 bg-violet-500/15" : ""}`}
                      onClick={() => {
                        setSeriesGame(index);
                        setResult(game);
                        setCursor(game.plays.length);
                        setRunning(false);
                      }}
                    >
                      Game {index + 1} · {game.score[0]}–{game.score[1]}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
          {activeGames.length > 0 && (series || coaching) && (
            <section className="rounded-2xl border p-5 space-y-4">
              <div className={`overflow-hidden rounded-2xl border p-5 sm:p-7 ${standalone ? "border-cyan-300/20 bg-gradient-to-br from-cyan-300/10 via-violet-500/5 to-[#080d19]" : "border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-violet-500/5 to-sky-500/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4"><div><p className={`text-xs uppercase tracking-[.25em] font-black ${standalone ? "text-cyan-300" : "text-orange-500"}`}>{standalone ? "FIVEOUT" : "QNBA Arena"} · BO{challengeBestOf || bestOf}</p><h3 className="mt-2 text-3xl font-black">Lineup A <span className={standalone ? "text-cyan-300" : "text-orange-500"}>{(series?.wins || lobby?.wins || [0, 0])[0]}</span><span className="mx-3 text-foreground/30">:</span><span className={standalone ? "text-violet-300" : "text-sky-500"}>{(series?.wins || lobby?.wins || [0, 0])[1]}</span> Lineup B</h3><p className="mt-2 text-sm text-foreground/60">{series ? `Series won by Lineup ${series.winner === 0 ? "A" : "B"}` : `Game ${activeGames.length + 1} is next`}</p></div><button className={`${button} ${standalone ? "border-cyan-300/30 bg-cyan-300 text-[#06101a] hover:bg-cyan-200" : "border-orange-500/40 bg-orange-500 text-black hover:bg-orange-400"}`} onClick={() => void copyShareCard()}>{shareCopied ? "Copied ✓" : "Copy result & link"}</button></div>
                <div className="mt-6 flex flex-wrap gap-2">{activeGames.map((game, index) => <span key={index} className="rounded-full border bg-background/60 px-3 py-1 text-sm font-bold">G{index + 1} · {game.score[0]}–{game.score[1]}</span>)}</div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs uppercase text-violet-400">Series MVP</p><p className="mt-1 font-black">{seriesStats.mvp?.name || "Pending"}</p>{seriesStats.mvp && <p className="text-xs text-foreground/60">{(seriesStats.mvp.pts / seriesStats.mvp.games).toFixed(1)} PPG · {(seriesStats.mvp.reb / seriesStats.mvp.games).toFixed(1)} RPG · {(seriesStats.mvp.ast / seriesStats.mvp.games).toFixed(1)} APG</p>}</div><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs uppercase text-emerald-400">Top performance</p><p className="mt-1 font-black">{seriesStats.bestGame?.name || "Pending"}</p><p className="text-xs text-foreground/60">{seriesStats.bestGame ? `${seriesStats.bestGame.pts} PTS · Game ${seriesStats.bestGame.game}` : ""}</p></div><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs uppercase text-sky-400">Closest game</p><p className="mt-1 font-black">{seriesStats.closest ? `Game ${seriesStats.closest.number}` : "Pending"}</p><p className="text-xs text-foreground/60">{seriesStats.closest?.margin} point margin</p></div><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs uppercase text-orange-400">Average margin</p><p className="mt-1 font-black">{seriesStats.averageMargin.toFixed(1)} points</p><p className="text-xs text-foreground/60">Across {activeGames.length} game{activeGames.length === 1 ? "" : "s"}</p></div></div>
              </div>
            </section>
          )}
          <div className="rounded-2xl bg-background/80 border p-6 text-center">
            <p className="text-xs uppercase tracking-widest text-foreground/60">
              {finished
                ? "Final"
                : current
                  ? `${current.period <= 4 ? `Q${current.period}` : `OT${current.period - 4}`} · ${current.clock}`
                  : "Tip-off"}
            </p>
            <div className="grid grid-cols-3 items-center gap-4 my-5">
              <div>
                <p className="font-bold text-orange-500">LINEUP A</p>
                <p className="text-xs text-foreground/60">
                  {labels[result.tactics[0]]}
                </p>
              </div>
              <p className="text-4xl sm:text-6xl font-black tabular-nums whitespace-nowrap">
                {score[0]} <span className="text-foreground/30">:</span>{" "}
                {score[1]}
              </p>
              <div>
                <p className="font-bold text-sky-500">LINEUP B</p>
                <p className="text-xs text-foreground/60">
                  {labels[result.tactics[1]]}
                </p>
              </div>
            </div>
            <p className="font-semibold min-h-6">
              {finished
                ? score[0] === score[1]
                  ? "Draw after six overtimes"
                  : `Lineup ${score[0] > score[1] ? "A" : "B"} wins by ${Math.abs(score[0] - score[1])}!`
                : running
                  ? "Match in progress"
                  : "Playback paused"}
            </p>
            <div className="h-1 bg-foreground/10 rounded mt-4 overflow-hidden">
              <div
                className="h-full bg-orange-500"
                style={{ width: `${(100 * cursor) / result.plays.length}%` }}
              />
            </div>
          </div>
          <TacticalCourt result={result} cursor={cursor} speed={speed} />
          <section className="rounded-xl border bg-background/40 p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
              {result.profiles.map((team, side) => (
                <div key={side} className="min-w-0">
                  <p className={`text-xs font-bold uppercase ${side === 0 ? "text-orange-500" : "text-sky-500"}`}>
                    Lineup {side === 0 ? "A" : "B"} starters
                  </p>
                  <p className="mt-1 truncate text-sm text-foreground/70">
                    {team.slice(0, 5).map((player) => player.name).join(" · ")}
                  </p>
                </div>
              ))}
              <button
                className={button}
                onClick={() => {
                  setShowFullLineups(true);
                  window.setTimeout(
                    () =>
                      document
                        .getElementById("full-match-lineups")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    0,
                  );
                }}
              >
                View full lineups
              </button>
            </div>
          </section>
          <MatchInsights result={result} cursor={cursor} />
          <div className="rounded-xl border bg-background/40 p-4">
            <h3 className="font-bold mb-3">Play-by-play</h3>
            <div className="h-52 overflow-y-auto space-y-2">
              {result.plays
                .slice(Math.max(0, cursor - 12), cursor)
                .reverse()
                .map((p, i) => {
                  const index = cursor - i - 1;
                  const presentation = playPresentation(p, result.plays[index - 1]);
                  return (
                  <p key={index} className={`rounded-r-lg border-l-2 py-1 pl-3 pr-2 text-sm ${p.side === 0 ? "border-orange-500" : "border-sky-500"} ${presentation.important ? "bg-amber-500/10" : ""}`}>
                    <span className="text-foreground/50 tabular-nums">
                      {p.period <= 4 ? `Q${p.period}` : `OT${p.period - 4}`}{" "}
                      {p.clock} ·{" "}
                    </span>
                    {presentation.label && <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-400">{presentation.label}</span>}
                    {p.text}
                  </p>
                )})}
              {cursor === 0 && (
                <p className="text-sm text-foreground/60">Ready for tip-off.</p>
              )}
            </div>
          </div>
          {showFullLineups && (
            <section id="full-match-lineups" className="scroll-mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">Full lineups</h3>
                <button
                  className={button}
                  onClick={() => setShowFullLineups(false)}
                >
                  Hide full lineups
                </button>
              </div>
              <MatchLineups teams={result.profiles} />
            </section>
          )}
          {finished && (
            <>
              <FinalGameSummary
                result={result}
                shared={!!challengeCode}
                onRematch={!challengeCode ? () => void start() : undefined}
                onShare={() => void copyGameResult()}
              />
              {shareCopied && <p role="status" className="text-sm font-semibold text-emerald-500">Result and link copied ✓</p>}
              <div className="flex flex-wrap gap-3">
                {!challengeCode && (
                  <button
                    className={button}
                    disabled={busy || !!savedId}
                    onClick={() => void saveMatch()}
                  >
                    {savedId ? "Saved to match history" : "Save match"}
                  </button>
                )}
                <a className={button} href={standalone ? "/full-court/history" : "/matches"}>
                  Open match history
                </a>
                {standalone && savedToAccount && <button className={button} disabled={busy || lineupsSaved} onClick={() => void saveLineups()}>{lineupsSaved ? "Both lineups saved" : "Save both lineups"}</button>}
                {!challengeCode && (
                  <button
                    className={button}
                    onClick={() => {
                      setResult(null);
                      setCursor(0);
                      setSavedId(null);
                      setSavedToAccount(null);
                      setLineupsSaved(false);
                    }}
                  >
                    Edit rotations
                  </button>
                )}
              </div>
              {standalone && savedId && savedToAccount === false && <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[.07] p-4"><p className="font-bold">Keep this matchup and track your record.</p><p className="mt-1 text-sm text-foreground/60">It is saved in this browser for now. Sign in to keep your history across devices.</p><a href="/full-court/account" className="mt-3 inline-block rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-[#06101a]">Create or sign in to your account</a></div>}
              <section className="rounded-xl border p-4">
                <h3 className="font-bold">{standalone ? "League scoring reference" : "NBA scoring reference"}</h3>
                <p className="text-sm text-foreground/70 mt-2">
                  This game totaled{" "}
                  <strong>{result.score[0] + result.score[1]}</strong> points
                  with a{" "}
                  <strong>{Math.abs(result.score[0] - result.score[1])}</strong>
                  -point margin. In {result.calibration.season},{" "}
                  {result.calibration.games.toLocaleString("en-US")} NBA
                  regular-season games averaged{" "}
                  {result.calibration.averageTotal.toFixed(1)} total points and
                  a {result.calibration.averageMargin.toFixed(1)}-point margin;
                  90% of totals were between {result.calibration.central90[0]}{" "}
                  and {result.calibration.central90[1]}.
                </p>
                <p className="text-xs text-foreground/50 mt-2">
                  This is a league-level calibration reference. Historical
                  player lineups are not available in the current dataset, so it
                  does not validate this particular matchup.
                </p>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-bold mb-2">What separated the teams</h3>
                <ul className="space-y-2 text-sm text-foreground/70">
                  {result.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <caption className="text-left font-bold mb-2">
                    Score by period
                  </caption>
                  <thead>
                    <tr>
                      <th>Team</th>
                      {result.quarters.map((_, i) => (
                        <th key={i}>{i < 4 ? `Q${i + 1}` : `OT${i - 3}`}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1].map((side) => (
                      <tr key={side} className="border-t">
                        <th className="py-3">
                          Lineup {side === 0 ? "A" : "B"}
                        </th>
                        {result.quarters.map((q, i) => (
                          <td key={i}>{q[side]}</td>
                        ))}
                        <td className="font-bold">{result.score[side]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.boxes.map((team, side) => (
                <div key={side} className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <caption className="text-left font-bold mb-3">
                      Lineup {side === 0 ? "A" : "B"} · Box score
                    </caption>
                    <thead>
                      <tr>
                        {[
                          "Player",
                          "MIN",
                          "PTS",
                          "REB",
                          "OREB",
                          "STL",
                          "BLK",
                          "PF",
                          "AST",
                          "TO",
                          "FG",
                          "3PT",
                          "FT",
                        ].map((h) => (
                          <th key={h} className="p-2 first:text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {team.map((p) => (
                        <tr key={p.id} className="border-t">
                          <th className="p-2 text-left font-medium">
                            <span className="flex items-center gap-2">
                              <PlayerImage
                                playerId={p.id}
                                alt=""
                                className="w-9 h-9 object-contain"
                              />
                              {p.name}
                            </span>
                          </th>
                          <td>{p.min.toFixed(1)}</td>
                          <td>{p.pts}</td>
                          <td>{p.reb}</td>
                          <td>{p.oreb}</td>
                          <td>{p.stl}</td>
                          <td>{p.blk}</td>
                          <td>{p.pf}</td>
                          <td>{p.ast}</td>
                          <td>{p.tov}</td>
                          <td>
                            {p.fgm}/{p.fga}
                          </td>
                          <td>
                            {p.threeM}/{p.threeA}
                          </td>
                          <td>
                            {p.ftm}/{p.fta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
          <p className="text-xs text-foreground/60">
            Source: {era === "alltime" ? `${result.season} · career totals converted to role- and sample-adjusted profiles` : `NBA Stats · ${result.season} regular season · synced ${new Date(result.syncedAt).toLocaleString("en-US")}`}. {result.model}.
            Results stay on this page only; replay does not generate a new
            outcome.
          </p>
        </>
      )}
      <details className="text-sm text-foreground/60">
        <summary className="cursor-pointer">How this prototype works</summary>
        <p className="mt-3">
          Four 12-minute quarters, with pace affected by tactics. Ties trigger
          5-minute overtime, up to six periods. Each team has two guards, two
          forwards and a center among its first five, plus up to three bench
          players. Rates use minutes and sample size; limited samples are pulled
          toward explicit model priors. Offensive rebounds retain possession.
          Steals and blocks are recorded events. Established shooters improve
          spacing for two-point shots. Inside play targets the center; pressure
          defense risks fouls; faster play risks turnovers. Season playing time
          allocates an abstract 240-minute rotation; this is possession-share
          weighting rather than literal substitutions. Heavy workloads now add
          a late-game fatigue penalty; foul trouble, timeouts, late-game pace
          and intentional fouling also affect the possession model.
          The model still does not include injuries or home advantage. Halftime tactics preserve the signed
          first-half seed and affect only later periods. Positions come from
          stored biographies, not season-specific defensive tracking. League
          scoring is compared with a 1,230-game 2024-25 baseline, but
          matchup-level calibration is not possible with the current data. This
          remains an entertainment model, not a forecast. Both sides may select
          the same player. Editing either lineup resets the match.
        </p>
      </details>
    </section>
  );
}
