import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/lib/guesser-server";
import { safeRedirect } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectTo = safeRedirect(url.searchParams.get("redirect_to"), "/full-court/account");
  if (!code)
    return NextResponse.redirect(new URL("/full-court/account?error=Invalid+sign-in+link.", url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user)
    return NextResponse.redirect(new URL("/full-court/account?error=Sign-in+link+expired.+Please+try+again.", url.origin));

  const store = await cookies();
  const guestId = store.get("qnba-guesser-guest")?.value?.split(".")[0];
  if (guestId && /^[0-9a-f-]{36}$/.test(guestId)) {
    const db = admin();
    const guest = `guest:${guestId}`;
    const owner = `user:${data.user.id}`;
    const transfers = await Promise.all([
      db.from("match_results").update({ owner_key: owner }).eq("owner_key", guest),
      db.from("match_challenges").update({ creator_key: owner }).eq("creator_key", guest),
      db.from("match_challenges").update({ opponent_key: owner }).eq("opponent_key", guest),
    ]);
    const transferError = transfers.find(result => result.error)?.error;
    if (transferError) console.error("Guest history transfer failed", transferError);
    store.delete("qnba-guesser-guest");
  }
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
