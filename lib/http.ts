import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

export const VISITOR_COOKIE = 'ww_vid';

/** Mark cookies Secure only when the request really came over HTTPS (so http://localhost and LAN testing keep them). */
export async function requestIsHttps(req?: Request) {
  const h = await headers();
  const proto = h.get('x-forwarded-proto')?.split(',')[0].trim();
  if (proto) return proto === 'https';
  if (req) return new URL(req.url).protocol === 'https:';
  return false;
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function clientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const s = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** Anonymous visitor id (first-party cookie, 1 year). Only route handlers / actions may create it. */
export async function visitorId(create = false): Promise<{ id: string; isNew: boolean } | null> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{8,40}$/.test(existing)) return { id: existing, isNew: false };
  if (!create) return null;
  const id = crypto.randomBytes(12).toString('base64url');
  jar.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: await requestIsHttps(), path: '/', maxAge: 365 * 86400 });
  return { id, isNew: true };
}

// ─────────────── Rate limiting (in-memory, per server instance) ───────────────

const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}

export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
