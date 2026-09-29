'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSite } from '../site/SiteProvider';
import { Icon } from '../site/Icon';
import { Equalizer } from './Equalizer';
import { useActionEngine } from './useActionEngine';
import { useGeminiLive } from './useGeminiLive';
import { useTextChat } from './useTextChat';
import { getConversationId } from './session';
import { ACTION_LABEL } from '@/lib/tool-defs';

interface Msg {
  id: string;
  role: 'user' | 'ai' | 'action' | 'notice';
  text: string;
  at: number;
  open?: boolean;
  ok?: boolean;
  /** Bookkeeping actions (reading the screen, noting intent) are saved but not shown to the visitor. */
  hidden?: boolean;
  action?: { label: string; href: string };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const MSG_KEY = 'ww_msgs';
const MODE_KEY = 'ww_mode';

/** Friendly text for an action line, e.g. "scroll_to_section(section=pricing)" → "Scrolling to section · pricing". */
function actionText(line: string) {
  const m = /^(\w+)\((.*)\)$/.exec(line);
  if (!m) return line;
  const label = ACTION_LABEL[m[1] as keyof typeof ACTION_LABEL] ?? m[1];
  const detail = m[2]
    .split(', ')
    .map((kv) => kv.split('=').slice(1).join('='))
    .filter((v) => v && v.length < 40 && !v.startsWith('{'))
    .join(' · ');
  return detail ? `${label} · ${detail}` : label;
}

export function Assistant() {
  const site = useSite();
  const { ws, assistantOpen, setAssistantOpen, action } = site;
  const f = ws.features;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setModeState] = useState<'voice' | 'text'>(f.voice ? 'voice' : 'text');
  const [text, setText] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Messages before this time belong to an earlier conversation (e.g. voice before switching to chat).
  const convStartAt = useRef(0);
  const markNewConversation = () => {
    convStartAt.current = Date.now();
    try {
      sessionStorage.setItem('ww_conv_start', String(convStartAt.current));
    } catch {}
  };

