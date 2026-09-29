'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin, type AdminSession } from '@/lib/auth';
import { can, ROLES, type Role } from '@/lib/permissions';
import { getActiveWorkspace } from '@/lib/workspace';
import { one, tx } from '@/lib/db';
import { loadDemoData, removeDemoData } from '@/lib/demo-data';
import { activeAdminCount, createStaff, getAdminByEmail, getAdminByUsername, setPassword, updateStaff } from '@/lib/admin-users';
import { EMAIL_RE, MIN_PASSWORD, USERNAME_RE } from '@/lib/passwords';
import { fromLocalInput } from '@/lib/format';
import { addNote, assignLead, createTask, deleteLead, setStage, setTaskDone, updateAppointment, updateLeadFields, upsertLead } from '@/lib/crm';

type State = { error?: string; ok?: string };
const str = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);
const num = (fd: FormData, k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
/** datetime-local input (store time zone) → ms */
const dt = (v: string) => fromLocalInput(v);

async function canEditLead(session: AdminSession, leadId: number) {
  if (!can(session.user.role, 'leads.edit')) return false;
  if (can(session.user.role, 'leads.edit_all')) return true;
  const r = await one<{ assigned_to: number | null }>(`SELECT assigned_to FROM leads WHERE id=?`, [leadId]);
  return !!r && (r.assigned_to === null || Number(r.assigned_to) === session.user.id);
}

async function guardLead(leadId: number) {
  const session = await requireAdmin();
  if (!(await canEditLead(session, leadId))) throw new Error('You do not have permission to change this lead.');
  return { session, ws: await getActiveWorkspace() };
}

const refreshLead = (id: number) => {
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath('/admin/leads');
  revalidatePath('/admin/pipeline');
  revalidatePath('/admin');
};

// ─────────────── Leads ───────────────

export async function createLeadAction(fd: FormData) {
  const session = await requireAdmin('leads.edit');
  const ws = await getActiveWorkspace();
  const r = await upsertLead(
    ws,
    {
      name: str(fd, 'name', 120),
      email: str(fd, 'email', 200),
      phone: str(fd, 'phone', 40),
      company: str(fd, 'company', 160),
      industry: str(fd, 'industry', 80),
      customerType: str(fd, 'customer_type', 40),
      service: str(fd, 'service', 120),
      requirements: str(fd, 'requirements', 3000),
      budget: str(fd, 'budget', 80),
      timeline: str(fd, 'timeline', 80),
      source: str(fd, 'source', 40) || 'manual',
      value: num(fd, 'value'),
      consent: true,
    },
    { by: session.user.id },
  );
  if (!r.id) throw new Error(r.error ?? 'Could not create the lead.');
  const assign = str(fd, 'assigned_to');
  if (assign && can(session.user.role, 'leads.assign')) await assignLead(ws, r.id, Number(assign), session.user.id);
  else if (session.user.role === 'sales') await assignLead(ws, r.id, session.user.id, session.user.id);
  refreshLead(r.id);
  redirect(`/admin/leads/${r.id}`);
}

export async function saveLeadAction(fd: FormData) {
  const id = Number(fd.get('id'));
  const { session, ws } = await guardLead(id);
  const custom: Record<string, unknown> = {};
  for (const f of ws.config.crm.customFields) {
    const v = str(fd, `custom_${f.key}`, 200);
    if (v) custom[f.key] = f.type === 'number' ? Number(v) : v;
  }
  const dm = str(fd, 'decision_maker');
  await updateLeadFields(
    ws,
    id,
    {
      name: str(fd, 'name', 120),
      email: str(fd, 'email', 200),
      phone: str(fd, 'phone', 40),
      company: str(fd, 'company', 160),
      industry: str(fd, 'industry', 80),
      customer_type: str(fd, 'customer_type', 40),
      company_size: str(fd, 'company_size', 40),
      source: str(fd, 'source', 40),
      interested_service: str(fd, 'interested_service', 120),
      requirements: str(fd, 'requirements', 5000),
      budget: str(fd, 'budget', 80),
      timeline: str(fd, 'timeline', 80),
      value: str(fd, 'value', 20),
      next_action: str(fd, 'next_action', 300),
      tags: str(fd, 'tags', 400)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      next_follow_up_at: dt(str(fd, 'next_follow_up_at', 30)),
      decision_maker: dm === 'yes' ? true : dm === 'no' ? false : null,
      custom,
    },
    session.user.id,
  );
  refreshLead(id);
}

export async function stageAction(fd: FormData) {
  const id = Number(fd.get('id'));
  const { session, ws } = await guardLead(id);
  await setStage(ws, id, str(fd, 'stage', 30), session.user.id, str(fd, 'lost_reason', 300) || null);
  refreshLead(id);
}

/** Called from the pipeline board (drag & drop). */
export async function moveStage(id: number, stage: string) {
  const { session, ws } = await guardLead(id);
  const ok = await setStage(ws, id, stage, session.user.id);
  refreshLead(id);
  return ok;
}

export async function assignAction(fd: FormData) {
  const id = Number(fd.get('id'));
  const session = await requireAdmin('leads.assign');
  const ws = await getActiveWorkspace();
  const to = str(fd, 'assigned_to');
  await assignLead(ws, id, to ? Number(to) : null, session.user.id);
  refreshLead(id);
}

export async function noteAction(fd: FormData) {
  const id = Number(fd.get('lead_id'));
  const { session, ws } = await guardLead(id);
  const body = str(fd, 'body', 5000);
  if (!body) return;
  const kind = str(fd, 'kind', 10);
  await addNote(ws, id, body, session.user.id, (['note', 'call', 'email', 'meeting'].includes(kind) ? kind : 'note') as 'note');
  refreshLead(id);
}

export async function deleteLeadAction(fd: FormData) {
  const session = await requireAdmin('leads.delete');
  const ws = await getActiveWorkspace();
  const id = Number(fd.get('id'));
  if (!session) return;
  await deleteLead(ws, id);
  revalidatePath('/admin/leads');
  redirect('/admin/leads');
}

// ─────────────── Tasks ───────────────

export async function taskAction(fd: FormData) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const leadId = num(fd, 'lead_id');
  if (leadId && !(await canEditLead(session, leadId))) throw new Error('Not allowed.');
  if (!leadId && !can(session.user.role, 'leads.edit')) throw new Error('Not allowed.');
  const title = str(fd, 'title', 200);
  if (!title) return;
  const assignedRaw = str(fd, 'assigned_to');
  const assignedTo = assignedRaw && can(session.user.role, 'tasks.manage_all') ? Number(assignedRaw) : session.user.id;
  await createTask(ws, { leadId, title, type: str(fd, 'type', 20) || 'follow_up', dueAt: dt(str(fd, 'due_at', 30)), assignedTo, priority: str(fd, 'priority', 10) || 'normal' }, session.user.id);
  if (leadId) refreshLead(leadId);
  revalidatePath('/admin/tasks');
}

