import 'server-only';
import { exec, one, q } from './db';
import { emitWebhook, notify } from './notify';
import { track, isReturningVisitor } from './events';
import { computeScore, scoreBand } from './scoring';
import { can, type Role } from './permissions';
import type { Workspace } from './workspace';
import type { WorkspaceConfig } from './workspace-types';
import { labelize, money } from './format';

const NOW = () => Date.now();
const HOUR = 3_600_000;

export interface Lead {
  id: number;
  workspace_id: string;
  visitor_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  customer_type: string | null;
  company_size: string | null;
  source: string;
  channel: string | null;
  interested_service: string | null;
  requirements: string | null;
  budget: string | null;
  timeline: string | null;
  decision_maker: boolean | null;
  intent_level: string | null;
  score: number;
  score_breakdown: Record<string, number>;
  stage: string;
  value: number;
  assigned_to: number | null;
  assignee_name?: string | null;
  last_interaction_at: number | null;
  next_follow_up_at: number | null;
  summary: string | null;
  next_action: string | null;
  tags: string[];
  custom: Record<string, unknown>;
  lost_reason: string | null;
  won_at: number | null;
  stage_changed_at: number;
  consent: boolean;
  created_at: number;
  updated_at: number;
  is_demo: boolean;
}

export interface LeadInput {
  visitorId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  industry?: string | null;
  customerType?: string | null;
  companySize?: string | null;
  service?: string | null;
  requirements?: string | null;
  budget?: string | null;
  timeline?: string | null;
  decisionMaker?: boolean | null;
  intentLevel?: 'low' | 'medium' | 'high' | null;
  source?: string | null;
  channel?: 'voice' | 'text' | 'form' | null;
  consent?: boolean;
  tags?: string[];
  custom?: Record<string, unknown>;
  value?: number | null;
}

const LEAD_COLS = `l.*, u.full_name AS assignee_name`;
const clean = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
export const normEmail = (e: unknown) => {
  const v = clean(e, 200)?.toLowerCase() ?? null;
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};
export const normPhone = (p: unknown) => {
  const v = clean(p, 40);
  if (!v) return null;
  const plus = v.trim().startsWith('+') || v.trim().startsWith('00');
  const digits = v.replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 7 ? `${plus ? '+' : ''}${digits}` : null;
};

/** Maps "e-commerce store" / "ecommerce-store" / a partial name to a configured service slug. */
export function resolveService(c: WorkspaceConfig, v: unknown): string | null {
  const t = clean(v, 120)?.toLowerCase();
  if (!t) return null;
  const exact = c.services.find((s) => s.slug === t || s.name.toLowerCase() === t);
  if (exact) return exact.slug;
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best: { slug: string; hits: number } | null = null;
  for (const s of c.services) {
    const hay = `${s.slug} ${s.name} ${s.category}`.toLowerCase();
    const hits = words.filter((w) => hay.includes(w)).length;
    if (hits && (!best || hits > best.hits)) best = { slug: s.slug, hits };
  }
  return best?.slug ?? null;
}

export function stageInfo(c: WorkspaceConfig, key: string) {
  return c.crm.stages.find((s) => s.key === key) ?? { key, label: labelize(key), probability: 0, color: '#64748b', kind: 'open' as const };
}

export async function addActivity(
  ws: Workspace,
  a: { leadId: number | null; type: string; title: string; body?: string | null; meta?: Record<string, unknown>; by?: number | null; conversationId?: string | null; at?: number },
) {
  await exec(`INSERT INTO activities (workspace_id, lead_id, conversation_id, type, title, body, meta, by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)`, [
    ws.id,
    a.leadId,
    a.conversationId ?? null,
    a.type,
    a.title.slice(0, 200),
    a.body?.slice(0, 5000) ?? null,
    JSON.stringify(a.meta ?? {}),
    a.by ?? null,
    a.at ?? NOW(),
  ]);
}

/** Round-robin: the active sales rep with the fewest leads assigned in the last 30 days. */
export async function nextAssignee(ws: Workspace): Promise<number | null> {
  if (ws.config.crm.assignment !== 'round_robin') return null;
  const r = await one<{ id: number }>(
    `SELECT u.id FROM admin_users u
     LEFT JOIN leads l ON l.assigned_to = u.id AND l.workspace_id = ? AND l.created_at > ?
     WHERE u.active AND u.role = 'sales' AND NOT u.is_demo
     GROUP BY u.id ORDER BY COUNT(l.id), u.id LIMIT 1`,
    [ws.id, NOW() - 30 * 86_400_000],
  );
  return r ? Number(r.id) : null;
}

