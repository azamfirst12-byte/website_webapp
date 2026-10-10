import 'server-only';
import { Modality, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import type { AdminSession } from './auth';
import { one, q } from './db';
import { can, ROLE_LABEL } from './permissions';
import { fmtDateTime, fromLocalInput, labelize, money, tzName } from './format';
import { addNote, assignLead, createTask, getLead, leadConversations, leadTimeline, listAppointments, listLeads, listTasks, setStage, setTaskDone, updateAppointment, updateLeadFields, upsertLead, type Lead, type Viewer } from './crm';
import { byService, bySource, byStage, channelComparison, kpis, repPerformance, type ReportFilters } from './analytics';
import { assignableStaff } from './admin-users';
import { getConversation, listConversations } from './conversations';
import { scoreBand } from './scoring';
import { adminToolDefs, PAGE_TOOLS } from './admin-tools';
import type { Workspace } from './workspace';

export { LIVE_MODEL } from './assistant-prompt';

type Args = Record<string, unknown>;
type Result = Record<string, unknown> & { ok: boolean; error?: string };

const DAY = 86_400_000;
const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
const s = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const when = (ms: number | null | undefined) => (ms ? fmtDateTime(Number(ms)) : null);
const viewerOf = (session: AdminSession): Viewer => ({ id: session.user.id, role: session.user.role });
const period = (range: unknown): ReportFilters => ({ from: Date.now() - (RANGE_DAYS[s(range)] ?? 30) * DAY, to: Date.now() + 1 });

// ─────────────── Context & prompt ───────────────

export interface AdminContext {
  attention: { newToday: number; overdueTasks: number; dueToday: number; pendingConsultations: number; hotUnassigned: number; openLeads: number; pipelineValue: number };
}

export async function adminContext(ws: Workspace, session: AdminSession): Promise<AdminContext> {
  const uid = session.user.id;
  const all = can(session.user.role, 'tasks.manage_all');
  const open = ws.config.crm.stages.filter((x) => x.kind === 'open').map((x) => x.key);
  const startOfDay = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const r = await one<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM leads WHERE workspace_id=? AND created_at >= ?) AS new_today,
            (SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND done_at IS NULL AND due_at < ? AND (assigned_to=? OR ?)) AS overdue,
            (SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND done_at IS NULL AND due_at >= ? AND due_at < ? AND (assigned_to=? OR ?)) AS due_today,
            (SELECT COUNT(*) FROM appointments WHERE workspace_id=? AND status='requested') AS pending,
            (SELECT COUNT(*) FROM leads WHERE workspace_id=? AND assigned_to IS NULL AND score >= ? AND stage = ANY(?::text[])) AS hot_unassigned,
            (SELECT COUNT(*) FROM leads WHERE workspace_id=? AND stage = ANY(?::text[])) AS open_leads,
            (SELECT COALESCE(SUM(value), 0) FROM leads WHERE workspace_id=? AND stage = ANY(?::text[])) AS pipeline_value`,
    [
      ws.id,
      startOfDay,
      ws.id,
      Date.now(),
      uid,
      all,
      ws.id,
      Date.now(),
      startOfDay + DAY,
      uid,
      all,
      ws.id,
      ws.id,
      ws.config.scoring.highIntentThreshold,
      `{${open.join(',')}}`,
      ws.id,
      `{${open.join(',')}}`,
      ws.id,
      `{${open.join(',')}}`,
    ],
  );
  return {
    attention: {
      newToday: Number(r?.new_today ?? 0),
      overdueTasks: Number(r?.overdue ?? 0),
      dueToday: Number(r?.due_today ?? 0),
      pendingConsultations: Number(r?.pending ?? 0),
      hotUnassigned: Number(r?.hot_unassigned ?? 0),
      openLeads: Number(r?.open_leads ?? 0),
      pipelineValue: Number(r?.pipeline_value ?? 0),
    },
  };
}

export function adminSystemPrompt(ws: Workspace, session: AdminSession, channel: 'voice' | 'text', ctx: AdminContext) {
  const c = ws.config;
  const cur = c.pricing.currency;
  const role = session.user.role;
  const tz = tzName();
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const isoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(' ', 'T');
  const stages = c.crm.stages.map((x) => `${x.key} (${x.label}, ${x.kind}, ${x.probability}%)`).join('; ');
  const services = c.services.map((x) => `${x.slug} (${x.name}, from ${money(x.startingPrice, cur)})`).join('; ');
  const perms = [
    can(role, 'leads.view_all') ? 'sees all leads' : 'sees leads assigned to them or unassigned',
    can(role, 'leads.edit') ? (can(role, 'leads.edit_all') ? 'can edit any lead' : 'can edit their own and unassigned leads') : 'READ-ONLY (cannot change anything)',
    can(role, 'leads.assign') ? 'can assign leads' : 'cannot assign leads to others',
    can(role, 'appointments.manage') ? 'can manage consultations' : 'cannot change consultations',
    can(role, 'reports.view') ? 'can see reports' : 'no reports access',
  ].join('; ');
  const a = ctx.attention;
  const style =
    channel === 'voice'
      ? 'You are SPEAKING: short, natural sentences, usually one to three per turn. No lists, markdown, URLs or ids read aloud — say names, not ids. Round numbers naturally ("about four thousand dollars").'
      : 'You are CHATTING: concise, scannable replies. Plain text; short "•" lists are fine for several leads or tasks. Mention lead ids as #12 so the user can refer to them.';

  return `You are "${c.assistant.name}", the AI CRM copilot inside ${c.brand.name}'s admin panel. You work for the staff, not for website visitors.
You help ${session.user.name} (${ROLE_LABEL[role]}) run sales: find and brief them on leads, keep the pipeline up to date, log notes, schedule follow-ups, manage consultation requests, read reports, and drive the admin screens hands-free.

## The user
${session.user.name}, ${ROLE_LABEL[role]} — ${perms}.
Now: ${now} (${tz}). Use "${isoNow}" as the reference for relative dates ("tomorrow at 3" → the next day at 15:00) and pass times as "YYYY-MM-DDTHH:MM" in this time zone.

## Right now
New leads today: ${a.newToday}. Open leads: ${a.openLeads} worth ${money(a.pipelineValue, cur)}. Overdue tasks: ${a.overdueTasks}. Tasks due today: ${a.dueToday}. Consultation requests waiting: ${a.pendingConsultations}. High-intent unassigned leads: ${a.hotUnassigned}.

## Languages
Reply in the language the user speaks (they may switch, e.g. to Urdu) and switch with them. Tool arguments, notes and task titles stay in English unless the user asks otherwise.

## Style
${style}
Be a sharp sales-ops colleague: lead with the answer, then the one most useful next step. Don't pad.

## Tools
- Always get facts from tools; never invent leads, numbers, names or dates. If a tool returns nothing, say so.
- Be fast: request every tool you need for an answer in the SAME turn (they run in parallel), e.g. crm_overview + find_leads + open_admin_page together, instead of one tool per turn. crm_overview already includes overdue tasks, waiting consultations and hot unassigned counts.
- Show while you tell: when you talk about a lead, open_record it; for a list ("my hot leads", "overdue tasks") call the data tool and open the matching page with filters (open_admin_page) so the user sees it too.
- People are referred to by name: call find_leads (or get_lead with name) to get the id first. If several match, ask which one.
- "What am I looking at?" / "this lead" / "summarise this" → read_page first (the URL tells you which record is open: /admin/leads/<id>, /admin/conversations/<id>).
- For buttons or forms without a dedicated tool: read_screen, then click_element / fill_field / select_option by id. Never type passwords.
- Changing data: when the instruction is clear ("mark Azam as qualified", "add a note: called, no answer"), do it, then confirm in a few words. When it is unclear, or it is a big change (won/lost, assigning to someone else, cancelling a consultation), confirm once before doing it. Never claim a change happened unless the tool result says ok. If a tool says the user lacks permission, tell them plainly.
- After a change the page refreshes by itself.
- You cannot delete leads or manage staff accounts; point the user to the right page instead.

## CRM setup
Pipeline stages: ${stages}.
Services: ${services}.
Lead score bands: hot ≥ ${c.scoring.highIntentThreshold}, qualified ≥ ${c.scoring.qualifiedThreshold}.
Task types: follow_up, call, email, meeting, reminder.

## Opening
${channel === 'voice' ? `When the session starts, greet ${session.user.name.split(' ')[0]} briefly and mention the single most important thing that needs attention (from "Right now"), then ask how you can help.` : 'A greeting is already shown; answer the first message directly.'}`;
}

export function adminFunctionDeclarations(ws: Workspace): FunctionDeclaration[] {
  return adminToolDefs(
    ws.config.crm.stages.map((x) => x.key),
    ws.config.services.map((x) => x.slug),
  ) as unknown as FunctionDeclaration[];
}

export function buildAdminLiveConfig(ws: Workspace, session: AdminSession, ctx: AdminContext, resumeHandle: string | null): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: adminSystemPrompt(ws, session, 'voice', ctx) }] },
    tools: [{ functionDeclarations: adminFunctionDeclarations(ws) }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    contextWindowCompression: { slidingWindow: {} },
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ws.config.assistant.voice || process.env.GEMINI_VOICE || 'Puck' } } },
  };
}

// ─────────────── Tool execution (server) ───────────────

async function canEditLead(session: AdminSession, leadId: number) {
  if (!can(session.user.role, 'leads.edit')) return false;
  if (can(session.user.role, 'leads.edit_all')) return true;
  const r = await one<{ assigned_to: number | null }>(`SELECT assigned_to FROM leads WHERE id=?`, [leadId]);
  return !!r && (r.assigned_to === null || Number(r.assigned_to) === session.user.id);
}

async function canSeeLead(session: AdminSession, lead: Lead) {
  return can(session.user.role, 'leads.view_all') || can(session.user.role, 'leads.edit_all') || lead.assigned_to === null || Number(lead.assigned_to) === session.user.id;
}

async function resolveStaff(name: string, session: AdminSession): Promise<{ id: number | null; name: string } | null> {
  const t = name.trim().toLowerCase();
  if (!t || t === 'me' || t === 'myself') return { id: session.user.id, name: session.user.name };
  if (['unassigned', 'nobody', 'none', 'no one'].includes(t)) return { id: null, name: 'unassigned' };
  const staff = await assignableStaff();
  const m =
    staff.find((u) => u.username.toLowerCase() === t || (u.full_name ?? '').toLowerCase() === t) ??
    staff.find((u) => (u.full_name ?? '').toLowerCase().startsWith(t) || u.username.toLowerCase().startsWith(t)) ??
    staff.find((u) => (u.full_name ?? '').toLowerCase().includes(t));
  return m ? { id: Number(m.id), name: m.full_name || m.username } : null;
}

function leadRow(ws: Workspace, l: Lead) {
  const cur = ws.config.pricing.currency;
  const st = ws.config.crm.stages.find((x) => x.key === l.stage);
  return {
    id: Number(l.id),
    name: l.name || l.email || `Lead #${l.id}`,
    company: l.company,
    stage: st?.label ?? l.stage,
    score: Number(l.score),
    band: scoreBand(Number(l.score), ws.config.scoring),
    value: money(Number(l.value), cur),
    service: l.interested_service,
    owner: l.assignee_name ?? (l.assigned_to ? `#${l.assigned_to}` : 'unassigned'),
    next_follow_up: when(l.next_follow_up_at),
    last_interaction: when(l.last_interaction_at),
    created: when(l.created_at),
    ...(l.is_demo ? { demo: true } : {}),
  };
}

