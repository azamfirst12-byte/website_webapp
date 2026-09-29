'use client';

/**
 * Generic screen control for the voice assistant.
 * read_screen() lists every visible interactive element with a short id (e1, e2…);
 * the assistant then clicks, types, selects or ticks by id — so it can operate any
 * button, link, search box, dropdown (LOV), checkbox or popup, including ones added later.
 *
 * Opt-outs:
 *   data-ai="off"   → listed as locked; the assistant can't change it (legal confirmations, consent)
 *   data-ai-skip    → hidden from the assistant entirely (e.g. its own chat panel)
 */

export const SELECTOR =
  'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=menuitem], [contenteditable=true]';

export interface ScreenElement {
  id: string;
  kind: string;
  label: string;
  where: string;
  value?: string;
  checked?: boolean;
  options?: string[];
  disabled?: true;
  locked?: true;
  href?: string;
}

let lastScan = new Map<string, HTMLElement>();

const clean = (s: string | null | undefined, max = 80) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function isVisible(el: HTMLElement) {
  if (!el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
}

export function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const t = labelledby.split(' ').map((i) => document.getElementById(i)?.textContent).join(' ');
    if (clean(t)) return clean(t);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const wrap = el.closest('label');
    if (wrap) {
      // Label text without the control's own content (e.g. a dropdown's options).
      const copy = wrap.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('select, input, textarea, option').forEach((n) => n.remove());
      const t = clean(copy.textContent);
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l?.textContent) return clean(l.textContent);
    }
    if ('placeholder' in el && el.placeholder) return clean(el.placeholder);
    if (el.name) return clean(el.name);
  }
  const text = clean((el as HTMLElement).innerText || el.textContent);
  if (text) return text;
  const img = el.querySelector('img[alt], svg[aria-label]');
  if (img) return clean(img.getAttribute('alt') || img.getAttribute('aria-label'));
  return clean(el.getAttribute('title')) || '(unlabelled)';
}

function kindOf(el: HTMLElement) {
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (t === 'checkbox' || t === 'radio') return t;
    if (t === 'submit' || t === 'button') return 'button';
    return t === 'search' ? 'search box' : `${t} field`;
  }
  if (el instanceof HTMLSelectElement) return 'dropdown';
  if (el instanceof HTMLTextAreaElement) return 'text area';
  if (el instanceof HTMLAnchorElement) return 'link';
  if (el.getAttribute('role') === 'checkbox') return 'checkbox';
  if (el.getAttribute('role') === 'tab') return 'tab';
  if (el.tagName === 'SUMMARY') return 'accordion';
  if (el.getAttribute('role') === 'menuitem') return 'menu item';
  return 'button';
}

function regionOf(el: HTMLElement) {
  const dlg = el.closest('[role=dialog]');
  if (dlg) return `popup: ${clean(dlg.getAttribute('aria-label') || dlg.querySelector('h1,h2,h3')?.textContent, 40) || 'dialog'}`;
  if (el.closest('header')) return 'header';
  if (el.closest('footer')) return 'footer';
  if (el.closest('nav')) return 'menu';
  const section = el.closest('section[id], section[aria-label]');
  if (section) return `section: ${section.getAttribute('aria-label') || section.id}`;
  return 'page';
}

export function openDialogs() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role=dialog]')).filter((d) => isVisible(d) && !d.closest('[data-ai-skip]'));
}

