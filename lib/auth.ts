import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requestIsHttps } from './http';
import { adminCount, ensureAdminSeeded, getAdminById } from './admin-users';
import { safeEqual } from './passwords';
import { can, type Permission, type Role } from './permissions';

/**
 * Signed-cookie sessions. Staff (/admin) and developers (/developer) use different cookies,
 * different signing keys (derived per purpose from AUTH_SECRET) and different user tables,
 * so an admin cookie can never be replayed as a developer session.
 */

export const ADMIN_COOKIE = 'ww_admin';
const SESSION_HOURS = 12;

export interface AdminSession {
  user: { id: number; name: string; username: string; role: Role; email: string };
  exp: number;
}

interface TokenPayload {
  uid: number;
  v: number;
  exp: number;
  p: 'admin' | 'developer';
}

function secret() {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 16) throw new Error('AUTH_SECRET must be set (at least 16 characters).');
  return s;
}

const keyFor = (purpose: TokenPayload['p']) => crypto.createHmac('sha256', secret()).update(`ww:${purpose}:v1`).digest();
const sign = (purpose: TokenPayload['p'], data: string) => crypto.createHmac('sha256', keyFor(purpose)).update(data).digest('base64url');

export function createToken(purpose: TokenPayload['p'], uid: number, sessionVersion: number, hours = SESSION_HOURS) {
  const payload: TokenPayload = { uid, v: sessionVersion, exp: Date.now() + hours * 3600 * 1000, p: purpose };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(purpose, data)}`;
}

export function readTokenPayload(purpose: TokenPayload['p'], token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  try {
    if (!safeEqual(sig, sign(purpose, data))) return null;
    const p = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (p.p !== purpose || !p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function cookieOptions(path = '/', hours = SESSION_HOURS) {
  return { httpOnly: true, sameSite: 'strict' as const, secure: await requestIsHttps(), path, maxAge: hours * 3600 };
}

// ─────────────── Staff ───────────────

/** Names of required settings that are missing (values are never exposed). */
export async function missingAuthConfig(): Promise<string[]> {
  const missing: string[] = [];
  if ((process.env.AUTH_SECRET?.trim().length ?? 0) < 16) missing.push('AUTH_SECRET (16+ characters)');
  if (!(await ensureAdminSeeded()) && (await adminCount()) === 0) {
    if (!process.env.ADMIN_USERNAME?.trim()) missing.push('ADMIN_USERNAME');
    if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) missing.push('ADMIN_PASSWORD');
  }
  return missing;
}

export const createSessionToken = (uid: number, v: number) => createToken('admin', uid, v);
export const sessionCookieOptions = () => cookieOptions('/');

export async function getAdminSession(): Promise<AdminSession | null> {
  if ((process.env.AUTH_SECRET?.trim().length ?? 0) < 16) return null;
  const p = readTokenPayload('admin', (await cookies()).get(ADMIN_COOKIE)?.value);
  if (!p) return null;
  const user = await getAdminById(p.uid);
  // A password change or deactivation bumps session_version, which signs out every older login.
  if (!user || !user.active || user.session_version !== p.v) return null;
  return {
    user: { id: Number(user.id), name: user.full_name || user.username, username: user.username, role: user.role, email: user.email },
    exp: p.exp,
  };
}

/** For server components / actions: redirect to login when not signed in. */
export async function requireAdmin(permission?: Permission): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  if (permission && !can(session.user.role, permission)) redirect('/admin?denied=1');
  return session;
}

/** For route handlers. */
export async function adminFromRequest(permission?: Permission) {
  const s = await getAdminSession();
  if (!s) return null;
  if (permission && !can(s.user.role, permission)) return null;
  return s;
}