async function scoreSignalsFor(lead: Pick<Lead, 'id' | 'visitor_id'>) {
  const r = await one<{ bookings: number; actions: number }>(
    `SELECT (SELECT COUNT(*) FROM appointments WHERE lead_id = ?) AS bookings,
            (SELECT COALESCE(SUM(action_count), 0) FROM conversations WHERE lead_id = ? AND channel = 'voice') AS actions`,
    [lead.id, lead.id],
  );
  return { booking_requested: Number(r?.bookings ?? 0) > 0, voice_actions: Number(r?.actions ?? 0), returning_visitor: await isReturningVisitor(lead.visitor_id) };
}

/** Recomputes the score, moves new/contacted leads to "qualified" when they cross the threshold, notifies on hot leads. */
export async function rescoreLead(ws: Workspace, id: number, by: number | null = null) {
  const lead = await one<Lead>(`SELECT * FROM leads WHERE id=? AND workspace_id=?`, [id, ws.id]);
  if (!lead) return null;
  const extra = await scoreSignalsFor(lead);
  const { score, breakdown } = computeScore({ ...lead, ...extra }, ws.config.scoring);
  const c = ws.config;
  let stage = lead.stage;
  if (c.crm.autoQualify && score >= c.scoring.qualifiedThreshold && ['new', 'contacted'].includes(lead.stage) && c.crm.stages.some((s) => s.key === 'qualified')) stage = 'qualified';
  await exec(`UPDATE leads SET score=?, score_breakdown=?::jsonb, stage=?, stage_changed_at = CASE WHEN stage <> ? THEN ? ELSE stage_changed_at END, updated_at=? WHERE id=?`, [
    score,
    JSON.stringify(breakdown),
    stage,
    stage,
    NOW(),
    NOW(),
    id,
  ]);
  if (score !== lead.score) {
    await addActivity(ws, { leadId: id, type: 'score_change', title: `Lead score ${lead.score} → ${score}`, meta: { from: lead.score, to: score, breakdown }, by });
  }
  if (stage !== lead.stage) {
    await addActivity(ws, { leadId: id, type: 'stage_change', title: `Stage: ${stageInfo(c, lead.stage).label} → ${stageInfo(c, stage).label} (automatic)`, meta: { from: lead.stage, to: stage, auto: true } });
    emitWebhook(ws, 'lead.qualified', { id, name: lead.name, email: lead.email, phone: lead.phone, score });
  }
  const wasHot = scoreBand(lead.score, c.scoring) === 'hot';
  if (!wasHot && scoreBand(score, c.scoring) === 'hot') {
    await notify(ws, {
      type: 'lead_hot',
      title: `🔥 High-intent lead: ${lead.name || lead.email || lead.phone || 'visitor'} (score ${score})`,
      body: [lead.interested_service && `Service: ${lead.interested_service}`, lead.budget && `Budget: ${lead.budget}`, lead.timeline && `Timeline: ${lead.timeline}`].filter(Boolean).join('\n'),
      link: `/admin/leads/${id}`,
      assignedTo: lead.assigned_to,
      isDemo: lead.is_demo,
    });
  }
  return { score, stage };
}

/**
 * Creates or updates the lead for this visitor / email / phone. Only non-empty values overwrite.
 * Used by the assistant (voice + text), the contact and booking forms, and manual entry.
 */
