import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;

  const hasCode = url.searchParams.has("code");
  const isHome = url.pathname === "/";
  const isAnalyticsFlow =
    url.searchParams.has("scope") ||
    url.searchParams.get("state")?.startsWith("ga") ||
    url.searchParams.get("redirect_uri")?.includes("/analytics/callback");

  // FIX za Supabase OAuth, ali NE diraj GA OAuth
  if (isHome && hasCode && !isAnalyticsFlow) {
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
