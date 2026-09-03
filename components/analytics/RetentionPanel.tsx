"use client";

import { useEffect, useMemo, useState } from "react";

type RetentionResponse = {
  // backend može vratit counts
  newUsers?: number;
  new_users?: number;

  day1?: number; // count
  day7?: number; // count

  // backend može vratit već izračunate postotke
  day1Rate?: number; // percent
  day7Rate?: number; // percent

  // legacy / druge varijante (ako ikad promijeniš)
  d1?: number;
  d7?: number;
  retention1?: number;
  retention7?: number;

  day1_users?: number;
  day7_users?: number;
  day1Users?: number;
  day7Users?: number;
};

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function computeRates(r: RetentionResponse | null) {
  if (!r) return { d1: null as number | null, d7: null as number | null };

  // ✅ 1) PRIORITET: ako backend već šalje rateove, koristi njih
  if (typeof r.day1Rate === "number" || typeof r.day7Rate === "number") {
    return {
      d1: typeof r.day1Rate === "number" ? r.day1Rate : 0,
      d7: typeof r.day7Rate === "number" ? r.day7Rate : 0,
    };
  }

  // ✅ 2) Inače probaj iz countova: newUsers + day1/day7 (ili varijante)
  const newUsers = num((r as any).newUsers ?? (r as any).new_users);
  const day1Users = num(
    (r as any).day1 ??
      (r as any).day1_users ??
      (r as any).day1Users
  );
  const day7Users = num(
    (r as any).day7 ??
      (r as any).day7_users ??
      (r as any).day7Users
  );

  if (newUsers > 0) {
    return {
      d1: (day1Users / newUsers) * 100,
      d7: (day7Users / newUsers) * 100,
    };
  }

  // ✅ 3) Fallback: ako netko vraća direktno postotke pod drugim imenima
  const directD1 = r.d1 ?? r.retention1;
  const directD7 = r.d7 ?? r.retention7;

  return {
    d1: typeof directD1 === "number" ? directD1 : null,
    d7: typeof directD7 === "number" ? directD7 : null,
  };
}

export default function RetentionPanel() {
  const [data, setData] = useState<RetentionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/analytics/retention", { cache: "no-store" });
        const json = (await res.json()) as RetentionResponse;

        console.log("Retention API JSON:", json);

        if (!res.ok) throw new Error((json as any)?.error || "Retention API error");
        setData(json);
      } catch (e: any) {
        setErr(e?.message ?? null);
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { d1, d7 } = useMemo(() => computeRates(data), [data]);
  const hasNumbers = typeof d1 === "number" && typeof d7 === "number";

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Retention</h2>
          <p className="text-sm text-foreground/70">
            How many new users return after 1 and 7 days.
          </p>
        </div>

        {hasNumbers ? (
          <div className="text-right">
            <div className="text-xs text-foreground/60">D7 / D1 ratio</div>
            <div className="text-2xl font-semibold text-foreground">
              {d1! > 0 ? pct((d7! / d1!) * 100) : "—"}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        {loading && <div className="text-sm text-foreground/70">Loading retention data…</div>}

        {!loading && err && (
          <div className="text-sm text-foreground/60">
            Unable to load retention data. Please try again later.
          </div>
        )}

        {!loading && !err && !hasNumbers && (
          <div className="text-sm text-foreground/60">No data yet.</div>
        )}

        {!loading && hasNumbers && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RetentionCard title="Day 1" value={d1!} />
            <RetentionCard title="Day 7" value={d7!} />

            <div className="sm:col-span-2 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-sm font-semibold text-foreground">Trend (mini)</div>
              <p className="mt-1 text-xs text-foreground/60">
                This chart compares day 1 and day 7 retention. A daily trend requires time-series data from Google Analytics.
              </p>

              <div className="mt-4 flex items-end gap-3">
                <Bar label="D1" value={d1!} max={Math.max(d1!, d7!)} />
                <Bar label="D7" value={d7!} max={Math.max(d1!, d7!)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RetentionCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="text-xs text-foreground/60">{title}</div>
      <div className="text-2xl font-semibold text-foreground">{pct(value)}</div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-xs text-foreground/60">
        <span>{label}</span>
        <span className="font-semibold text-foreground/80">{pct(value)}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: "linear-gradient(90deg, hsl(var(--chart-2)), hsl(var(--chart-1)))",
          }}
        />
      </div>
    </div>
  );
}