export async function upsertLead(ws: Workspace, input: LeadInput, ctx: { by?: number | null; conversationId?: string | null } = {}) {
  const c = ws.config;
  const email = normEmail(input.email);
  const phone = normPhone(input.phone);
  const service = input.service ? resolveService(c, input.service) : null;
  const patch: Record<string, unknown> = {
    name: clean(input.name, 120),
    email,
    phone,
    company: clean(input.company, 160),
    industry: clean(input.industry, 80),
    customer_type: clean(input.customerType, 40),
    company_size: clean(input.companySize, 40),
    interested_service: service,
    requirements: clean(input.requirements, 4000),
    budget: clean(input.budget, 80),
    timeline: clean(input.timeline, 80),
    decision_maker: typeof input.decisionMaker === 'boolean' ? input.decisionMaker : null,
    intent_level: input.intentLevel && ['low', 'medium', 'high'].includes(input.intentLevel) ? input.intentLevel : null,
  };

  let existing: Lead | undefined;
  if (input.visitorId) existing = await one<Lead>(`SELECT * FROM leads WHERE workspace_id=? AND visitor_id=? ORDER BY updated_at DESC LIMIT 1`, [ws.id, input.visitorId]);
  if (!existing && email) existing = await one<Lead>(`SELECT * FROM leads WHERE workspace_id=? AND lower(email)=? ORDER BY updated_at DESC LIMIT 1`, [ws.id, email]);
  if (!existing && phone) existing = await one<Lead>(`SELECT * FROM leads WHERE workspace_id=? AND phone=? ORDER BY updated_at DESC LIMIT 1`, [ws.id, phone]);

  const now = NOW();
  if (existing) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const changed: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) continue;
      const cur = (existing as unknown as Record<string, unknown>)[k];
      if (k === 'requirements' && typeof cur === 'string' && cur && typeof v === 'string' && !cur.includes(v)) {
        // Requirements accumulate across conversations.
        sets.push(`${k}=?`);
        vals.push(`${cur}\n${v}`.slice(-4000));
        changed.push(k);
        continue;
      }
      if (cur === v) continue;
      // Intent only goes up automatically.
      if (k === 'intent_level' && cur === 'high') continue;
      sets.push(`${k}=?`);
      vals.push(v);
      changed.push(k);
    }
    if (input.visitorId && !existing.visitor_id) {
      sets.push('visitor_id=?');
      vals.push(input.visitorId);
    }
    if (input.consent) sets.push('consent=TRUE');
    if (input.tags?.length) {
      sets.push(`tags=?::jsonb`);
      vals.push(JSON.stringify([...new Set([...(existing.tags ?? []), ...input.tags.map((t) => t.slice(0, 30))])].slice(0, 20)));
    }
    if (input.custom && Object.keys(input.custom).length) {
      sets.push(`custom = custom || ?::jsonb`);
      vals.push(JSON.stringify(input.custom));
    }
    if (!existing.value && service) {
      sets.push('value=?');
      vals.push(c.services.find((s) => s.slug === service)?.startingPrice ?? 0);
    }
    sets.push('last_interaction_at=?', 'updated_at=?');
    vals.push(now, now);
    await exec(`UPDATE leads SET ${sets.join(', ')} WHERE id=?`, [...vals, existing.id]);
    if (changed.length) {
      await addActivity(ws, {
        leadId: existing.id,
        type: 'lead_updated',
        title: `Updated ${changed.map(labelize).join(', ').toLowerCase()}${input.channel ? ` via ${input.channel === 'form' ? 'form' : `${input.channel} assistant`}` : ''}`,
        meta: { changed, source: input.source },
        by: ctx.by,
        conversationId: ctx.conversationId,
      });
      emitWebhook(ws, 'lead.updated', { id: existing.id, changed, ...patch });
    }
    if (ctx.conversationId) await exec(`UPDATE conversations SET lead_id=? WHERE id=? AND lead_id IS NULL`, [existing.id, ctx.conversationId]);
    await rescoreLead(ws, existing.id, ctx.by ?? null);
    return { id: Number(existing.id), created: false };
  }

  // New lead needs at least one way to contact or identify them.
  if (!patch.name && !email && !phone) return { id: 0, created: false, error: 'A name, email or phone number is needed to create a lead.' };

  const assigned = ctx.by ? null : await nextAssignee(ws);
  const value = input.value ?? (service ? c.services.find((s) => s.slug === service)?.startingPrice ?? 0 : 0);
  const source = clean(input.source, 40) ?? (input.channel === 'voice' ? 'voice_assistant' : input.channel === 'text' ? 'text_chat' : 'manual');
  const followUp = now + c.crm.followUpHours * HOUR;
  const row = await one<{ id: number }>(
    `INSERT INTO leads (workspace_id, visitor_id, name, email, phone, company, industry, customer_type, company_size, source, channel, interested_service,
       requirements, budget, timeline, decision_maker, intent_level, stage, value, assigned_to, last_interaction_at, next_follow_up_at, tags, custom, consent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?) RETURNING id`,
    [
      ws.id,
      input.visitorId ?? null,
      patch.name ?? '',
      email,
      phone,
      patch.company,
      patch.industry,
      patch.customer_type,
      patch.company_size,
      source,
      input.channel ?? null,
      service,
      patch.requirements,
      patch.budget,
      patch.timeline,
      patch.decision_maker,
      patch.intent_level,
      c.crm.stages[0]?.key ?? 'new',
      value,
      assigned,
      now,
      followUp,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.custom ?? {}),
      !!input.consent,
    ],
  );
  const id = Number(row!.id);
  const via = input.channel === 'voice' ? 'the voice assistant' : input.channel === 'text' ? 'the chat assistant' : labelize(source).toLowerCase();
  await addActivity(ws, { leadId: id, type: 'lead_created', title: `Lead captured via ${via}`, meta: { source, channel: input.channel }, by: ctx.by, conversationId: ctx.conversationId });
  const displayName = (patch.name as string) || email || phone || 'New visitor';
  await exec(`INSERT INTO tasks (workspace_id, lead_id, title, type, priority, due_at, assigned_to, created_by) VALUES (?, ?, ?, 'follow_up', 'normal', ?, ?, ?)`, [
    ws.id,
    id,
    `Follow up with ${displayName}`,
    followUp,
    assigned,
    ctx.by ?? null,
  ]);
  if (assigned) await addActivity(ws, { leadId: id, type: 'assignment', title: 'Assigned automatically (round-robin)', meta: { to: assigned } });
  if (ctx.conversationId) await exec(`UPDATE conversations SET lead_id=? WHERE id=?`, [id, ctx.conversationId]);
  await track(ws, { type: 'lead_captured', name: source, visitorId: input.visitorId, conversationId: ctx.conversationId, channel: input.channel === 'form' ? null : input.channel ?? null });
  const scored = await rescoreLead(ws, id, ctx.by ?? null);
  const svc = service ? c.services.find((s) => s.slug === service)?.name : null;
  await notify(ws, {
    type: 'lead_new',
    title: `New lead: ${displayName}${patch.company ? ` (${patch.company})` : ''}`,
    body: [`Source: ${labelize(source)}`, svc && `Interested in: ${svc}`, `Score: ${scored?.score ?? 0}`, email && `Email: ${email}`, phone && `Phone: ${phone}`]
      .filter(Boolean)
      .join('\n'),
    link: `/admin/leads/${id}`,
    assignedTo: assigned,
  });
  emitWebhook(ws, 'lead.created', { id, ...patch, source, score: scored?.score ?? 0, stage: scored?.stage });
  return { id, created: true };
}

