"use client";

import { useState } from "react";

export default function AccountDataControls() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function remove() {
    setWorking(true); setError("");
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || "Unable to delete your data."); setWorking(false); return; }
    window.location.assign("/full-court?accountData=deleted");
  }

  return <section className="rounded-2xl border border-red-400/20 bg-red-400/[.035] p-5">
    <h2 className="text-xl font-black">Account data</h2>
    <p className="mt-2 text-sm leading-6 text-slate-400">Permanently remove your FIVEOUT profile, saved lineups, match history, and challenges. Your shared QNBA login and QNBA data will remain.</p>
    {!open ? <button onClick={() => setOpen(true)} className="mt-4 rounded-xl border border-red-400/30 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-400/10">Delete FIVEOUT data</button> : <div className="mt-5 max-w-md rounded-xl border border-red-400/25 bg-[#060914] p-4">
      <p className="text-sm font-bold text-red-200">This cannot be undone. Type DELETE to confirm.</p>
      <input aria-label="Type DELETE to confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-3 w-full rounded-xl border border-white/15 bg-transparent p-3 outline-none focus:border-red-300" />
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3 flex gap-2"><button disabled={confirmation !== "DELETE" || working} onClick={() => void remove()} className="rounded-xl bg-red-400 px-4 py-2 text-sm font-black text-[#160608] disabled:opacity-40">{working ? "Deleting…" : "Delete permanently"}</button><button disabled={working} onClick={() => { setOpen(false); setConfirmation(""); setError(""); }} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Cancel</button></div>
    </div>}
  </section>;
}
