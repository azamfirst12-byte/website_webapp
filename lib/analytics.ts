import 'server-only';
import { one, q } from './db';
import { tzName } from './format';
import type { Workspace } from './workspace';

/**
 * Report queries for /admin/reports and the dashboard. `from`/`to` are unix ms.
 * Filters: lead source, service, stage, customer type apply to lead metrics;
 * channel (voice/text) applies to conversation, action and lead metrics; source also filters traffic.
 */
export interface ReportFilters {
  from: number;
  to: number;
  source?: string;
  service?: string;
  stage?: string;
  customerType?: string;
  channel?: 'voice' | 'text';
  bucket?: 'day' | 'week' | 'month';
  hideDemo?: boolean;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

function leadWhere(ws: Workspace, f: ReportFilters, alias = 'l', range = true) {
  const w = [`${alias}.workspace_id = ?`];
  const p: unknown[] = [ws.id];
  if (range) w.push(`${alias}.created_at >= ? AND ${alias}.created_at < ?`), p.push(f.from, f.to);
  if (f.source) w.push(`${alias}.source = ?`), p.push(f.source);
  if (f.service) w.push(`${alias}.interested_service = ?`), p.push(f.service);
  if (f.stage) w.push(`${alias}.stage = ?`), p.push(f.stage);
  if (f.customerType) w.push(`${alias}.customer_type = ?`), p.push(f.customerType);
  if (f.channel) w.push(`${alias}.channel = ?`), p.push(f.channel);
  if (f.hideDemo) w.push(`NOT ${alias}.is_demo`);
  return { sql: w.join(' AND '), params: p };
}

function convWhere(ws: Workspace, f: ReportFilters, alias = 'c') {
  const w = [`${alias}.workspace_id = ?`, `${alias}.started_at >= ?`, `${alias}.started_at < ?`];
  const p: unknown[] = [ws.id, f.from, f.to];
  if (f.channel) w.push(`${alias}.channel = ?`), p.push(f.channel);
  if (f.hideDemo) w.push(`NOT ${alias}.is_demo`);
  if (f.source) w.push(`EXISTS (SELECT 1 FROM visitors v WHERE v.id = ${alias}.visitor_id AND v.source = ?)`), p.push(f.source);
  if (f.service) w.push(`EXISTS (SELECT 1 FROM leads x WHERE x.id = ${alias}.lead_id AND x.interested_service = ?)`), p.push(f.service);
  return { sql: w.join(' AND '), params: p };
}

function eventWhere(ws: Workspace, f: ReportFilters, alias = 'e') {
  const w = [`${alias}.workspace_id = ?`, `${alias}.created_at >= ?`, `${alias}.created_at < ?`];
  const p: unknown[] = [ws.id, f.from, f.to];
  if (f.hideDemo) w.push(`NOT ${alias}.is_demo`);
  if (f.source) w.push(`EXISTS (SELECT 1 FROM visitors v WHERE v.id = ${alias}.visitor_id AND v.source = ?)`), p.push(f.source);
  return { sql: w.join(' AND '), params: p };
}

export async function kpis(ws: Workspace, f: ReportFilters) {
  const c = ws.config;
  const qi = c.crm.stages.findIndex((x) => x.key === 'qualified');
  const qualifiedStages = qi < 0 ? [] : c.crm.stages.filter((s, i) => i >= qi && s.kind !== 'lost').map((s) => s.key);
  // Opportunities = open stages after "qualified" (Proposal, Negotiation by default).
  const oppStages = qi < 0 ? [] : c.crm.stages.filter((s, i) => i > qi && s.kind === 'open').map((s) => s.key);
  const won = c.crm.stages.filter((s) => s.kind === 'won').map((s) => s.key);
  const lost = c.crm.stages.filter((s) => s.kind === 'lost').map((s) => s.key);
  const lw = leadWhere(ws, f);
  const inList = (arr: string[]) => (arr.length ? arr.map((s) => `'${s.replace(/'/g, "''")}'`).join(',') : `''`);

  const traffic = await one<Record<string, unknown>>(
    `SELECT COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.type='page_view') AS visitors,
            COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.type='page_view' AND v.visits > 1) AS returning,
            COUNT(*) FILTER (WHERE e.type='page_view') AS page_views,
            COALESCE(SUM((e.meta->>'ms')::numeric) FILTER (WHERE e.type='engagement'), 0) AS engaged_ms,
            COUNT(*) FILTER (WHERE e.type='cta_click') AS cta_clicks
     FROM events e LEFT JOIN visitors v ON v.id = e.visitor_id WHERE ${eventWhere(ws, f).sql}`,
    eventWhere(ws, f).params,
  );
  const cw = convWhere(ws, f);
  const convs = await one<Record<string, unknown>>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE c.channel='voice') AS voice,
            COUNT(*) FILTER (WHERE c.channel='text') AS text,
            COUNT(*) FILTER (WHERE c.success) AS successful,
            COUNT(*) FILTER (WHERE c.success IS NOT NULL) AS judged,
            COUNT(*) FILTER (WHERE c.handoff) AS handoffs,
            COALESCE(SUM(c.action_count) FILTER (WHERE c.channel='voice'), 0) AS voice_actions,
            COALESCE(SUM(c.failed_actions) FILTER (WHERE c.channel='voice'), 0) AS voice_failed,
            COUNT(*) FILTER (WHERE c.channel='voice' AND c.lead_id IS NOT NULL) AS voice_leads,
            COUNT(*) FILTER (WHERE c.channel='voice' AND EXISTS (SELECT 1 FROM appointments a WHERE a.conversation_id = c.id)) AS voice_bookings,
            COALESCE(AVG(c.turn_count), 0) AS avg_turns,
            COALESCE(AVG(c.ended_at - c.started_at) FILTER (WHERE c.ended_at IS NOT NULL), 0) AS avg_duration
     FROM conversations c WHERE ${cw.sql}`,
    cw.params,
  );
  const leads = await one<Record<string, unknown>>(
    `SELECT COUNT(*) AS leads,
            COUNT(*) FILTER (WHERE l.stage IN (${inList(qualifiedStages)}) OR l.score >= ?) AS qualified,
            COUNT(*) FILTER (WHERE l.stage IN (${inList(won)})) AS won,
            COUNT(*) FILTER (WHERE l.stage IN (${inList(lost)})) AS lost,
            COALESCE(SUM(l.value) FILTER (WHERE l.stage IN (${inList(won)})), 0) AS won_value,
            COUNT(*) FILTER (WHERE l.channel = 'voice') AS voice_leads,
            COUNT(*) FILTER (WHERE l.score >= ?) AS hot
     FROM leads l WHERE ${lw.sql}`,
    [c.scoring.qualifiedThreshold, c.scoring.highIntentThreshold, ...lw.params],
  );
  // Pipeline is a snapshot (not limited to leads created in the range).
  const pw = leadWhere(ws, { ...f, stage: undefined }, 'l', false);
  const probs = c.crm.stages.map((s) => `WHEN '${s.key.replace(/'/g, "''")}' THEN ${Math.max(0, Math.min(100, Number(s.probability) || 0))}`).join(' ');
  const pipe = await one<Record<string, unknown>>(
    `SELECT COUNT(*) FILTER (WHERE l.stage NOT IN (${inList([...won, ...lost])})) AS open,
            COUNT(*) FILTER (WHERE l.stage IN (${inList(oppStages)})) AS active_opps,
            COALESCE(SUM(l.value) FILTER (WHERE l.stage NOT IN (${inList([...won, ...lost])})), 0) AS open_value,
            COALESCE(SUM(l.value * (CASE l.stage ${probs} ELSE 0 END) / 100.0) FILTER (WHERE l.stage NOT IN (${inList([...won, ...lost])})), 0) AS weighted_value
     FROM leads l WHERE ${pw.sql}`,
    pw.params,
  );
  const appts = await one<Record<string, unknown>>(
    `SELECT COUNT(*) AS requested, COUNT(*) FILTER (WHERE a.status IN ('confirmed','completed')) AS confirmed
     FROM appointments a JOIN leads l ON l.id = a.lead_id WHERE a.created_at >= ? AND a.created_at < ? AND ${leadWhere(ws, f, 'l', false).sql}`,
    [f.from, f.to, ...leadWhere(ws, f, 'l', false).params],
  );
  const tasks = await one<Record<string, unknown>>(
    `SELECT COUNT(*) AS due, COUNT(*) FILTER (WHERE t.done_at IS NOT NULL) AS done, COUNT(*) FILTER (WHERE t.done_at IS NOT NULL AND t.done_at <= t.due_at + 86400000) AS on_time
     FROM tasks t WHERE t.workspace_id = ? AND t.due_at >= ? AND t.due_at < ? ${f.hideDemo ? 'AND NOT t.is_demo' : ''}`,
    [ws.id, f.from, Math.min(f.to, Date.now())],
  );

  const visitors = num(traffic?.visitors);
  const totalConvs = num(convs?.total);
  const voice = num(convs?.voice);
  const leadsN = num(leads?.leads);
  return {
    visitors,
    returningVisitors: num(traffic?.returning),
    pageViews: num(traffic?.page_views),
    ctaClicks: num(traffic?.cta_clicks),
    avgEngagementMs: visitors ? num(traffic?.engaged_ms) / visitors : 0,
    conversations: totalConvs,
    voiceSessions: voice,
    textSessions: num(convs?.text),
    aiSuccessRate: num(convs?.judged) ? num(convs?.successful) / num(convs?.judged) : 0,
    handoffs: num(convs?.handoffs),
    handoffRate: totalConvs ? num(convs?.handoffs) / totalConvs : 0,
    commandsPerVoiceSession: voice ? num(convs?.voice_actions) / voice : 0,
    voiceActions: num(convs?.voice_actions),
    voiceActionFailRate: num(convs?.voice_actions) ? num(convs?.voice_failed) / num(convs?.voice_actions) : 0,
    voiceSessionsWithLead: num(convs?.voice_leads),
    voiceToBookingRate: voice ? num(convs?.voice_bookings) / voice : 0,
    avgTurns: num(convs?.avg_turns),
    avgConversationMs: num(convs?.avg_duration),
    leads: leadsN,
    qualifiedLeads: num(leads?.qualified),
    hotLeads: num(leads?.hot),
    won: num(leads?.won),
    lost: num(leads?.lost),
    wonValue: num(leads?.won_value),
    voiceLeads: num(leads?.voice_leads),
    leadToClientRate: leadsN ? num(leads?.won) / leadsN : 0,
    visitorToLeadRate: visitors ? leadsN / visitors : 0,
    openLeads: num(pipe?.open),
    activeOpportunities: num(pipe?.active_opps),
    pipelineValue: num(pipe?.open_value),
    weightedPipelineValue: num(pipe?.weighted_value),
    consultationRequests: num(appts?.requested),
    consultationsConfirmed: num(appts?.confirmed),
    tasksDue: num(tasks?.due),
    tasksDone: num(tasks?.done),
    followUpCompletion: num(tasks?.due) ? num(tasks?.done) / num(tasks?.due) : 0,
    followUpOnTime: num(tasks?.due) ? num(tasks?.on_time) / num(tasks?.due) : 0,
  };
}

