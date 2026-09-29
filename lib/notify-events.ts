// Webhook event names (client-safe).
export const WEBHOOK_EVENTS = [
  'lead.created',
  'lead.updated',
  'lead.qualified',
  'lead.stage_changed',
  'lead.won',
  'lead.lost',
  'booking.requested',
  'handoff.requested',
  'conversation.closed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
