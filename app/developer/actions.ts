'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { GoogleGenAI } from '@google/genai';
import { requireDeveloper, createDeveloper, deleteDeveloper, getDeveloperById, setDeveloperPassword, setDeveloperSessionCookie } from '@/lib/dev-auth';
import { DEV_WS_COOKIE, editingWorkspace } from '@/lib/dev-workspace';
import { activateWorkspace, archiveWorkspace, createWorkspace, restoreVersion, saveWorkspaceConfig, withDefaults } from '@/lib/workspace';
import { deliver } from '@/lib/notify';
import { LIVE_MODEL } from '@/lib/assistant-prompt';
import { TEXT_MODEL } from '@/lib/conversations';
import { checkPasswordHash, EMAIL_RE, MIN_PASSWORD, USERNAME_RE } from '@/lib/passwords';
import { exec, one } from '@/lib/db';
import type { WorkspaceConfig } from '@/lib/workspace-types';

export interface SaveResult {
  ok: boolean;
  errors?: string[];
  message?: string;
}

const PATH_RE = /^[a-zA-Z]+(\.[a-zA-Z0-9]+)*$/;

function refreshSite() {
  revalidatePath('/', 'layout');
}

/** Replaces one part of the workspace config (e.g. "hero", "pricing.plans") and saves a new version. */
export async function saveConfigPart(path: string, valueJson: string, note: string): Promise<SaveResult> {
  const dev = await requireDeveloper();
  if (!PATH_RE.test(path)) return { ok: false, errors: ['Invalid path'] };
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }
  const { ws } = await editingWorkspace();
  const config = structuredClone(ws.config) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let cur: Record<string, unknown> = config;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  const r = await saveWorkspaceConfig(ws.id, config as unknown as WorkspaceConfig, dev.user.username, note || `Edited ${path}`);
  if (!r.ok) return { ok: false, errors: r.errors };
  refreshSite();
  return { ok: true, message: 'Saved. The live site updates within seconds.' };
}

export async function saveRawConfig(json: string, note: string): Promise<SaveResult> {
  const dev = await requireDeveloper();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  const { ws } = await editingWorkspace();
  const r = await saveWorkspaceConfig(ws.id, withDefaults(parsed), dev.user.username, note || 'Raw JSON edit');
  if (!r.ok) return { ok: false, errors: r.errors };
  refreshSite();
  return { ok: true, message: 'Configuration saved.' };
}

export async function restoreVersionAction(fd: FormData) {
  const dev = await requireDeveloper();
  const { ws } = await editingWorkspace();
  await restoreVersion(ws.id, Number(fd.get('version')), dev.user.username);
  refreshSite();
  revalidatePath('/developer', 'layout');
}

// ─────────────── Workspaces ───────────────

export async function createWorkspaceAction(_prev: SaveResult, fd: FormData): Promise<SaveResult> {
  const dev = await requireDeveloper();
  const id = String(fd.get('id') ?? '')
    .trim()
    .toLowerCase();
  const from = String(fd.get('from') ?? 'template:agency');
  const r = await createWorkspace(id, String(fd.get('name') ?? ''), from.startsWith('clone:') ? { cloneOf: from.slice(6) } : { template: from.replace('template:', '') }, dev.user.username);
  revalidatePath('/developer/workspaces');
  return r.ok ? { ok: true, message: `Workspace "${id}" created as a draft. Edit it, then activate it when ready.` } : { ok: false, errors: r.errors };
}

export async function editWorkspaceAction(fd: FormData) {
  await requireDeveloper();
  (await cookies()).set(DEV_WS_COOKIE, String(fd.get('id') ?? ''), { path: '/developer', httpOnly: true, sameSite: 'strict', maxAge: 30 * 86400 });
  revalidatePath('/developer', 'layout');
}

export async function activateWorkspaceAction(fd: FormData) {
  await requireDeveloper();
  await activateWorkspace(String(fd.get('id') ?? ''));
  refreshSite();
  revalidatePath('/developer', 'layout');
}

export async function archiveWorkspaceAction(fd: FormData) {
  await requireDeveloper();
  await archiveWorkspace(String(fd.get('id') ?? ''));
  revalidatePath('/developer/workspaces');
}

// ─────────────── Tests ───────────────