// ─────────────── Stage / assignment / fields ───────────────

export async function setStage(ws: Workspace, id: number, stage: string, by: number | null, lostReason?: string | null) {
  const c = ws.config;
  const st = c.crm.stages.find((s) => s.key === stage);
  if (!st) return false;
  const lead = await one<Lead>(`SELECT * FROM leads WHERE id=? AND workspace_id=?`, [id, ws.id]);
  if (!lead || lead.stage === stage) return !!lead;
  const now = NOW();
  await exec(
    `UPDATE leads SET stage=?, stage_changed_at=?, updated_at=?, won_at = CASE WHEN ? THEN ? ELSE won_at END, lost_reason = CASE WHEN ? THEN ? ELSE lost_reason END WHERE id=?`,
    [stage, now, now, st.kind === 'won', now, st.kind === 'lost', lostReason?.slice(0, 300) ?? null, id],
  );
  await addActivity(ws, {
    leadId: id,
    type: 'stage_change',
    title: `Stage: ${stageInfo(c, lead.stage).label} → ${st.label}`,
    body: st.kind === 'lost' && lostReason ? `Reason: ${lostReason}` : null,
    meta: { from: lead.stage, to: stage },
    by,
  });
  emitWebhook(ws, st.kind === 'won' ? 'lead.won' : st.kind === 'lost' ? 'lead.lost' : 'lead.stage_changed', { id, name: lead.name, from: lead.stage, to: stage, value: lead.value });
  if (st.kind === 'won') {
    await notify(ws, { type: 'lead_won', title: `🎉 Won: ${lead.name || lead.email} — ${money(lead.value, c.pricing.currency)}`, link: `/admin/leads/${id}`, assignedTo: lead.assigned_to, isDemo: lead.is_demo });
  }
  return true;
}

export async function assignLead(ws: Workspace, id: number, userId: number | null, by: number | null) {
  const u = userId ? await one<{ full_name: string; username: string }>(`SELECT full_name, username FROM admin_users WHERE id=? AND active`, [userId]) : null;
  if (userId && !u) return false;
  await exec(`UPDATE leads SET assigned_to=?, updated_at=? WHERE id=? AND workspace_id=?`, [userId, NOW(), id, ws.id]);
  await exec(`UPDATE tasks SET assigned_to=? WHERE lead_id=? AND done_at IS NULL`, [userId, id]);
  await addActivity(ws, { leadId: id, type: 'assignment', title: userId ? `Assigned to ${u!.full_name || u!.username}` : 'Unassigned', meta: { to: userId }, by });
  if (userId && userId !== by) {
    const lead = await one<{ name: string; is_demo: boolean }>(`SELECT name, is_demo FROM leads WHERE id=?`, [id]);
    await notify(ws, { type: 'lead_assigned', title: `Lead assigned to you: ${lead?.name ?? id}`, link: `/admin/leads/${id}`, assignedTo: userId, onlyAssignee: true, isDemo: lead?.is_demo });
  }
  return true;
}

