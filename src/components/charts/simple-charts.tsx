"use client";

import { cn } from "@/lib/utils";

export type Slice = { label: string; value: number; color: string };

export function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {slices.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        {centerValue != null && (
          <div className="text-xl font-bold tabular-nums leading-none tracking-tight sm:text-2xl">{centerValue}</div>
        )}
        {centerLabel && <div className="mt-0.5 text-[9px] font-bold uppercase leading-tight text-muted-foreground">{centerLabel}</div>}
      </div>
    </div>
  );
}

export function BarChart({
  items,
  maxBars = 8,
  valueKey = "value",
  labelKey = "label",
}: {
  items: Array<Record<string, string | number>>;
  maxBars?: number;
  valueKey?: string;
  labelKey?: string;
}) {
  const rows = items.slice(0, maxBars);
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));

  return (
    <div className="flex h-full min-h-0 flex-col justify-start gap-1.5 overflow-hidden">
      {rows.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin datos</p>
      )}
      {rows.map((r) => {
        const val = Number(r[valueKey] || 0);
        const pct = Math.round((val / max) * 100);
        return (
          <div key={String(r[labelKey])} className="grid min-w-0 shrink-0 grid-cols-[1fr_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="mb-0.5 truncate text-[11px] font-semibold">{String(r[labelKey])}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartLegend({ slices }: { slices: Slice[] }) {
  return (
    <div className="flex max-h-full min-w-0 flex-col flex-wrap gap-x-3 gap-y-1 overflow-hidden sm:flex-row sm:content-center">
      {slices.map((s) => (
        <div key={s.label} className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className="truncate text-muted-foreground">{s.label}</span>
          <strong className="shrink-0 tabular-nums">{s.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  compact?: boolean;
}) {
  const tones = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-sky-600",
    muted: "text-slate-600",
  };
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm",
        compact ? "px-2.5 py-2" : "p-4"
      )}
    >
      <div
        className={cn(
          "truncate font-bold uppercase tracking-wide text-muted-foreground",
          compact ? "text-[10px]" : "text-[11px]"
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "font-bold tabular-nums tracking-tight",
          compact ? "mt-0.5 text-xl leading-tight sm:text-2xl" : "mt-1 text-3xl",
          tones[tone]
        )}
      >
        {value}
      </div>
      {hint && (
        <p className={cn("truncate text-muted-foreground", compact ? "mt-0.5 text-[10px]" : "mt-1 text-[11px]")}>
          {hint}
        </p>
      )}
    </div>
  );
}
