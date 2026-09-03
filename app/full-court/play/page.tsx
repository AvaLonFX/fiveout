import FanFeatures from "@/components/FanFeatures";

export default function FullCourtPlay() {
  return <main className="mx-auto max-w-7xl px-5 py-8">
    <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">FIVEOUT · Match lab</p><h1 className="mt-2 text-4xl font-black tracking-tight">Build the matchup.</h1><p className="mt-2 text-slate-400">Run both benches yourself or make a friend defend their basketball choices.</p></div>
    <FanFeatures kind="matchups" standalone />
  </main>;
}
