import "server-only";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import {
  createHmac,
  randomUUID,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Answer, Era, Game, Mode, Move } from "./guesser-types";
import { feedback, hintText, summarize } from "./guesser-rules";

class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function admin() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing server credentials");
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function identity() {
  const auth = await createClient();
  const {
    data,
    error,
  } = await auth.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) return { owner: `user:${userId}`, signedIn: true };
  const missingSession =
    error?.name === "AuthSessionMissingError" ||
    error?.code === "session_not_found" ||
    error?.message?.toLowerCase().includes("session missing");
  if (error && !missingSession)
    throw new GameError(
      "Unable to verify your account. Please sign in again.",
      401,
    );
  const store = await cookies();
  const key =
    process.env.GUESSER_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing signing key");
  const sign = (id: string) =>
    createHmac("sha256", key).update(`qnba-guesser-guest:${id}`).digest("hex");
  const raw = store.get("qnba-guesser-guest")?.value || "";
  let [id, signature] = raw.split(".");
  const valid =
    /^[0-9a-f-]{36}$/.test(id || "") &&
    /^[0-9a-f]{64}$/.test(signature || "") &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)));
  if (!valid) {
    id = randomUUID();
    signature = sign(id);
    store.set("qnba-guesser-guest", `${id}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return { owner: `guest:${id}`, signedIn: false };
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
function fail(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, e.status);
  console.error(
    "Guesser request failed",
    e instanceof Error ? e.message : "Database error",
  );
  return json({ error: "Game temporarily unavailable. Please retry." }, 503);
}
function bio(p: any): Answer {
  return {
    id: Number(p.PERSON_ID),
    name: p.player_full_name || `${p.PLAYER_FIRST_NAME} ${p.PLAYER_LAST_NAME}`,
    team: p.TEAM_NAME || null,
    position: p.POSITION || null,
    country: p.COUNTRY || null,
    height: p.HEIGHT || null,
    draftYear: p.DRAFT_YEAR == null ? null : String(p.DRAFT_YEAR),
    stats: {
      pts: Number(p.PTS || 0),
      reb: Number(p.REB || 0),
      ast: Number(p.AST || 0),
    },
  };
}
async function pick(era: Era): Promise<Answer> {
  const db = admin();
  if (era === "current") {
    const { data, error } = await db
      .from("verified_current_stats")
      .select("PLAYER_ID,PLAYER_NAME,PTS,REB,AST")
      .gt("PTS", 5)
      .order("PLAYER_ID")
      .limit(1000);
    if (error || !data?.length) throw new Error("No current pool");
    const p = data[randomInt(data.length)];
    const { data: b, error: be } = await db
      .from("Osnovno_NBA")
      .select("*")
      .eq("PERSON_ID", p.PLAYER_ID)
      .single();
    if (be || !b) throw new Error("Missing player biography");
    return {
      ...bio(b),
      stats: { pts: Number(p.PTS), reb: Number(p.REB), ast: Number(p.AST) },
    };
  }
  const all: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("FullStats_NBA")
      .select("PERSON_ID,PTS,REB,AST,GP")
      .gt("GP", 0)
      .order("PERSON_ID")
      .range(offset, offset + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const eligible = all.filter(
    (p) =>
      Number(p.PTS) / Number(p.GP) > 5 &&
      [p.PTS, p.REB, p.AST].every(
        (v) => v !== null && Number.isFinite(Number(v)),
      ),
  );
  if (!eligible.length) throw new Error("No historical pool");
  for (let attempt = 0; attempt < 5 && eligible.length; attempt++) {
    const p = eligible.splice(randomInt(eligible.length), 1)[0];
    const { data: b, error } = await db
      .from("Osnovno_NBA")
      .select("*")
      .eq("PERSON_ID", p.PERSON_ID)
      .maybeSingle();
    if (error) throw error;
    if (!b) continue;
    const round = (v: number) => Math.round(v * 10) / 10;
    return {
      ...bio(b),
      stats: {
        pts: round(p.PTS / p.GP),
        reb: round(p.REB / p.GP),
        ast: round(p.AST / p.GP),
      },
    };
  }
  throw new Error("Historical player biographies unavailable");
}
type Session = {
  id: string;
  owner_key: string;
  era: Era;
  mode: Mode;
  day: string;
  answer: Answer;
  moves: Move[];
  status: Game["status"];
  version: number;
};
function view(s: Session): Game {
  return {
    id: s.id,
    era: s.era,
    mode: s.mode,
    day: s.day,
    version: s.version,
    status: s.status,
    moves: s.moves,
    stats: s.answer.stats,
    player: s.status === "playing" ? null : s.answer,
  };
}
export async function gameRoute(req: NextRequest, era: Era, mode: Mode) {
  try {
    const { owner } = await identity();
    const db = admin();
    if (req.method === "GET") {
      let q = db
        .from("guesser_sessions")
        .select("*")
        .eq("owner_key", owner)
        .eq("era", era)
        .eq("mode", mode);
      if (mode === "daily")
        q = q.eq("day", new Date().toISOString().slice(0, 10));
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return json({ game: data ? view(data) : null });
    }
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin)
      throw new GameError("Invalid request origin", 403);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new GameError("JSON required", 415);
    const raw = await req.text();
    if (raw.length > 2048) throw new GameError("Request too large", 413);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError("Invalid JSON");
    }
    if (!body || typeof body !== "object")
      throw new GameError("Invalid action");
    if (body.action === "start" || body.action === "new") {
      if (body.action === "new" && mode !== "practice")
        throw new GameError("Daily challenges cannot be restarted");
      const today = new Date().toISOString().slice(0, 10);
      let existingQuery = db
        .from("guesser_sessions")
        .select("*")
        .eq("owner_key", owner)
        .eq("era", era)
        .eq("mode", mode);
      if (mode === "daily") existingQuery = existingQuery.eq("day", today);
      const { data: existing, error: existingError } = await existingQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (
        existing &&
        (body.action === "start" || existing.status === "playing")
      )
        return json({ game: view(existing) });
      let answer: Answer | undefined;
      if (mode === "daily") {
        const { data: challenge, error: challengeError } = await db
          .from("guesser_challenges")
          .select("answer")
          .eq("era", era)
          .eq("day", today)
          .maybeSingle();
        if (challengeError) throw challengeError;
        answer = challenge?.answer;
      }
      const { data, error } = await db.rpc("start_guesser", {
        p_owner: owner,
        p_era: era,
        p_mode: mode,
        p_answer: answer || (await pick(era)),
        p_new: body.action === "new",
      });
      if (error) {
        if (error.message.includes("Practice limit"))
          throw new GameError(
            "Practice limit reached. Try again in an hour.",
            429,
          );
        throw error;
      }
      return json({ game: view(data) });
    }
    if (
      !["guess", "hint"].includes(body.action) ||
      typeof body.id !== "string" ||
      !Number.isInteger(body.version)
    )
      throw new GameError("Invalid action");
    if (!/^[0-9a-f-]{36}$/.test(body.id)) throw new GameError("Invalid game");
    const { data: s, error } = await db
      .from("guesser_sessions")
      .select("*")
      .eq("id", body.id)
      .eq("owner_key", owner)
      .eq("era", era)
      .eq("mode", mode)
      .maybeSingle();
    if (error) throw error;
    if (!s) throw new GameError("Game not found", 404);
    if (mode === "daily" && s.day !== new Date().toISOString().slice(0, 10))
      throw new GameError(
        "A new daily challenge is available. Reload to play.",
        409,
      );
    if (s.version !== body.version || s.status !== "playing")
      return json(
        {
          game: view(s),
          error: "Your game has changed. The latest progress is shown.",
        },
        409,
      );
    let move: Move;
    if (body.action === "hint") {
      const n = s.moves.filter((m: Move) => m.type === "hint").length;
      if (n >= 4) throw new GameError("All hints have been used");
      move = { type: "hint", hint: hintText(s.answer, n) };
    } else {
      if (!Number.isSafeInteger(body.playerId) || body.playerId <= 0)
        throw new GameError("Choose a valid player");
      if (s.moves.some((m: Move) => m.id === body.playerId))
        throw new GameError("You already guessed this player. Choose another.");
      const { data: p, error: pe } = await db
        .from("Osnovno_NBA")
        .select("*")
        .eq("PERSON_ID", body.playerId)
        .maybeSingle();
      if (pe) throw pe;
      if (!p) throw new GameError("Player not found");
      const guess = bio(p);
      move = {
        type: "guess",
        id: guess.id,
        name: guess.name,
        correct: guess.id === s.answer.id,
        feedback: feedback(s.answer, guess),
      };
    }
    const moves = [...s.moves, move];
    const status = move.correct
      ? "won"
      : moves.length >= 6
        ? "lost"
        : "playing";
    // Compare-and-swap makes double clicks, retries and concurrent tabs consume at most one move.
    const { data: updated, error: ue } = await db
      .from("guesser_sessions")
      .update({ moves, status, version: s.version + 1 })
      .eq("id", s.id)
      .eq("owner_key", owner)
      .eq("version", body.version)
      .eq("status", "playing")
      .select("*")
      .maybeSingle();
    if (ue) throw ue;
    if (!updated) {
      const { data: latest, error: le } = await db
        .from("guesser_sessions")
        .select("*")
        .eq("id", s.id)
        .eq("owner_key", owner)
        .single();
      if (le) throw le;
      return json(
        {
          game: view(latest),
          error:
            "Another request updated this game. Your latest progress is shown.",
        },
        409,
      );
    }
    return json({ game: view(updated) });
  } catch (e) {
    return fail(e);
  }
}
export async function summaryRoute() {
  try {
    const { owner, signedIn } = await identity();
    const today = new Date().toISOString().slice(0, 10);
    const db = admin();
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("guesser_sessions")
        .select("era,day,status,moves")
        .eq("owner_key", owner)
        .eq("mode", "daily")
        .order("day")
        .order("era")
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const { data: dailyFive, error: fiveError } = await db
      .from("daily_five_results")
      .select("score")
      .eq("owner_key", owner)
      .eq("day", today)
      .maybeSingle();
    if (fiveError) throw fiveError;
    return json({
      signedIn,
      day: today,
      dailyFive,
      current: summarize(
        rows.filter((r) => r.era === "current"),
        today,
      ),
      alltime: summarize(
        rows.filter((r) => r.era === "alltime"),
        today,
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
