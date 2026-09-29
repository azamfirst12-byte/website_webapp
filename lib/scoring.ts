// Lead scoring: pure functions, shared by the server, demo seed and admin UI.
import type { ScoreSignal, WorkspaceConfig } from './workspace-types';

export interface ScoreInput {
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  interested_service?: string | null;
  requirements?: string | null;
  budget?: string | null;
  timeline?: string | null;
  decision_maker?: boolean | null;
  intent_level?: string | null;
  booking_requested?: boolean;
  voice_actions?: number;
  returning_visitor?: boolean;
}

/** Largest number in a budget text such as "$3,000 – $7,500", "5k", "PKR 500000". */
export function budgetAmount(budget: string | null | undefined): number | null {
  if (!budget) return null;
  const nums = [...budget.toLowerCase().replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/g)].map((m) => Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1));
  return nums.length ? Math.max(...nums) : null;
}

export function timelineBucket(t: string | null | undefined): 'urgent' | 'soon' | 'later' | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (/(asap|soon as possible|urgent|immediately|this week|within 1 month|within a month|1 month|next week|now)/.test(s)) return 'urgent';
  if (/(1[–-]3 months|2 months|3 months|this quarter|next month|few weeks|6 weeks)/.test(s)) return 'soon';
  return 'later';
}

export function scoreSignals(i: ScoreInput, highBudgetMin: number): ScoreSignal[] {
  const out: ScoreSignal[] = [];
  if (i.email) out.push('has_email');
  if (i.phone) out.push('has_phone');
  if (i.company) out.push('has_company');
  if (i.interested_service) out.push('service_selected');
  if ((i.requirements ?? '').trim().length >= 40) out.push('requirements_detailed');
  const b = i.budget && !/not sure|unsure|don.t know/i.test(i.budget) ? budgetAmount(i.budget) : null;
  if (b !== null) {
    out.push('budget_known');
    if (b >= highBudgetMin) out.push('budget_high');
  }
  const t = timelineBucket(i.timeline);
  if (t === 'urgent') out.push('timeline_urgent');
  else if (t === 'soon') out.push('timeline_soon');
  if (i.decision_maker) out.push('decision_maker');
  if (i.intent_level === 'high') out.push('intent_high');
  else if (i.intent_level === 'medium') out.push('intent_medium');
  if (i.booking_requested) out.push('booking_requested');
  if ((i.voice_actions ?? 0) >= 3) out.push('engaged_voice');
  if (i.returning_visitor) out.push('returning_visitor');
  return out;
}

/** 0–100 score plus the points each signal contributed. */
export function computeScore(i: ScoreInput, scoring: WorkspaceConfig['scoring']) {
  const signals = scoreSignals(i, scoring.highBudgetMin);
  const breakdown: Partial<Record<ScoreSignal, number>> = {};
  let total = 0;
  for (const s of signals) {
    const p = Number(scoring.points[s] ?? 0);
    if (!p) continue;
    breakdown[s] = p;
    total += p;
  }
  return { score: Math.max(0, Math.min(100, Math.round(total))), breakdown };
}

export function scoreBand(score: number, scoring: Pick<WorkspaceConfig['scoring'], 'qualifiedThreshold' | 'highIntentThreshold'>) {
  if (score >= scoring.highIntentThreshold) return 'hot' as const;
  if (score >= scoring.qualifiedThreshold) return 'qualified' as const;
  if (score >= scoring.qualifiedThreshold / 2) return 'warm' as const;
  return 'cold' as const;
}

export const SIGNAL_LABELS: Record<ScoreSignal, string> = {
  has_email: 'Email provided',
  has_phone: 'Phone provided',
  has_company: 'Company provided',
  service_selected: 'Chose a service',
  requirements_detailed: 'Detailed requirements',
  budget_known: 'Budget stated',
  budget_high: 'High budget',
  timeline_urgent: 'Urgent timeline',
  timeline_soon: 'Timeline within 3 months',
  decision_maker: 'Decision maker',
  intent_high: 'High intent (AI)',
  intent_medium: 'Medium intent (AI)',
  booking_requested: 'Requested a consultation',
  engaged_voice: 'Engaged with voice actions',
  returning_visitor: 'Returning visitor',
};