export async function toggleTaskAction(fd: FormData) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const id = Number(fd.get('id'));
  const t = await one<{ assigned_to: number | null; lead_id: number | null }>(`SELECT assigned_to, lead_id FROM tasks WHERE id=?`, [id]);
  if (!t) return;
  if (!can(session.user.role, 'tasks.manage_all') && t.assigned_to !== null && Number(t.assigned_to) !== session.user.id) throw new Error('Not your task.');
  if (session.user.role === 'viewer') throw new Error('Read-only account.');
  await setTaskDone(ws, id, fd.get('done') === '1', session.user.id);
  if (t.lead_id) refreshLead(Number(t.lead_id));
  revalidatePath('/admin/tasks');
}

// ─────────────── Appointments ───────────────

export async function appointmentAction(fd: FormData) {
  const session = await requireAdmin('appointments.manage');
  const ws = await getActiveWorkspace();
  const id = Number(fd.get('id'));
  const status = str(fd, 'status', 20);
  await updateAppointment(
    ws,
    id,
    {
      status: ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'].includes(status) ? status : undefined,
      scheduledAt: dt(str(fd, 'scheduled_at', 30)),
      meetingLink: str(fd, 'meeting_link', 300) || null,
      notes: str(fd, 'notes', 1000) || null,
    },
    session.user.id,
  );
  revalidatePath('/admin/appointments');
  revalidatePath('/admin');
}

