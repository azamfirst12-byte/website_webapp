'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../site/Icon';
import { Equalizer } from '../../assistant/Equalizer';
import { clickElement, fillField, readPageText, readScreen, scrollPage, selectOption, settle } from '../../assistant/dom-control';
import { waitFor } from '../../assistant/view';
import { ADMIN_PAGE_PATH, ADMIN_PAGES, ADMIN_TOOL_LABEL, PAGE_TOOLS, QUIET_TOOLS, WRITE_TOOLS, type AdminPage } from '@/lib/admin-tools';
import { useAdminLive } from './useAdminLive';
import { useAdminChat } from './useAdminChat';

interface Msg {
  id: string;
  role: 'user' | 'ai' | 'action' | 'notice';
  text: string;
  at: number;
  open?: boolean;
  ok?: boolean;
  hidden?: boolean;
}

type Args = Record<string, unknown>;
type ToolResult = Record<string, unknown> & { ok?: boolean; error?: string };

const uid = () => Math.random().toString(36).slice(2, 10);
const MSG_KEY = 'wa_msgs';
const MODE_KEY = 'wa_mode';
const OPEN_KEY = 'wa_open';
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const QUICK_PROMPTS = [
  { label: '⚡ What needs attention?', text: 'What needs my attention right now?' },
  { label: '🔥 Hot leads', text: 'Show my hot open leads.' },
  { label: '⏰ Overdue tasks', text: 'What tasks are overdue?' },
  { label: '📅 Consultations', text: 'Any consultation requests waiting?' },
  { label: '📊 Pipeline', text: 'Give me a pipeline summary.' },
];

