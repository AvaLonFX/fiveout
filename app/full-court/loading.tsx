import FiveOutBall from "@/components/FiveOutBall";

export default function FullCourtLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
      <div className="fiveout-loading" role="status" aria-live="polite">
        <div className="fiveout-loading-court" aria-hidden="true">
          <FiveOutBall className="fiveout-loading-ball" />
          <span className="fiveout-loading-shadow" />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[.28em] text-cyan-300">Preparing the court</p>
        <h1 className="mt-2 text-2xl font-black">Loading FIVEOUT…</h1>
      </div>
    </main>
  );
}