// ─────────────── Team (admins only) ───────────────

export async function createStaffAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin('team.manage');
  const username = str(fd, 'username', 60);
  const email = str(fd, 'email', 200).toLowerCase();
  const role = str(fd, 'role', 20) as Role;
  const pw = String(fd.get('password') ?? '');
  if (!USERNAME_RE.test(username)) return { error: 'User ID: 3–60 letters, numbers, dot, dash or underscore.' };
  if (email && !EMAIL_RE.test(email)) return { error: 'Enter a valid email.' };
  if (!ROLES.includes(role)) return { error: 'Choose a role.' };
  if (pw.length < MIN_PASSWORD) return { error: `Temporary password must be at least ${MIN_PASSWORD} characters.` };
  if (await getAdminByUsername(username)) return { error: 'That user ID is taken.' };
  if (email && (await getAdminByEmail(email))) return { error: 'That email already has an account.' };
  await createStaff({ username, email, fullName: str(fd, 'full_name', 80) || username, role, password: pw });
  revalidatePath('/admin/team');
  return { ok: `Created ${username}. Share the temporary password privately; they can change it in Account.` };
}

export async function updateStaffAction(fd: FormData) {
  const session = await requireAdmin('team.manage');
  const id = Number(fd.get('id'));
  const role = str(fd, 'role', 20) as Role;
  const active = fd.get('active') === '1';
  if (id === session.user.id && (role !== 'admin' || !active)) throw new Error("You can't remove your own admin access.");
  const target = await one<{ role: Role; active: boolean }>(`SELECT role, active FROM admin_users WHERE id=?`, [id]);
  if (target?.role === 'admin' && target.active && (role !== 'admin' || !active) && (await activeAdminCount()) <= 1) throw new Error('At least one active admin is required.');
  await updateStaff(id, { role: ROLES.includes(role) ? role : undefined, active, fullName: str(fd, 'full_name', 80) || undefined });
  revalidatePath('/admin/team');
}

export async function resetStaffPasswordAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin('team.manage');
  const pw = String(fd.get('password') ?? '');
  if (pw.length < MIN_PASSWORD) return { error: `At least ${MIN_PASSWORD} characters.` };
  await setPassword(Number(fd.get('id')), pw);
  return { ok: 'Password reset. Their other sessions were signed out.' };
}

// ─────────────── Demo data ───────────────

export async function demoDataAction(_prev: State, fd: FormData): Promise<State> {
  await requireAdmin('demo.manage');
  const ws = await getActiveWorkspace();
  try {
    if (fd.get('op') === 'remove') {
      const c = await tx((db) => removeDemoData(db));
      revalidatePath('/admin', 'layout');
      return { ok: `Removed ${c.leads ?? 0} demo leads, ${c.conversations ?? 0} conversations and ${c.visitors ?? 0} visitors.` };
    }
    const r = await tx((db) => loadDemoData(db, ws.id, ws.config));
    revalidatePath('/admin', 'layout');
    return { ok: `Loaded ${r.visitors} visitors, ${r.conversations} conversations and ${r.leads} leads (all labelled DEMO).` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function markAllReadAction() {
  const session = await requireAdmin();
  const { exec } = await import('@/lib/db');
  await exec(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`, [Date.now(), session.user.id]);
  revalidatePath('/admin', 'layout');
}
