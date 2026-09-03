"use client";

import { useEffect, useMemo, useState } from "react";

type FunnelRow = { step: string; users: number };

// conversionRate može biti stari broj ili novi objekt s više metrika
type ConversionRateObject = {
  viewFromSearch?: number; // %
  compareFromView?: number; // %
  compareFromSearch?: number; // %
};

type FunnelResponse = {
  funnel: FunnelRow[];
  conversionRate?: number | ConversionRateObject;
};

function formatPct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Sparkline({
  values,
  height = 44,
}: {
  values: number[];
  height?: number;
}) {
  const width = 220;

  const max = Math.max(1, ...values);
  const min = Math.min(...values);

  const points = values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const t = max === min ? 0.5 : (v - min) / (max - min);
      const y = (1 - t) * (height - 8) + 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-[260px]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="hsl(var(--chart-5))" />
          <stop offset="1" stopColor="hsl(var(--chart-1))" />
        </linearGradient>
      </defs>

      {/* baseline */}
      <path
        d={`M0 ${height - 4} H ${width}`}
        stroke="hsl(var(--border))"
        strokeWidth="1"
        opacity="0.6"
      />

      {/* line */}
      <polyline
        fill="none"
        stroke="url(#spark)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function FunnelPanel() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/analytics/funnel", { cache: "no-store" });
        const json = (await res.json()) as FunnelResponse;

        if (!res.ok) throw new Error((json as any)?.error || "Funnel API error");
        setData(json);
      } catch (e: any) {
        setErr(e?.message ?? "Unknown error");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const funnel = data?.funnel ?? [];

  const maxUsers = useMemo(
    () => Math.max(1, ...funnel.map((r) => r.users)),
    [funnel]
  );

  const totalUsers = useMemo(
    () => funnel.reduce((acc, r) => acc + (r.users ?? 0), 0),
    [funnel]
  );

  const computedConversion = useMemo(() => {
    if (funnel.length < 2) return 0;
    const first = funnel[0]?.users ?? 0;
    const last = funnel[funnel.length - 1]?.users ?? 0;
    if (first <= 0) return 0;
    return (last / first) * 100;
  }, [funnel]);

  const conversionHeadline = useMemo(() => {
    const cr = data?.conversionRate;
    if (typeof cr === "number") return cr;
    return computedConversion;
  }, [data?.conversionRate, computedConversion]);

  const conversionDetails: ConversionRateObject | null = useMemo(() => {
    const cr = data?.conversionRate;
    if (cr && typeof cr === "object") return cr;
    return null;
  }, [data?.conversionRate]);

  const sparkValues = useMemo(() => funnel.map((f) => f.users), [funnel]);

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Funnel</h2>
          <p className="text-sm text-foreground/70">
            See each step (Search → View → …) and how many users continue.
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="text-right">
            <div className="text-xs text-foreground/60">
              Conversion (last / first)
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {formatPct(conversionHeadline)}
            </div>
          </div>

          {sparkValues.length > 0 ? <Sparkline values={sparkValues} /> : null}
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${clamp(conversionHeadline, 0, 100)}%`,
            background:
              "linear-gradient(90deg, hsl(var(--chart-2)), hsl(var(--chart-1)))",
          }}
        />
      </div>

      {conversionDetails && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniStat label="Search → View" value={formatPct(conversionDetails.viewFromSearch ?? 0)} />
          <MiniStat label="View → Compare" value={formatPct(conversionDetails.compareFromView ?? 0)} />
          <MiniStat label="Search → Compare" value={formatPct(conversionDetails.compareFromSearch ?? 0)} />
        </div>
      )}

      <div className="mt-6">
        {loading && <div className="text-sm text-foreground/70">Loading funnel data…</div>}

        {err && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {err}
          </div>
        )}

        {!loading && !err && funnel.length === 0 && (
          <div className="text-sm text-foreground/70">No data yet.</div>
        )}

        {!loading && !err && funnel.length > 0 && (
          <div className="mt-2 grid gap-3">
            {funnel.map((row, idx) => {
              const prev = idx === 0 ? null : funnel[idx - 1];
              const dropFromPrev =
                prev && prev.users > 0 ? (row.users / prev.users) * 100 : null;

              return (
                <div
                  key={`${row.step}-${idx}`}
                  className="rounded-2xl border border-border bg-muted/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background">
                          {idx + 1}
                        </span>
                        {row.step}
                      </div>

                      <div className="mt-1 text-xs text-foreground/60">
                        {prev ? (
                          <>
                            From the previous step:{" "}
                            <span className="font-semibold text-foreground/80">
                              {dropFromPrev ? formatPct(dropFromPrev) : "—"}
                            </span>
                          </>
                        ) : (
                          "First step"
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs text-foreground/60">Users</div>
                      <div className="text-lg font-semibold text-foreground">
                        {row.users}
                      </div>
                    </div>
                  </div>

                  {/* bar */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(row.users / maxUsers) * 100}%`,
                        background:
                          "linear-gradient(90deg, hsl(var(--chart-5)), hsl(var(--chart-1)))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !err && funnel.length > 0 && (
          <div className="mt-4 text-xs text-foreground/60">
            Total “users across steps”: <span className="font-semibold text-foreground/80">{totalUsers}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="text-xs text-foreground/60">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