/** Bucket labels (day YYYY-MM-DD, week = Monday YYYY-MM-DD, month YYYY-MM) in the store time zone. */
function buckets(from: number, to: number, bucket: 'day' | 'week' | 'month', tz: string) {
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const labels: string[] = [];
  const seen = new Set<string>();
  const end = Math.min(to, Date.now());
  for (let t = from; t <= end + 43_200_000; t += 43_200_000) {
    const d = dayFmt.format(new Date(Math.min(t, end)));
    let label = d;
    if (bucket === 'month') label = d.slice(0, 7);
    else if (bucket === 'week') {
      const dt = new Date(`${d}T00:00:00Z`);
      const dow = (dt.getUTCDay() + 6) % 7;
      label = new Date(dt.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
    }
    if (!seen.has(label)) seen.add(label), labels.push(label);
  }
  return labels;
}

const bucketSql = (col: string, bucket: 'day' | 'week' | 'month') =>
  bucket === 'month'
    ? `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE $TZ, 'YYYY-MM')`
    : bucket === 'week'
      ? `to_char(date_trunc('week', to_timestamp(${col} / 1000.0) AT TIME ZONE $TZ), 'YYYY-MM-DD')`
      : `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE $TZ, 'YYYY-MM-DD')`;

/** Leads, qualified, won, conversations (voice/text) per bucket. */
export async function trends(ws: Workspace, f: ReportFilters) {
  const tz = tzName();
  const days = (f.to - f.from) / 86_400_000;
  const bucket = f.bucket ?? (days > 120 ? 'month' : days > 45 ? 'week' : 'day');
  const lw = leadWhere(ws, f);
  const cw = convWhere(ws, f);
  const b = (col: string) => bucketSql(col, bucket).replace(/\$TZ/g, '?::text');
  const rows = await q<{ b: string; k: string; n: number }>(
    `SELECT ${b('l.created_at')} AS b, 'leads' AS k, COUNT(*) AS n FROM leads l WHERE ${lw.sql} GROUP BY 1
     UNION ALL SELECT ${b('l.created_at')}, 'qualified', COUNT(*) FROM leads l WHERE ${lw.sql} AND l.score >= ? GROUP BY 1
     UNION ALL SELECT ${b('l.won_at')}, 'won', COUNT(*) FROM leads l WHERE ${leadWhere(ws, f, 'l', false).sql} AND l.won_at >= ? AND l.won_at < ? GROUP BY 1
     UNION ALL SELECT ${b('c.started_at')}, c.channel, COUNT(*) FROM conversations c WHERE ${cw.sql} GROUP BY 1, 2`,
    [
      tz,
      ...lw.params,
      tz,
      ...lw.params,
      ws.config.scoring.qualifiedThreshold,
      tz,
      ...leadWhere(ws, f, 'l', false).params,
      f.from,
      f.to,
      tz,
      ...cw.params,
    ],
  );
  const labels = buckets(f.from, f.to, bucket, tz);
  const idx = new Map(labels.map((l, i) => [l, i]));
  const zero = () => new Array<number>(labels.length).fill(0);
  const out: Record<'leads' | 'qualified' | 'won' | 'voice' | 'text', number[]> = { leads: zero(), qualified: zero(), won: zero(), voice: zero(), text: zero() };
  for (const r of rows) {
    const i = idx.get(r.b);
    if (i === undefined || !(r.k in out)) continue;
    out[r.k as keyof typeof out][i] += num(r.n);
  }
  return { labels, bucket, ...out };
}

export async function byService(ws: Workspace, f: ReportFilters) {
  const lw = leadWhere(ws, { ...f, service: undefined });
  const won = ws.config.crm.stages.filter((s) => s.kind === 'won').map((s) => s.key);
  const rows = await q<{ service: string | null; leads: number; won: number; value: number }>(
    `SELECT l.interested_service AS service, COUNT(*) AS leads, COUNT(*) FILTER (WHERE l.stage = ANY(?::text[])) AS won,
            COALESCE(SUM(l.value) FILTER (WHERE l.stage = ANY(?::text[])), 0) AS value
     FROM leads l WHERE ${lw.sql} GROUP BY 1 ORDER BY leads DESC`,
    [`{${won.join(',')}}`, `{${won.join(',')}}`, ...lw.params],
  );
  const names = new Map(ws.config.services.map((s) => [s.slug, s.name]));
  return rows.map((r) => ({ label: r.service ? (names.get(r.service) ?? r.service) : 'Not specified', leads: num(r.leads), won: num(r.won), value: num(r.value) }));
}

export async function bySource(ws: Workspace, f: ReportFilters) {
  const lw = leadWhere(ws, { ...f, source: undefined });
  const won = ws.config.crm.stages.filter((s) => s.kind === 'won').map((s) => s.key);
  return (
    await q<{ source: string; leads: number; qualified: number; won: number; value: number }>(
      `SELECT l.source, COUNT(*) AS leads, COUNT(*) FILTER (WHERE l.score >= ?) AS qualified, COUNT(*) FILTER (WHERE l.stage = ANY(?::text[])) AS won,
              COALESCE(SUM(l.value) FILTER (WHERE l.stage = ANY(?::text[])), 0) AS value
       FROM leads l WHERE ${lw.sql} GROUP BY 1 ORDER BY leads DESC`,
      [ws.config.scoring.qualifiedThreshold, `{${won.join(',')}}`, `{${won.join(',')}}`, ...lw.params],
    )
  ).map((r) => ({ ...r, leads: num(r.leads), qualified: num(r.qualified), won: num(r.won), value: num(r.value) }));
}

export async function byStage(ws: Workspace, f: ReportFilters) {
  const lw = leadWhere(ws, { ...f, stage: undefined }, 'l', false);
  const rows = await q<{ stage: string; n: number; value: number }>(`SELECT l.stage, COUNT(*) AS n, COALESCE(SUM(l.value), 0) AS value FROM leads l WHERE ${lw.sql} GROUP BY 1`, lw.params);
  const m = new Map(rows.map((r) => [r.stage, r]));
  return ws.config.crm.stages.map((s) => ({ key: s.key, label: s.label, color: s.color, n: num(m.get(s.key)?.n), value: num(m.get(s.key)?.value) }));
}

export async function intents(ws: Workspace, f: ReportFilters) {
  const ew = eventWhere(ws, f);
  const ch = f.channel ? ' AND e.channel = ?' : '';
  const chp = f.channel ? [f.channel] : [];
  const cats = await q<{ label: string; n: number }>(`SELECT COALESCE(e.name, 'other') AS label, COUNT(*) AS n FROM events e WHERE ${ew.sql} AND e.type='intent'${ch} GROUP BY 1 ORDER BY n DESC`, [
    ...ew.params,
    ...chp,
  ]);
  const questions = await q<{ label: string; n: number }>(
    `SELECT MIN(e.meta->>'question') AS label, COUNT(*) AS n FROM events e WHERE ${ew.sql} AND e.type='intent'${ch} AND e.meta->>'question' <> ''
     GROUP BY lower(regexp_replace(e.meta->>'question', '[^a-zA-Z0-9 ]', '', 'g')) ORDER BY n DESC LIMIT 10`,
    [...ew.params, ...chp],
  );
  return { categories: cats.map((c) => ({ label: c.label, n: num(c.n) })), questions: questions.map((c) => ({ label: c.label, n: num(c.n) })) };
}

export async function voiceCommands(ws: Workspace, f: ReportFilters) {
  const ew = eventWhere(ws, f);
  const rows = await q<{ name: string; ok: number; failed: number }>(
    `SELECT e.name, COUNT(*) FILTER (WHERE e.ok IS NOT FALSE) AS ok, COUNT(*) FILTER (WHERE e.ok IS FALSE) AS failed
     FROM events e WHERE ${ew.sql} AND e.type='action' AND e.channel = ? AND e.name NOT IN ('get_view_context','read_screen','qualify_lead','record_intent')
     GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 15`,
    [...ew.params, f.channel ?? 'voice'],
  );
  return rows.map((r) => ({ name: r.name, ok: num(r.ok), failed: num(r.failed) }));
}

export async function channelComparison(ws: Workspace, f: ReportFilters) {
  const cw = convWhere(ws, { ...f, channel: undefined });
  const rows = await q<{ channel: string; sessions: number; turns: number; duration: number; leads: number; success: number; judged: number; bookings: number }>(
    `SELECT c.channel, COUNT(*) AS sessions, COALESCE(AVG(c.turn_count), 0) AS turns, COALESCE(AVG(c.ended_at - c.started_at) FILTER (WHERE c.ended_at IS NOT NULL), 0) AS duration,
            COUNT(*) FILTER (WHERE c.lead_id IS NOT NULL) AS leads, COUNT(*) FILTER (WHERE c.success) AS success, COUNT(*) FILTER (WHERE c.success IS NOT NULL) AS judged,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.conversation_id = c.id)) AS bookings
     FROM conversations c WHERE ${cw.sql} GROUP BY 1`,
    cw.params,
  );
  return (['voice', 'text'] as const).map((ch) => {
    const r = rows.find((x) => x.channel === ch);
    return {
      channel: ch,
      sessions: num(r?.sessions),
      avgTurns: num(r?.turns),
      avgMs: num(r?.duration),
      leads: num(r?.leads),
      successRate: num(r?.judged) ? num(r?.success) / num(r?.judged) : 0,
      bookings: num(r?.bookings),
    };
  });
}

export async function trafficSources(ws: Workspace, f: ReportFilters) {
  const ew = eventWhere(ws, f);
  return (
    await q<{ label: string; n: number }>(
      `SELECT v.source AS label, COUNT(DISTINCT e.visitor_id) AS n FROM events e JOIN visitors v ON v.id = e.visitor_id WHERE ${ew.sql} AND e.type='page_view' GROUP BY 1 ORDER BY n DESC`,
      ew.params,
    )
  ).map((r) => ({ label: r.label, n: num(r.n) }));
}

export async function topPages(ws: Workspace, f: ReportFilters) {
  const ew = eventWhere(ws, f);
  return (
    await q<{ label: string; n: number }>(`SELECT e.path AS label, COUNT(*) AS n FROM events e WHERE ${ew.sql} AND e.type='page_view' GROUP BY 1 ORDER BY n DESC LIMIT 8`, ew.params)
  ).map((r) => ({ label: r.label, n: num(r.n) }));
}

export async function topSections(ws: Workspace, f: ReportFilters) {
  const ew = eventWhere(ws, f);
  return (
    await q<{ label: string; n: number }>(`SELECT e.name AS label, COUNT(*) AS n FROM events e WHERE ${ew.sql} AND e.type='section_view' GROUP BY 1 ORDER BY n DESC LIMIT 8`, ew.params)
  ).map((r) => ({ label: r.label, n: num(r.n) }));
}

export async function repPerformance(ws: Workspace, f: ReportFilters) {
  const lw = leadWhere(ws, f);
  const won = ws.config.crm.stages.filter((s) => s.kind === 'won').map((s) => s.key);
  return (
    await q<{ name: string; leads: number; won: number; value: number }>(
      `SELECT COALESCE(u.full_name, u.username, 'Unassigned') AS name, COUNT(*) AS leads, COUNT(*) FILTER (WHERE l.stage = ANY(?::text[])) AS won,
              COALESCE(SUM(l.value) FILTER (WHERE l.stage = ANY(?::text[])), 0) AS value
       FROM leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE ${lw.sql} GROUP BY 1 ORDER BY leads DESC`,
      [`{${won.join(',')}}`, `{${won.join(',')}}`, ...lw.params],
    )
  ).map((r) => ({ name: r.name, leads: num(r.leads), won: num(r.won), value: num(r.value) }));
}

/** Dashboard feed: latest leads, conversations and bookings. */
export async function recentFeed(ws: Workspace, limit = 12) {
  return q<{ kind: 'lead' | 'conversation' | 'booking'; at: number; ref: string; title: string; detail: string }>(
    `SELECT * FROM (
       SELECT 'lead' AS kind, created_at AS at, id::text AS ref, COALESCE(NULLIF(name, ''), email, phone, 'Lead') AS title, source || ' · score ' || score AS detail FROM leads WHERE workspace_id = ?
       UNION ALL SELECT 'conversation', started_at, id, channel || ' conversation', COALESCE(intent, outcome, status) FROM conversations WHERE workspace_id = ?
       UNION ALL SELECT 'booking', a.created_at, a.lead_id::text, 'Consultation · ' || l.name, COALESCE(a.preferred_time, a.status) FROM appointments a JOIN leads l ON l.id = a.lead_id WHERE a.workspace_id = ?
     ) x ORDER BY at DESC LIMIT ?`,
    [ws.id, ws.id, ws.id, limit],
  );
}

/** CSV export of leads (all columns people usually need). */
export async function leadsCsv(ws: Workspace, f: ReportFilters) {
  const lw = leadWhere(ws, f);
  const rows = await q<Record<string, unknown>>(
    `SELECT l.id, l.created_at, l.name, l.email, l.phone, l.company, l.industry, l.customer_type, l.source, l.channel, l.interested_service, l.budget, l.timeline,
            l.score, l.stage, l.value, u.full_name AS assigned_to, l.next_follow_up_at, l.summary, l.next_action, l.is_demo
     FROM leads l LEFT JOIN admin_users u ON u.id = l.assigned_to WHERE ${lw.sql} ORDER BY l.created_at DESC`,
    lw.params,
  );
  const cols = ['id', 'created_at', 'name', 'email', 'phone', 'company', 'industry', 'customer_type', 'source', 'channel', 'interested_service', 'budget', 'timeline', 'score', 'stage', 'value', 'assigned_to', 'next_follow_up_at', 'summary', 'next_action', 'is_demo'];
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // no formula injection in spreadsheets
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const date = (ms: unknown) => (ms ? new Date(Number(ms)).toISOString() : '');
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c.endsWith('_at') ? date(r[c]) : r[c])).join(','))].join('\n');
}
