import { assignLineup, roles } from "./lineup-roles";
export type Tactic = "balanced" | "perimeter" | "inside" | "fast" | "pressure";
export const tactics: Tactic[] = [
  "balanced",
  "perimeter",
  "inside",
  "fast",
  "pressure",
];
export const tacticInfo: Record<
  Tactic,
  { label: string; description: string }
> = {
  balanced: {
    label: "Balanced",
    description: "Normal pace and each player's usual shot mix.",
  },
  perimeter: {
    label: "More threes",
    description:
      "More three-point attempts and fewer trips to the line. Works best with established shooters.",
  },
  inside: {
    label: "Play through the center",
    description:
      "More touches for your center, fewer threes and more fouls drawn. Crowded spacing and rim protection can hurt.",
  },
  fast: {
    label: "Push the pace",
    description:
      "Shorter possessions and more opportunities, but a higher turnover risk.",
  },
  pressure: {
    label: "Defensive pressure",
    description:
      "More chances to force steals, at the cost of conceding more shooting fouls.",
  },
};
export type SimPlayer = {
  id: number;
  name: string;
  position: string;
  games: number;
  minutes: number;
  sampleMinutes: number;
  confidence: string;
  fga: number;
  fta: number;
  threeA: number;
  p2: number;
  p3: number;
  ft: number;
  oreb: number;
  dreb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  offensiveImpact: number;
  defensiveImpact: number;
};
export type Box = {
  id: number;
  name: string;
  position: string;
  pts: number;
  reb: number;
  oreb: number;
  dreb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  fgm: number;
  fga: number;
  threeM: number;
  threeA: number;
  ftm: number;
  fta: number;
  secondChance: number;
  min: number;
};
export type Play = {
  period: number;
  clock: string;
  side: number;
  text: string;
  score: number[];
  scorers: number[][];
  run: { side: number; points: number } | null;
  event: string;
  possession: number;
  onCourt?: number[][];
  participants?: {
    primaryId: number;
    primarySide: number;
    offensiveId: number;
    secondaryId?: number;
  };
};
export type Simulation = {
  model: string;
  score: number[];
  boxes: Box[][];
  plays: Play[];
  quarters: number[][];
  tactics: Tactic[];
  secondHalfTactics: Tactic[];
  profiles: SimPlayer[][];
  rotation: number[][];
  possessions: number[];
  timeouts: number[];
  fatigue: number[][];
  summary: string[];
  calibration: typeof NBA_CALIBRATION;
};
export const NBA_CALIBRATION = {
  season: "2024-25",
  games: 1230,
  averageTotal: 227.65,
  totalStandardDeviation: 19.79,
  averageMargin: 12.75,
  central90: [195, 261] as [number, number],
};
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function defaultRotation(team: Array<{ minutes?: number }>): number[] {
  if (!team.length) return [];
  if (team.length === 5) return [48, 48, 48, 48, 48];
  const target = team.map((p, i) =>
    clamp(
      Number.isFinite(p.minutes) ? Number(p.minutes) : i < 5 ? 30 : 12,
      i < 5 ? 26 : 8,
      i < 5 ? 38 : 22,
    ),
  );
  const scale = 240 / target.reduce((sum, value) => sum + value, 0);
  const minutes = target.map((value) => Math.round(value * scale * 10) / 10);
  minutes[minutes.length - 1] =
    Math.round(
      (minutes[minutes.length - 1] + 240 - minutes.reduce((a, b) => a + b, 0)) *
        10,
    ) / 10;
  return minutes;
}
// Per-game source values become approximate season totals for sample-aware shrinkage.
export function profile(
  raw: Record<string, unknown>,
  position: string,
): SimPlayer | null {
  const required = [
    "PLAYER_ID",
    "GP",
    "MIN",
    "FGA",
    "FGM",
    "FG3A",
    "FG3M",
    "FTA",
    "FTM",
    "OREB",
    "DREB",
    "AST",
    "TOV",
    "STL",
    "BLK",
  ];
  if (
    required.some(
      (k) =>
        raw[k] === null ||
        raw[k] === undefined ||
        raw[k] === "" ||
        !Number.isFinite(Number(raw[k])) ||
        Number(raw[k]) < 0,
    ) ||
    !roles(position).length
  )
    return null;
  const n = (k: string) => Number(raw[k]),
    gp = n("GP"),
    min = n("MIN");
  if (gp <= 0 || min <= 0 || n("FGA") <= 0) return null;
  const minutes = gp * min;
  const isCenter = roles(position).includes("C");
  const isGuard = roles(position).includes("G");
  const threeVolume = (n("FG3A") * 36) / min;
  const rate = (key: string, prior: number, max: number) =>
    clamp(((n(key) * gp + (prior * 400) / 36) / (minutes + 400)) * 36, 0, max);
  const posterior = (
    made: number,
    attempts: number,
    prior: number,
    strength: number,
  ) =>
    clamp(
      (Math.min(made, attempts) * gp + prior * strength) /
        (attempts * gp + strength),
      0.05,
      0.95,
    );
  const p2 = posterior(
    Math.max(0, n("FGM") - n("FG3M")),
    Math.max(0, n("FGA") - n("FG3A")),
    isCenter ? 0.54 : 0.51,
    150,
  );
  // Low-volume non-shooters should not inherit league-average three-point skill.
  const threePrior = isCenter
    ? threeVolume < 1
      ? 0.27
      : threeVolume < 3
        ? 0.31
        : 0.34
    : threeVolume < 1
      ? 0.3
      : isGuard
        ? 0.35
        : 0.34;
  const p3 = posterior(n("FG3M"), n("FG3A"), threePrior, 200);
  const ft = posterior(n("FTM"), n("FTA"), isCenter ? 0.72 : 0.78, 75);
  const fga = rate("FGA", isCenter ? 12 : 14, 30);
  const fta = rate("FTA", isCenter ? 5 : 4, 15);
  const threeA = rate("FG3A", isCenter ? 1.2 : isGuard ? 4 : 3, 16);
  const oreb = rate("OREB", isCenter ? 2.5 : 1.2, 6);
  const dreb = rate("DREB", isCenter ? 7 : 4.5, 14);
  const ast = rate("AST", isGuard ? 4.5 : 2.8, 14);
  const tov = rate("TOV", 2, 6);
  const stl = rate("STL", 1, 3.5);
  const blk = rate("BLK", isCenter ? 1.3 : 0.4, 4);
  const threeShare = clamp(threeA / Math.max(1, fga), 0, 0.85);
  const shotValue = 2 * p2 * (1 - threeShare) + 3 * p3 * threeShare;
  const roleFga = isCenter ? 11.5 : isGuard ? 14.5 : 13;
  const roleAst = isGuard ? 4.5 : isCenter ? 2.5 : 3;
  const roleShotValue = isCenter ? 1.1 : isGuard ? 1.06 : 1.07;
  const roleDreb = isCenter ? 6.8 : isGuard ? 4 : 5;
  const creationVolume = clamp(
    (fga + 0.44 * fta) / (roleFga + 2),
    0.35,
    1.15,
  );
  const offensiveImpact = clamp(
    (shotValue - roleShotValue) * 10 * creationVolume +
      (fga - roleFga) * 0.08 +
      (ast - roleAst) * 0.17 -
      (tov - 2) * 0.22,
    -4,
    5.5,
  );
  const defensiveImpact = clamp(
    (stl - 1) * 0.65 +
      (blk - (isCenter ? 1.2 : 0.35)) * 0.22 +
      (dreb - roleDreb) * 0.04,
    -2.5,
    3,
  );
  return {
    id: n("PLAYER_ID"),
    name: String(raw.PLAYER_NAME),
    position,
    games: gp,
    minutes: min,
    sampleMinutes: minutes,
    confidence:
      minutes < 400
        ? "Limited sample"
        : minutes < 1200
          ? "Moderate sample"
          : "Established sample",
    fga,
    fta,
    threeA,
    p2,
    p3,
    ft,
    oreb,
    dreb,
    ast,
    tov,
    stl,
    blk,
    offensiveImpact,
    defensiveImpact,
  };
}
export function simulate(
  input: SimPlayer[][],
  plans: Tactic[],
  random: () => number,
  secondHalfPlans: Tactic[] = plans,
  requestedRotation?: number[][],
): Simulation {
  if (
    input.length !== 2 ||
    plans.length !== 2 ||
    secondHalfPlans.length !== 2 ||
    plans.some((t) => !tactics.includes(t)) ||
    secondHalfPlans.some((t) => !tactics.includes(t)) ||
    input.some((team) => team.length < 5 || team.length > 8) ||
    (requestedRotation !== undefined &&
      (requestedRotation.length !== 2 ||
        requestedRotation.some(
          (minutes, side) =>
            !Array.isArray(minutes) ||
            minutes.length !== input[side].length ||
            minutes.some(
              (value) => !Number.isFinite(value) || value < 0 || value > 48,
            ) ||
            Math.abs(minutes.reduce((sum, value) => sum + value, 0) - 240) >
              0.05,
        )))
  )
    throw Error("Invalid match setup");
  const assigned = input.map((t) => assignLineup(t.slice(0, 5)));
  if (assigned.some((t) => !t))
    throw Error("Each lineup needs two guards, two forwards and a center.");
  const teams = assigned.map((starters, side) => [
    ...(starters as SimPlayer[]),
    ...input[side].slice(5),
  ]);
  const rotation = teams.map((team, side) => {
    if (!requestedRotation) return defaultRotation(team);
    const byId = new Map(
      input[side].map((player, index) => [
        player.id,
        requestedRotation[side][index],
      ]),
    );
    return team.map((player) => byId.get(player.id)!);
  });
  const boxes: Box[][] = teams.map((t, side) =>
    t.map((p, i) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      pts: 0,
      reb: 0,
      oreb: 0,
      dreb: 0,
      ast: 0,
      tov: 0,
      stl: 0,
      blk: 0,
      pf: 0,
      fgm: 0,
      fga: 0,
      threeM: 0,
      threeA: 0,
      ftm: 0,
      fta: 0,
      secondChance: 0,
      min: rotation[side][i],
    })),
  );
  const score = [0, 0],
    plays: Play[] = [],
    quarters: number[][] = [],
    possessions = [0, 0],
    timeouts = [6, 6];
  let run: { side: number; points: number } | null = null,
    serial = 0;
  const sum = (side: number, key: "oreb" | "dreb" | "ast" | "stl") =>
    teams[side].reduce((n, p, i) => n + (p[key] * rotation[side][i]) / 36, 0);
  const pick = (weights: number[]) => {
    let n = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      n -= weights[i];
      if (n < 0) return i;
    }
    return weights.length - 1;
  };
  const weighted = (side: number, key: "oreb" | "dreb" | "stl" | "ast") =>
    pick(
      teams[side].map((p, i) => Math.max(0, (p[key] * rotation[side][i]) / 36)),
    );
  const expectedOnCourt = (
    side: number,
    value: (player: SimPlayer) => number,
  ) =>
    teams[side].reduce(
      (total, player, index) =>
        total + value(player) * (rotation[side][index] / 48),
      0,
    );
  const diminishingDelta = (value: number, baseline: number) => {
    const difference = value - baseline;
    return Math.sign(difference) * Math.sqrt(Math.abs(difference));
  };
  // Expected lineup values are rotation-weighted and can never count more than
  // five players. This avoids treating every shooter on an eight-man roster as
  // if they shared the floor at once.
  const spacing = teams.map((_, side) =>
    expectedOnCourt(side, (player) =>
      player.threeA >= 4 && player.p3 >= 0.33
        ? 1
        : player.threeA >= 2 && player.p3 >= 0.32
          ? 0.7
          : player.threeA >= 1 && player.p3 >= 0.3
            ? 0.35
            : 0,
    ),
  );
  const rimProtection = teams.map((_, side) =>
    expectedOnCourt(side, (player) => Math.sqrt(Math.max(0, player.blk))),
  );
  const teamOffense = teams.map((_, side) => {
    const base = expectedOnCourt(side, (player) => player.offensiveImpact) / 5;
    const spacingEffect = (spacing[side] - 3) * 0.32;
    const playmaking = expectedOnCourt(side, (player) => player.ast);
    const creationEffect = diminishingDelta(playmaking, 22) * 0.08;
    const centerLoad = expectedOnCourt(side, (player) =>
      roles(player.position).includes("C") ? 1 : 0,
    );
    const sizePenalty = Math.max(0, centerLoad - 1.6) * 0.3;
    return base + spacingEffect + creationEffect - sizePenalty;
  });
  const teamDefense = teams.map((_, side) => {
    const base = expectedOnCourt(side, (player) => player.defensiveImpact) / 5;
    const rimEffect = diminishingDelta(rimProtection[side], 5) * 0.12;
    return base + rimEffect;
  });
  const addPoints = (
    side: number,
    i: number,
    points: number,
    second: boolean,
  ) => {
    boxes[side][i].pts += points;
    score[side] += points;
    if (second) boxes[side][i].secondChance += points;
    if (points) {
      run =
        run?.side === side
          ? { side, points: run.points + points }
          : { side, points };
    }
  };
  const first = random() < 0.5 ? 0 : 1;
  const onCourt = (side: number, required: number[]) => {
    const unique = Array.from(new Set(required));
    const rest = teams[side]
      .map((_, index) => index)
      .filter((index) => !unique.includes(index))
      .sort((a, b) => {
        const waveA = ((serial * 13 + a * 17 + side * 7) % 23) - 11;
        const waveB = ((serial * 13 + b * 17 + side * 7) % 23) - 11;
        return (
          rotation[side][b] + waveB * 0.45 - (rotation[side][a] + waveA * 0.45)
        );
      });
    return [...unique, ...rest].slice(0, Math.min(5, teams[side].length));
  };
  for (let period = 1; period <= 10; period++) {
    if (period > 4 && score[0] !== score[1]) break;
    const before = [...score];
    let left = period <= 4 ? 720 : 300,
      side = (first + period - 1) % 2,
      second = false,
      continuation = false;
    while (left > 0) {
      const other = 1 - side,
        team = teams[side],
        def = teams[other],
        activePlans = period <= 2 ? plans : secondHalfPlans;
      if (!continuation) {
        possessions[side]++;
        serial++;
      }
      const lateClose =
        period >= 4 && left <= 120 && Math.abs(score[0] - score[1]) <= 8;
      const duration = continuation
        ? 4 + Math.floor(random() * 10)
        : Math.round(
            (activePlans[side] === "fast"
              ? 8
              : activePlans[side] === "inside"
                ? 12
                : 10) +
              random() * 6 -
              (lateClose && score[side] < score[other] ? 3 : 0),
          );
      left = Math.max(0, left - duration);
      const i = pick(
          team.map((p, j) =>
            Math.max(
              0,
              (p.fga + 0.44 * p.fta) *
                clamp(1 + p.offensiveImpact * 0.045, 0.78, 1.25) *
                (rotation[side][j] / 36) *
                (activePlans[side] === "inside" && j === 4 ? 1.6 : 1),
            ),
          ),
        ),
        p = team[i],
        box = boxes[side][i];
      const handler = weighted(side, "ast"),
        h = team[handler];
      let text = "",
        event = "",
        keep = false,
        primarySide = side,
        primaryIndex = i,
        offensiveIndex = i,
        secondaryIndex: number | undefined,
        secondarySide = side;
      const rebound = () => {
        const offensiveRebounding = sum(side, "oreb");
        const defensiveRebounding = sum(other, "dreb");
        const chance = clamp(
          0.24 +
            0.014 * diminishingDelta(offensiveRebounding, 7) -
            0.007 * diminishingDelta(defensiveRebounding, 25),
          0.14,
          0.36,
        );
        const offense = random() < chance;
        const rSide = offense ? side : other,
          idx = weighted(rSide, offense ? "oreb" : "dreb"),
          r = boxes[rSide][idx];
        r.reb++;
        if (offense) r.oreb++;
        else r.dreb++;
        primarySide = rSide;
        primaryIndex = idx;
        text += ` ${r.name} takes the ${offense ? "offensive" : "defensive"} rebound.`;
        if (offense && left > 0) {
          keep = true;
          event = "offensive-rebound";
        }
      };
      const toChance = clamp(
        (h.tov / (h.fga + 0.44 * h.fta + h.ast + h.tov)) * 1.2 +
          (activePlans[side] === "fast" ? 0.035 : 0) +
          (activePlans[other] === "pressure" ? 0.03 : 0) +
          0.008 * diminishingDelta(sum(other, "stl"), 7),
        0.055,
        0.25,
      );
      if (random() < toChance) {
        boxes[side][handler].tov++;
        event = "turnover";
        primaryIndex = handler;
        offensiveIndex = handler;
        if (random() < 0.65) {
          const steal = weighted(other, "stl");
          boxes[other][steal].stl++;
          text = `${def[steal].name} steals the ball from ${h.name}!`;
          event = "steal";
          primarySide = other;
          primaryIndex = steal;
          secondaryIndex = handler;
          secondarySide = side;
        } else text = `${h.name} loses the ball out of bounds.`;
      } else if (
        random() <
        clamp(
          (p.fta / Math.max(1, p.fga)) * 0.4 +
            (activePlans[side] === "inside"
              ? 0.025
              : activePlans[side] === "perimeter"
                ? -0.015
                : 0) +
            (activePlans[other] === "pressure" ? 0.035 : 0) +
            (lateClose && score[side] > score[other] ? 0.12 : 0),
          0.03,
          0.24,
        )
      ) {
        const fouler = pick(
          def.map((_, j) =>
            Math.max(1, rotation[other][j] - boxes[other][j].pf * 5),
          ),
        );
        secondaryIndex = fouler;
        secondarySide = other;
        boxes[other][fouler].pf++;
        box.fta += 2;
        const one = random() < p.ft,
          two = random() < p.ft,
          made = Number(one) + Number(two);
        box.ftm += made;
        addPoints(side, i, made, second);
        text = `${p.name} draws a shooting foul on ${def[fouler].name}: ${made}/2 free throws.${boxes[other][fouler].pf >= 5 ? " Foul trouble changes the defensive matchup." : ""}`;
        event = "free-throws";
        if (!two) rebound();
      } else {
        const three =
          random() <
          clamp(
            p.threeA / Math.max(1, p.fga) +
              (activePlans[side] === "perimeter"
                ? 0.18
                : activePlans[side] === "inside"
                  ? -0.18
                  : 0),
            0.01,
            0.85,
          );
        box.fga++;
        if (three) box.threeA++;
        const defenderIndex = pick(
          def.map((x, j) => Math.max(0, (x.blk * rotation[other][j]) / 36)),
        );
        const defender = def[defenderIndex];
        const teamBlockChance = clamp(
          0.035 + 0.012 * diminishingDelta(rimProtection[other], 5),
          0.012,
          0.09,
        );
        const blocked = random() < teamBlockChance * (three ? 0.3 : 1);
        const crowding = three
          ? 0
          : clamp((spacing[side] - 3) * 0.012, -0.036, 0.024);
        const fatiguePenalty =
          Math.max(0, rotation[side][i] - 34) *
            Math.max(0, period - 1) *
            0.0012 +
          (activePlans[side] === "fast" ? Math.max(0, period - 2) * 0.004 : 0);
        const matchupAdjustment = clamp(
          (teamOffense[side] - teamDefense[other]) * 0.017 - 0.015,
          -0.07,
          0.07,
        );
        const made =
          !blocked &&
          random() <
            clamp(
              (three ? p.p3 : p.p2) +
                crowding +
                matchupAdjustment -
                fatiguePenalty,
              0.12,
              0.82,
            );
        event = blocked ? "block" : made ? "basket" : "miss";
        if (made) {
          box.fgm++;
          if (three) box.threeM++;
          addPoints(side, i, three ? 3 : 2, second);
          text = `${p.name} ${three ? "hits a three!" : "makes a two-point shot."}`;
          if (random() < clamp(sum(side, "ast") / 48, 0.3, 0.75)) {
            const helper = pick(
              team.map((x, j) =>
                j === i ? 0 : Math.max(0, (x.ast * rotation[side][j]) / 36),
              ),
            );
            boxes[side][helper].ast++;
            secondaryIndex = helper;
            secondarySide = side;
            text += ` Assist: ${team[helper].name}.`;
          }
        } else {
          if (blocked) {
            boxes[other][defenderIndex].blk++;
            text = `${defender.name} blocks ${p.name}'s shot!`;
            primarySide = other;
            primaryIndex = defenderIndex;
            secondaryIndex = i;
            secondarySide = side;
          } else
            text = `${p.name} misses ${three ? "from three" : "a two-point shot"}.`;
          rebound();
        }
      }
      const activeRun = run as { side: number; points: number } | null;
      if (
        activeRun &&
        activeRun.side === side &&
        activeRun.points >= 8 &&
        timeouts[other] > 0
      ) {
        timeouts[other]--;
        text += ` Lineup ${other === 0 ? "A" : "B"} calls timeout to stop the ${activeRun.points}–0 run.`;
        run = null;
      }
      plays.push({
        period,
        clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
        side,
        text,
        score: [...score],
        scorers: boxes.map((t) => t.map((b) => b.pts)),
        run: run,
        event,
        possession: serial,
        onCourt: [0, 1].map((courtSide) => {
          const required = courtSide === side ? [offensiveIndex] : [];
          if (primarySide === courtSide) required.push(primaryIndex);
          if (secondaryIndex !== undefined && secondarySide === courtSide)
            required.push(secondaryIndex);
          return onCourt(courtSide, required).map(
            (index) => teams[courtSide][index].id,
          );
        }),
        participants: {
          primaryId: teams[primarySide][primaryIndex].id,
          primarySide,
          offensiveId: team[offensiveIndex].id,
          secondaryId:
            secondaryIndex === undefined
              ? undefined
              : teams[secondarySide][secondaryIndex]?.id,
        },
      });
      if (keep) {
        continuation = true;
        second = true;
      } else {
        side = other;
        continuation = false;
        second = false;
      }
    }
    quarters.push(score.map((v, i) => v - before[i]));
  }
  const totals = (
    key: "oreb" | "tov" | "stl" | "blk" | "secondChance" | "threeM" | "ftm",
  ) => boxes.map((t) => t.reduce((n, p) => n + p[key], 0));
  const summary = [
    `Offensive rebounds: A ${totals("oreb")[0]} — B ${totals("oreb")[1]}. Second-chance points: ${totals("secondChance").join(" — ")}.`,
    `Turnovers: A ${totals("tov")[0]} — B ${totals("tov")[1]}. Steals: ${totals("stl").join(" — ")}; blocks: ${totals("blk").join(" — ")}.`,
    `Made threes: ${totals("threeM").join(" — ")}. Made free throws: ${totals("ftm").join(" — ")}.`,
    `Possessions: A ${possessions[0]} — B ${possessions[1]}. These are observed differences, not proof of a single cause of victory.`,
  ];
  return {
    model: "FIVEOUT matchup model v5",
    score,
    boxes,
    plays,
    quarters,
    tactics: plans,
    secondHalfTactics: secondHalfPlans,
    profiles: teams,
    rotation,
    possessions,
    timeouts,
    fatigue: rotation.map((team) =>
      team.map((minutes) => Math.round(Math.max(0, minutes - 32) * 2.5)),
    ),
    summary,
    calibration: NBA_CALIBRATION,
  };
}
