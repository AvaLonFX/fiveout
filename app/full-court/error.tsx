"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function FullCourtError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-5 py-16 text-center">
      <section className="w-full rounded-[2rem] border border-amber-300/20 bg-amber-300/[.045] p-8 sm:p-12">
        <p className="text-xs font-black uppercase tracking-[.25em] text-amber-300">The play broke down</p>
        <h1 className="mt-3 text-3xl font-black">FIVEOUT could not finish loading this screen.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Your saved matches and lineups are safe. Try the screen again, or return to the court and start fresh.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-[#06101a] hover:bg-cyan-200">Try again</button>
          <Link href="/full-court" className="rounded-xl border border-white/15 px-5 py-3 font-bold hover:bg-white/5">Return home</Link>
        </div>
      </section>
    </main>
  );
}