const EDITABLE = ['name', 'email', 'phone', 'company', 'industry', 'customer_type', 'company_size', 'source', 'interested_service', 'requirements', 'budget', 'timeline', 'value', 'next_action', 'summary'] as const;

export async function updateLeadFields(ws: Workspace, id: number, patch: Partial<Record<(typeof EDITABLE)[number], unknown>> & { tags?: string[]; next_follow_up_at?: number | null; custom?: Record<string, unknown>; decision_maker?: boolean | null }, by: number) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (k === 'email') v = normEmail(v);
    else if (k === 'phone') v = normPhone(v);
    else if (k === 'value') v = Math.max(0, Number(v) || 0);
    else if (k === 'interested_service') v = v ? resolveService(ws.config, v) : null;
    else v = typeof v === 'string' ? v.trim().slice(0, k === 'requirements' || k === 'summary' ? 5000 : 200) || null : null;
    if (k === 'name') v = v ?? '';
    if (k === 'source') v = v ?? 'manual';
    sets.push(`${k}=?`);
    vals.push(v);
  }
  if ('decision_maker' in patch) {
    sets.push('decision_maker=?');
    vals.push(patch.decision_maker ?? null);
  }
  if (patch.tags) {
    sets.push('tags=?::jsonb');
    vals.push(JSON.stringify(patch.tags.map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 20)));
  }
  if ('next_follow_up_at' in patch) {
    sets.push('next_follow_up_at=?');
    vals.push(patch.next_follow_up_at ?? null);
  }
  if (patch.custom) {
    sets.push('custom=?::jsonb');
    vals.push(JSON.stringify(patch.custom));
  }
  if (!sets.length) return;
  sets.push('updated_at=?');
  vals.push(NOW());
  await exec(`UPDATE leads SET ${sets.join(', ')} WHERE id=? AND workspace_id=?`, [...vals, id, ws.id]);
  await addActivity(ws, { leadId: id, type: 'lead_updated', title: 'Details edited', meta: { fields: Object.keys(patch) }, by });
  await rescoreLead(ws, id, by);
}

export async function deleteLead(ws: Workspace, id: number) {
  await exec(`UPDATE conversations SET lead_id=NULL WHERE lead_id=?`, [id]);
  await exec(`DELETE FROM leads WHERE id=? AND workspace_id=?`, [id, ws.id]);
}

// ─────────────── Queries ───────────────

export interface LeadFilters {
  q?: string;
  stage?: string;
  source?: string;
  service?: string;
  assigned?: string; // 'me' | 'unassigned' | user id
  channel?: string;
  customerType?: string;
  band?: 'hot' | 'qualified' | 'warm' | 'cold';
  from?: number;
  to?: number;
  sort?: 'recent' | 'score' | 'value' | 'follow_up';
  page?: number;
  demo?: 'only' | 'hide';
  openOnly?: boolean;
}

export interface Viewer {
  id: number;
  role: Role;
}

/** WHERE clause limiting what a staff member can see. */
export function visibility(viewer: Viewer, alias = 'l') {
  return can(viewer.role, 'leads.view_all') || can(viewer.role, 'leads.edit_all') ? { sql: 'TRUE', params: [] as unknown[] } : { sql: `(${alias}.assigned_to = ? OR ${alias}.assigned_to IS NULL)`, params: [viewer.id] as unknown[] };
}

