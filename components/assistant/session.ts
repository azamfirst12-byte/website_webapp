'use client';

// The visitor's current assistant conversation (so forms and events are linked to it).
let current: { id: string | null; channel: 'voice' | 'text' | null } = { id: null, channel: null };

export function getConversationId() {
  if (current.id) return current.id;
  try {
    return sessionStorage.getItem('ww_conv');
  } catch {
    return null;
  }
}

export function getConversationChannel() {
  if (current.channel) return current.channel;
  try {
    return sessionStorage.getItem('ww_conv_ch') as 'voice' | 'text' | null;
  } catch {
    return null;
  }
}

export function setConversation(id: string | null, channel: 'voice' | 'text' | null) {
  current = { id, channel };
  try {
    if (id) {
      sessionStorage.setItem('ww_conv', id);
      sessionStorage.setItem('ww_conv_ch', channel ?? '');
    } else {
      sessionStorage.removeItem('ww_conv');
      sessionStorage.removeItem('ww_conv_ch');
    }
  } catch {}
}
