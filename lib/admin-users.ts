import 'server-only';
import crypto from 'node:crypto';
import { exec, one, q } from './db';
import { checkPasswordHash, DUMMY_HASH, hashPassword } from './passwords';
import type { Role } from './permissions';

/** Staff accounts for the business admin area (/admin). Developers live in a separate table. */
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  password_hash: string;
  session_version: number;
  last_login_at: number | null;
}

const COLS = 'id, username, email, full_name, role, active, password_hash, session_version, last_login_at';
const RESET_MINUTES = 30;
const NOW = `(floor(extract(epoch from clock_timestamp()) * 1000))::bigint`;

export async function adminCount() {
  return Number((await one<{ n: number }>('SELECT COUNT(*) AS n FROM admin_users WHERE is_demo = FALSE'))?.n ?? 0);
}

/** Creates the first admin from ADMIN_USERNAME + ADMIN_PASSWORD(_HASH) + ADMIN_EMAIL if no real staff account exists yet. */
export async function ensureAdminSeeded() {
  if ((await adminCount()) > 0) return true;
  const username = process.env.ADMIN_USERNAME?.trim();
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim() || (process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : '');
  if (!username || !hash) return false;
  await exec(
    `INSERT INTO admin_users (username, email, full_name, role, password_hash)
     SELECT ?, ?, ?, 'admin', ? WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE is_demo = FALSE) ON CONFLICT DO NOTHING`,
    [username, (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(), 'Administrator', hash],
  );
  return true;
}

export const getAdminById = (id: number) => one<AdminUser>(`SELECT ${COLS} FROM admin_users WHERE id=?`, [id]);
export const getAdminByUsername = (u: string) => one<AdminUser>(`SELECT ${COLS} FROM admin_users WHERE lower(username)=lower(?)`, [u.trim()]);
export const getAdminByEmail = async (e: string) =>
  e.trim() ? one<AdminUser>(`SELECT ${COLS} FROM admin_users WHERE lower(email)=lower(?) AND email <> '' AND active ORDER BY id LIMIT 1`, [e.trim()]) : undefined;

/** Staff member when username/email + password match and the account is active, else null. */
export async function verifyLogin(username: string, password: string): Promise<AdminUser | null> {
  await ensureAdminSeeded();
  const user = (await getAdminByUsername(username)) ?? (username.includes('@') ? await getAdminByEmail(username) : undefined);
  const ok = checkPasswordHash(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return null;
  await exec(`UPDATE admin_users SET last_login_at=${NOW} WHERE id=?`, [user.id]);
  return user;
}

export async function setPassword(id: number, password: string) {
  await exec(`UPDATE admin_users SET password_hash=?, session_version=session_version+1, updated_at=${NOW} WHERE id=?`, [hashPassword(password), id]);
  await exec('DELETE FROM admin_resets WHERE admin_id=?', [id]);
}

export async function setAccount(id: number, username: string, email: string, fullName: string) {
  await exec(`UPDATE admin_users SET username=?, email=?, full_name=?, updated_at=${NOW} WHERE id=?`, [username.trim(), email.trim().toLowerCase(), fullName.trim().slice(0, 80), id]);
}

// ─────────────── Team management ───────────────

export async function listStaff() {
  return q<Omit<AdminUser, 'password_hash'> & { is_demo: boolean; open_leads: number }>(
    `SELECT u.id, u.username, u.email, u.full_name, u.role, u.active, u.session_version, u.last_login_at, u.is_demo,
            (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.stage NOT IN ('won','lost')) AS open_leads
     FROM admin_users u ORDER BY u.active DESC, u.role, u.username`,
  );
}

/** Active staff who can own leads (for assignment dropdowns and round-robin). */
export async function assignableStaff() {
  return q<{ id: number; username: string; full_name: string; role: Role }>(
    `SELECT id, username, full_name, role FROM admin_users WHERE active AND role IN ('admin','manager','sales') ORDER BY full_name, username`,
  );
}

export async function createStaff(u: { username: string; email: string; fullName: string; role: Role; password: string }) {
  const r = await one<AdminUser>(`INSERT INTO admin_users (username, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING ${COLS}`, [
    u.username.trim(),
    u.email.trim().toLowerCase(),
    u.fullName.trim().slice(0, 80),
    u.role,
    hashPassword(u.password),
  ]);
  return r!;
}

export async function updateStaff(id: number, patch: { role?: Role; active?: boolean; fullName?: string }) {
  await exec(
    `UPDATE admin_users SET role=COALESCE(?, role), active=COALESCE(?, active), full_name=COALESCE(?, full_name),
       session_version = session_version + CASE WHEN ? = FALSE THEN 1 ELSE 0 END, updated_at=${NOW} WHERE id=?`,
    [patch.role ?? null, patch.active ?? null, patch.fullName ?? null, patch.active ?? null, id],
  );
}

/** Admins left who can manage the team (prevents locking everyone out). */
export async function activeAdminCount() {
  return Number((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM admin_users WHERE role='admin' AND active`))?.n ?? 0);
}

// ─────────────── Reset tokens ───────────────

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function createResetToken(adminId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  await exec('DELETE FROM admin_resets WHERE admin_id=? OR expires_at < ?', [adminId, Date.now()]);
  await exec('INSERT INTO admin_resets (token_hash, admin_id, expires_at) VALUES (?, ?, ?)', [sha(token), adminId, Date.now() + RESET_MINUTES * 60000]);
  return { token, minutes: RESET_MINUTES };
}

export async function adminForResetToken(token: string): Promise<AdminUser | null> {
  if (!token) return null;
  const row = await one<{ admin_id: number }>('SELECT admin_id FROM admin_resets WHERE token_hash=? AND used_at IS NULL AND expires_at > ?', [sha(token), Date.now()]);
  return row ? ((await getAdminById(Number(row.admin_id))) ?? null) : null;
}

export async function resetPasswordWithToken(token: string, password: string) {
  if (!token) return false;
  const row = await one<{ admin_id: number }>(
    'UPDATE admin_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at > ? RETURNING admin_id',
    [Date.now(), sha(token), Date.now()],
  );
  if (!row) return false;
  await setPassword(Number(row.admin_id), password);
  return true;
}

/** Usernames for the quick-pick chips on the login page (never passwords). */
export async function adminUsernames(limit = 8): Promise<{ username: string; role: Role }[]> {
  await ensureAdminSeeded();
  return q<{ username: string; role: Role }>('SELECT username, role FROM admin_users WHERE active AND is_demo = FALSE ORDER BY id LIMIT ?', [limit]);
}
