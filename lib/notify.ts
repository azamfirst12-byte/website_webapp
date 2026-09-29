import 'server-only';
import crypto from 'node:crypto';
import { after } from 'next/server';
import { exec, q } from './db';
import { sendMail } from './mailer';
import { siteUrl } from './site';
import type { Workspace } from './workspace';

/**
 * Notifications for the sales team:
 *  - in-app (bell in /admin) for admins, managers and the assigned rep
 *  - email for important events (new lead, booking, hand-over, won)
 *  - webhooks configured in Developer › Integrations (signed with HMAC-SHA256)
 */

export type NotifyType = 'lead_new' | 'lead_qualified' | 'lead_hot' | 'booking' | 'handoff' | 'lead_won' | 'lead_assigned' | 'task_due' | 'summary';

import { WEBHOOK_EVENTS, type WebhookEvent } from './notify-events';
export { WEBHOOK_EVENTS, type WebhookEvent };

const EMAIL_TYPES: NotifyType[] = ['lead_new', 'lead_hot', 'booking', 'handoff', 'lead_won'];

/** Runs work after the response is sent when possible (route handlers / actions), else inline. */
function later(fn: () => Promise<void>) {
  try {
    after(fn);
  } catch {
    void fn().catch((e) => console.error('[notify]', e));
  }
}

export async function notify(
  ws: Workspace,
  n: { type: NotifyType; title: string; body?: string; link?: string; assignedTo?: number | null; onlyAssignee?: boolean; isDemo?: boolean },
) {
  const recipients = await q<{ id: number }>(
    n.onlyAssignee && n.assignedTo
      ? `SELECT id FROM admin_users WHERE id=? AND active`
      : `SELECT id FROM admin_users WHERE active AND (role IN ('admin','manager') OR id = ?)`,
    [n.assignedTo ?? 0],
  );
  for (const r of recipients) {
    await exec(`INSERT INTO notifications (workspace_id, user_id, type, title, body, link, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      ws.id,
      r.id,
      n.type,
      n.title.slice(0, 200),
      n.body?.slice(0, 1000) ?? null,
      n.link ?? null,
      !!n.isDemo,
    ]);
  }
  if (!n.isDemo && EMAIL_TYPES.includes(n.type)) {
    const to = [
      ...(process.env.SALES_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').split(','),
      ...(ws.config.integrations.notifyEmails ?? []),
    ]
      .map((e) => e.trim())
      .filter(Boolean);
    if (to.length) {
      const link = n.link ? `${siteUrl()}${n.link}` : `${siteUrl()}/admin`;
      later(async () => {
        await sendMail([...new Set(to)].join(','), `[${ws.config.brand.name}] ${n.title}`, `${n.title}\n\n${n.body ?? ''}\n\nOpen: ${link}\n`);
      });
    }
  }
}

/** Sends an event to every enabled webhook subscribed to it. */
export function emitWebhook(ws: Workspace, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = (ws.config.integrations.webhooks ?? []).filter((h) => h.enabled && h.url && (h.events.includes(event) || h.events.includes('*')));
  if (!hooks.length) return;
  const body = JSON.stringify({ event, workspace: ws.id, sent_at: new Date().toISOString(), data });
  later(async () => {
    await Promise.all(hooks.map((h) => deliver(ws.id, h, event, body)));
  });
}

export async function deliver(workspaceId: string, h: { url: string; secret: string; name: string }, event: string, body: string) {
  const sig = h.secret ? crypto.createHmac('sha256', h.secret).update(body).digest('hex') : '';
  try {
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Event': event, ...(sig ? { 'X-Webhook-Signature': `sha256=${sig}` } : {}) },
      body,
      signal: AbortSignal.timeout(6000),
    });
    await exec(`INSERT INTO integration_logs (workspace_id, event, target, status, code) VALUES (?, ?, ?, ?, ?)`, [
      workspaceId,
      event,
      h.name || h.url,
      res.ok ? 'ok' : 'error',
      res.status,
    ]);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    await exec(`INSERT INTO integration_logs (workspace_id, event, target, status, error) VALUES (?, ?, ?, 'error', ?)`, [
      workspaceId,
      event,
      h.name || h.url,
      (e as Error).message.slice(0, 300),
    ]).catch(() => {});
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
