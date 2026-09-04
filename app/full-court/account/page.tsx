import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { signInWithGoogleAction, signInWithMagicLinkAction, signOutAction } from "@/app/actions";
import ArenaProfile from "@/components/ArenaProfile";
import SavedLineups from "@/components/SavedLineups";
import AccountDataControls from "@/components/AccountDataControls";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="mx-auto max-w-xl px-5 py-12">
    <section className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[.08] via-[#0a1020] to-violet-500/[.08] p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">FIVEOUT account</p>
      <h1 className="mt-3 text-3xl font-black">Keep your court history.</h1>
      <p className="mt-3 leading-7 text-slate-400">Quick Match stays free without an account. Sign in to keep matches across devices, save lineups, track your record, and manage friend challenges.</p>
      {params.error && <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{params.error}</p>}
      {params.sent && <p role="status" className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">Check {params.sent}. We sent you a secure sign-in link.</p>}
      <form action={signInWithGoogleAction} className="mt-7"><input type="hidden" name="redirectTo" value="/full-court/account"/><button className="w-full rounded-xl bg-white px-4 py-3 font-bold text-slate-950 hover:bg-slate-100">Continue with Google</button></form>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10"/>OR<span className="h-px flex-1 bg-white/10"/></div>
      <form action={signInWithMagicLinkAction} className="space-y-3"><input type="hidden" name="redirectTo" value="/full-court/account"/><label className="block text-sm font-bold">Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-white/15 bg-[#060914] p-3 font-normal outline-none focus:border-cyan-300"/></label><button className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-[#06101a] hover:bg-cyan-200">Email me a sign-in link</button></form>
      <p className="mt-5 text-center text-xs text-slate-500">No password required. Your guest match history will move to your account after sign-in.</p>
      <p className="mt-3 text-center text-xs text-slate-500">By continuing, you agree to the <Link className="underline" href="/full-court/terms">Terms</Link> and acknowledge the <Link className="underline" href="/full-court/privacy">Privacy Policy</Link>.</p>
    </section>
  </main>;
  return <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">FIVEOUT account</p><h1 className="mt-2 text-3xl font-black">Your locker room.</h1><p className="mt-2 text-slate-400">Signed in as {user.email}</p></div><div className="flex gap-2"><Link href="/full-court/history" className="rounded-xl border border-white/15 px-4 py-2 font-bold">Match history</Link><form action={signOutAction}><button className="rounded-xl border border-white/15 px-4 py-2 font-bold">Sign out</button></form></div></div>
    <ArenaProfile />
    <SavedLineups />
    <AccountDataControls />
  </main>;
}
