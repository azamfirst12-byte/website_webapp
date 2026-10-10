'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Part = { text?: string; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; functionResponse?: { id?: string; name: string; response: Record<string, unknown> }; thoughtSignature?: string; thought?: boolean };
type Content = { role: 'user' | 'model'; parts: Part[] };

export interface AdminChatHooks {
  addMessage: (role: 'user' | 'ai', text: string) => void;
  /** Runs all function calls of one model turn (data calls are batched into one request). */
  runTools: (calls: { name: string; args: Record<string, unknown> }[]) => Promise<Record<string, unknown>[]>;
}

const HISTORY_KEY = 'wa_text_history';
const MAX_TOOL_ROUNDS = 8;

/** Text channel of the admin copilot: same tools as voice, over /api/admin/assistant/chat. */
export function useAdminChat(hooks: AdminChatHooks) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const history = useRef<Content[]>([]);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const h = sessionStorage.getItem(HISTORY_KEY);
      if (h) history.current = JSON.parse(h);
    } catch {}
  }, []);

  const save = () => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.current.slice(-60)));
    } catch {}
  };

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    busyRef.current = true;
    setError('');
    hooksRef.current.addMessage('user', t);
    setBusy(true);
    try {
      history.current.push({ role: 'user', parts: [{ text: `${t}\n\n[admin page: ${location.pathname}${location.search}]` }] });
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const r = await fetch('/api/admin/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: history.current.slice(-40) }),
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
        let results: Record<string, unknown>[];
        try {
          results = await hooksRef.current.runTools(calls.map((c) => ({ name: c.name, args: c.args ?? {} })));
        } catch (e) {
          results = calls.map(() => ({ ok: false, error: (e as Error).message }));
        }
        const responses: Part[] = calls.map((c, i) => ({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { result: results[i] ?? { ok: false } } } }));
        history.current.push({ role: 'user', parts: responses });
      }
      save();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    history.current = [];
    try {
      sessionStorage.removeItem(HISTORY_KEY);
    } catch {}
  }, []);

  return { busy, error, send, reset };
}