/** Snapshot of what the user can see and use right now. */
export function readScreen(filter?: string) {
  document.querySelectorAll('[data-ai-id]').forEach((e) => e.removeAttribute('data-ai-id'));
  lastScan = new Map();

  const dialogs = openDialogs();
  // When a popup is open, only its controls are really usable — list those first.
  const roots: ParentNode[] = dialogs.length ? [dialogs[dialogs.length - 1], document] : [document];
  const seen = new Set<HTMLElement>();
  const items: ScreenElement[] = [];
  const f = filter?.toLowerCase().trim();
  let n = 0;

  for (const root of roots) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
      if (seen.has(el) || el.closest('[data-ai-skip]') || !isVisible(el)) continue;
      seen.add(el);
      const label = labelOf(el);
      const kind = kindOf(el);
      if (f && !`${label} ${kind}`.toLowerCase().includes(f)) continue;
      if (items.length >= (f ? 40 : 90)) break;

      const id = `e${++n}`;
      el.setAttribute('data-ai-id', id);
      lastScan.set(id, el);
      const item: ScreenElement = { id, kind, label, where: regionOf(el) };
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) item.checked = el.checked;
      else if (el instanceof HTMLInputElement && el.type !== 'password') item.value = clean(el.value, 60);
      else if (el instanceof HTMLTextAreaElement) item.value = clean(el.value, 60);
      else if (el instanceof HTMLSelectElement) {
        item.value = clean(el.selectedOptions[0]?.text, 60);
        item.options = Array.from(el.options).slice(0, 25).map((o) => clean(o.text, 50));
      }
      if (el.getAttribute('aria-checked')) item.checked = el.getAttribute('aria-checked') === 'true';
      if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
      if (el.closest('[data-ai="off"]')) item.locked = true;
      if (el instanceof HTMLAnchorElement && el.getAttribute('href')?.startsWith('/')) item.href = el.getAttribute('href')!;
      items.push(item);
    }
  }

  return {
    url: location.pathname + location.search,
    title: clean(document.querySelector('main h1, h1')?.textContent) || document.title,
    popup_open: dialogs.length ? clean(dialogs[dialogs.length - 1].getAttribute('aria-label'), 60) || 'yes' : null,
    elements: items,
    note: 'Use the ids with click_element / fill_field / select_option / set_checkbox. Ids change after anything on screen changes — read again then. Locked items must be done by the user.',
  };
}

// ─────────────── Actions ───────────────

type Result = { ok: boolean; error?: string; [k: string]: unknown };

/** Find by id from the last scan, or fall back to matching visible label text. */
export function resolve(target: string): HTMLElement | null {
  const t = target.trim();
  const byId = lastScan.get(t) ?? document.querySelector<HTMLElement>(`[data-ai-id="${CSS.escape(t)}"]`);
  if (byId && byId.isConnected) return byId;
  const want = t.toLowerCase();
  const dialogs = openDialogs();
  const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1] : document;
  const all = Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR)).filter((e) => !e.closest('[data-ai-skip]') && isVisible(e));
  return (
    all.find((e) => labelOf(e).toLowerCase() === want) ??
    all.find((e) => labelOf(e).toLowerCase().startsWith(want)) ??
    all.find((e) => labelOf(e).toLowerCase().includes(want)) ??
    null
  );
}

export const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const after = async (extra: Record<string, unknown> = {}): Promise<Result> => {
  await settle(350);
  const d = openDialogs();
  return { ok: true, url: location.pathname + location.search, popup_open: d.length ? clean(d[d.length - 1].getAttribute('aria-label'), 60) || 'yes' : null, ...extra };
};

function guard(el: HTMLElement | null, target: string): Result | null {
  if (!el) return { ok: false, error: `Nothing on screen matches "${target}". Call read_screen to get current ids.` };
  if (el.closest('[data-ai="off"]')) return { ok: false, error: 'This item is locked: the visitor must do it themselves (consent). Ask them to tap it.' };
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return { ok: false, error: 'That control is disabled right now (a required step may be missing).' };
  return null;
}

function highlight(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prev = el.style.outline;
  el.style.outline = '2px solid var(--highlight, #22d3ee)';
  el.style.outlineOffset = '2px';
  setTimeout(() => {
    el.style.outline = prev;
  }, 1200);
}