export async function listLeads(ws: Workspace, f: LeadFilters, viewer: Viewer, pageSize = 30) {
  const where: string[] = ['l.workspace_id = ?'];
  const params: unknown[] = [ws.id];
  const vis = visibility(viewer);
  where.push(vis.sql);
  params.push(...vis.params);
  if (f.q) {
    where.push(`(l.name ILIKE ? OR l.email ILIKE ? OR l.phone ILIKE ? OR l.company ILIKE ? OR l.requirements ILIKE ?)`);
    const like = `%${f.q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like, like, like);
  }
  if (f.stage) where.push('l.stage = ?'), params.push(f.stage);
  if (f.source) where.push('l.source = ?'), params.push(f.source);
  if (f.service) where.push('l.interested_service = ?'), params.push(f.service);
  if (f.channel) where.push('l.channel = ?'), params.push(f.channel);
  if (f.customerType) where.push('l.customer_type = ?'), params.push(f.customerType);
  if (f.assigned === 'me') where.push('l.assigned_to = ?'), params.push(viewer.id);
  else if (f.assigned === 'unassigned') where.push('l.assigned_to IS NULL');
  else if (f.assigned && /^\d+$/.test(f.assigned)) where.push('l.assigned_to = ?'), params.push(Number(f.assigned));
  if (f.band) {
    const s = ws.config.scoring;
    const [lo, hi] = f.band === 'hot' ? [s.highIntentThreshold, 101] : f.band === 'qualified' ? [s.qualifiedThreshold, s.highIntentThreshold] : f.band === 'warm' ? [s.qualifiedThreshold / 2, s.qualifiedThreshold] : [-1, s.qualifiedThreshold / 2];
    where.push('l.score >= ? AND l.score < ?');
    params.push(lo, hi);
  }
  if (f.from) where.push('l.created_at >= ?'), params.push(f.from);
  if (f.to) where.push('l.created_at < ?'), params.push(f.to);
  if (f.openOnly) {
    const open = ws.config.crm.stages.filter((s) => s.kind === 'open').map((s) => s.key);
    where.push(`l.stage = ANY(?::text[])`);
    params.push(`{${open.join(',')}}`);
  }
  if (f.demo === 'only') where.push('l.is_demo');
  if (f.demo === 'hide') where.push('NOT l.is_demo');
  const order =
    f.sort === 'score' ? 'l.score DESC, l.updated_at DESC' : f.sort === 'value' ? 'l.value DESC, l.updated_at DESC' : f.sort === 'follow_up' ? 'l.next_follow_up_at ASC NULLS LAST' : 'l.created_at DESC';
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    q<Lead>(`SELECT ${LEAD_COLS} FROM leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]),
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM leads l WHERE ${where.join(' AND ')}`, params),
  ]);
  return { rows, total: Number(total?.n ?? 0), page, pageSize };
}

export async function getLead(ws: Workspace, id: number) {
  return one<Lead>(`SELECT ${LEAD_COLS} FROM leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE l.id=? AND l.workspace_id=?`, [id, ws.id]);
}

export async function leadTimeline(id: number) {
  return q<{ id: number; type: string; title: string; body: string | null; meta: Record<string, unknown>; created_at: number; by_name: string | null; conversation_id: string | null }>(
    `SELECT a.id, a.type, a.title, a.body, a.meta, a.created_at, a.conversation_id, u.full_name AS by_name
     FROM activities a LEFT JOIN admin_users u ON u.id = a.by_user_id WHERE a.lead_id=? ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
    [id],
  );
}

export async function leadConversations(id: number) {
  return q<{ id: string; channel: string; started_at: number; turn_count: number; action_count: number; intent: string | null; outcome: string | null; status: string }>(
    `SELECT id, channel, started_at, turn_count, action_count, intent, outcome, status FROM conversations WHERE lead_id=? ORDER BY started_at DESC`,
    [id],
  );
}

export async function pipelineBoard(ws: Workspace, viewer: Viewer, f: { service?: string; assigned?: string } = {}) {
  const vis = visibility(viewer);
  const where = ['l.workspace_id = ?', vis.sql];
  const params: unknown[] = [ws.id, ...vis.params];
  if (f.service) where.push('l.interested_service = ?'), params.push(f.service);
  if (f.assigned === 'me') where.push('l.assigned_to = ?'), params.push(viewer.id);
  else if (f.assigned && /^\d+$/.test(f.assigned)) where.push('l.assigned_to = ?'), params.push(Number(f.assigned));
  // Closed deals only for the last 60 days, so the board stays focused.
  where.push(`(l.stage NOT IN (${ws.config.crm.stages.filter((s) => s.kind !== 'open').map(() => '?').join(',') || "''"}) OR l.stage_changed_at > ?)`);
  params.push(...ws.config.crm.stages.filter((s) => s.kind !== 'open').map((s) => s.key), NOW() - 60 * 86_400_000);
  return q<Lead>(`SELECT ${LEAD_COLS} FROM leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE ${where.join(' AND ')} ORDER BY l.score DESC, l.updated_at DESC LIMIT 500`, params);
}

// ─────────────── Notes, tasks, appointments ───────────────

export async function addNote(ws: Workspace, leadId: number, body: string, by: number, kind: 'note' | 'call' | 'email' | 'meeting' = 'note') {
  const titles = { note: 'Note', call: 'Call logged', email: 'Email logged', meeting: 'Meeting logged' };
  await addActivity(ws, { leadId, type: kind, title: titles[kind], body: body.slice(0, 5000), by });
  await exec(`UPDATE leads SET last_interaction_at=?, updated_at=?, stage = CASE WHEN stage = 'new' AND ? <> 'note' THEN 'contacted' ELSE stage END WHERE id=?`, [NOW(), NOW(), kind, leadId]);
}

