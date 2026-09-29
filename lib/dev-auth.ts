import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { exec, one, q } from './db';
import { checkPasswordHash, DUMMY_HASH, hashPassword } from './passwords';
import { cookieOptions, createToken, readTokenPayload } from './auth';

/**
 * Developer Control Center accounts. Deliberately separate from staff accounts:
 * own table, own cookie (scoped to /developer), own signing key. Having an admin
 * account never grants developer access.
 */

export const DEV_COOKIE = 'ww_dev';
const DEV_HOURS = 8;

export interface DeveloperUser {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  session_version: number;
  last_login_at: number | null;
}
const COLS = 'id, username, email, password_hash, session_version, last_login_at';
const NOW = `(floor(extract(epoch from clock_timestamp()) * 1000))::bigint`;

export async function developerCount() {
  return Number((await one<{ n: number }>('SELECT COUNT(*) AS n FROM developer_users'))?.n ?? 0);
}

export async function ensureDeveloperSeeded() {
  if ((await developerCount()) > 0) return true;
  const username = process.env.DEVELOPER_USERNAME?.trim();
  const hash = process.env.DEVELOPER_PASSWORD_HASH?.trim() || (process.env.DEVELOPER_PASSWORD ? hashPassword(process.env.DEVELOPER_PASSWORD) : '');
  if (!username || !hash) return false;
  await exec(
    `INSERT INTO developer_users (username, email, password_hash) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM developer_users) ON CONFLICT DO NOTHING`,
    [username, (process.env.DEVELOPER_EMAIL ?? '').trim().toLowerCase(), hash],
  );
  return true;
}

export async function missingDevConfig(): Promise<string[]> {
  const missing: string[] = [];
  if ((process.env.AUTH_SECRET?.trim().length ?? 0) < 16) missing.push('AUTH_SECRET (16+ characters)');
  if (!(await ensureDeveloperSeeded())) {
    if (!process.env.DEVELOPER_USERNAME?.trim()) missing.push('DEVELOPER_USERNAME');
    if (!process.env.DEVELOPER_PASSWORD && !process.env.DEVELOPER_PASSWORD_HASH) missing.push('DEVELOPER_PASSWORD');
  }
  return missing;
}

export const getDeveloperById = (id: number) => one<DeveloperUser>(`SELECT ${COLS} FROM developer_users WHERE id=?`, [id]);

export async function verifyDeveloperLogin(username: string, password: string) {
  await ensureDeveloperSeeded();
  const user = await one<DeveloperUser>(`SELECT ${COLS} FROM developer_users WHERE lower(username)=lower(?) OR (email <> '' AND lower(email)=lower(?))`, [
    username.trim(),
    username.trim(),
  ]);
  const ok = checkPasswordHash(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  await exec(`UPDATE developer_users SET last_login_at=${NOW} WHERE id=?`, [user.id]);
  return user;
}

export async function setDeveloperSessionCookie(user: DeveloperUser) {
  (await cookies()).set(DEV_COOKIE, createToken('developer', Number(user.id), user.session_version, DEV_HOURS), await cookieOptions('/developer', DEV_HOURS));
}

export async function clearDeveloperCookie() {
  (await cookies()).set(DEV_COOKIE, '', { path: '/developer', maxAge: 0 });
}

export async function getDeveloperSession() {
  if ((process.env.AUTH_SECRET?.trim().length ?? 0) < 16) return null;
  const p = readTokenPayload('developer', (await cookies()).get(DEV_COOKIE)?.value);
  if (!p) return null;
  const user = await getDeveloperById(p.uid);
  if (!user || user.session_version !== p.v) return null;
  return { user: { id: Number(user.id), username: user.username, email: user.email } };
}

export async function requireDeveloper() {
  const s = await getDeveloperSession();
  if (!s) redirect('/developer/login');
  return s;
}

export async function listDevelopers() {
  return q<{ id: number; username: string; email: string; last_login_at: number | null; created_at: number }>(
    'SELECT id, username, email, last_login_at, created_at FROM developer_users ORDER BY id',
  );
}

export async function createDeveloper(username: string, email: string, password: string) {
  await exec('INSERT INTO developer_users (username, email, password_hash) VALUES (?, ?, ?)', [username.trim(), email.trim().toLowerCase(), hashPassword(password)]);
}

export async function setDeveloperPassword(id: number, password: string) {
  await exec(`UPDATE developer_users SET password_hash=?, session_version=session_version+1, updated_at=${NOW} WHERE id=?`, [hashPassword(password), id]);
}

export async function deleteDeveloper(id: number) {
  if ((await developerCount()) <= 1) return false;
  await exec('DELETE FROM developer_users WHERE id=?', [id]);
  return true;
}
