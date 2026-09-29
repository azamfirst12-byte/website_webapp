'use client';

// Batched analytics events → /api/events (sendBeacon on page hide so nothing is lost).
export interface ClientEvent {
  type: 'section_view' | 'cta_click' | 'engagement' | 'action';
  name?: string;
  path?: string;
  channel?: 'voice' | 'text' | null;
  ok?: boolean;
  conversationId?: string | null;
  meta?: Record<string, unknown>;
}

let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let enabled: Set<string> | null = null;

export function setEnabledEvents(list: string[]) {
  enabled = new Set(list);
}

export function flush(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 40) });
  if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
  else fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  if (queue.length) flush(beacon);
}

export function trackEvent(e: ClientEvent) {
  if (enabled && !enabled.has(e.type)) return;
  queue.push({ path: location.pathname, ...e });
  if (!timer) timer = setTimeout(() => flush(), 3000);
}