  // ── restore after reload / navigation between tabs
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(MSG_KEY);
      if (m) setMessages(JSON.parse(m));
      convStartAt.current = Number(sessionStorage.getItem('ww_conv_start')) || 0;
      const md = sessionStorage.getItem(MODE_KEY) as 'voice' | 'text' | null;
      if (md === 'voice' && f.voice) setModeState('voice');
      if (md === 'text' && f.textChat) setModeState('text');
    } catch {}
  }, [f.voice, f.textChat]);
  useEffect(() => {
    try {
      sessionStorage.setItem(MSG_KEY, JSON.stringify(messages.slice(-150)));
    } catch {}
  }, [messages]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── message helpers
  const append = useCallback((role: 'user' | 'ai', chunk: string) => {
    if (!chunk) return;
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      if (last && last.role === role && last.open) return [...ms.slice(0, -1), { ...last, text: last.text + chunk }];
      const closed = ms.map((m) => (m.open ? { ...m, open: false } : m));
      return [...closed, { id: uid(), role, text: chunk.trimStart(), at: Date.now(), open: true }];
    });
  }, []);
  const closeOpen = useCallback(() => setMessages((ms) => (ms.some((m) => m.open) ? ms.map((m) => (m.open ? { ...m, open: false } : m)) : ms)), []);
  const push = useCallback((m: Omit<Msg, 'id' | 'at'>) => setMessages((ms) => [...ms.map((x) => (x.open ? { ...x, open: false } : x)), { id: uid(), at: Date.now(), ...m }]), []);
  const transcript = useCallback(
    () =>
      messagesRef.current
        .filter((m) => m.at >= convStartAt.current && (m.role === 'user' || m.role === 'ai' || m.role === 'action'))
        .map((m) => ({ role: m.role, text: m.text, at: m.at, ...(m.role === 'action' ? { ok: m.ok !== false } : {}) })),
    [],
  );

  const liveRef = useRef<ReturnType<typeof useGeminiLive> | null>(null);
  const runTool = useActionEngine({
    channel: () => modeRef.current,
    conversationId: () => getConversationId(),
    notice: (t, a) => push({ role: 'notice', text: t, action: a }),
    logAction: (line, ok, quiet) => push({ role: 'action', text: line, ok, hidden: quiet }),
    panel: (a) => {
      if (a === 'minimize') setAssistantOpen(false);
      else if (a === 'expand') setAssistantOpen(true);
      else if (a === 'clear_chat') setMessages([]);
      else if (a === 'mute_mic' || a === 'unmute_mic') {
        const ok = liveRef.current?.setMicEnabled(a === 'unmute_mic');
        if (!ok) return { ok: false, error: 'The microphone is not on.' };
        return { ok: true, note: a === 'mute_mic' ? 'Muted: the visitor unmutes by tapping the mic or typing.' : 'Unmuted.' };
      }
      return { ok: true, done: a };
    },
  });

  // Developer console helper (development only): window.__assistant.run('scroll_to_section', { section: 'pricing' })
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __assistant?: unknown }).__assistant = { run: runTool };
  }, [runTool]);

  const live = useGeminiLive({ append, closeOpen, runTool, transcript });
  liveRef.current = live;
  const chat = useTextChat({ addMessage: (role, t) => push({ role, text: t }), runTool, transcript });

  const hasConversation = !!(live.conversationId || chat.conversationId);

  const setMode = useCallback(
    async (m: 'voice' | 'text') => {
      if (m === modeRef.current) return;
      // One conversation per channel: finish the current one (it gets summarised) and continue in the other.
      if (modeRef.current === 'voice' && live.conversationId) await live.end();
      if (modeRef.current === 'text' && chat.conversationId) await chat.end();
      markNewConversation();
      setModeState(m);
      try {
        sessionStorage.setItem(MODE_KEY, m);
      } catch {}
      if (m === 'voice') void live.start();
      else setTimeout(() => inputRef.current?.focus(), 50);
    },
    [live, chat],
  );

  // Opened from a button anywhere on the site.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (assistantOpen && !wasOpen.current) {
      if (mode === 'voice' && !live.active) void live.start();
      if (mode === 'text') setTimeout(() => inputRef.current?.focus(), 80);
    }
    wasOpen.current = assistantOpen;
  }, [assistantOpen, mode, live]);

  // Optional: open the chat by itself once per visit.
  useEffect(() => {
    if (!f.autoOpenAssistant) return;
    try {
      if (sessionStorage.getItem('ww_auto')) return;
      sessionStorage.setItem('ww_auto', '1');
    } catch {}
    const t = setTimeout(() => {
      setModeState(f.textChat ? 'text' : 'voice');
      if (f.textChat) setAssistantOpen(true);
    }, 9000);
    return () => clearTimeout(t);
  }, [f.autoOpenAssistant, f.textChat, setAssistantOpen]);

  const endConversation = useCallback(async () => {
    setConfirmEnd(false);
    if (live.conversationId || live.active) await live.end();
    if (chat.conversationId) await chat.end();
    setMessages([]);
    markNewConversation();
  }, [live, chat]);

  if (!f.voice && !f.textChat) return null;

  const voiceActive = mode === 'voice' && live.active;
  const statusLine =
    mode === 'text'
      ? chat.busy
        ? 'Thinking…'
        : 'Chat'
      : live.status === 'connecting'
        ? 'Connecting…'
        : live.status === 'reconnecting'
          ? 'Reconnecting…'
          : live.status === 'error'
            ? 'Disconnected'
            : live.status === 'idle'
              ? 'Tap the mic to talk'
              : live.activity !== 'listening'
                ? { listening: 'Listening', hearing: 'Hearing you…', thinking: 'Thinking…', speaking: 'Speaking — talk to interrupt', acting: 'Working on the page…' }[live.activity]
                : !live.micAvailable
                  ? 'Mic unavailable — type below'
                  : !live.micOn
                    ? 'Mic muted'
                    : 'Listening';
  const error = mode === 'voice' ? live.error : chat.error;
  const showGreeting = !messages.length;

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (mode === 'text') void chat.send(t);
    else {
      push({ role: 'user', text: t });
      live.sendText(t);
    }
  };

  return (
    <div data-ai-skip>
      {/* Visual feedback: the action the assistant is performing on the page. */}
      {action && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed z-[65] flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold shadow-xl backdrop-blur-xl transition ${
            assistantOpen ? 'bottom-[calc(78vh+12px)] right-4 sm:bottom-[640px] sm:right-6' : 'bottom-24 right-4 sm:right-6'
          } ${action.ok === false ? 'border-red-400/40 bg-red-500/15 text-red-100' : 'border-brand2/40 bg-[#0c1428]/90 text-white'}`}
        >
          {action.ok === false ? <Icon name="x" className="h-3.5 w-3.5" /> : <span className="h-2 w-2 animate-glow rounded-full bg-brand2" />}
          {action.label}
        </div>
      )}

      {!assistantOpen && (
        <div className="fixed bottom-5 right-4 z-[60] flex items-center gap-2 sm:bottom-6 sm:right-6">
          {hasConversation && <EndButton onEnd={endConversation} />}
          <button
            onClick={() => setAssistantOpen(true)}
            aria-label={hasConversation ? `Open ${ws.assistant.name}` : `Talk to ${ws.assistant.name}, the AI assistant`}
            className="group relative flex h-14 items-center gap-3 rounded-full bg-gradient-to-br from-brand to-brand2 pl-2 pr-5 text-white shadow-[0_10px_40px_-8px_rgb(var(--brand)/0.9)] transition hover:brightness-110"
          >
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-black/20">
              {voiceActive && live.speaking && <span className="absolute inset-0 animate-pulseRing rounded-full bg-white/40 motion-reduce:animate-none" aria-hidden />}
              {voiceActive ? <Equalizer getBands={live.getBands} color="#ffffff" idleColor="rgba(255,255,255,0.6)" className="relative h-5 w-6" /> : <Icon name={f.voice ? 'mic' : 'chat'} className="h-5 w-5" />}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-bold leading-tight">{voiceActive ? statusLine : `Ask ${ws.assistant.name}`}</span>
              <span className="block text-[11px] leading-tight text-white/75">{voiceActive ? 'Tap to see the chat' : f.voice ? 'Talk or type' : 'Chat with us'}</span>
            </span>
          </button>
        </div>
      )}

      {assistantOpen && (
        <section
          aria-label={`${ws.assistant.name} — AI assistant`}
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[78vh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#080b16]/95 text-white shadow-[0_-10px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[400px] sm:rounded-3xl"
        >
          {/* Header */}
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
            <div className={`relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand/40 to-brand2/30 ring-1 ring-inset ring-white/15`}>
              {mode === 'voice' ? <Equalizer getBands={live.getBands} color="rgb(var(--brand-2))" className="h-5 w-6" /> : <Icon name="sparkles" className="h-5 w-5 text-brand2" />}
              {voiceActive && live.speaking && <span className="absolute inset-0 animate-pulseRing rounded-2xl bg-brand2/40 motion-reduce:animate-none" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold">{ws.assistant.name}</p>
              <p className="flex items-center gap-1.5 text-[11.5px] text-white/60" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${voiceActive || (mode === 'text' && chat.busy) ? 'animate-glow bg-emerald-400' : 'bg-white/30'}`} />
                {statusLine}
              </p>
            </div>
            {f.voice && f.textChat && (
              <div role="tablist" aria-label="Assistant mode" className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
                {(['voice', 'text'] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => void setMode(m)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition ${mode === m ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
                  >
                    <Icon name={m === 'voice' ? 'mic' : 'chat'} className="h-3.5 w-3.5" />
                    {m === 'voice' ? 'Voice' : 'Chat'}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setAssistantOpen(false)} aria-label="Minimise assistant" className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
              <Icon name="chevronDown" className="h-5 w-5" />
            </button>
          </header>

          {/* Transcript */}
          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4" aria-live="polite">
            {showGreeting && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[13.5px] leading-snug">
                  {ws.assistant.greeting}
                  <p className="mt-2 text-[11.5px] text-white/50">
                    {mode === 'voice' ? 'Just talk: I can scroll, open pages, compare plans, fill forms and book a call.' : 'Type anything: I can show you around the site and book a call.'}
                  </p>
                </div>
              </div>
            )}
            {messages.filter((m) => !m.hidden).map((m) =>
              m.role === 'action' ? (
                <p key={m.id} className={`flex items-center gap-1.5 pl-1 text-[11px] ${m.ok === false ? 'text-red-300/80' : 'text-brand2/80'}`}>
                  <Icon name={m.ok === false ? 'x' : 'bolt'} className="h-3 w-3" />
                  {actionText(m.text)}
                </p>
              ) : (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    dir="auto"
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${
                      m.role === 'user' ? 'rounded-br-md bg-gradient-to-r from-brand to-[#6a4df0] text-white' : m.role === 'notice' ? 'border border-brand2/30 bg-brand2/10 text-white' : 'rounded-bl-md border border-white/10 bg-white/[0.05] text-white/95'
                    } ${m.open ? 'opacity-85' : ''}`}
                  >
                    {m.text}
                    {m.open && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-brand2 align-middle" aria-hidden />}
                    {m.action && (
                      <a href={m.action.href} target={m.action.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="btn-wa mt-2 flex w-full !py-2 text-[12.5px]">
                        <Icon name="whatsapp" className="h-4 w-4" /> {m.action.label}
                      </a>
                    )}
                  </div>
                </div>
              ),
            )}
            {mode === 'text' && chat.busy && (
              <div className="flex gap-1 pl-2" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-100" role="alert">
                {error}
                {mode === 'voice' && f.textChat && (
                  <button onClick={() => void setMode('text')} className="ml-2 font-semibold underline">
                    Switch to chat
                  </button>
                )}
              </div>
            )}
            {mode === 'voice' && !live.micAvailable && <p className="text-center text-[11.5px] text-white/50">Microphone unavailable — you can type below instead.</p>}
          </div>

          {/* Quick prompts */}
          {ws.assistant.quickPrompts.length > 0 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-3.5 pb-2" aria-label="Suggestions">
              {ws.assistant.quickPrompts.map((q) => (
                <button
                  key={q.label}
                  onClick={() => {
                    if (mode === 'text') void chat.send(q.text);
                    else {
                      push({ role: 'user', text: q.text });
                      live.sendText(q.text);
                    }
                  }}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/80 transition hover:border-brand2/40 hover:text-white"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Controls */}
          <form
            className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {mode === 'voice' && (
              <button
                type="button"
                onClick={() => (live.active ? live.toggleMic() : live.start())}
                aria-label={live.active && live.micOn ? 'Mute microphone' : 'Turn microphone on'}
                aria-pressed={live.active && live.micOn}
                className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${live.active && live.micOn ? 'bg-gradient-to-br from-brand to-brand2 text-white' : 'bg-white/10 text-white'}`}
              >
                {live.active && live.micOn && live.activity === 'hearing' && <span className="absolute inset-0 animate-pulseRing rounded-full bg-brand2/40" aria-hidden />}
                <Icon name={live.active && live.micOn ? 'mic' : 'micOff'} className="relative h-5 w-5" />
              </button>
            )}
            {mode === 'voice' && live.speaking ? (
              <button type="button" onClick={live.stopSpeaking} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] text-[13px] font-semibold hover:bg-white/10">
                <Icon name="stop" className="h-3.5 w-3.5" /> Stop speaking
              </button>
            ) : (
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === 'voice' ? 'Or type a message…' : 'Type your message…'}
                aria-label="Message"
                dir="auto"
                className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[14px] outline-none placeholder:text-white/35 focus:border-brand2/50"
              />
            )}
            <button type="submit" aria-label="Send" disabled={mode === 'text' && chat.busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>

          {(hasConversation || messages.length > 0) && (
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2 text-[11.5px]">
              {confirmEnd ? (
                <>
                  <span className="text-white/65">End the conversation?</span>
                  <span className="flex gap-2">
                    <button onClick={() => setConfirmEnd(false)} className="rounded-full px-3 py-1 text-white/70 hover:bg-white/10">
                      Keep going
                    </button>
                    <button onClick={() => void endConversation()} className="rounded-full bg-red-500/85 px-3 py-1 font-semibold">
                      End
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-white/40">Conversations are saved to help our team follow up.</span>
                  <button onClick={() => setConfirmEnd(true)} className="shrink-0 font-semibold text-white/70 hover:text-white">
                    End chat
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Red "End" button beside the launcher: first tap asks, second tap ends. */
function EndButton({ onEnd }: { onEnd: () => void | Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        await onEnd();
        setBusy(false);
        setArmed(false);
      }}
      aria-label={armed ? 'Tap again to end the conversation' : 'End conversation'}
      className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold text-white shadow-lg transition ${armed ? 'bg-red-600 ring-2 ring-red-300' : 'bg-red-500/90 hover:bg-red-600'}`}
    >
      <Icon name="stop" className="h-3.5 w-3.5" />
      {busy ? 'Ending…' : armed ? 'Tap to confirm' : 'End'}
    </button>
  );
}