export async function clickElement(target: string): Promise<Result> {
  const el = resolve(target);
  const bad = guard(el, target);
  if (bad) return bad;
  highlight(el!);
  await new Promise((r) => setTimeout(r, 150));
  el!.click();
  return after({ clicked: labelOf(el!) });
}

/** Sets a value the way typing would, so React state updates. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function fillField(target: string, value: string, submit = false): Promise<Result> {
  const el = resolve(target);
  const bad = guard(el, target);
  if (bad) return bad;
  if (el instanceof HTMLSelectElement) return selectOption(target, value);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { ok: false, error: 'That element is not a text field.' };
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) return { ok: false, error: 'Use set_checkbox for checkboxes.' };
  if (el instanceof HTMLInputElement && el.type === 'password') return { ok: false, error: 'Passwords must be typed by the user.' };
  highlight(el);
  el.focus();
  setNativeValue(el, value);
  if (submit) {
    if (el.form) el.form.requestSubmit();
    else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  return after({ filled: labelOf(el), value: clean(el.value, 80), submitted: submit });
}

export async function selectOption(target: string, option: string): Promise<Result> {
  const el = resolve(target);
  const bad = guard(el, target);
  if (bad) return bad;
  if (!(el instanceof HTMLSelectElement)) return { ok: false, error: 'That element is not a dropdown.' };
  const want = option.toLowerCase().trim();
  const opts = Array.from(el.options);
  const match =
    opts.find((o) => o.text.toLowerCase().trim() === want || o.value.toLowerCase() === want) ??
    opts.find((o) => o.text.toLowerCase().startsWith(want)) ??
    opts.find((o) => o.text.toLowerCase().includes(want));
  if (!match) return { ok: false, error: `No option like "${option}".`, options: opts.slice(0, 25).map((o) => clean(o.text, 50)) };
  highlight(el);
  setNativeValue(el, match.value);
  return after({ selected: clean(match.text) });
}

export async function setCheckbox(target: string, checked: boolean): Promise<Result> {
  const el = resolve(target);
  const bad = guard(el, target);
  if (bad) return bad;
  const isBox = (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) || el!.getAttribute('role') === 'checkbox';
  if (!isBox) return { ok: false, error: 'That element is not a checkbox.' };
  const current = el instanceof HTMLInputElement ? el.checked : el!.getAttribute('aria-checked') === 'true';
  if (current !== checked) {
    highlight(el!);
    el!.click();
  }
  return after({ checkbox: labelOf(el!), checked });
}

/** Closes the top-most popup / menu. */
export async function closeTopPopup(): Promise<Result> {
  const dialogs = openDialogs();
  const top = dialogs[dialogs.length - 1];
  if (top) {
    const btn = top.querySelector<HTMLElement>('[aria-label="Close"], [aria-label^="Close"], [data-close]');
    if (btn) btn.click();
    else {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    return after({ closed: clean(top.getAttribute('aria-label'), 60) || 'popup' });
  }
  const menu = document.querySelector<HTMLElement>('button[aria-expanded="true"]:not([data-ai-skip] *)');
  if (menu) {
    menu.click();
    return after({ closed: labelOf(menu) });
  }
  return { ok: false, error: 'No popup is open.' };
}

export async function scrollPage(direction: string, target?: string): Promise<Result> {
  if (target) {
    const el = resolve(target) ?? document.getElementById(target);
    if (!el) return { ok: false, error: `Nothing matches "${target}".` };
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return after();
  }
  const h = window.innerHeight * 0.8;
  if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  else if (direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  else window.scrollBy({ top: direction === 'up' ? -h : h, behavior: 'smooth' });
  return after();
}

/** Reads the main visible text (for "what does this page say?"). */
export function readPageText(max = 2500) {
  const main = document.querySelector('[role=dialog]:not([data-ai-skip] *)') ?? document.querySelector('main') ?? document.body;
  return { url: location.pathname, text: clean((main as HTMLElement).innerText, max) };
}