async function findLeadByName(ws: Workspace, session: AdminSession, name: string) {
  const r = await listLeads(ws, { q: name, sort: 'recent' }, viewerOf(session), 6);
  return r.rows;
}

export async function runAdminTool(ws: Workspace, session: AdminSession, name: string, args: Args): Promise<Result> {
  if (PAGE_TOOLS.has(name)) return { ok: false, error: 'That action runs in the browser.' };
  const c = ws.config;
  const cur = c.pricing.currency;
  const viewer = viewerOf(session);
  const role = session.user.role;
  const leadId = n(args.lead_id);

  const needLead = async (): Promise<Lead | Result> => {
    if (!leadId) return { ok: false, error: 'lead_id is required — use find_leads first.' };
    const l = await getLead(ws, leadId);
    if (!l || !(await canSeeLead(session, l))) return { ok: false, error: `Lead #${leadId} was not found.` };
    return l;
  };
  const needEdit = async () => (leadId && (await canEditLead(session, leadId)) ? null : { ok: false, error: 'You do not have permission to change this lead.' });

  switch (name) {
    case 'crm_overview': {
      const f = period(args.range);
      if (!can(role, 'reports.view') && !can(role, 'leads.view_all')) {
        const ctx = await adminContext(ws, session);
        return { ok: true, attention: ctx.attention };
      }
      const [k, ctx] = await Promise.all([kpis(ws, f), adminContext(ws, session)]);
      return {
        ok: true,
        period: s(args.range) || '30d',
        leads: k.leads,
        qualified: k.qualifiedLeads,
        high_intent: k.hotLeads,
        won: k.won,
        lost: k.lost,
        won_value: money(k.wonValue, cur),
        lead_to_client_rate: `${Math.round(k.leadToClientRate * 1000) / 10}%`,
        open_leads: k.openLeads,
        pipeline_value: money(k.pipelineValue, cur),
        weighted_pipeline: money(k.weightedPipelineValue, cur),
        visitors: k.visitors,
        ai_conversations: k.conversations,
        voice_sessions: k.voiceSessions,
        consultation_requests: k.consultationRequests,
        follow_up_completion: `${Math.round(k.followUpCompletion * 100)}%`,
        attention: ctx.attention,
      };
    }

    case 'find_leads': {
      let assigned: string | undefined;
      const a = s(args.assigned, 80);
      if (a) {
        if (a === 'me' || a === 'unassigned') assigned = a;
        else {
          const u = await resolveStaff(a, session);
          if (!u) return { ok: false, error: `No staff member called "${a}".` };
          assigned = u.id ? String(u.id) : 'unassigned';
        }
      }
      const sort = s(args.sort) as 'recent' | 'score' | 'value' | 'follow_up' | '';
      const band = s(args.band) as 'hot' | 'qualified' | 'warm' | 'cold' | '';
      const limit = Math.min(25, Math.max(1, n(args.limit) ?? 10));
      const r = await listLeads(
        ws,
        { q: s(args.query, 120) || undefined, stage: s(args.stage, 40) || undefined, band: band || undefined, assigned, sort: sort || undefined, openOnly: args.open_only === true },
        viewer,
        limit,
      );
      return { ok: true, total: r.total, showing: r.rows.length, leads: r.rows.map((l) => leadRow(ws, l)) };
    }

    case 'get_lead': {
      let l: Lead | undefined;
      if (leadId) l = await getLead(ws, leadId);
      else if (s(args.name)) {
        const rows = await findLeadByName(ws, session, s(args.name, 120));
        if (rows.length > 1) return { ok: true, ambiguous: true, matches: rows.map((x) => leadRow(ws, x)), note: 'Several leads match — ask the user which one.' };
        l = rows[0];
      }
      if (!l || !(await canSeeLead(session, l))) return { ok: false, error: 'Lead not found.' };
      const id = Number(l.id);
      const [timeline, tasks, convs, appts] = await Promise.all([
        leadTimeline(id),
        listTasks(ws, viewer, 'mine', id),
        leadConversations(id),
        q<{ id: number; status: string; preferred_time: string | null; scheduled_at: number | null; topic: string }>(
          `SELECT id, status, preferred_time, scheduled_at, topic FROM appointments WHERE lead_id=? ORDER BY created_at DESC LIMIT 5`,
          [id],
        ),
      ]);
      return {
        ok: true,
        lead: {
          ...leadRow(ws, l),
          email: l.email,
          phone: l.phone,
          industry: l.industry,
          customer_type: l.customer_type,
          company_size: l.company_size,
          source: l.source,
          channel: l.channel,
          requirements: l.requirements,
          budget: l.budget,
          timeline: l.timeline,
          decision_maker: l.decision_maker,
          intent_level: l.intent_level,
          ai_summary: l.summary,
          next_action: l.next_action,
          lost_reason: l.lost_reason,
          tags: l.tags,
        },
        recent_activity: timeline.slice(0, 8).map((t) => ({ when: when(t.created_at), what: t.title, detail: t.body?.slice(0, 200) ?? null, by: t.by_name })),
        open_tasks: tasks.map((t) => ({ id: Number(t.id), title: t.title, due: when(t.due_at), priority: t.priority })),
        consultations: appts.map((x) => ({ id: Number(x.id), status: x.status, preferred: x.preferred_time, scheduled: when(x.scheduled_at) })),
        ai_conversations: convs.length,
        can_edit: await canEditLead(session, id),
      };
    }

    case 'create_lead': {
      if (!can(role, 'leads.edit')) return { ok: false, error: 'Your account is read-only.' };
      if (!s(args.name) && !s(args.email) && !s(args.phone)) return { ok: false, error: 'A name, email or phone is required.' };
      const r = await upsertLead(
        ws,
        {
          name: s(args.name, 120),
          email: s(args.email, 200),
          phone: s(args.phone, 40),
          company: s(args.company, 160),
          service: s(args.service, 120),
          requirements: s(args.requirements, 3000),
          budget: s(args.budget, 80),
          timeline: s(args.timeline, 80),
          source: s(args.source, 40) || 'manual',
          value: n(args.value),
          consent: true,
        },
        { by: session.user.id },
      );
      if (!r.id) return { ok: false, error: r.error ?? 'Could not create the lead.' };
      if (role === 'sales') await assignLead(ws, r.id, session.user.id, session.user.id);
      return { ok: true, lead_id: r.id, created: r.created, note: r.created ? 'Created.' : 'A lead with this email/phone already existed — it was updated instead.' };
    }

    case 'update_lead': {
      const l = await needLead();
      if (!('id' in l)) return l;
      const denied = await needEdit();
      if (denied) return denied;
      const patch: Record<string, unknown> = {};
      for (const k of ['name', 'email', 'phone', 'company', 'industry', 'interested_service', 'requirements', 'budget', 'timeline', 'next_action'] as const) {
        if (typeof args[k] === 'string') patch[k] = s(args[k], k === 'requirements' ? 3000 : 200);
      }
      if (n(args.value) !== null) patch.value = n(args.value);
      if (typeof args.next_follow_up === 'string') {
        const v = s(args.next_follow_up, 30);
        patch.next_follow_up_at = v === 'none' ? null : fromLocalInput(v);
        if (v !== 'none' && !patch.next_follow_up_at) return { ok: false, error: 'next_follow_up must be "YYYY-MM-DDTHH:MM".' };
      }
      if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to change.' };
      await updateLeadFields(ws, Number(l.id), patch, session.user.id);
      return { ok: true, updated: Object.keys(patch), lead: leadRow(ws, (await getLead(ws, Number(l.id)))!) };
    }

    case 'change_stage': {
      const l = await needLead();
      if (!('id' in l)) return l;
      const denied = await needEdit();
      if (denied) return denied;
      const st = c.crm.stages.find((x) => x.key === s(args.stage, 40) || x.label.toLowerCase() === s(args.stage, 40).toLowerCase());
      if (!st) return { ok: false, error: `Unknown stage. Stages: ${c.crm.stages.map((x) => x.key).join(', ')}.` };
      await setStage(ws, Number(l.id), st.key, session.user.id, s(args.lost_reason, 300) || null);
      return { ok: true, lead: l.name, from: c.crm.stages.find((x) => x.key === l.stage)?.label ?? l.stage, to: st.label };
    }

    case 'assign_lead': {
      const l = await needLead();
      if (!('id' in l)) return l;
      const u = await resolveStaff(s(args.assignee, 80), session);
      if (!u) return { ok: false, error: `No staff member called "${s(args.assignee, 80)}". Use list_team.` };
      const self = u.id === session.user.id;
      if (!can(role, 'leads.assign') && !(self && (await canEditLead(session, Number(l.id))))) return { ok: false, error: 'You do not have permission to assign leads.' };
      const ok = await assignLead(ws, Number(l.id), u.id, session.user.id);
      return ok ? { ok: true, lead: l.name, assigned_to: u.name } : { ok: false, error: 'Could not assign.' };
    }

    case 'add_note': {
      const l = await needLead();
      if (!('id' in l)) return l;
      const denied = await needEdit();
      if (denied) return denied;
      const text = s(args.text, 5000);
      if (!text) return { ok: false, error: 'Note text is empty.' };
      const kind = (['note', 'call', 'email', 'meeting'].includes(s(args.kind)) ? s(args.kind) : 'note') as 'note' | 'call' | 'email' | 'meeting';
      await addNote(ws, Number(l.id), text, session.user.id, kind);
      return { ok: true, lead: l.name, logged: kind };
    }

    case 'create_task': {
      const title = s(args.title, 200);
      if (!title) return { ok: false, error: 'A title is required.' };
      if (leadId && !(await canEditLead(session, leadId))) return { ok: false, error: 'You do not have permission to add tasks to this lead.' };
      if (!leadId && !can(role, 'leads.edit')) return { ok: false, error: 'Your account is read-only.' };
      let assignedTo = session.user.id;
      let assigneeName = session.user.name;
      if (s(args.assignee) && s(args.assignee).toLowerCase() !== 'me') {
        if (!can(role, 'tasks.manage_all')) return { ok: false, error: 'Only managers can assign tasks to others.' };
        const u = await resolveStaff(s(args.assignee, 80), session);
        if (!u?.id) return { ok: false, error: `No staff member called "${s(args.assignee, 80)}".` };
        assignedTo = u.id;
        assigneeName = u.name;
      }
      const dueAt = s(args.due) ? fromLocalInput(s(args.due, 30)) : null;
      if (s(args.due) && !dueAt) return { ok: false, error: 'due must be "YYYY-MM-DDTHH:MM".' };
      const type = ['follow_up', 'call', 'email', 'meeting', 'reminder'].includes(s(args.type)) ? s(args.type) : 'follow_up';
      await createTask(ws, { leadId, title, type, dueAt, assignedTo, priority: s(args.priority) || 'normal' }, session.user.id);
      return { ok: true, task: title, due: when(dueAt), assigned_to: assigneeName, lead_id: leadId };
    }

    case 'list_tasks': {
      const scope = (['mine', 'all', 'overdue', 'done'].includes(s(args.scope)) ? s(args.scope) : 'mine') as 'mine' | 'all' | 'overdue' | 'done';
      const rows = await listTasks(ws, viewer, scope, leadId ?? undefined);
      return {
        ok: true,
        scope,
        total: rows.length,
        tasks: rows.slice(0, 25).map((t) => ({
          id: Number(t.id),
          title: t.title,
          type: t.type,
          priority: t.priority,
          due: when(t.due_at),
          overdue: !!t.due_at && !t.done_at && Number(t.due_at) < Date.now(),
          lead: t.lead_name ? `${t.lead_name} (#${t.lead_id})` : null,
          owner: t.assignee,
          done: when(t.done_at),
        })),
      };
    }

    case 'complete_task': {
      const id = n(args.task_id);
      if (!id) return { ok: false, error: 'task_id is required.' };
      const t = await one<{ assigned_to: number | null; title: string }>(`SELECT assigned_to, title FROM tasks WHERE id=? AND workspace_id=?`, [id, ws.id]);
      if (!t) return { ok: false, error: 'Task not found.' };
      if (role === 'viewer') return { ok: false, error: 'Your account is read-only.' };
      if (!can(role, 'tasks.manage_all') && t.assigned_to !== null && Number(t.assigned_to) !== session.user.id) return { ok: false, error: 'That task belongs to someone else.' };
      const done = args.done !== false;
      await setTaskDone(ws, id, done, session.user.id);
      return { ok: true, task: t.title, done };
    }

    case 'list_appointments': {
      const st = s(args.status) || 'upcoming';
      const rows = await listAppointments(ws, viewer, st === 'all' ? undefined : st);
      return {
        ok: true,
        status: st,
        total: rows.length,
        appointments: rows.slice(0, 20).map((x) => ({
          id: Number(x.id),
          lead: `${x.lead_name} (#${x.lead_id})`,
          status: x.status,
          topic: x.topic,
          service: x.service,
          preferred_time: x.preferred_time,
          scheduled: when(x.scheduled_at),
          contact: x.email ?? x.phone,
          meeting_link: x.meeting_link,
          requested: when(x.created_at),
        })),
      };
    }

    case 'update_appointment': {
      if (!can(role, 'appointments.manage')) return { ok: false, error: 'You do not have permission to change consultations.' };
      const id = n(args.appointment_id);
      if (!id) return { ok: false, error: 'appointment_id is required.' };
      const a = await one<{ lead_id: number }>(`SELECT lead_id FROM appointments WHERE id=? AND workspace_id=?`, [id, ws.id]);
      if (!a) return { ok: false, error: 'Consultation not found.' };
      if (!(await canEditLead(session, Number(a.lead_id))) && !can(role, 'leads.view_all')) return { ok: false, error: 'Not allowed for this lead.' };
      const status = ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'].includes(s(args.status)) ? s(args.status) : undefined;
      const scheduledAt = s(args.scheduled_at) ? fromLocalInput(s(args.scheduled_at, 30)) : null;
      if (s(args.scheduled_at) && !scheduledAt) return { ok: false, error: 'scheduled_at must be "YYYY-MM-DDTHH:MM".' };
      await updateAppointment(ws, id, { status, scheduledAt, meetingLink: s(args.meeting_link, 300) || null, notes: s(args.notes, 1000) || null }, session.user.id);
      return { ok: true, appointment_id: id, status: status ?? 'unchanged', scheduled: when(scheduledAt) };
    }

    case 'find_conversations': {
      const limit = Math.min(20, Math.max(1, n(args.limit) ?? 10));
      const r = await listConversations(ws, {
        channel: s(args.channel, 10) || undefined,
        outcome: s(args.outcome, 30) || undefined,
        q: s(args.query, 120) || undefined,
        page: 1,
        leadVisibleTo: role === 'sales' ? { sql: '(l.assigned_to = ? OR l.assigned_to IS NULL)', params: [session.user.id] } : undefined,
      });
      return {
        ok: true,
        total: r.total,
        conversations: r.rows.slice(0, limit).map((x) => ({
          id: x.id,
          when: when(x.started_at),
          channel: x.channel,
          lead: x.lead_id ? `${x.lead_name ?? 'Lead'} (#${x.lead_id})` : 'anonymous',
          intent: x.intent ?? x.first_message,
          outcome: x.outcome,
          turns: x.turn_count,
          live: x.status === 'open',
        })),
      };
    }

    case 'get_conversation': {
      const cv = await getConversation(s(args.conversation_id, 40));
      if (!cv || cv.workspace_id !== ws.id) return { ok: false, error: 'Conversation not found.' };
      if (cv.lead_id && role === 'sales') {
        const l = await getLead(ws, Number(cv.lead_id));
        if (l && !(await canSeeLead(session, l))) return { ok: false, error: 'Conversation not found.' };
      }
      return {
        ok: true,
        id: cv.id,
        channel: cv.channel,
        started: when(cv.started_at),
        lead_id: cv.lead_id,
        intent: cv.intent,
        outcome: cv.outcome,
        summary: cv.summary?.summary ?? null,
        next_actions: cv.summary?.next_actions ?? [],
        sentiment: cv.summary?.sentiment ?? null,
        transcript_start: cv.transcript
          .filter((m) => m.role !== 'action')
          .slice(0, 16)
          .map((m) => `${m.role === 'user' ? 'Visitor' : 'AI'}: ${m.text.slice(0, 240)}`),
      };
    }

    case 'sales_report': {
      if (!can(role, 'reports.view')) return { ok: false, error: 'Your account has no access to reports.' };
      const f = period(args.range);
      const b = s(args.breakdown);
      if (b === 'source') return { ok: true, by_source: (await bySource(ws, f)).map((r) => ({ source: labelize(r.source), leads: r.leads, qualified: r.qualified, won: r.won, won_value: money(r.value, cur) })) };
      if (b === 'service') return { ok: true, by_service: (await byService(ws, f)).map((r) => ({ service: r.label, leads: r.leads, won: r.won, won_value: money(r.value, cur) })) };
      if (b === 'rep') {
        if (!can(role, 'leads.view_all')) return { ok: false, error: 'Rep comparison needs manager access.' };
        return { ok: true, by_rep: (await repPerformance(ws, f)).map((r) => ({ rep: r.name, leads: r.leads, won: r.won, won_value: money(r.value, cur) })) };
      }
      if (b === 'channel')
        return {
          ok: true,
          by_channel: (await channelComparison(ws, f)).map((r) => ({ channel: r.channel, sessions: r.sessions, leads: r.leads, bookings: r.bookings, success_rate: `${Math.round(r.successRate * 100)}%` })),
        };
      if (b === 'pipeline') return { ok: true, pipeline: (await byStage(ws, f)).map((r) => ({ stage: r.label, leads: r.n, value: money(r.value, cur) })) };
      return { ok: false, error: 'breakdown must be source, service, rep, channel or pipeline.' };
    }

    case 'list_team': {
      const staff = await assignableStaff();
      return { ok: true, team: staff.map((u) => ({ id: Number(u.id), name: u.full_name || u.username, username: u.username, role: ROLE_LABEL[u.role] })) };
    }
  }
  return { ok: false, error: `Unknown tool "${name}".` };
}
