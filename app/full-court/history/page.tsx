import SavedMatches from "@/components/SavedMatches";

export default function FiveOutHistoryPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-8">
      <div className="mb-7">
        <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">FIVEOUT · Archive</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Your match history.</h1>
        <p className="mt-2 text-sm text-slate-400">Revisit saved simulations and completed challenges from this browser or account.</p>
      </div>
      <SavedMatches standalone />
    </div>
  );
}
