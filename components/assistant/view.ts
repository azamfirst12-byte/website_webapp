'use client';

import { labelOf, openDialogs, resolve } from './dom-control';

/** Rendered and not hidden (ignores opacity, so sections mid-way through their fade-in still count). */
function isShown(el: HTMLElement) {
  if (!el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none';
}

/**
 * Context awareness: what the visitor is looking at, in reading order, so the assistant can
 * resolve "this", "these plans", "the second option". Items are elements with data-item="type:id".
 */

const clean = (s: string | null | undefined, max = 200) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Share of the element that is on screen; elements taller than the screen count when they fill most of it. */
function visibleRatio(el: Element) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  if (r.height <= 0 || r.width <= 0) return 0;
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const ratio = (h * w) / (r.height * r.width);
  return h >= vh * 0.5 && w > 0 ? Math.max(ratio, 0.5) : ratio;
}

/** Visible items in reading order (top-to-bottom, left-to-right), inside the open popup if there is one. */
export function visibleItems(minRatio = 0.35) {
  const dialogs = openDialogs();
  const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1] : document;
  const els = Array.from(scope.querySelectorAll<HTMLElement>('[data-item]')).filter((el) => !el.closest('[data-ai-skip]') && isShown(el) && visibleRatio(el) >= minRatio);
  // Nested duplicates (e.g. a compare-table header inside a section) — keep the first per id.
  const seen = new Set<string>();
  return els
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => (Math.abs(a.r.top - b.r.top) < 24 ? a.r.left - b.r.left : a.r.top - b.r.top))
    .filter(({ el }) => {
      const id = el.dataset.item!;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map(({ el }, i) => ({ n: i + 1, id: el.dataset.item!, type: el.dataset.item!.split(':')[0], label: clean(el.dataset.itemLabel || labelOf(el), 140) }));
}

export function sectionsInView() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))
    .map((el) => ({ id: el.dataset.section!, ratio: visibleRatio(el), cover: (() => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) / window.innerHeight;
    })() }))
    .filter((s) => s.cover > 0.05)
    .sort((a, b) => b.cover - a.cover);
}

export function findItem(target: string): HTMLElement | null {
  const t = target.trim();
  if (!t) return null;
  const esc = CSS.escape(t);
  return (
    document.querySelector<HTMLElement>(`[role=dialog] [data-item="${esc}"]`) ??
    document.querySelector<HTMLElement>(`[data-item="${esc}"]`) ??
    document.querySelector<HTMLElement>(`[data-section="${esc}"]`) ??
    document.getElementById(t) ??
    // "growth" → plan:growth / service:growth…
    document.querySelector<HTMLElement>(`[data-item$=":${esc}"]`) ??
    matchItemByLabel(t) ??
    resolve(t)
  );
}

function matchItemByLabel(t: string) {
  const want = t.toLowerCase();
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-item]')).filter((el) => isShown(el));
  return items.find((el) => (el.dataset.itemLabel ?? '').toLowerCase().startsWith(want)) ?? items.find((el) => (el.dataset.itemLabel ?? '').toLowerCase().includes(want)) ?? null;
}

let lastHighlight: HTMLElement | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

/** Smooth scroll + temporary glow on the element the assistant is talking about. */
export function highlight(el: HTMLElement, scroll = true) {
  // Reveal the section right away (skip its entrance animation) so the visitor sees the target.
  el.closest('.reveal')?.classList.add('in');
  if (el.classList.contains('reveal')) el.classList.add('in');
  if (scroll) {
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.8;
    el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
  }
  lastHighlight?.classList.remove('ai-highlight');
  if (highlightTimer) clearTimeout(highlightTimer);
  el.classList.add('ai-highlight');
  lastHighlight = el;
  highlightTimer = setTimeout(() => el.classList.remove('ai-highlight'), 3200);
}

export async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 3000, step = 80): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  return null;
}

/** Text the visitor can currently see (sections intersecting the viewport, or the open popup). */
export function visibleText(max = 2200) {
  const dialogs = openDialogs();
  if (dialogs.length) return clean((dialogs[dialogs.length - 1] as HTMLElement).innerText, max);
  const parts: string[] = [];
  for (const s of sectionsInView().slice(0, 3)) {
    const el = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(s.id)}"]`);
    if (el) parts.push(`[${s.id}] ${clean(el.innerText, Math.floor(max / 2))}`);
  }
  return clean(parts.join('\n'), max);
}

export function textOf(target: string, max = 2500) {
  const el = findItem(target);
  return el ? clean(el.innerText, max) : null;
}

export function formValues(form: string) {
  const f = document.querySelector<HTMLFormElement>(`form[data-form="${CSS.escape(form)}"]`);
  if (!f) return null;
  const out: Record<string, string> = {};
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name || el.type === 'checkbox' || el.type === 'password') continue;
    if (el.value) out[el.name] = clean(el.value, 120);
  }
  return out;
}

/** Resolves when smooth scrolling has finished (scroll position stable), max ~1.5 s. */
export async function scrollSettled(max = 1500) {
  const start = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - start < max) {
    await new Promise((r) => setTimeout(r, 90));
    const y = window.scrollY;
    stable = y === last ? stable + 1 : 0;
    if (stable >= 2) return;
    last = y;
  }
}
