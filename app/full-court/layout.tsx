import Link from "next/link";
import FiveOutMark from "@/components/FiveOutMark";
import FiveOutAccountNav from "@/components/FiveOutAccountNav";

export const metadata = {
  title: "FIVEOUT · Build the matchup",
  description: "Draft across eras, set your rotation, and simulate every possession.",
};

export default function FullCourtLayout({ children }: { children: React.ReactNode }) {
  return <div className="full-court-root min-h-screen bg-[#060914] text-slate-100">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060914]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-5">
        <Link href="/full-court"><FiveOutMark /></Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-1 text-xs font-semibold sm:gap-2 sm:text-sm">
          <Link href="/full-court" className="rounded-xl px-2.5 py-2 text-slate-300 hover:bg-white/5 sm:px-4">Home</Link>
          <Link href="/full-court/history" className="rounded-xl px-2.5 py-2 text-slate-300 hover:bg-white/5 sm:px-4">History</Link>
          <Link href="/full-court/play" className="rounded-xl bg-cyan-300 px-3 py-2 text-[#06101a] shadow-[0_0_24px_rgba(103,232,249,.15)] hover:bg-cyan-200 sm:px-4"><span className="sm:hidden">Play</span><span className="hidden sm:inline">Enter the lab</span></Link>
          <FiveOutAccountNav />
        </nav>
      </div>
    </header>
    {children}
  </div>;
}
