import type { ReportFilters } from './analytics';

const DAY = 86_400_000;

export const RANGES: Record<string, { label: string; days: number }> = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
  '365d': { label: 'Last 12 months', days: 365 },
};

/** URL search params → report filters (range presets or from/to dates). */
export function parseReportFilters(p: Record<string, string | undefined>): ReportFilters {
  let from: number;
  let to = Date.now() + 1;
  if (p.from && /^\d{4}-\d{2}-\d{2}$/.test(p.from)) {
    from = Date.parse(`${p.from}T00:00:00Z`);
    if (p.to && /^\d{4}-\d{2}-\d{2}$/.test(p.to)) to = Date.parse(`${p.to}T23:59:59Z`) + 1;
  } else from = Date.now() - (RANGES[p.range ?? '30d']?.days ?? 30) * DAY;
  const ch = p.channel === 'voice' || p.channel === 'text' ? p.channel : undefined;
  const bucket = p.bucket === 'day' || p.bucket === 'week' || p.bucket === 'month' ? p.bucket : undefined;
  return {
    from,
    to,
    source: p.source || undefined,
    service: p.service || undefined,
    stage: p.stage || undefined,
    customerType: p.customer_type || undefined,
    channel: ch,
    bucket,
    hideDemo: p.demo === 'hide',
  };
}
