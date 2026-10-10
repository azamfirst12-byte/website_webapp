'use client';

import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MicCapture, Player } from './audio';
import { setConversation } from './session';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';
export type Activity = 'listening' | 'hearing' | 'thinking' | 'speaking' | 'acting';

const HANDLE_KEY = 'ww_resume';

export interface LiveHooks {
  /** Streamed transcription chunk (user or assistant). */
  append: (role: 'user' | 'ai', text: string) => void;
  /** Close any streaming bubble (turn finished / interrupted). */
  closeOpen: () => void;
  /** Runs a function call through the action engine. */
  runTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Transcript to save on the server. */
  transcript: () => unknown[];
  onEnded?: () => void;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error || 'Request failed'), { status: r.status });
  return d as T;
}

/**
 * Full-duplex Gemini Live voice session (from the Ridgeline app): mic → Gemini, Gemini audio → speaker,
 * live transcripts, barge-in, tool calls through the action layer, transparent reconnects with
 * session resumption, periodic transcript sync. The API key never reaches the browser: the server
 * issues a single-use token with the prompt, tools and voice locked in.
 */
export function useGeminiLive(hooks: LiveHooks) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [activity, setActivity] = useState<Activity>('listening');
  const [micOn, setMicOn] = useState(true);
  const [micAvailable, setMicAvailable] = useState(true);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);

  const session = useRef<Session | null>(null);
  const mic = useRef<MicCapture | null>(null);
  const player = useRef(new Player());
  const handle = useRef<string | null>(null);
  const closing = useRef(false);
  const pending = useRef<string[]>([]);
  const conv = useRef<string | null>(null);
  const retries = useRef(0);
  const muteTurn = useRef(false);
  const hearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    try {
      handle.current = sessionStorage.getItem(HANDLE_KEY);
      const c = sessionStorage.getItem('ww_conv');
      if (c && sessionStorage.getItem('ww_conv_ch') === 'voice') {
        conv.current = c;
        setConversationId(c);
      }
    } catch {}
    player.current.onIdle = () => setActivity((a) => (a === 'speaking' ? 'listening' : a));
  }, []);

  const connectRef = useRef<(resume: boolean) => Promise<void>>(async () => {});

  const onMessage = useCallback(async (msg: LiveServerMessage) => {
    const h = hooksRef.current;
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      handle.current = msg.sessionResumptionUpdate.newHandle;
      try {
        sessionStorage.setItem(HANDLE_KEY, handle.current ?? '');
      } catch {}
    }
    if (msg.goAway) setTimeout(() => connectRef.current(true).catch(() => {}), 500);
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) {
        player.current.interrupt();
        muteTurn.current = false;
        setActivity('listening');
        h.closeOpen();
      }
      if (sc.inputTranscription?.text) {
        h.append('user', sc.inputTranscription.text);
        setActivity('hearing');
        if (hearTimer.current) clearTimeout(hearTimer.current);
        // No more speech for a moment and no answer yet → the model is thinking.
        hearTimer.current = setTimeout(() => setActivity((a) => (a === 'hearing' ? 'thinking' : a)), 700);
      }
      if (sc.outputTranscription?.text && !muteTurn.current) h.append('ai', sc.outputTranscription.text);
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/') && !muteTurn.current) {
          player.current.play(p.inlineData.data, p.inlineData.mimeType);
          setActivity('speaking');
        }
      }
      if (sc.turnComplete) {
        muteTurn.current = false;
        h.closeOpen();
        if (!player.current.speaking) setActivity('listening');
      }
    }
    const calls = msg.toolCall?.functionCalls ?? [];
    if (calls.length) {
      setActivity('acting');
      const responses = await Promise.all(
        calls.map(async (c: { id?: string; name?: string; args?: unknown }) => {
          let result: Record<string, unknown>;
          try {
            result = await h.runTool(c.name ?? '', (c.args ?? {}) as Record<string, unknown>);
          } catch (e) {
            result = { ok: false, error: (e as Error).message };
          }
          return { id: c.id, name: c.name, response: { result } };
        }),
      );
      session.current?.sendToolResponse({ functionResponses: responses });
      setActivity('thinking');
    }
  }, []);

  const fail = useCallback((e: unknown) => {
    setStatus('error');
    const status = (e as { status?: number }).status;
    setError(status === 429 ? 'Voice limit reached for now. You can keep going in chat.' : (e as Error).message || 'Something went wrong.');
  }, []);

  const connect = useCallback(
    async (resume: boolean) => {
      const cid = conv.current;
      if (!cid) return;
      const old = session.current;
      session.current = null;
      try {
        old?.close();
      } catch {}
      setStatus(resume ? 'reconnecting' : 'connecting');
      const d = await postJson<{ token: string; model: string }>('/api/live-token', { conversationId: cid, handle: resume ? handle.current : null });
      const ai = new GoogleGenAI({ apiKey: d.token, httpOptions: { apiVersion: 'v1alpha' } });
      let s: Session | null = null;
      s = await ai.live.connect({
        model: d.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: (m: LiveServerMessage) => void onMessage(m),
          onerror: (e: ErrorEvent) => console.warn('live error', e.message),
          onclose: (ev: CloseEvent) => {
            if (closing.current || !s || session.current !== s) return;
            session.current = null;
            const reason = (ev?.reason ?? '').trim();
            if (reason) console.warn('[assistant] live connection closed', ev.code, reason);
            // Billing / quota / key problems won't fix themselves on retry: say what Google said.
            if (/credit|billing|quota|exhausted|exceeded|api key|permission|denied/i.test(reason)) {
              setStatus('error');
              setError(/credit|billing/i.test(reason) ? 'Voice is unavailable: the Gemini account is out of credit (AI Studio → Billing).' : `Voice is unavailable: ${reason.slice(0, 140)}`);
              return;
            }
            if (retries.current < 4 && handle.current) {
              retries.current += 1;
              setTimeout(() => connectRef.current(true).catch(fail), 400 * retries.current);
            } else {
              setStatus('error');
              setError(reason ? `Connection lost (${reason.slice(0, 120)}). Tap the mic to reconnect.` : 'Connection lost. Tap the mic to reconnect.');
            }
          },
        },
      });
      session.current = s;
      retries.current = 0;
      setStatus('live');
      setActivity('listening');
      setError('');
      if (!resume) s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `(The visitor opened the voice assistant on ${location.pathname}. Greet them now.)` }] }], turnComplete: true });
      for (const t of pending.current.splice(0)) s.sendRealtimeInput({ text: t });
    },
    [onMessage, fail],
  );
  connectRef.current = connect;

  const startMic = useCallback(async () => {
    if (mic.current) return;
    const m = new MicCapture();
    try {
      await m.start((b64) => session.current?.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }));
      mic.current = m;
      m.enabled = true;
      setMicOn(true);
      setMicAvailable(true);
    } catch {
      setMicAvailable(false);
      setMicOn(false);
    }
  }, []);

  /** Start or resume. Must be called from a click so audio can play on mobile. */
  const start = useCallback(async () => {
    player.current.unlock();
    closing.current = false;
    setError('');
    try {
      let resume = !!conv.current && !!handle.current;
      if (!conv.current) {
        const d = await postJson<{ conversationId: string }>('/api/conversations', { channel: 'voice', path: location.pathname });
        conv.current = d.conversationId;
        setConversationId(d.conversationId);
        setConversation(d.conversationId, 'voice');
        resume = false;
      }
      await Promise.all([connect(resume), startMic()]);
    } catch (e) {
      fail(e);
    }
  }, [connect, startMic, fail]);

  const sendText = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      player.current.interrupt();
      if (session.current && statusRef.current === 'live') session.current.sendRealtimeInput({ text: t });
      else {
        pending.current.push(t);
        if (statusRef.current === 'idle' || statusRef.current === 'error') void start();
      }
      setActivity('thinking');
    },
    [start],
  );

  const setMicEnabled = useCallback((on: boolean) => {
    if (!mic.current) return false;
    mic.current.enabled = on;
    setMicOn(on);
    if (!on) session.current?.sendRealtimeInput({ audioStreamEnd: true });
    return true;
  }, []);

  const toggleMic = useCallback(async () => {
    if (!mic.current) return startMic();
    setMicEnabled(!mic.current.enabled);
  }, [startMic, setMicEnabled]);

  /** "Stop talking": silence the rest of this answer (the visitor can also just talk over it). */
  const stopSpeaking = useCallback(() => {
    player.current.interrupt();
    muteTurn.current = true;
    hooksRef.current.closeOpen();
    setActivity('listening');
  }, []);

  const sync = useCallback(async () => {
    const id = conv.current;
    if (!id) return;
    await fetch('/api/conversations/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, transcript: hooksRef.current.transcript() }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  /** Ends the conversation: audio off, transcript saved; the server writes the summary into the CRM. */
  const end = useCallback(async () => {
    closing.current = true;
    try {
      session.current?.close();
    } catch {}
    session.current = null;
    mic.current?.stop();
    mic.current = null;
    player.current.interrupt();
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
    handle.current = null;
    setConversationId(null);
    setConversation(null, null);
    try {
      sessionStorage.removeItem(HANDLE_KEY);
    } catch {}
    setStatus('idle');
    setActivity('listening');
    hooksRef.current.onEnded?.();
  }, []);

  /** Pause the voice connection without ending the conversation (e.g. switching to chat). */
  const pause = useCallback(() => {
    closing.current = true;
    try {
      session.current?.close();
    } catch {}
    session.current = null;
    mic.current?.stop();
    mic.current = null;
    player.current.interrupt();
    setStatus('idle');
    void sync();
  }, [sync]);

  // Keep the server copy fresh (tab may close without "End").
  useEffect(() => {
    if (status !== 'live') return;
    const t = setInterval(() => void sync(), 20_000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [status, sync]);

  useEffect(
    () => () => {
      closing.current = true;
      session.current?.close();
      mic.current?.stop();
    },
    [],
  );

  const getBands = useCallback((n: number) => {
    if (player.current.speaking) return { values: player.current.bands(n), source: 'ai' as const };
    if (mic.current?.enabled) return { values: mic.current.bands(n), source: 'mic' as const };
    return { values: new Array(n).fill(0), source: 'idle' as const };
  }, []);

  return {
    status,
    activity,
    micOn,
    micAvailable,
    error,
    conversationId,
    active: status === 'live' || status === 'connecting' || status === 'reconnecting',
    start,
    sendText,
    toggleMic,
    setMicEnabled,
    stopSpeaking,
    speaking: activity === 'speaking',
    end,
    pause,
    sync,
    getBands,
  };
}
