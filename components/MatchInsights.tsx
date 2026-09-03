"use client";
import PlayerImage from "@/components/PlayerImage";
import { assignLineup, lineupSlots } from "@/lib/lineup-roles";
import type { Simulation } from "@/lib/match-simulation";
type Play = Simulation["plays"][number];

function periodName(period: number) {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

export function playPresentation(play: Play, previous?: Play) {
  const before = previous?.score || [0, 0];
  const oldLead = before[0] - before[1];
  const newLead = play.score[0] - play.score[1];
  const leadChange = oldLead !== 0 && newLead !== 0 && Math.sign(oldLead) !== Math.sign(newLead);
  const tied = newLead === 0 && oldLead !== 0;
  const clutch = play.period >= 4 && Number(play.clock.split(":")[0]) < 2 && Math.abs(newLead) <= 8;
  const three = /three/i.test(play.text) && /hits/i.test(play.text);
  const timeoutRun = /calls timeout.*run/i.test(play.text);
  const important = leadChange || tied || clutch || three || play.event === "block" || play.event === "steal" || timeoutRun;
  const label = leadChange
    ? "LEAD CHANGE"
    : tied
      ? "TIE GAME"
      : timeoutRun
        ? "RUN STOPPED"
        : clutch
          ? "CLUTCH"
          : three
            ? "3PT"
            : play.event === "block"
              ? "BLOCK"
              : play.event === "steal"
                ? "STEAL"
                : "";
  return { important, label, leadChange, clutch };
}

function visibleContext(plays: Play[]) {
  let leadChanges = 0;
  let largestA = 0;
  let largestB = 0;
  const biggestRun = plays.reduce<Play["run"]>(
    (biggest, play) =>
      play.run && (!biggest || play.run.points > biggest.points)
        ? play.run
        : biggest,
    null,
  );
  plays.forEach((play, index) => {
    const diff = play.score[0] - play.score[1];
    largestA = Math.max(largestA, diff);
    largestB = Math.max(largestB, -diff);
    if (playPresentation(play, plays[index - 1]).leadChange) leadChanges++;
  });
  return { leadChanges, largestA, largestB, biggestRun };
}

function findKeyMoment(result: Simulation) {
  const winner = result.score[0] > result.score[1] ? 0 : 1;
  const winnerLead = (score: number[]) =>
    winner === 0 ? score[0] - score[1] : score[1] - score[0];
  const finalMargin = Math.abs(result.score[0] - result.score[1]);
  const permanentLeadIndex = result.plays.findIndex((play, index) => {
    const before = index ? winnerLead(result.plays[index - 1].score) : 0;
    return (
      play.side === winner &&
      before <= 0 &&
      winnerLead(play.score) > 0 &&
      result.plays.slice(index + 1).every((later) => winnerLead(later.score) > 0)
    );
  });
  if (finalMargin <= 10 && permanentLeadIndex >= 0) {
    return {
      play: result.plays[permanentLeadIndex],
      reason: "The winning lineup took the lead here and never gave it back.",
    };
  }
  const biggestWinningRun = result.plays.reduce<Play | null>(
    (best, play) =>
      play.run?.side === winner &&
      (!best?.run || play.run.points > best.run.points)
        ? play
        : best,
    null,
  );
  if (biggestWinningRun?.run && biggestWinningRun.run.points >= 6) {
    return {
      play: biggestWinningRun,
      reason: `This completed the winner's decisive ${biggestWinningRun.run.points}–0 run.`,
    };
  }
  if (permanentLeadIndex >= 0) {
    return {
      play: result.plays[permanentLeadIndex],
      reason: "The winning lineup moved ahead here and stayed in control.",
    };
  }
  const fallback = [...result.plays]
    .reverse()
    .find((play) => play.side === winner && play.event === "basket");
  return { play: fallback || result.plays.at(-1), reason: "A late scoring play that helped secure the result." };
}

export function HalftimeCoachingReport({ result }: { result: Simulation }) {
  const firstHalf = result.plays.filter((play) => play.period <= 2);
  const last = firstHalf.at(-1);
  if (!last) return null;
  const context = visibleContext(firstHalf);
  const eventCount = (side: number, pattern: RegExp) =>
    firstHalf.filter((play) => play.side === side && pattern.test(play.text)).length;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1].map((side) => {
        const other = 1 - side;
        const margin = last.score[side] - last.score[other];
        const turnovers = eventCount(side, /loses the ball|steals the ball from/i);
        const threes = eventCount(side, /hits a three/i);
        const offensiveBoards = eventCount(side, /offensive rebound/i);
        const suggestion = margin <= -8
          ? threes < eventCount(other, /hits a three/i)
            ? "Consider Perimeter to create more three-point volume."
            : "Consider Fast pace to create more possessions."
          : turnovers >= 4
            ? "Protect the ball: Balanced is the safer second-half plan."
            : offensiveBoards < eventCount(other, /offensive rebound/i)
              ? "Consider Inside to pressure the paint and glass."
              : "The current plan is holding up; avoid an unnecessary overhaul.";
        return (
          <article key={side} className={`rounded-xl border p-4 ${side === 0 ? "border-orange-500/30" : "border-sky-500/30"}`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-bold">Lineup {side === 0 ? "A" : "B"} report</h4>
              <strong className={margin >= 0 ? "text-emerald-500" : "text-amber-500"}>{margin === 0 ? "Tied" : `${margin > 0 ? "+" : ""}${margin}`}</strong>
            </div>
            <p className="mt-2 text-sm text-foreground/70">{threes} made threes · {offensiveBoards} offensive rebounds · {turnovers} live-ball or unforced turnovers</p>
            <p className="mt-2 text-sm font-semibold">Coach suggestion: {suggestion}</p>
            <p className="mt-2 text-xs text-foreground/50">Game context: {context.leadChanges} lead changes · largest lead {side === 0 ? context.largestA : context.largestB}</p>
          </article>
        );
      })}
    </div>
  );
}