export async function testWebhookAction(hookId: string): Promise<SaveResult> {
  await requireDeveloper();
  const { ws } = await editingWorkspace();
  const h = ws.config.integrations.webhooks.find((x) => x.id === hookId);
  if (!h) return { ok: false, errors: ['Save the webhook first, then test it.'] };
  const body = JSON.stringify({ event: 'test.ping', workspace: ws.id, sent_at: new Date().toISOString(), data: { message: 'Test from the Developer Control Center' } });
  const r = await deliver(ws.id, h, 'test.ping', body);
  return r.ok ? { ok: true, message: `Delivered (HTTP ${r.status}).` } : { ok: false, errors: [`Failed: ${r.status ? `HTTP ${r.status}` : (r as { error?: string }).error}`] };
}

export async function testGeminiAction(): Promise<SaveResult> {
  await requireDeveloper();
  if (!process.env.GEMINI_API_KEY) return { ok: false, errors: ['GEMINI_API_KEY is not set.'] };
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const out: string[] = [];
  const errors: string[] = [];
  try {
    const r = await ai.models.generateContent({ model: TEXT_MODEL, contents: 'Reply with the single word OK.' });
    out.push(`Text model ${TEXT_MODEL}: ${(r.text ?? '').trim().slice(0, 20) || 'responded'}`);
  } catch (e) {
    errors.push(`Text model ${TEXT_MODEL}: ${(e as Error).message.slice(0, 200)}`);
  }
  try {
    await ai.models.get({ model: LIVE_MODEL });
    out.push(`Live model ${LIVE_MODEL}: found`);
  } catch (e) {
    errors.push(`Live model ${LIVE_MODEL}: ${(e as Error).message.slice(0, 200)} — check GEMINI_LIVE_MODEL against Google's current model list.`);
  }
  try {
    await ai.authTokens.create({ config: { uses: 1, expireTime: new Date(Date.now() + 60_000).toISOString(), httpOptions: { apiVersion: 'v1alpha' } } });
    out.push('Ephemeral voice tokens: OK');
  } catch (e) {
    errors.push(`Ephemeral tokens: ${(e as Error).message.slice(0, 200)}`);
  }
  return { ok: !errors.length, message: out.join(' · '), errors };
}

// ─────────────── Developer accounts ───────────────

export async function createDeveloperAction(_prev: SaveResult, fd: FormData): Promise<SaveResult> {
  await requireDeveloper();
  const username = String(fd.get('username') ?? '').trim();
  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase();
  const pw = String(fd.get('password') ?? '');
  if (!USERNAME_RE.test(username)) return { ok: false, errors: ['Developer ID: 3–60 letters, numbers, dot, dash or underscore.'] };
  if (email && !EMAIL_RE.test(email)) return { ok: false, errors: ['Invalid email.'] };
  if (pw.length < MIN_PASSWORD) return { ok: false, errors: [`Password must be at least ${MIN_PASSWORD} characters.`] };
  if (await one(`SELECT 1 FROM developer_users WHERE lower(username)=lower(?)`, [username])) return { ok: false, errors: ['That ID is taken.'] };
  await createDeveloper(username, email, pw);
  revalidatePath('/developer/account');
  return { ok: true, message: `Developer "${username}" created.` };
}

export async function changeDeveloperPasswordAction(_prev: SaveResult, fd: FormData): Promise<SaveResult> {
  const dev = await requireDeveloper();
  const me = await getDeveloperById(dev.user.id);
  if (!me || !checkPasswordHash(String(fd.get('current') ?? ''), me.password_hash)) return { ok: false, errors: ['Current password is incorrect.'] };
  const pw = String(fd.get('password') ?? '');
  if (pw.length < MIN_PASSWORD) return { ok: false, errors: [`At least ${MIN_PASSWORD} characters.`] };
  if (pw !== String(fd.get('confirm') ?? '')) return { ok: false, errors: ['Passwords do not match.'] };
  await setDeveloperPassword(me.id, pw);
  const updated = await getDeveloperById(me.id);
  if (updated) await setDeveloperSessionCookie(updated);
  return { ok: true, message: 'Password changed. Other sessions were signed out.' };
}

export async function deleteDeveloperAction(fd: FormData) {
  const dev = await requireDeveloper();
  const id = Number(fd.get('id'));
  if (id === dev.user.id) throw new Error("You can't delete yourself.");
  await deleteDeveloper(id);
  revalidatePath('/developer/account');
}

export async function clearIntegrationLogsAction() {
  await requireDeveloper();
  const { ws } = await editingWorkspace();
  await exec(`DELETE FROM integration_logs WHERE workspace_id=?`, [ws.id]);
  revalidatePath('/developer/integrations');
}
