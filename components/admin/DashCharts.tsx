'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Dependency-free SVG charts for the dark admin dashboard.
 * Palette: validated categorical order (dark steps) — blue, orange, aqua, yellow, magenta.
 * Marks: 2px lines, 4px rounded bar ends, 2px surface gaps, recessive grid, hover tooltips.
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const SURFACE = '#0a1120';
const GRID = 'rgba(255,255,255,0.07)';
const AXIS_TEXT = 'rgba(255,255,255,0.45)';

/** Measures the container so SVG text stays at real pixel size on any card width. */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export type LabelMode = 'day' | 'month';
export type ValueMode = 'count' | 'money';
/** "2026-09-27" → "Sep 27", "2026-09" → "Sep '26" */
const fmtLabel = (l: string, mode: LabelMode) => {
  const [y, m, d] = l.split('-');
  return mode === 'month' ? `${MONTHS[Number(m) - 1]} '${y.slice(2)}` : `${MONTHS[Number(m) - 1]} ${Number(d)}`;
};
const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-[#0a1120] p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {subtitle && <span className="text-[11px] text-white/40">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value !== undefined && <span className="tabular-nums text-white/45">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Sits inside the plot, beside the hovered point; flips to the left on the right half. */
function Tooltip({ left, flip, children }: { left: string; flip: boolean; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-white/15 bg-[#050a14]/95 px-2.5 py-1.5 text-[11px] text-white shadow-xl"
      style={{ left, top: 4, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
      role="tooltip"
    >
      {children}
    </div>
  );
}

// ─────────────── Line chart (several count series, one axis) ───────────────

export function LineChart({
  labels,
  series,
  height = 220,
  labelMode = 'day',
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string }[];
  height?: number;
  labelMode?: LabelMode;
}) {
  const formatLabel = (l: string) => fmtLabel(l, labelMode);
  const [box, W] = useWidth();
  const H = height;
  const pad = { l: 34, r: 12, t: 10, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - 50) / 64))));

  return (
    <div className="relative" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full"
        role="img"
        aria-label={`Trend of ${series.map((s) => s.name).join(', ')}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          (i % every === 0 && x(n - 1) - x(i) >= 56) || i === n - 1 ? (
            <text key={l} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={AXIS_TEXT}>
              {formatLabel(l)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.25)" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip left={`${(x(hover) / W) * 100}%`} flip={x(hover) > W / 2}>
          <p className="mb-1 font-semibold">{formatLabel(labels[hover])}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-white/70">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular-nums">{fmtNum(s.values[hover])}</span>
            </p>
          ))}
        </Tooltip>
      )}
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color, value: fmtNum(s.values.reduce((a, b) => a + b, 0)) }))} />}
    </div>
  );
}

// ─────────────── Column chart (single series, e.g. order value per day) ───────────────

export function ColumnChart({
  labels,
  values,
  color = SERIES[0],
  height = 180,
  valueMode = 'count',
  labelMode = 'day',
}: {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  valueMode?: ValueMode;
  labelMode?: LabelMode;
}) {
  const formatLabel = (l: string) => fmtLabel(l, labelMode);
  const formatValue = valueMode === 'money' ? fmtMoney : fmtNum;
  const [box, W] = useWidth();
  const H = height;
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...values));
  const n = labels.length;
  const band = (W - pad.l - pad.r) / Math.max(1, n);
  const bw = Math.max(2, band - 2); // 2px surface gap between columns
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - 50) / 64))));
  const base = H - pad.b;

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Column chart" onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
              {formatValue(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x0 = pad.l + i * band + 1;
          const h = Math.max(0, base - y(v));
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {/* hit target larger than the mark */}
              <rect x={pad.l + i * band} y={pad.t} width={band} height={base - pad.t} fill="transparent" />
              {v > 0 && (
                <path
                  d={`M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + bw - r} Q${x0 + bw},${base - h} ${x0 + bw},${base - h + r} V${base} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
            </g>
          );
        })}
        {labels.map((l, i) =>
          (i % every === 0 && (n - 1 - i) * band >= 56) || i === n - 1 ? (
            <text key={l} x={pad.l + i * band + band / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill={AXIS_TEXT}>
              {formatLabel(l)}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <Tooltip left={`${((pad.l + hover * band + band / 2) / W) * 100}%`} flip={pad.l + hover * band > W / 2}>
          <p className="font-semibold">{formatLabel(labels[hover])}</p>
          <p className="tabular-nums">{formatValue(values[hover])}</p>
        </Tooltip>
      )}
    </div>
  );
}

// ─────────────── Donut ───────────────

