import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const processSecret = randomBytes(32).toString("hex");
const secret = () =>
  process.env.GUESSER_COOKIE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  processSecret;
const sign = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");

export const matchToken = (seed: number, issued: number) => {
  const value = `${seed}.${issued}`;
  return `${value}.${sign(value)}`;
};

export function readMatchToken(token: unknown) {
  if (typeof token !== "string" || token.length > 160) return null;
  const [seedText, issuedText, signature, ...extra] = token.split(".");
  const seed = Number(seedText),
    issued = Number(issuedText);
  if (
    extra.length ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isSafeInteger(issued) ||
    Math.abs(Date.now() - issued) > 60 * 60 * 1000 ||
    !/^[a-f0-9]{64}$/.test(signature || "")
  )
    return null;
  const expected = Buffer.from(sign(`${seed}.${issued}`), "hex"),
    actual = Buffer.from(signature, "hex");
  return timingSafeEqual(expected, actual) ? { seed, issued } : null;
}

export const seededRandom = (initial: number) => {
  let state = initial >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const newMatchSeed = () => randomBytes(4).readUInt32BE(0);
