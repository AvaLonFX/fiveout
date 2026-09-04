import Link from "next/link";

const features = [
  ["01", "Build your eight", "Choose current stars or legends and shape a legal rotation."],
  ["02", "Challenge a friend", "Share one link, draft live, and play BO1 through BO7."],
  ["03", "Watch every possession", "Follow the tactical court, play-by-play, momentum, and box score."],
];

export default function FullCourtHome() {
  return <main>
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_25%,rgba(34,211,238,.16),transparent_30%),radial-gradient(circle_at_25%_65%,rgba(139,92,246,.18),transparent_34%)]" />
      <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-5 py-16 sm:py-20 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <p className="mb-5 text-xs font-black uppercase tracking-[.3em] text-cyan-300">FIVEOUT · Basketball sandbox</p>
          <h1 className="max-w-3xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl">BUILD THE FIVE.<br/><span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">OWN THE OUTCOME.</span></h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">Build two eight-player rotations, set the tactics, and watch a possession-by-possession simulation decide the matchup.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/full-court/play" className="rounded-xl bg-cyan-300 px-6 py-3 font-black text-[#06101a] shadow-[0_0_40px_rgba(34,211,238,.2)] hover:bg-cyan-200">Build a matchup →</Link>
            <a href="#how" className="rounded-xl border border-white/15 px-6 py-3 font-bold hover:bg-white/5">How it works</a>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 text-xs text-slate-400 sm:gap-8 sm:text-sm"><span><b className="block text-base text-white sm:text-xl">Multiple eras</b>Current + All-Time</span><span><b className="block text-base text-white sm:text-xl">BO1–BO7</b>Series formats</span><span><b className="block text-base text-white sm:text-xl">Live</b>Friend draft</span></div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[.045] p-4 shadow-2xl shadow-violet-950/40">
          <div className="rounded-2xl border border-white/10 bg-[#0a1020] p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400"><span>Q4 · 02:18</span><span className="text-emerald-300">Live simulation</span></div>
            <div className="my-8 grid grid-cols-[1fr_auto_1fr] items-center text-center"><div><span className="text-cyan-300">LINEUP A</span><p className="mt-2 text-5xl font-black">108</p></div><span className="text-2xl text-slate-600">:</span><div><span className="text-violet-300">LINEUP B</span><p className="mt-2 text-5xl font-black">105</p></div></div>
            <div className="relative h-48 overflow-hidden rounded-xl border-4 border-[#e8c38c] bg-[#ad683a]">
              <div className="absolute left-1/2 top-0 h-full w-px bg-[#f7e3bd]"/><div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f7e3bd]"/>
              {[
                ['LD','15%','28%','bg-cyan-300'],
                ['SC','29%','48%','bg-cyan-300'],
                ['SG','18%','74%','bg-cyan-300'],
                ['GA','42%','24%','bg-cyan-300'],
                ['NJ','40%','76%','bg-cyan-300'],
                ['JB','58%','26%','bg-violet-400'],
                ['JT','72%','48%','bg-violet-400'],
                ['KA','84%','27%','bg-violet-400'],
                ['KD','82%','74%','bg-violet-400'],
                ['VW','60%','77%','bg-violet-400'],
              ].map(([n,l,t,c])=><span key={n} style={{left:l,top:t}} className={`absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[10px] font-black text-[#060914] shadow-lg ${c}`}>{n}</span>)}
            </div>
            <p className="mt-4 text-center text-sm text-slate-300">Your rotation. Your read. Every possession.</p>
          </div>
        </div>
      </div>
    </section>
    <section id="how" className="mx-auto max-w-7xl px-5 py-20"><p className="text-xs font-black uppercase tracking-[.3em] text-violet-300">How it works</p><h2 className="mt-3 text-3xl font-black">From zero to tip-off in minutes.</h2><div className="mt-10 grid gap-4 md:grid-cols-3">{features.map(([number,title,copy])=><article key={number} className="rounded-2xl border border-white/10 bg-white/[.035] p-6"><span className="text-sm font-black text-cyan-300">{number}</span><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-3 leading-7 text-slate-400">{copy}</p></article>)}</div><div className="mt-10 flex flex-col gap-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">A statistical basketball sandbox</p><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Player production, role, efficiency, playmaking, defense, rotation minutes and tactics shape each result. Every simulation includes game-to-game variance, so favorites can still lose.</p></div><Link href="/full-court/play" className="shrink-0 rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-[#06101a] hover:bg-cyan-200">Start building</Link></div></section>
  </main>;
}
