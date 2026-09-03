// lib/ga-data.ts
import { cookies } from "next/headers";

const GA_CLIENT_ID = process.env.GA_CLIENT_ID!;
const GA_CLIENT_SECRET = process.env.GA_CLIENT_SECRET!;
const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID!;

export function getBaseUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl;

  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return vercel ?? "http://localhost:3000";
}

export function getGoogleAuthUrl() {
  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/google/callback`;

  const params = new URLSearchParams({
    client_id: GA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function isInvalidGrantPayload(text: string) {
  return text.includes('"error":"invalid_grant"') || text.includes("invalid_grant");
}

async function exchangeCodeForTokens(code: string) {
  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/google/callback`;

  const body = new URLSearchParams({
    code,
    client_id: GA_CLIENT_ID,
    client_secret: GA_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: GA_CLIENT_ID,
    client_secret: GA_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && isInvalidGrantPayload(text)) {
      throw new Error(`GA_INVALID_GRANT: ${text}`);
    }
    throw new Error(`Refresh token failed: ${res.status} ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

/**
 * OVO se smije jer se zove iz Route Handlera (/api/google/callback)
 */
export async function saveTokensFromCode(code: string) {
  const tok = await exchangeCodeForTokens(code);
  const c = await cookies();

  if (tok.refresh_token) {
    c.set("ga_refresh_token", tok.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }

  c.set("ga_access_token", tok.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: tok.expires_in,
  });

  return tok;
}

/**
 * OVO se smije SAMO ako se zove iz Server Actiona ili Route Handlera.
 * (Nemoj ga zvati iz "običnih" server funkcija koje renderaju page.)
 */
export async function disconnectGa() {
  const c = await cookies();
  c.set("ga_refresh_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  c.set("ga_access_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Server component može READ cookies, ali ne smije SET.
 * Zato ovdje samo vraćamo token, bez spremanja novog access tokena u cookie.
 */
async function getValidAccessToken() {
  const c = await cookies();

  const access = c.get("ga_access_token")?.value;
  if (access) return access;

  const refresh = c.get("ga_refresh_token")?.value;
  if (!refresh) return null;

  try {
    const refreshed = await refreshAccessToken(refresh);
    // NE SMIJEMO c.set(...) ovdje (server component path)
    return refreshed.access_token;
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.startsWith("GA_INVALID_GRANT:")) {
      // Token je istekao / revokean -> ponašaj se kao "not connected"
      // (korisnik može kliknuti Disconnect/Connect)
      return null;
    }
    throw err;
  }
}

export async function fetchGuesserEventsSummary(days = 7) {
  if (!GA_PROPERTY_ID) throw new Error("Missing GA_PROPERTY_ID env var.");

  const token = await getValidAccessToken();
  if (!token) return null;

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`;

  const body = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: {
          values: ["guesser_start", "guesser_guess", "guesser_hint", "guesser_end"],
        },
      },
    },
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();

    // Ako je access token invalid (401) -> samo vrati null (bez cookie set-a)
    if (res.status === 401 && isInvalidGrantPayload(text)) {
      return null;
    }

    throw new Error(`runReport failed: ${res.status} ${text}`);
  }

  const json = await res.json();

  const rows = json.rows ?? [];
  const out: Record<string, number> = {};
  for (const r of rows) {
    const name = r.dimensionValues?.[0]?.value;
    const countStr = r.metricValues?.[0]?.value;
    if (name) out[name] = Number(countStr ?? 0);
  }

  for (const k of ["guesser_start", "guesser_guess", "guesser_hint", "guesser_end"]) {
    if (!(k in out)) out[k] = 0;
  }

  return out;
}
