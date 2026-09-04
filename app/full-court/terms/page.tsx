import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12 text-slate-300">
    <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">Legal</p>
    <h1 className="mt-3 text-4xl font-black text-white">Terms of Use</h1>
    <p className="mt-2 text-sm text-slate-500">Last updated: September 4, 2026</p>
    <div className="mt-10 space-y-8 leading-7">
      <section><h2 className="text-xl font-black text-white">Using FIVEOUT</h2><p className="mt-2">FIVEOUT is a statistical basketball sandbox for entertainment and educational use. You may use it only lawfully and must not disrupt the service, bypass security or usage limits, automate abusive traffic, scrape protected areas, or interfere with other users.</p></section>
      <section><h2 className="text-xl font-black text-white">Accounts</h2><p className="mt-2">You are responsible for access to your email and sign-in provider. Do not impersonate another person or use a misleading public coach name. We may restrict access when necessary to protect users or the service.</p></section>
      <section><h2 className="text-xl font-black text-white">Simulations and data</h2><p className="mt-2">Results are generated from a statistical model and random variation. They are not real-world predictions, official ratings, betting advice, or guarantees of player or team performance. Historical and current data can be incomplete or inaccurate.</p></section>
      <section><h2 className="text-xl font-black text-white">Names and trademarks</h2><p className="mt-2">Player and team names may be used to identify factual basketball data. FIVEOUT is an independent project and is not endorsed by, sponsored by, or affiliated with the NBA, its teams, or their players. Third-party names and marks belong to their respective owners.</p></section>
      <section><h2 className="text-xl font-black text-white">Availability</h2><p className="mt-2">The service is provided as available and may change, pause, or stop. To the extent permitted by law, FIVEOUT is provided without warranties, and the operator is not responsible for indirect loss caused by use of or inability to use the service.</p></section>
      <section><h2 className="text-xl font-black text-white">Your content and conduct</h2><p className="mt-2">You keep ownership of names or other content you submit. You give FIVEOUT permission to store and display that content only as needed to operate features you choose, including public coach profiles and shared challenges.</p></section>
      <section><h2 className="text-xl font-black text-white">Changes and contact</h2><p className="mt-2">These terms may change as FIVEOUT develops. Continued use after an update means the revised terms apply. Questions can be submitted through the <a className="text-cyan-300 underline" href="https://github.com/AvaLonFX/fiveout" rel="noreferrer">FIVEOUT GitHub repository</a>. Your mandatory consumer rights under applicable law remain unaffected.</p></section>
    </div>
    <Link href="/full-court" className="mt-10 inline-block font-bold text-cyan-300">← Back to FIVEOUT</Link>
  </main>;
}