/** Light formatting for AI replies: **bold**, "* " / "- " bullets → "•", drops "---" rules and "#" heading marks. */
function RichText({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .filter((l) => !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l))
    .map((l) => l.replace(/^(\s*)[*-]\s+/, '$1• ').replace(/^\s*#{1,6}\s+/, ''));
  return (
    <>
      {lines.map((l, i) => (
        <span key={i}>
          {l.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            /^\*\*[^*]+\*\*$/.test(seg) ? (
              <strong key={j} className="font-semibold text-white">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              seg
            ),
          )}
          {i < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}

/** "find_leads" + args → "Searching leads · hot" for the action line in the panel. */
function actionLine(name: string, args: Args) {
  const label = ADMIN_TOOL_LABEL[name] ?? name;
  const detail = Object.entries(args)
    .filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && String(v).length < 40 && !['text', 'notes', 'requirements'].includes(k))
    .map(([, v]) => String(v).replace(/_/g, ' '))
    .slice(0, 3)
    .join(' · ');
  return detail ? `${label} · ${detail}` : label;
}

/**
 * Floating AI copilot for the admin panel — the same voice + chat assistant as the website,
 * but working in CRM context: it reads and updates leads, tasks, consultations and reports
 * (server tools, with the signed-in user's permissions) and drives the admin screens.
 */
export function AdminAssistant({ name, userName }: { name: string; userName: string }) {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [mode, setModeState] = useState<'voice' | 'text'>('text');
  const [text, setText] = useState('');
  const [pill, setPill] = useState<{ label: string; ok?: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try {
      sessionStorage.setItem(OPEN_KEY, v ? '1' : '');
    } catch {}
  }, []);

  // ── restore after reload
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(MSG_KEY);
      if (m) setMessages(JSON.parse(m));
      const md = sessionStorage.getItem(MODE_KEY);
      if (md === 'voice' || md === 'text') setModeState(md);
      if (sessionStorage.getItem(OPEN_KEY) === '1' && md !== 'voice') setOpenState(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(MSG_KEY, JSON.stringify(messages.slice(-150)));
    } catch {}
  }, [messages]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

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

  const showPill = useCallback((label: string, ok?: boolean) => {
    setPill({ label, ok });
    if (pillTimer.current) clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(() => setPill(null), ok === false ? 3500 : 2200);
  }, []);

  // ── page control (browser side)
  /** Client-side navigation; resolves 'ok' once the URL matches, 'loading' if the page is still compiling/loading. */
  const navigate = useCallback(
    async (path: string): Promise<'ok' | 'loading'> => {
      const want = new URL(path, location.origin);
      const here = () => location.pathname === want.pathname && new URLSearchParams(location.search).toString() === want.searchParams.toString();
      if (here()) return 'ok';
      const before = document.querySelector('main')?.innerHTML.length;
      router.push(want.pathname + want.search);
      const ok = await waitFor(() => here(), 20000, 120);
      if (!ok) return 'loading';
      // Wait for the new page content to render (server components stream in after the URL changes).
      await waitFor(() => document.querySelector('main h1') && document.querySelector('main')?.innerHTML.length !== before, 8000, 120);
      await settle(300);
      return 'ok';
    },
    [router],
  );

  const liveRef = useRef<ReturnType<typeof useAdminLive> | null>(null);

  const pageTool = useCallback(
    async (name: string, args: Args): Promise<ToolResult> => {
      switch (name) {
        case 'open_admin_page': {
          const page = str(args.page) as AdminPage;
          if (!ADMIN_PAGES.includes(page)) return { ok: false, error: `Unknown page. Pages: ${ADMIN_PAGES.join(', ')}.` };
          const qs = new URLSearchParams();
          const set = (k: string, v: unknown) => str(v) && qs.set(k, str(v));
          if (page === 'leads') {
            set('q', args.query);
            set('stage', args.stage);
            set('band', args.band);
            set('assigned', args.assigned);
            set('sort', args.sort);
          } else if (page === 'tasks') set('scope', args.scope);
          else if (page === 'appointments') set('status', args.status);
          else if (page === 'conversations') {
            set('channel', args.channel);
            set('q', args.query);
          } else if (page === 'reports') set('range', args.range);
          const path = `${ADMIN_PAGE_PATH[page]}${qs.toString() ? `?${qs}` : ''}`;
          const st = await navigate(path);
          return st === 'ok'
            ? { ok: true, page: location.pathname + location.search, title: document.querySelector('main h1')?.textContent?.trim() ?? null }
            : { ok: true, page: path, note: 'The page is still loading — it will appear in a moment. Do not open it again.' };
        }
        case 'open_record': {
          const id = str(args.id, 60).replace(/^#/, '');
          if (!id) return { ok: false, error: 'id is required.' };
          const path = str(args.type) === 'conversation' ? `/admin/conversations/${encodeURIComponent(id)}` : `/admin/leads/${encodeURIComponent(id)}`;
          const st = await navigate(path);
          return st === 'ok'
            ? { ok: true, page: location.pathname, title: document.querySelector('main h1')?.textContent?.trim() ?? null }
            : { ok: true, page: path, note: 'The record is still loading — it will appear in a moment. Do not open it again.' };
        }
        case 'read_screen':
          return { ok: true, ...readScreen(str(args.filter, 60) || undefined) };
        case 'read_page':
          return { ok: true, ...readPageText(3500) };
        case 'click_element': {
          const r = await clickElement(str(args.target, 120));
          return r;
        }
        case 'fill_field':
          return fillField(str(args.target, 120), typeof args.value === 'string' ? args.value.slice(0, 2000) : String(args.value ?? ''), args.submit === true);
        case 'select_option':
          return selectOption(str(args.target, 120), str(args.option, 120));
        case 'scroll_page':
          return scrollPage(str(args.direction, 10) || 'down');
        case 'go_back':
          history.back();
          await settle(700);
          return { ok: true, page: location.pathname };
        case 'refresh_page':
          router.refresh();
          await settle(600);
          return { ok: true };
        case 'assistant_panel': {
          const a = str(args.action, 20);
          if (a === 'minimize') setOpen(false);
          else if (a === 'expand') setOpen(true);
          else if (a === 'clear_chat') setMessages([]);
          else if (a === 'mute_mic' || a === 'unmute_mic') {
            const ok = liveRef.current?.setMicEnabled(a === 'unmute_mic');
            if (!ok) return { ok: false, error: 'The microphone is not on.' };
          }
          return { ok: true, done: a };
        }
      }
      return { ok: false, error: 'Unknown page action.' };
    },
    [navigate, router, setOpen],
  );

  /** Logs one finished action line (and the red pill when it failed). */
  const logResult = useCallback(
    (name: string, args: Args, result: ToolResult) => {
      const quiet = QUIET_TOOLS.has(name);
      const ok = result.ok !== false;
      push({ role: 'action', text: actionLine(name, args), ok, hidden: quiet });
      if (!ok && !quiet) showPill(result.error ? String(result.error).slice(0, 60) : 'That did not work', false);
    },
    [push, showPill],
  );

  /**
   * Runs every function call of one model turn: CRM data calls go to the server together in one
   * request (run in parallel there), page actions then run here in order.
   */
  const runTools = useCallback(
    async (calls: { name: string; args: Args }[]): Promise<ToolResult[]> => {
      const results: ToolResult[] = new Array(calls.length);
      const server = calls.map((c, i) => ({ ...c, i })).filter((c) => !PAGE_TOOLS.has(c.name));
      const first = calls.find((c) => !QUIET_TOOLS.has(c.name));
      if (first) showPill(server.length > 1 ? 'Checking the CRM…' : (ADMIN_TOOL_LABEL[first.name] ?? first.name));
      if (server.length) {
        try {
          const r = await fetch('/api/admin/assistant/tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calls: server.map(({ name, args }) => ({ name, args })) }),
          });
          const d = (await r.json().catch(() => ({}))) as { results?: ToolResult[]; error?: string };
          server.forEach((c, k) => (results[c.i] = r.ok ? (d.results?.[k] ?? { ok: false, error: 'No result.' }) : { ok: false, error: d.error || `Request failed (${r.status})` }));
        } catch (e) {
          server.forEach((c) => (results[c.i] = { ok: false, error: (e as Error).message }));
        }
        if (server.some((c) => WRITE_TOOLS.has(c.name) && results[c.i]?.ok)) router.refresh();
      }
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        if (PAGE_TOOLS.has(c.name)) {
          if (!QUIET_TOOLS.has(c.name)) showPill(ADMIN_TOOL_LABEL[c.name] ?? c.name);
          try {
            results[i] = await pageTool(c.name, c.args);
          } catch (e) {
            results[i] = { ok: false, error: (e as Error).message };
          }
        }
        logResult(c.name, c.args, results[i]);
      }
      return results;
    },
    [pageTool, router, showPill, logResult],
  );
  const runTool = useCallback(async (name: string, args: Args) => (await runTools([{ name, args }]))[0], [runTools]);

  const live = useAdminLive({ append, closeOpen, runTools });
  liveRef.current = live;
  const chat = useAdminChat({ addMessage: (role, t) => push({ role, text: t }), runTools });

  // Developer console helper: window.__crmAssistant.run('find_leads', { band: 'hot' })
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __crmAssistant?: unknown }).__crmAssistant = { run: runTool };
  }, [runTool]);

  const setMode = useCallback(
    async (m: 'voice' | 'text') => {
      if (m === modeRef.current) return;
      if (modeRef.current === 'voice') await live.end();
      setModeState(m);
      try {
        sessionStorage.setItem(MODE_KEY, m);
      } catch {}
      if (m === 'voice') void live.start();
      else setTimeout(() => inputRef.current?.focus(), 50);
    },
    [live],
  );

  // Opening the panel in voice mode starts listening (from a click, so audio can play).
  const openPanel = useCallback(() => {
    setOpen(true);
    if (modeRef.current === 'voice' && !live.active) void live.start();
    if (modeRef.current === 'text') setTimeout(() => inputRef.current?.focus(), 80);
  }, [live, setOpen]);

  // Keyboard shortcut: Ctrl/Cmd + K toggles the copilot.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) setOpen(false);
        else openPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openPanel, setOpen]);

  const clearChat = useCallback(async () => {
    if (live.active) await live.end();
    chat.reset();
    setMessages([]);
  }, [live, chat]);

  const voiceActive = mode === 'voice' && live.active;
  const statusLine =
    mode === 'text'
      ? chat.busy
        ? 'Working…'
        : 'CRM copilot'
      : live.status === 'connecting'
        ? 'Connecting…'
        : live.status === 'reconnecting'
          ? 'Reconnecting…'
          : live.status === 'error'
            ? 'Disconnected'
            : live.status === 'idle'
              ? 'Tap the mic to talk'
              : live.activity !== 'listening'
                ? { listening: 'Listening', hearing: 'Hearing you…', thinking: 'Thinking…', speaking: 'Speaking — talk to interrupt', acting: 'Working on the CRM…' }[live.activity]
                : !live.micAvailable
                  ? 'Mic unavailable — type below'
                  : !live.micOn
                    ? 'Mic muted'
                    : 'Listening';
  const error = mode === 'voice' ? live.error : chat.error;
  const firstName = userName.split(' ')[0];

  const submit = (t0?: string) => {
    const t = (t0 ?? text).trim();
    if (!t) return;
    if (!t0) setText('');
    if (mode === 'text') void chat.send(t);
    else {
      push({ role: 'user', text: t });
      live.sendText(t);
    }
  };

  return (
    <div data-ai-skip>
      {pill && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed z-[65] flex max-w-[80vw] items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold shadow-xl backdrop-blur-xl transition ${
            open ? 'bottom-[calc(78vh+12px)] right-4 sm:bottom-[640px] sm:right-6' : 'bottom-24 right-4 sm:right-6'
          } ${pill.ok === false ? 'border-red-400/40 bg-red-500/15 text-red-100' : 'border-brand2/40 bg-[#0c1428]/90 text-white'}`}
        >
          {pill.ok === false ? <Icon name="x" className="h-3.5 w-3.5" /> : <span className="h-2 w-2 animate-glow rounded-full bg-brand2" />}
          <span className="truncate">{pill.label}</span>
        </div>
      )}

      {!open && (
        <div className="fixed bottom-5 right-4 z-[60] flex items-center gap-2 sm:bottom-6 sm:right-6">
          {voiceActive && <EndButton onEnd={() => live.end()} />}
          <button
            onClick={openPanel}
            aria-label={`Open ${name}, the CRM copilot`}
            title="CRM copilot (Ctrl+K)"
            className="group relative flex h-14 items-center gap-3 rounded-full bg-gradient-to-br from-brand to-brand2 pl-2 pr-5 text-white shadow-[0_10px_40px_-8px_rgb(var(--brand)/0.9)] transition hover:brightness-110"
          >
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-black/20">
              {voiceActive && live.speaking && <span className="absolute inset-0 animate-pulseRing rounded-full bg-white/40 motion-reduce:animate-none" aria-hidden />}
              {voiceActive ? <Equalizer getBands={live.getBands} color="#ffffff" idleColor="rgba(255,255,255,0.6)" className="relative h-5 w-6" /> : <Icon name="sparkles" className="h-5 w-5" />}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-[13px] font-bold leading-tight">{voiceActive ? statusLine : `Ask ${name}`}</span>
              <span className="block text-[11px] leading-tight text-white/75">{voiceActive ? 'Tap to see the chat' : 'CRM copilot · talk or type'}</span>
            </span>
          </button>
        </div>
      )}

      {open && (
        <section
          aria-label={`${name} — CRM copilot`}
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[78vh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#080b16]/95 text-white shadow-[0_-10px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[400px] sm:rounded-3xl"
        >
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
            <div className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand/40 to-brand2/30 ring-1 ring-inset ring-white/15">
              {mode === 'voice' ? <Equalizer getBands={live.getBands} color="rgb(var(--brand-2))" className="h-5 w-6" /> : <Icon name="sparkles" className="h-5 w-5 text-brand2" />}
              {voiceActive && live.speaking && <span className="absolute inset-0 animate-pulseRing rounded-2xl bg-brand2/40 motion-reduce:animate-none" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[14px] font-bold">
                {name}
                <span className="rounded-full bg-white/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-white/60">CRM</span>
              </p>
              <p className="flex items-center gap-1.5 text-[11.5px] text-white/60" aria-live="polite">
                <span className={`h-1.5 w-1.5 rounded-full ${voiceActive || (mode === 'text' && chat.busy) ? 'animate-glow bg-emerald-400' : 'bg-white/30'}`} />
                {statusLine}
              </p>
            </div>
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
            <button onClick={() => setOpen(false)} aria-label="Minimise copilot" className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
              <Icon name="chevronDown" className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4" aria-live="polite">
            {!messages.length && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[13.5px] leading-snug">
                  Hi {firstName} — I&apos;m your CRM copilot.
                  <p className="mt-2 text-[11.5px] text-white/50">
                    {mode === 'voice'
                      ? 'Just talk: I can find leads, brief you, move stages, log notes, set follow-ups, handle consultations and open any page.'
                      : 'Ask about leads, tasks, consultations or numbers — or tell me what to update. I can also open pages for you.'}
                  </p>
                </div>
              </div>
            )}
            {messages
              .filter((m) => !m.hidden)
              .map((m) =>
                m.role === 'action' ? (
                  <p key={m.id} className={`flex items-center gap-1.5 pl-1 text-[11px] ${m.ok === false ? 'text-red-300/80' : 'text-brand2/80'}`}>
                    <Icon name={m.ok === false ? 'x' : 'bolt'} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{m.text}</span>
                  </p>
                ) : (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      dir="auto"
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${
                        m.role === 'user'
                          ? 'rounded-br-md bg-gradient-to-r from-brand to-[#6a4df0] text-white'
                          : m.role === 'notice'
                            ? 'border border-brand2/30 bg-brand2/10 text-white'
                            : 'rounded-bl-md border border-white/10 bg-white/[0.05] text-white/95'
                      } ${m.open ? 'opacity-85' : ''}`}
                    >
                      {m.role === 'ai' ? <RichText text={m.text} /> : m.text}
                      {m.open && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-brand2 align-middle" aria-hidden />}
                    </div>
                  </div>
                ),
              )}
            {mode === 'text' && chat.busy && (
              <div className="flex gap-1 pl-2" aria-label="Copilot is working">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-100" role="alert">
                {error}
                {mode === 'voice' && (
                  <button onClick={() => void setMode('text')} className="ml-2 font-semibold underline">
                    Switch to chat
                  </button>
                )}
              </div>
            )}
            {mode === 'voice' && !live.micAvailable && <p className="text-center text-[11.5px] text-white/50">Microphone unavailable — you can type below instead.</p>}
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3.5 pb-2" aria-label="Suggestions">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                onClick={() => submit(qp.text)}
                disabled={mode === 'text' && chat.busy}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/80 transition hover:border-brand2/40 hover:text-white disabled:opacity-40"
              >
                {qp.label}
              </button>
            ))}
          </div>

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
                placeholder={mode === 'voice' ? 'Or type a message…' : 'Ask or tell me what to update…'}
                aria-label="Message"
                dir="auto"
                className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[14px] outline-none placeholder:text-white/35 focus:border-brand2/50"
              />
            )}
            <button type="submit" aria-label="Send" disabled={mode === 'text' && chat.busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>

          <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2 text-[11.5px]">
            <span className="text-white/40">Acts with your permissions · Ctrl+K</span>
            <span className="flex shrink-0 gap-3">
              {voiceActive && (
                <button onClick={() => void live.end()} className="font-semibold text-red-300 hover:text-red-200">
                  End voice
                </button>
              )}
              {messages.length > 0 && (
                <button onClick={() => void clearChat()} className="font-semibold text-white/70 hover:text-white">
                  Clear chat
                </button>
              )}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

/** Red "End" button beside the launcher while voice is on: first tap asks, second tap ends. */
function EndButton({ onEnd }: { onEnd: () => void | Promise<void> }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={async () => {
        if (!armed) return setArmed(true);
        await onEnd();
        setArmed(false);
      }}
      aria-label={armed ? 'Tap again to end voice' : 'End voice'}
      className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold text-white shadow-lg transition ${armed ? 'bg-red-600 ring-2 ring-red-300' : 'bg-red-500/90 hover:bg-red-600'}`}
    >
      <Icon name="stop" className="h-3.5 w-3.5" />
      {armed ? 'Tap to confirm' : 'End'}
    </button>
  );
}
