import FanFeatures from "@/components/FanFeatures";

export default function FullCourtPlay() {
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8">
    <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">FIVEOUT · Match lab</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Build the matchup.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Choose Quick Match to control both teams, or send a Friend Challenge and let another coach build the opposition.</p></div>
    <FanFeatures kind="matchups" standalone />
  </main>;
}
