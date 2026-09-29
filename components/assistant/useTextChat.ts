'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setConversation } from './session';

type Part = { text?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; functionResponse?: { id?: string; name: string; response: Record<string, unknown> }; thoughtSignature?: string; thought?: boolean };
type Content = { role: 'user' | 'model'; parts: Part[] };

export interface TextHooks {
  addMessage: (role: 'user' | 'ai', text: string) => void;
  runTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  transcript: () => unknown[];
  onEnded?: () => void;
}

const MAX_TOOL_ROUNDS = 6;

/**
 * Text channel: the same assistant, tools and action layer as voice, over /api/chat
 * (server calls Gemini with the locked system prompt; tools run here in the page).
 */
export function useTextChat(hooks: TextHooks) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const history = useRef<Content[]>([]);
  const conv = useRef<string | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  useEffect(() => {
    try {
      const c = sessionStorage.getItem('ww_conv');
      if (c && sessionStorage.getItem('ww_conv_ch') === 'text') {
        conv.current = c;
        setConversationId(c);
        const h = sessionStorage.getItem('ww_text_history');
        if (h) history.current = JSON.parse(h);
      }
    } catch {}
  }, []);

  const save = () => {
    try {
      sessionStorage.setItem('ww_text_history', JSON.stringify(history.current.slice(-60)));
    } catch {}
  };

  const ensureConversation = useCallback(async () => {
    if (conv.current) return conv.current;
    const r = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'text', path: location.pathname }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not start the chat.');
    conv.current = d.conversationId;
    setConversationId(d.conversationId);
    setConversation(d.conversationId, 'text');
    return d.conversationId as string;
  }, []);

  const sync = useCallback(async () => {
    if (!conv.current) return;
    await fetch('/api/conversations/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conv.current, transcript: hooksRef.current.transcript() }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setError('');
      hooksRef.current.addMessage('user', t);
      setBusy(true);
      try {
        const id = await ensureConversation();
        history.current.push({ role: 'user', parts: [{ text: `${t}\n\n[page: ${location.pathname}]` }] });
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const r = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId: id, contents: history.current.slice(-40) }),
          });
          const d = (await r.json().catch(() => ({}))) as { parts?: Part[]; error?: string };
          if (!r.ok) throw new Error(d.error || 'The assistant is unavailable right now.');
          const parts = d.parts ?? [];
          history.current.push({ role: 'model', parts });
          const reply = parts
            .filter((p) => p.text && !p.thought)
            .map((p) => p.text)
            .join('')
            .trim();
          if (reply) hooksRef.current.addMessage('ai', reply);
          const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
          if (!calls.length) break;
          const responses: Part[] = [];
          for (const c of calls) {
            let result: Record<string, unknown>;
            try {
              result = await hooksRef.current.runTool(c.name, c.args ?? {});
            } catch (e) {
              result = { ok: false, error: (e as Error).message };
            }
            responses.push({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { result } } });
          }
          history.current.push({ role: 'user', parts: responses });
        }
        save();
        // Let React commit the last messages before saving the transcript.
        setTimeout(() => void sync(), 400);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureConversation, sync],
  );

  const end = useCallback(async () => {
    const id = conv.current;
    if (id) {
      await fetch('/api/conversations/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, transcript: hooksRef.current.transcript() }),
        keepalive: true,
      }).catch(() => {});
    }
    conv.current = null;
    history.current = [];
    setConversationId(null);
    setConversation(null, null);
    try {
      sessionStorage.removeItem('ww_text_history');
    } catch {}
    hooksRef.current.onEnded?.();
  }, []);

  return { busy, error, conversationId, send, end, sync };
}