export async function createTask(ws: Workspace, t: { leadId: number | null; title: string; type: string; dueAt: number | null; assignedTo: number | null; priority: string }, by: number) {
  await exec(`INSERT INTO tasks (workspace_id, lead_id, title, type, priority, due_at, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    ws.id,
    t.leadId,
    t.title.slice(0, 200),
    t.type,
    ['low', 'normal', 'high'].includes(t.priority) ? t.priority : 'normal',
    t.dueAt,
    t.assignedTo,
    by,
  ]);
  if (t.leadId) {
    await addActivity(ws, { leadId: t.leadId, type: 'task', title: `Task added: ${t.title}`, by });
    if (t.dueAt) await exec(`UPDATE leads SET next_follow_up_at = LEAST(COALESCE(next_follow_up_at, ?), ?) WHERE id=?`, [t.dueAt, t.dueAt, t.leadId]);
  }
}

export async function setTaskDone(ws: Workspace, id: number, done: boolean, by: number) {
  const t = await one<{ lead_id: number | null; title: string }>(`UPDATE tasks SET done_at=? WHERE id=? AND workspace_id=? RETURNING lead_id, title`, [done ? NOW() : null, id, ws.id]);
  if (t?.lead_id && done) {
    await addActivity(ws, { leadId: t.lead_id, type: 'task_done', title: `Task completed: ${t.title}`, by });
    // Next follow-up = earliest open task.
    await exec(`UPDATE leads SET last_interaction_at=?, next_follow_up_at=(SELECT MIN(due_at) FROM tasks WHERE lead_id=? AND done_at IS NULL) WHERE id=?`, [NOW(), t.lead_id, t.lead_id]);
  }
}

export async function listTasks(ws: Workspace, viewer: Viewer, scope: 'mine' | 'all' | 'overdue' | 'done' = 'mine', leadId?: number) {
  const where = ['t.workspace_id = ?'];
  const params: unknown[] = [ws.id];
  if (leadId) where.push('t.lead_id = ?'), params.push(leadId);
  if (scope === 'done') where.push('t.done_at IS NOT NULL');
  else where.push('t.done_at IS NULL');
  if (scope === 'overdue') where.push('t.due_at < ?'), params.push(NOW());
  if (scope === 'mine' || !can(viewer.role, 'tasks.manage_all')) {
    if (!leadId) where.push('(t.assigned_to = ? OR (t.assigned_to IS NULL AND ? ))'), params.push(viewer.id, can(viewer.role, 'tasks.manage_all'));
  }
  return q<{ id: number; lead_id: number | null; lead_name: string | null; title: string; type: string; priority: string; due_at: number | null; done_at: number | null; assignee: string | null; assigned_to: number | null }>(
    `SELECT t.id, t.lead_id, l.name AS lead_name, t.title, t.type, t.priority, t.due_at, t.done_at, u.full_name AS assignee, t.assigned_to
     FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN admin_users u ON u.id = t.assigned_to
     WHERE ${where.join(' AND ')} ORDER BY ${scope === 'done' ? 't.done_at DESC' : 't.due_at ASC NULLS LAST'} LIMIT 200`,
    params,
  );
}

export async function createBookingRequest(
  ws: Workspace,
  b: { leadId: number; conversationId?: string | null; preferredTime?: string | null; topic?: string | null; service?: string | null; notes?: string | null; channel?: string | null; visitorId?: string | null },
) {
  const service = b.service ? resolveService(ws.config, b.service) : null;
  const recent = await one<{ id: number }>(`SELECT id FROM appointments WHERE lead_id=? AND status='requested' AND created_at > ? ORDER BY id DESC LIMIT 1`, [b.leadId, NOW() - 20 * 60_000]);
  let id: number;
  if (recent) {
    id = Number(recent.id);
    await exec(`UPDATE appointments SET preferred_time=COALESCE(?, preferred_time), service=COALESCE(?, service), notes=COALESCE(?, notes), updated_at=? WHERE id=?`, [
      b.preferredTime?.slice(0, 120) ?? null,
      service,
      b.notes?.slice(0, 1000) ?? null,
      NOW(),
      id,
    ]);
  } else {
    const r = await one<{ id: number }>(
      `INSERT INTO appointments (workspace_id, lead_id, conversation_id, topic, service, preferred_time, duration_min, channel, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        ws.id,
        b.leadId,
        b.conversationId ?? null,
        (b.topic ?? ws.config.booking.heading ?? 'Consultation').slice(0, 120),
        service,
        b.preferredTime?.slice(0, 120) ?? null,
        ws.config.booking.durationMin,
        b.channel ?? null,
        b.notes?.slice(0, 1000) ?? null,
      ],
    );
    id = Number(r!.id);
    const lead = await one<{ name: string; email: string | null; phone: string | null; assigned_to: number | null }>(`SELECT name, email, phone, assigned_to FROM leads WHERE id=?`, [b.leadId]);
    await addActivity(ws, { leadId: b.leadId, type: 'booking', title: `Consultation requested${b.preferredTime ? ` for ${b.preferredTime}` : ''}`, body: b.notes ?? null, conversationId: b.conversationId });
    await track(ws, { type: 'booking_request', name: service ?? 'consultation', visitorId: b.visitorId, conversationId: b.conversationId, channel: b.channel === 'voice' || b.channel === 'text' ? b.channel : null });
    await notify(ws, {
      type: 'booking',
      title: `📅 Consultation request: ${lead?.name || lead?.email || 'visitor'}`,
      body: [b.preferredTime && `Preferred time: ${b.preferredTime}`, lead?.email && `Email: ${lead.email}`, lead?.phone && `Phone: ${lead.phone}`, b.notes].filter(Boolean).join('\n'),
      link: `/admin/appointments`,
      assignedTo: lead?.assigned_to,
    });
    emitWebhook(ws, 'booking.requested', { appointment_id: id, lead_id: b.leadId, preferred_time: b.preferredTime, service, name: lead?.name, email: lead?.email, phone: lead?.phone });
  }
  await rescoreLead(ws, b.leadId);
  return id;
}

