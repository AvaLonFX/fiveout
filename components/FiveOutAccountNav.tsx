import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { signOutAction } from "@/app/actions";

export default async function FiveOutAccountNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return <Link href="/full-court/account" className="rounded-xl border border-white/15 px-2.5 py-2 text-slate-200 hover:bg-white/5 sm:px-4">Sign in</Link>;
  return <div className="flex items-center gap-1 sm:gap-2">
    <Link href="/full-court/account" className="rounded-xl border border-cyan-300/25 px-2.5 py-2 text-cyan-200 hover:bg-cyan-300/10 sm:px-4">Account</Link>
    <form action={signOutAction}><button className="hidden rounded-xl px-3 py-2 text-slate-400 hover:bg-white/5 sm:block">Sign out</button></form>
  </div>;
}
