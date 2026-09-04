import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { admin, identity } from "@/lib/guesser-server";

export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  try {
    const { owner, signedIn } = await identity();
    if (!signedIn) return NextResponse.json({ error: "Sign in to manage your data." }, { status: 401 });
    const body = await req.json();
    if (body?.confirmation !== "DELETE")
      return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });

    const { error } = await admin().rpc("delete_fiveout_account_data", { p_owner: owner });
    if (error) throw error;
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("FIVEOUT data deletion failed", error);
    return NextResponse.json({ error: "Unable to delete your FIVEOUT data. Please try again." }, { status: 503 });
  }
}
