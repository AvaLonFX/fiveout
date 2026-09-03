"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GuesserCounts = {
  guesser_start: number;
  guesser_guess: number;
  guesser_hint: number;
  guesser_end: number;
};

export default function GuesserEventsCharts({
  data,
  days,
}: {
  data: GuesserCounts;
  days: number;
}) {
  const items = useMemo(() => {
    const arr = [
      { key: "guesser_start", label: "Start", value: data.guesser_start, color: "hsl(var(--chart-1))" },
      { key: "guesser_guess", label: "Guess", value: data.guesser_guess, color: "hsl(var(--chart-2))" },
      { key: "guesser_hint", label: "Hint", value: data.guesser_hint, color: "hsl(var(--chart-4))" },
      { key: "guesser_end", label: "End", value: data.guesser_end, color: "hsl(var(--chart-5))" },
    ] as const;

    const total = arr.reduce((s, x) => s + x.value, 0);
    const max = Math.max(1, ...arr.map((x) => x.value));

    return {
      total,
      max,
      perDay: total / Math.max(1, days),
      arr: arr.map((x) => ({
        ...x,
        pct: total ? (x.value / total) * 100 : 0,
        h: (x.value / max) * 100,
      })),
    };
  }, [data, days]);

  const completionRate = useMemo(() => {
    // “end/start” (ako start=0 -> 0)
    const start = data.guesser_start || 0;
    const end = data.guesser_end || 0;
    return start > 0 ? (end / start) * 100 : 0;
  }, [data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* BAR CHART */}
      <Card className="border-foreground/10 bg-background/35 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base sm:text-lg">Events overview</CardTitle>
              <p className="text-sm text-foreground/70 mt-1">
                Event comparison (last {days} days)
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs text-foreground/60">Total</div>
              <div className="text-xl font-bold tabular-nums">{items.total}</div>
              <div className="text-xs text-foreground/60">
                ~{items.perDay.toFixed(1)}/day
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          <div className="rounded-2xl border border-foreground/10 bg-background/20 p-4">
            <div className="flex items-end gap-3 h-44 sm:h-52">
              {items.arr.map((x) => (
                <div key={x.key} className="flex-1 min-w-0">
                  <div className="h-full flex flex-col justify-end">
                    <div
                      className="w-full rounded-xl transition-all duration-300"
                      style={{
                        height: `${x.h}%`,
                        background: x.color,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                      }}
                      aria-label={`${x.label}: ${x.value}`}
                      title={`${x.label}: ${x.value}`}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground/70 truncate">
                      {x.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {x.value}
                    </span>
                  </div>

                  <div className="text-[11px] text-foreground/50 tabular-nums">
                    {x.pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MiniKpi label="Completion (end/start)" value={`${completionRate.toFixed(1)}%`} />
              <MiniKpi label="Starts" value={data.guesser_start} />
              <MiniKpi label="Ends" value={data.guesser_end} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DONUT */}
      <Card className="border-foreground/10 bg-background/35 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Event share</CardTitle>
          <p className="text-sm text-foreground/70 mt-1">
            Share of the total for each event
          </p>
        </CardHeader>

        <CardContent className="pt-2">
          <div className="rounded-2xl border border-foreground/10 bg-background/20 p-4">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Donut
                values={items.arr.map((x) => ({ value: x.value, color: x.color }))}
              />

              <div className="w-full space-y-2">
                {items.arr.map((x) => (
                  <div
                    key={x.key}
                    className="
                      flex items-center justify-between gap-3
                      rounded-xl border border-foreground/10 bg-background/10
                      px-3 py-2
                    "
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: x.color }}
                      />
                      <span className="text-sm text-foreground/80 truncate">
                        {x.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {x.value}
                      </div>
                      <div className="text-xs text-foreground/60 tabular-nums">
                        {x.pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-1 text-xs text-foreground/60">
                   <span className="font-mono"></span> 
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-background/10 px-3 py-2">
      <div className="text-[11px] text-foreground/60">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Donut({
  values,
}: {
  values: Array<{ value: number; color: string }>;
}) {
  const total = values.reduce((s, v) => s + v.value, 0);
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="relative shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />

        {/* segments */}
        {values.map((seg, i) => {
          const frac = total ? seg.value / total : 0;
          const dash = frac * c;
          const dasharray = `${dash} ${c - dash}`;
          const circle = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dasharray 300ms ease" }}
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-xs text-foreground/60">Total</div>
          <div className="text-xl font-bold tabular-nums">{total}</div>
        </div>
      </div>
    </div>
  );
}
