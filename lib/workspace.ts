import 'server-only';
import { cache } from 'react';
import { exec, one, q, tx } from './db';
import { DEFAULT_WORKSPACE, TEMPLATES } from './default-workspace';
import {
  REQUIRED_ACTIONS,
  SECTION_IDS,
  SUPPORT_ACTIONS,
  WEBSITE_ACTIONS,
  type Features,
  type PublicWorkspace,
  type WorkspaceConfig,
  type WorkspaceMeta,
} from './workspace-types';

export interface Workspace extends WorkspaceMeta {
  config: WorkspaceConfig;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge a stored config over the defaults so fields added in later versions always exist. Arrays are replaced, not merged. */
export function withDefaults(stored: unknown, base: unknown = DEFAULT_WORKSPACE): WorkspaceConfig {
  if (!isObj(base)) return (stored ?? base) as WorkspaceConfig;
  if (!isObj(stored)) return structuredClone(base) as unknown as WorkspaceConfig;
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(stored)])) {
    const b = (base as Record<string, unknown>)[k];
    const s = stored[k];
    if (s === undefined) out[k] = structuredClone(b);
    else if (isObj(b) && isObj(s)) out[k] = withDefaults(s, b);
    else out[k] = s;
  }
  return out as unknown as WorkspaceConfig;
}

// ─────────────── Active workspace ───────────────

const TTL = 10_000;
const memo = new Map<string, { at: number; ws: Workspace }>();
let activeMemo: { at: number; id: string } | null = null;

export function invalidateWorkspaceCache() {
  memo.clear();
  activeMemo = null;
}

