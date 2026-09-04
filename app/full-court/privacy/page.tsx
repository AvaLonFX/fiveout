import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };
const updated = "September 4, 2026";

export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-5 py-12 text-slate-300">
    <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-300">Legal</p>
    <h1 className="mt-3 text-4xl font-black text-white">Privacy Policy</h1>
    <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
    <div className="mt-10 space-y-8 leading-7">
      <section><h2 className="text-xl font-black text-white">What FIVEOUT collects</h2><p className="mt-2">You can use Quick Match without an account. If you sign in, our authentication provider processes your email address, account identifier, and basic profile information supplied by your chosen sign-in provider. FIVEOUT stores your coach profile, saved lineups, match history, challenge participation, and the settings needed to provide the service.</p></section>
      <section><h2 className="text-xl font-black text-white">How we use information</h2><p className="mt-2">We use this information to authenticate you, synchronize your FIVEOUT data across devices, operate friend challenges, prevent abuse, diagnose errors, and improve the simulator. We do not sell personal information.</p></section>
      <section><h2 className="text-xl font-black text-white">Service providers</h2><p className="mt-2">Supabase provides authentication and database services. Vercel hosts and delivers the application. If you accept optional analytics and analytics is enabled, Google Analytics may receive usage information such as visited pages, approximate location, device information, and interaction events. These providers process information under their own terms and privacy policies.</p></section>
      <section id="cookies"><h2 className="text-xl font-black text-white">Cookies and local storage</h2><p className="mt-2">Necessary cookies maintain authentication, security, guest match ownership, and your cookie choice. Local storage may remember interface preferences such as whether you dismissed the introductory guide. Optional analytics is loaded only after you select “Accept analytics.” Select “Cookie settings” in the footer at any time to reconsider your choice.</p></section>
      <section><h2 className="text-xl font-black text-white">Retention and deletion</h2><p className="mt-2">Account-backed FIVEOUT data is retained while you use the service. You can permanently remove your FIVEOUT profile, saved lineups, match history, and challenges from the account page. Because authentication is currently shared with QNBA, deleting FIVEOUT data does not delete the shared login or QNBA data.</p></section>
      <section><h2 className="text-xl font-black text-white">Your choices</h2><p className="mt-2">You may use Quick Match as a guest, keep your coach profile private, reject optional analytics, remove saved lineups individually, or delete all FIVEOUT account data. You may also ask the project owner to review or remove data associated with your account.</p></section>
      <section><h2 className="text-xl font-black text-white">Security and age</h2><p className="mt-2">We use reasonable technical safeguards, but no online service can guarantee absolute security. FIVEOUT is not directed to children under 13, and we do not knowingly collect their personal information.</p></section>
      <section><h2 className="text-xl font-black text-white">Contact and changes</h2><p className="mt-2">For privacy questions, contact the project owner through the <a className="text-cyan-300 underline" href="https://github.com/AvaLonFX/fiveout" rel="noreferrer">FIVEOUT GitHub repository</a>. We may update this policy as the product changes and will revise the date shown above.</p></section>
    </div>
    <Link href="/full-court" className="mt-10 inline-block font-bold text-cyan-300">← Back to FIVEOUT</Link>
  </main>;
}
