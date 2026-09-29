import 'server-only';
import crypto from 'node:crypto';

// scrypt password hashing (no extra packages), shared by staff and developer accounts.
export const MIN_PASSWORD = 10;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPasswordHash(password: string, stored: string) {
  const [algo, salt, expected] = (stored ?? '').split(':');
  if (algo !== 'scrypt' || !salt || !expected) return false;
  return safeEqual(crypto.scryptSync(password, salt, 64).toString('hex'), expected);
}

/** A fixed dummy hash so failed lookups take as long as real ones (no username probing by timing). */
export const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (pw !== confirm) return 'The two passwords do not match.';
  return null;
}

export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,60}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