export async function activeWorkspaceId(): Promise<string> {
  // A deployment can be pinned to one workspace (one Vercel project per client).
  const pinned = process.env.ACTIVE_WORKSPACE?.trim();
  if (pinned) return pinned;
  if (activeMemo && Date.now() - activeMemo.at < TTL) return activeMemo.id;
  const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key='active_workspace'`);
  const id = typeof row?.value === 'string' ? row.value : 'xynex';
  activeMemo = { at: Date.now(), id };
  return id;
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.ws;
  const row = await one<{ id: string; name: string; status: WorkspaceMeta['status']; updated_at: number; config: unknown }>(
    `SELECT id, name, status, updated_at, config FROM workspaces WHERE id=?`,
    [id],
  );
  if (!row) return null;
  const ws: Workspace = { id: row.id, name: row.name, status: row.status, updated_at: Number(row.updated_at), config: withDefaults(row.config) };
  memo.set(id, { at: Date.now(), ws });
  return ws;
}

/** The workspace this deployment serves (per request). */
export const getActiveWorkspace = cache(async (): Promise<Workspace> => {
  try {
    const id = await activeWorkspaceId();
    const ws = (await getWorkspace(id)) ?? (await getWorkspace('xynex'));
    if (ws) return ws;
  } catch (e) {
    // Database unreachable (e.g. during a build without DATABASE_URL): render with the defaults.
    console.error('[workspace] falling back to defaults:', (e as Error).message);
  }
  return { id: 'xynex', name: DEFAULT_WORKSPACE.brand.name, status: 'active', updated_at: 0, config: structuredClone(DEFAULT_WORKSPACE) };
});

export function deployEnv(): 'production' | 'preview' | 'development' {
  const v = process.env.VERCEL_ENV;
  if (v === 'production' || v === 'preview' || v === 'development') return v;
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

/** Feature toggles with this environment's overrides applied. */
export function effectiveFeatures(c: WorkspaceConfig): Features {
  return { ...c.features, ...(c.environments?.[deployEnv()] ?? {}) };
}

/** Actions the assistant may use: the developer's allow-list plus the always-required ones, minus disabled features. */
export function allowedActions(c: WorkspaceConfig) {
  const f = effectiveFeatures(c);
  const all = new Set<string>([...c.assistant.allowedActions, ...REQUIRED_ACTIONS]);
  if (!f.booking) all.delete('request_booking');
  if (!f.handoff) all.delete('request_human_handoff');
  if (!f.compare) all.delete('compare_items');
  return [...WEBSITE_ACTIONS, ...SUPPORT_ACTIONS].filter((a) => all.has(a));
}

/** What the browser is allowed to see. */
export function toPublic(ws: Workspace): PublicWorkspace {
  const c = ws.config;
  const features = effectiveFeatures(c);
  return {
    id: ws.id,
    version: c.version,
    brand: c.brand,
    seo: c.seo,
    announcement: c.announcement,
    pages: c.pages,
    homeOrder: c.homeOrder,
    sections: c.sections,
    hero: c.hero,
    logos: c.logos,
    industries: c.industries,
    services: c.services,
    process: c.process,
    pricing: c.pricing,
    caseStudies: c.caseStudies,
    stats: c.stats,
    testimonials: c.testimonials,
    faq: c.faq,
    cta: c.cta,
    about: c.about,
    contact: c.contact,
    booking: c.booking,
    actions: c.actions,
    features,
    assistant: {
      name: c.assistant.name,
      greeting: c.assistant.greeting,
      languages: c.assistant.languages,
      quickPrompts: c.assistant.quickPrompts,
      allowedActions: allowedActions(c) as PublicWorkspace['assistant']['allowedActions'],
    },
    analyticsEvents: c.analytics.events.filter((e) => e.enabled).map((e) => e.key),
  };
}

// ─────────────── Validation ───────────────

const slugOk = (s: unknown) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(s);
const hexOk = (s: unknown) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

/** Returns a list of problems (empty = valid). Keeps obviously broken configs out of production. */
export function validateConfig(c: WorkspaceConfig): string[] {
  const errs: string[] = [];
  if (!c.brand?.name?.trim()) errs.push('brand.name is required');
  for (const [k, v] of Object.entries(c.brand?.colors ?? {})) if (!hexOk(v)) errs.push(`brand.colors.${k} must be a #rrggbb colour`);
  const uniq = (label: string, keys: unknown[]) => {
    const seen = new Set<unknown>();
    for (const k of keys) {
      if (seen.has(k)) errs.push(`${label}: duplicate "${String(k)}"`);
      seen.add(k);
    }
  };
  if (!Array.isArray(c.services)) errs.push('services must be a list');
  else {
    c.services.forEach((s, i) => {
      if (!slugOk(s.slug)) errs.push(`services[${i}].slug must be lowercase letters, numbers and dashes`);
      if (!s.name) errs.push(`services[${i}].name is required`);
      if (typeof s.startingPrice !== 'number' || s.startingPrice < 0) errs.push(`services[${i}].startingPrice must be a number`);
    });
    uniq('services', c.services.map((s) => s.slug));
  }
  if (!Array.isArray(c.pricing?.plans)) errs.push('pricing.plans must be a list');
  else {
    c.pricing.plans.forEach((p, i) => {
      if (!slugOk(p.id)) errs.push(`pricing.plans[${i}].id must be lowercase letters, numbers and dashes`);
    });
    uniq('pricing.plans', c.pricing.plans.map((p) => p.id));
  }
  if (Array.isArray(c.caseStudies)) uniq('caseStudies', c.caseStudies.map((x) => x.slug));
  if (Array.isArray(c.faq)) uniq('faq', c.faq.map((x) => x.id));
  if (!Array.isArray(c.homeOrder) || c.homeOrder.some((s) => !(SECTION_IDS as readonly string[]).includes(s))) errs.push(`homeOrder may only contain: ${SECTION_IDS.join(', ')}`);
  if (!Array.isArray(c.crm?.stages) || c.crm.stages.length < 2) errs.push('crm.stages needs at least two stages');
  else {
    uniq('crm.stages', c.crm.stages.map((s) => s.key));
    if (!c.crm.stages.some((s) => s.kind === 'won')) errs.push('crm.stages needs one stage with kind "won"');
    if (!c.crm.stages.some((s) => s.kind === 'lost')) errs.push('crm.stages needs one stage with kind "lost"');
    c.crm.stages.forEach((s, i) => {
      if (!/^[a-z0-9_]{1,30}$/.test(s.key)) errs.push(`crm.stages[${i}].key must be lowercase letters, numbers or _`);
    });
  }
  const known = new Set<string>([...WEBSITE_ACTIONS, ...SUPPORT_ACTIONS]);
  for (const a of c.assistant?.allowedActions ?? []) if (!known.has(a)) errs.push(`assistant.allowedActions: unknown action "${a}"`);
  for (const w of c.integrations?.webhooks ?? []) {
    try {
      const u = new URL(w.url);
      if (u.protocol !== 'https:' && !/^(localhost|127\.)/.test(u.hostname)) errs.push(`webhook "${w.name}" must use https`);
    } catch {
      errs.push(`webhook "${w.name}" has an invalid URL`);
    }
  }
  return errs;
}

// ─────────────── Developer operations ───────────────