export function FinalGameSummary({ result, onRematch, onShare, shared }: { result: Simulation; onRematch?: () => void; onShare: () => void; shared?: boolean }) {
  const context = visibleContext(result.plays);
  const players = result.boxes.flatMap((team, side) => team.map((player) => ({ ...player, side })));
  const mvp = players.sort((a, b) => (b.pts + b.reb * .8 + b.ast * 1.2 + (b.stl + b.blk) * 2 - b.tov) - (a.pts + a.reb * .8 + a.ast * 1.2 + (a.stl + a.blk) * 2 - a.tov))[0];
  const keyMoment = findKeyMoment(result);
  const keyPlay = keyMoment.play;
  const totals = result.boxes.map((team) => team.reduce((sum, p) => ({
    reb: sum.reb + p.reb, ast: sum.ast + p.ast, tov: sum.tov + p.tov,
    stl: sum.stl + p.stl, blk: sum.blk + p.blk, fgm: sum.fgm + p.fgm,
    fga: sum.fga + p.fga, threeM: sum.threeM + p.threeM, threeA: sum.threeA + p.threeA,
  }), { reb: 0, ast: 0, tov: 0, stl: 0, blk: 0, fgm: 0, fga: 0, threeM: 0, threeA: 0 }));
  const winner = result.score[0] > result.score[1] ? 0 : 1;
  const loser = winner === 0 ? 1 : 0;
  const edges = [
    { label: "rebounding", value: totals[winner].reb - totals[loser].reb },
    { label: "ball movement", value: totals[winner].ast - totals[loser].ast },
    { label: "three-point makes", value: totals[winner].threeM - totals[loser].threeM },
    { label: "turnover control", value: totals[loser].tov - totals[winner].tov },
  ].sort((a, b) => b.value - a.value);
  return (
    <section className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-background/60 to-orange-500/10 p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-violet-400">Postgame center</p><h3 className="mt-1 text-2xl font-black">Final: {result.score[0]}–{result.score[1]}</h3><p className="text-sm text-foreground/60">Lineup {result.score[0] > result.score[1] ? "A" : "B"} controlled the finish.</p></div>
        <div className="flex flex-wrap gap-2">{onRematch && <button className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-foreground/10" onClick={onRematch}>Run rematch</button>}<button className="rounded-xl border border-orange-500/40 bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400" onClick={onShare}>Copy result & link</button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-background/50 p-4"><p className="text-xs uppercase text-amber-400">Player of the game</p><p className="mt-1 font-black">{mvp?.name}</p><p className="text-sm text-foreground/60">{mvp?.pts} PTS · {mvp?.reb} REB · {mvp?.ast} AST</p></div>
        <div className="rounded-xl border bg-background/50 p-4"><p className="text-xs uppercase text-emerald-400">Biggest run</p><p className="mt-1 font-black">{context.biggestRun ? `Lineup ${context.biggestRun.side === 0 ? "A" : "B"} · ${context.biggestRun.points}–0` : "No major run"}</p><p className="text-sm text-foreground/60">{context.leadChanges} lead change{context.leadChanges === 1 ? "" : "s"}</p></div>
        <div className="rounded-xl border bg-background/50 p-4"><p className="text-xs uppercase text-sky-400">Key moment</p><p className="mt-1 font-bold">{keyPlay ? `${periodName(keyPlay.period)} ${keyPlay.clock === "0:00" ? "· End of period" : keyPlay.clock}` : "Final possession"}</p><p className="line-clamp-2 text-sm text-foreground/60">{keyPlay?.text}</p><p className="mt-2 text-xs text-sky-300/70">{keyMoment.reason}</p></div>
        <div className="rounded-xl border bg-background/50 p-4"><p className="text-xs uppercase text-violet-400">Deciding edge</p><p className="mt-1 font-black capitalize">{edges[0].label}</p><p className="text-sm text-foreground/60">Lineup {winner === 0 ? "A" : "B"} finished {edges[0].value > 0 ? `+${edges[0].value}` : "level"} in this area.</p></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-center text-sm"><caption className="mb-2 text-left font-bold">Team comparison</caption><thead><tr><th className="p-2 text-left">Team</th><th>FG</th><th>3PT</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th></tr></thead><tbody>{totals.map((team, side) => <tr key={side} className="border-t"><th className={`p-3 text-left ${side === 0 ? "text-orange-500" : "text-sky-500"}`}>Lineup {side === 0 ? "A" : "B"}</th><td>{team.fgm}/{team.fga}</td><td>{team.threeM}/{team.threeA}</td><td>{team.reb}</td><td>{team.ast}</td><td>{team.stl}</td><td>{team.blk}</td><td>{team.tov}</td></tr>)}</tbody></table></div>
      {shared && <p className="text-xs text-foreground/50">This result is synchronized for both coaches.</p>}
    </section>
  );
}
export type PreviewPlayer = {
  id: number;
  name: string;
  position?: string;
  confidence?: string;
  games?: number;
  minutes?: number;
  cost?: number;
};
export function MatchLineups({ teams }: { teams: PreviewPlayer[][] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {teams.map((team, side) => {
        const ordered = assignLineup(team.slice(0, 5));
        const display = ordered ? [...ordered, ...team.slice(5)] : team;
        return (
          <section
            key={side}
            className={`rounded-xl border p-4 ${side === 0 ? "border-orange-500/30" : "border-sky-500/30"}`}
          >
            <h3 className="font-bold mb-3">
              Lineup {side === 0 ? "A" : "B"} · {team.length}/8
            </h3>
            {display.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 py-2">
                <PlayerImage
                  playerId={p.id}
                  alt=""
                  className="w-10 h-10 object-contain"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.name}{" "}
                    <span className="text-foreground/50">
                      {ordered
                        ? i < 5
                          ? lineupSlots[i]
                          : "BENCH"
                        : p.position}
                    </span>
                  </p>
                  <p className="text-xs text-foreground/50">
                    {p.position} · {p.games} GP · {p.minutes} MPG
                  </p>
                  {p.confidence === "Limited sample" && (
                    <p className="text-xs text-amber-500">
                      Limited sample · stronger statistical adjustment
                    </p>
                  )}
                </div>
              </div>
            ))}
            <p
              className={`text-xs mt-2 ${ordered ? "text-emerald-500" : "text-amber-500"}`}
            >
              {ordered
                ? `Ready: G / G / F / F / C starters${team.length > 5 ? ` · ${team.length - 5} bench` : " · no bench"}`
                : "Needs 2 guards, 2 forwards and 1 center. G-F / F-C players can cover either listed role."}
            </p>
          </section>
        );
      })}
    </div>
  );
}
export function MatchInsights({
  result,
  cursor,
}: {
  result: Simulation;
  cursor: number;
}) {
  const visible = result.plays.slice(0, cursor),
    last = visible.at(-1);
  const context = visibleContext(visible);
  const leads = [0, ...visible.map((p) => p.score[0] - p.score[1])];
  const max = Math.max(10, ...leads.map(Math.abs));
  const width = 600,
    height = 140;
  const points = leads
    .map(
      (v, i) =>
        `${(i * width) / Math.max(1, result.plays.length)},${height / 2 - (v / max) * (height / 2 - 12)}`,
    )
    .join(" ");
  return (
    <div className="space-y-4">
      {last?.run && last.run.points >= 6 && (
        <p
          className="rounded-xl border border-orange-500/30 p-3 font-bold"
          role="status"
        >
          Lineup {last.run.side === 0 ? "A" : "B"} on a {last.run.points}–0
          scoring run
        </p>
      )}
      {last && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-background/40 p-3"><p className="text-xs text-foreground/50">Current margin</p><strong>{last.score[0] === last.score[1] ? "Tie game" : `${Math.abs(last.score[0] - last.score[1])} · ${last.score[0] > last.score[1] ? "A" : "B"} leads`}</strong></div>
          <div className="rounded-xl border bg-background/40 p-3"><p className="text-xs text-foreground/50">Lead changes</p><strong>{context.leadChanges}</strong></div>
          <div className="rounded-xl border bg-background/40 p-3"><p className="text-xs text-foreground/50">Largest lead A</p><strong>+{context.largestA}</strong></div>
          <div className="rounded-xl border bg-background/40 p-3"><p className="text-xs text-foreground/50">Largest lead B</p><strong>+{context.largestB}</strong></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {result.profiles.map((team, side) => {
          const leaders = team
            .map((p, i) => ({ ...p, pts: last?.scorers[side][i] || 0 }))
            .sort((a, b) => b.pts - a.pts)
            .slice(0, 2);
          return (
            <div key={side} className="rounded-xl border bg-background/40 p-4">
              <h3 className="text-xs uppercase text-foreground/60 mb-2">
                Lineup {side === 0 ? "A" : "B"} · Scoring leaders
              </h3>
              {leaders.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 text-sm py-1"
                >
                  <PlayerImage
                    playerId={p.id}
                    alt=""
                    className="w-8 h-8 object-contain"
                  />
                  <span className="flex-1">{p.name}</span>
                  <strong>{p.pts} PTS</strong>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <figure className="rounded-xl border bg-background/40 p-4">
        <figcaption className="font-bold">Lead tracker</figcaption>
        <p className="text-xs text-foreground/60">
          Above the line: A leads · Below: B leads · Largest leads so far: A +
          {Math.max(...leads)} / B +{Math.abs(Math.min(...leads))}
        </p>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-36"
          role="img"
          aria-label={`Lead over revealed plays. Current lead: ${Math.abs(leads.at(-1) || 0)} points for ${(leads.at(-1) || 0) >= 0 ? "A" : "B"}.`}
        >
          <line
            x1="0"
            x2={width}
            y1={height / 2}
            y2={height / 2}
            stroke="currentColor"
            opacity="0.25"
          />
          <polyline
            points={points}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
          />
          <text x="4" y="12" fill="currentColor" fontSize="10">
            A +{max}
          </text>
          <text x="4" y="136" fill="currentColor" fontSize="10">
            B +{max}
          </text>
        </svg>
        <p className="text-xs text-foreground/50">
          Tip-off → final · Only revealed plays are shown.
        </p>
      </figure>
    </div>
  );
}
