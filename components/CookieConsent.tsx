"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

type Choice = "accepted" | "rejected" | null;
const COOKIE = "fiveout-cookie-consent";

function readChoice(): Choice {
  const value = document.cookie.split("; ").find(part => part.startsWith(`${COOKIE}=`))?.split("=")[1];
  return value === "accepted" || value === "rejected" ? value : null;
}

export default function CookieConsent() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const gaId = process.env.NEXT_PUBLIC_GA_ID || "";

  useEffect(() => {
    setChoice(readChoice());
    setReady(true);
    const open = () => setChoice(null);
    document.querySelectorAll("[data-cookie-settings]").forEach(node => node.addEventListener("click", open));
    return () => document.querySelectorAll("[data-cookie-settings]").forEach(node => node.removeEventListener("click", open));
  }, []);

  function choose(next: Exclude<Choice, null>) {
    document.cookie = `${COOKIE}=${next}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setChoice(next);
  }

  return <>
    {choice === "accepted" && gaId && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="fiveout-ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}',{anonymize_ip:true});`}</Script>
    </>}
    {ready && choice === null && <aside role="dialog" aria-label="Cookie choices" aria-live="polite" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-2xl rounded-2xl border border-cyan-300/25 bg-[#0a1020] p-5 shadow-2xl shadow-black/60">
      <h2 className="text-lg font-black text-white">Your cookie choice</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">FIVEOUT uses necessary cookies to keep sign-in and match sessions working. With your permission, optional analytics helps us understand how the product is used. You can change this choice later.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => choose("accepted")} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-[#06101a] hover:bg-cyan-200">Accept analytics</button>
        <button onClick={() => choose("rejected")} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/5">Necessary only</button>
        <Link href="/full-court/privacy#cookies" className="text-sm text-slate-400 underline hover:text-white">Learn more</Link>
      </div>
    </aside>}
  </>;
}