export function Donut({
  data,
  centerLabel,
  size = 150,
}: {
  /** label may be null (e.g. a grouped SQL value) — shown as "Not set" */
  data: { label: string | null; n: number }[];
  centerLabel: string;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // ≤5 categories: fold the tail into "Other" so hues never cycle.
  const rows = useMemo(() => {
    const sorted = data
      .filter((d) => d.n > 0)
      .map((d) => ({ label: d.label ?? 'Not set', n: d.n }))
      .sort((a, b) => b.n - a.n);
    if (sorted.length <= 5) return sorted;
    return [...sorted.slice(0, 4), { label: 'Other', n: sorted.slice(4).reduce((a, b) => a + b.n, 0) }];
  }, [data]);
  const total = rows.reduce((a, b) => a + b.n, 0);
  const R = 50;
  const r = 34;
  const cx = 60;
  const gap = rows.length > 1 ? 0.035 : 0; // radians — 2px-ish surface gap between segments

  let a0 = -Math.PI / 2;
  const arcs = rows.map((d, i) => {
    const sweep = (d.n / total) * Math.PI * 2;
    const s = a0 + gap / 2;
    const e = a0 + sweep - gap / 2;
    a0 += sweep;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cx + rad * Math.sin(ang)).toFixed(2)}`;
    const full = rows.length === 1;
    const path = full
      ? `M${cx},${cx - R} A${R},${R} 0 1 1 ${cx - 0.01},${cx - R} L${cx - 0.01},${cx - r} A${r},${r} 0 1 0 ${cx},${cx - r} Z`
      : `M${p(s, R)} A${R},${R} 0 ${large} 1 ${p(e, R)} L${p(e, r)} A${r},${r} 0 ${large} 0 ${p(s, r)} Z`;
    return { path, color: SERIES[i], ...d };
  });

  if (!total) return <p className="py-10 text-center text-xs text-white/40">No data in this period.</p>;

  const shown = hover !== null ? rows[hover] : null;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" style={{ width: size, height: size }} className="shrink-0" role="img" aria-label={`${centerLabel}: ${rows.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
        {arcs.map((a, i) => (
          <path
            key={a.label}
            d={a.path}
            fill={a.color}
            opacity={hover === null || hover === i ? 1 : 0.4}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default transition-opacity"
          />
        ))}
        <text x="60" y="58" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">
          {shown ? shown.n : total}
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="8" fill={AXIS_TEXT}>
          {shown ? shown.label.replace(/_/g, ' ') : centerLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[11px]">
        {rows.map((d, i) => (
          <li
            key={d.label}
            className={`flex items-center justify-between gap-2 rounded px-1 ${hover === i ? 'bg-white/5' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-white/80">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
              <span className="truncate capitalize">{d.label.replace(/_/g, ' ')}</span>
            </span>
            <span className="tabular-nums text-white/60">
              {d.n} <span className="text-white/35">{Math.round((100 * d.n) / total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────── Horizontal bars (ranked list) ───────────────

export function HBars({
  data,
  color = SERIES[0],
  valueMode = 'count',
  empty = 'No data in this period.',
}: {
  data: { label: string; n: number; sub?: string }[];
  color?: string;
  valueMode?: ValueMode;
  empty?: string;
}) {
  const formatValue = valueMode === 'money' ? fmtMoney : fmtNum;
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.some((d) => d.n > 0)) return <p className="py-8 text-center text-xs text-white/40">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="group text-[11px]" title={`${d.label}: ${formatValue(d.n)}${d.sub ? ` · ${d.sub}` : ''}`}>
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate text-white/80">{d.label}</span>
            <span className="tabular-nums text-white/60">
              {formatValue(d.n)}
              {d.sub && <span className="ml-1 text-white/35">{d.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5">
            <div className="h-2 rounded-full transition-[filter] group-hover:brightness-125" style={{ width: `${Math.max(2, (100 * d.n) / max)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─────────────── Funnel (ordinal: one hue, dark→light) ───────────────

const FUNNEL_STEPS = ['#86b6ef', '#5598e7', '#3987e5', '#256abf', '#1c5cab'];

export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  if (!steps.some((s) => s.n > 0)) return <p className="py-8 text-center text-xs text-white/40">No product activity in this period.</p>;
  return (
    <ul className="space-y-2">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : null;
        const rate = prev ? Math.round((100 * s.n) / prev) : null;
        return (
          <li key={s.label} className="text-[11px]">
            <div className="mb-1 flex justify-between gap-2 text-white/80">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {s.n.toLocaleString()}
                {rate !== null && <span className="ml-1.5 text-white/40">{rate}% of previous</span>}
              </span>
            </div>
            <div className="flex h-5 justify-center rounded bg-white/[0.03]">
              <div className="h-5 rounded" style={{ width: `${Math.max(2, (100 * s.n) / max)}%`, background: FUNNEL_STEPS[i] }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