export async function listAppointments(ws: Workspace, viewer: Viewer, status?: string) {
  const vis = visibility(viewer);
  const where = ['a.workspace_id = ?', vis.sql];
  const params: unknown[] = [ws.id, ...vis.params];
  if (status === 'upcoming') where.push(`a.status IN ('requested','confirmed')`);
  else if (status) where.push('a.status = ?'), params.push(status);
  return q<{
    id: number;
    lead_id: number;
    lead_name: string;
    email: string | null;
    phone: string | null;
    topic: string;
    service: string | null;
    preferred_time: string | null;
    scheduled_at: number | null;
    duration_min: number;
    status: string;
    channel: string | null;
    notes: string | null;
    meeting_link: string | null;
    created_at: number;
    assignee: string | null;
  }>(
    `SELECT a.*, l.name AS lead_name, l.email, l.phone, u.full_name AS assignee
     FROM appointments a JOIN leads l ON l.id = a.lead_id LEFT JOIN admin_users u ON u.id = l.assigned_to
     WHERE ${where.join(' AND ')} ORDER BY CASE WHEN a.status IN ('requested','confirmed') THEN 0 ELSE 1 END, COALESCE(a.scheduled_at, a.created_at) ${status === 'upcoming' ? 'ASC' : 'DESC'} LIMIT 200`,
    params,
  );
}

export async function updateAppointment(ws: Workspace, id: number, p: { status?: string; scheduledAt?: number | null; meetingLink?: string | null; notes?: string | null }, by: number) {
  const a = await one<{ lead_id: number; status: string }>(`SELECT lead_id, status FROM appointments WHERE id=? AND workspace_id=?`, [id, ws.id]);
  if (!a) return;
  await exec(
    `UPDATE appointments SET status=COALESCE(?, status), scheduled_at=COALESCE(?, scheduled_at), meeting_link=COALESCE(?, meeting_link), notes=COALESCE(?, notes), updated_at=? WHERE id=?`,
    [p.status ?? null, p.scheduledAt ?? null, p.meetingLink ?? null, p.notes ?? null, NOW(), id],
  );
  if (p.status && p.status !== a.status) {
    await addActivity(ws, { leadId: a.lead_id, type: 'booking', title: `Consultation ${p.status.replace('_', ' ')}`, by });
    if (p.status === 'confirmed' || p.status === 'completed') {
      await exec(`UPDATE leads SET stage = CASE WHEN stage IN ('new','contacted') THEN 'qualified' ELSE stage END, last_interaction_at=? WHERE id=?`, [NOW(), a.lead_id]);
    }
  }
  if (p.scheduledAt) await exec(`UPDATE leads SET next_follow_up_at=? WHERE id=?`, [p.scheduledAt, a.lead_id]);
}
