// Formatting helpers (client + server safe).

export function money(n: number | null | undefined, currency = '$') {
  const v = Number(n ?? 0);
  return `${currency}${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: v % 1 ? 2 : 0 })}`;
}

/** "voice_assistant" → "Voice assistant" */
export const labelize = (k: string | null | undefined) => {
  if (!k) return '—';
  const s = k.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function tzName() {
  const tz = (typeof process !== 'undefined' && process.env.STORE_TIMEZONE) || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function fmtDateTime(ms: number | null | undefined, tz = tzName()) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(ms)));
}

export function fmtDate(ms: number | null | undefined, tz = tzName()) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Number(ms)));
}

export function ago(ms: number | null | undefined, now = Date.now()) {
  if (!ms) return '—';
  const d = now - Number(ms);
  const future = d < 0;
  const a = Math.abs(d);
  const m = Math.round(a / 60000);
  const out = m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  if (out === 'just now') return out;
  return future ? `in ${out}` : `${out} ago`;
}

export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "#7c5cff" → "124 92 255" for CSS rgb(var(--x) / a) */
export function hexToTriplet(hex: string, fallback = '124 92 255') {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : fallback;
}

/** YYYY-MM-DD in the given zone. */
export function dayKey(ms: number, tz = tzName()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);

function tzOffsetMs(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ms;
}

/** "2026-10-01T15:30" entered in the store time zone → unix ms. */
export function fromLocalInput(v: string | null | undefined, tz = tzName()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v ?? '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 9), +(m[5] ?? 0));
  return guess - tzOffsetMs(guess, tz);
}

/** unix ms → "2026-10-01T15:30" in the store time zone (for datetime-local inputs). */
export function toLocalInput(ms: number | null | undefined, tz = tzName()) {
  if (!ms) return '';
  const d = new Date(Number(ms) + tzOffsetMs(Number(ms), tz));
  return d.toISOString().slice(0, 16);
}