export async function listWorkspaces(): Promise<(WorkspaceMeta & { active: boolean; leads: number })[]> {
  const active = await activeWorkspaceId();
  const rows = await q<WorkspaceMeta & { leads: number }>(
    `SELECT w.id, w.name, w.status, w.updated_at, (SELECT COUNT(*) FROM leads l WHERE l.workspace_id = w.id) AS leads
     FROM workspaces w ORDER BY (w.id = ?) DESC, w.updated_at DESC`,
    [active],
  );
  return rows.map((r) => ({ ...r, updated_at: Number(r.updated_at), leads: Number(r.leads), active: r.id === active }));
}

export async function saveWorkspaceConfig(id: string, config: WorkspaceConfig, by: string, note = '') {
  const merged = withDefaults(config);
  const errs = validateConfig(merged);
  if (errs.length) return { ok: false as const, errors: errs };
  await tx(async (db) => {
    await db.exec(`UPDATE workspaces SET config=?::jsonb, name=?, updated_at=? WHERE id=?`, [JSON.stringify(merged), merged.brand.name, Date.now(), id]);
    await db.exec(`INSERT INTO workspace_versions (workspace_id, config, note, created_by) VALUES (?, ?::jsonb, ?, ?)`, [id, JSON.stringify(merged), note.slice(0, 200), by]);
    // Keep the history manageable: last 50 versions per workspace.
    await db.exec(
      `DELETE FROM workspace_versions WHERE workspace_id=? AND id NOT IN (SELECT id FROM workspace_versions WHERE workspace_id=? ORDER BY created_at DESC, id DESC LIMIT 50)`,
      [id, id],
    );
  });
  invalidateWorkspaceCache();
  return { ok: true as const };
}

export async function createWorkspace(id: string, name: string, from: { template?: string; cloneOf?: string }, by: string) {
  if (!slugOk(id)) return { ok: false as const, errors: ['Workspace id: lowercase letters, numbers and dashes'] };
  if (await one(`SELECT 1 FROM workspaces WHERE id=?`, [id])) return { ok: false as const, errors: ['That workspace id already exists'] };
  let config: WorkspaceConfig;
  if (from.cloneOf) {
    const src = await getWorkspace(from.cloneOf);
    if (!src) return { ok: false as const, errors: ['Source workspace not found'] };
    config = structuredClone(src.config);
  } else config = (TEMPLATES[from.template ?? 'agency'] ?? TEMPLATES.agency).build();
  if (name.trim()) config.brand.name = name.trim();
  await exec(`INSERT INTO workspaces (id, name, status, config) VALUES (?, ?, 'draft', ?::jsonb)`, [id, config.brand.name, JSON.stringify(config)]);
  await exec(`INSERT INTO workspace_versions (workspace_id, config, note, created_by) VALUES (?, ?::jsonb, ?, ?)`, [
    id,
    JSON.stringify(config),
    from.cloneOf ? `Cloned from ${from.cloneOf}` : `Created from template ${from.template ?? 'agency'}`,
    by,
  ]);
  invalidateWorkspaceCache();
  return { ok: true as const };
}

export async function activateWorkspace(id: string) {
  if (!(await one(`SELECT 1 FROM workspaces WHERE id=?`, [id]))) return false;
  await tx(async (db) => {
    await db.exec(`UPDATE workspaces SET status='draft' WHERE status='active' AND id<>?`, [id]);
    await db.exec(`UPDATE workspaces SET status='active', updated_at=? WHERE id=?`, [Date.now(), id]);
    await db.exec(
      `INSERT INTO settings (key, value, updated_at) VALUES ('active_workspace', ?::jsonb, ?) ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [JSON.stringify(id), Date.now()],
    );
  });
  invalidateWorkspaceCache();
  return true;
}

export async function archiveWorkspace(id: string) {
  if (id === (await activeWorkspaceId())) return false;
  await exec(`UPDATE workspaces SET status='archived', updated_at=? WHERE id=?`, [Date.now(), id]);
  invalidateWorkspaceCache();
  return true;
}

export async function listVersions(id: string, limit = 30) {
  return q<{ id: number; note: string; created_by: string; created_at: number }>(
    `SELECT id, note, created_by, created_at FROM workspace_versions WHERE workspace_id=? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [id, limit],
  );
}

export async function restoreVersion(id: string, versionId: number, by: string) {
  const v = await one<{ config: unknown; created_at: number }>(`SELECT config, created_at FROM workspace_versions WHERE workspace_id=? AND id=?`, [id, versionId]);
  if (!v) return { ok: false as const, errors: ['Version not found'] };
  return saveWorkspaceConfig(id, withDefaults(v.config), by, `Restored version #${versionId}`);
}
