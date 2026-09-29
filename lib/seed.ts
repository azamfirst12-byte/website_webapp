import 'server-only';
import type { Db } from './db';
import { DEFAULT_WORKSPACE } from './default-workspace';
import { loadDemoData } from './demo-data';
import { hashPassword } from './passwords';

export const DEFAULT_WORKSPACE_ID = 'xynex';

/**
 * First-run setup (runs inside the schema transaction): the default workspace, the active-workspace
 * setting and — unless SEED_DEMO_DATA=off — clearly labelled demo CRM/analytics data.
 */
export async function seed(db: Db) {
  const existing = await db.one<{ n: number }>('SELECT COUNT(*) AS n FROM workspaces');
  if (Number(existing?.n ?? 0) > 0) return;

  await db.exec(`INSERT INTO workspaces (id, name, status, config) VALUES (?, ?, 'active', ?::jsonb) ON CONFLICT (id) DO NOTHING`, [
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE.brand.name,
    JSON.stringify(DEFAULT_WORKSPACE),
  ]);
  await db.exec(`INSERT INTO workspace_versions (workspace_id, config, note, created_by) VALUES (?, ?::jsonb, 'Initial version', 'system')`, [
    DEFAULT_WORKSPACE_ID,
    JSON.stringify(DEFAULT_WORKSPACE),
  ]);
  await db.exec(`INSERT INTO settings (key, value) VALUES ('active_workspace', ?::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(DEFAULT_WORKSPACE_ID)]);

  // First admin from .env now (not on first login), so demo notifications have someone to go to.
  const username = process.env.ADMIN_USERNAME?.trim();
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim() || (process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : '');
  if (username && hash) {
    await db.exec(
      `INSERT INTO admin_users (username, email, full_name, role, password_hash)
       SELECT ?, ?, 'Administrator', 'admin', ? WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE is_demo = FALSE) ON CONFLICT DO NOTHING`,
      [username, (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(), hash],
    );
  }

  if ((process.env.SEED_DEMO_DATA ?? 'on').toLowerCase() !== 'off') {
    await loadDemoData(db, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE);
  }
}
