'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveConfigPart, type SaveResult } from '@/app/developer/actions';

/**
 * Generic, schema-driven editor for one part of the workspace config.
 * Every Developer screen (site content, assistant, CRM, actions, integrations…) is built from this,
 * so new config fields only need a schema entry, not a new form.
 */

export type Opt = { value: string; label: string };
export type FieldDef =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'color' | 'url' | 'bool' | 'password'; help?: string; placeholder?: string; rows?: number; half?: boolean }
  | { key: string; label: string; type: 'select'; options: Opt[]; help?: string; half?: boolean }
  | { key: string; label: string; type: 'multiselect'; options: Opt[]; help?: string }
  | { key: string; label: string; type: 'lines' | 'tags'; help?: string; rows?: number }
  | { key: string; label: string; type: 'object'; fields: FieldDef[]; help?: string }
  | { key: string; label: string; type: 'list'; item: FieldDef[]; titleKey: string; newItem: Record<string, unknown>; help?: string; max?: number }
  | { key: string; label: string; type: 'record'; keys: Opt[]; valueType: 'text' | 'number'; help?: string }
  | { key: string; label: string; type: 'order'; options: Opt[]; help?: string }
  | { key: string; label: string; type: 'json'; help?: string; rows?: number };

type Obj = Record<string, unknown>;

const inp = 'w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-amber-300/60';
const lab = 'mb-1 block text-[12px] font-semibold text-white/65';

function Help({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-[11.5px] leading-snug text-white/40">{text}</p> : null;
}

function JsonField({ value, onChange, rows = 8 }: { value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState('');
  return (
    <>
      <textarea
        rows={rows}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr('');
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
        className={`${inp} font-mono text-[12px]`}
      />
      {err && <p className="mt-1 text-[11.5px] text-red-300">{err}</p>}
    </>
  );
}

export function Field({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (def.type) {
    case 'text':
    case 'url':
    case 'password':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <input type={def.type === 'password' ? 'password' : def.type === 'url' ? 'url' : 'text'} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={inp} />
          <Help text={def.help} />
        </label>
      );
    case 'textarea':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <textarea rows={def.rows ?? 4} value={String(value ?? '')} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={inp} />
          <Help text={def.help} />
        </label>
      );
    case 'number':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <input type="number" step="any" value={value === undefined || value === null ? '' : Number(value)} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={inp} />
          <Help text={def.help} />
        </label>
      );
    case 'color':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <span className="flex items-center gap-2">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
            <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={`${inp} font-mono`} />
          </span>
          <Help text={def.help} />
        </label>
      );
    case 'bool':
      return (
        <label className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" />
          <span>
            <span className="block text-[13px] font-semibold text-white">{def.label}</span>
            <Help text={def.help} />
          </span>
        </label>
      );
    case 'select':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inp}>
            {def.options.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#10131c]">
                {o.label}
              </option>
            ))}
          </select>
          <Help text={def.help} />
        </label>
      );
    case 'multiselect': {
      const set = new Set(Array.isArray(value) ? (value as string[]) : []);
      return (
        <fieldset>
          <legend className={lab}>{def.label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {def.options.map((o) => (
              <label key={o.value} className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] ${set.has(o.value) ? 'border-amber-300/60 bg-amber-300/15 text-white' : 'border-white/10 text-white/55'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={set.has(o.value)}
                  onChange={(e) => {
                    const next = new Set(set);
                    if (e.target.checked) next.add(o.value);
                    else next.delete(o.value);
                    onChange(def.options.map((x) => x.value).filter((v) => next.has(v)));
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
          <Help text={def.help} />
        </fieldset>
      );
    }
    case 'lines':
    case 'tags': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <label className="block">
          <span className={lab}>
            {def.label} <span className="font-normal text-white/35">({def.type === 'lines' ? 'one per line' : 'comma separated'})</span>
          </span>
          {def.type === 'lines' ? (
            <textarea rows={def.rows ?? Math.min(10, Math.max(3, arr.length + 1))} value={arr.join('\n')} onChange={(e: { target: { value: string } }) => onChange(e.target.value.split('\n').map((x) => x.trimStart()).filter((x, i, a) => x || i < a.length - 1))} className={inp} />
          ) : (
            <input value={arr.join(', ')} onChange={(e: { target: { value: string } }) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} className={inp} />
          )}
          <Help text={def.help} />
        </label>
      );
    }
    case 'object':
      return (
        <fieldset className="rounded-xl border border-white/[0.07] p-3">
          <legend className="px-1 text-[12px] font-bold text-white/70">{def.label}</legend>
          <Help text={def.help} />
          <Fields defs={def.fields} value={(value ?? {}) as Obj} onChange={onChange} />
        </fieldset>
      );
    case 'record': {
      const rec = (value ?? {}) as Obj;
      return (
        <fieldset>
          <legend className={lab}>{def.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {def.keys.map((k) => (
              <label key={k.value} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5">
                <span className="flex-1 text-[12px] text-white/70">{k.label}</span>
                <input
                  type={def.valueType === 'number' ? 'number' : 'text'}
                  value={rec[k.value] === undefined ? '' : String(rec[k.value])}
                  onChange={(e) => onChange({ ...rec, [k.value]: def.valueType === 'number' ? Number(e.target.value || 0) : e.target.value })}
                  className={`${inp} ${def.valueType === 'number' ? 'w-20' : 'w-32'}`}
                />
              </label>
            ))}
          </div>
          <Help text={def.help} />
        </fieldset>
      );
    }
    case 'order': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const hidden = def.options.filter((o) => !list.includes(o.value));
      const move = (i: number, d: number) => {
        const next = [...list];
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      const name = (v: string) => def.options.find((o) => o.value === v)?.label ?? v;
      return (
        <fieldset>
          <legend className={lab}>{def.label}</legend>
          <ol className="space-y-1">
            {list.map((v, i) => (
              <li key={v} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[13px]">
                <span className="w-5 text-white/35">{i + 1}</span>
                <span className="flex-1 text-white">
                  {name(v)} <code className="text-[11px] text-white/35">#{v}</code>
                </span>
                <button type="button" onClick={() => move(i, -1)} className="rounded px-1.5 text-white/60 hover:bg-white/10" aria-label="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} className="rounded px-1.5 text-white/60 hover:bg-white/10" aria-label="Move down">
                  ↓
                </button>
                <button type="button" onClick={() => onChange(list.filter((x) => x !== v))} className="rounded px-1.5 text-red-300/80 hover:bg-white/10" aria-label="Hide">
                  ✕
                </button>
              </li>
            ))}
          </ol>
          {hidden.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hidden.map((o) => (
                <button key={o.value} type="button" onClick={() => onChange([...list, o.value])} className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[12px] text-white/55 hover:text-white">
                  + {o.label}
                </button>
              ))}
            </div>
          )}
          <Help text={def.help} />
        </fieldset>
      );
    }
    case 'list': {
      const list = Array.isArray(value) ? (value as Obj[]) : [];
      const set = (i: number, v: Obj) => onChange(list.map((x, j) => (j === i ? v : x)));
      const move = (i: number, d: number) => {
        const next = [...list];
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <fieldset>
          <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-bold text-white">
            <span>
              {def.label} <span className="font-normal text-white/40">({list.length})</span>
            </span>
          </legend>
          <Help text={def.help} />
          <div className="mt-2 space-y-2">
            {list.map((item, i) => (
              <details key={i} className="group rounded-xl border border-white/[0.08] bg-white/[0.02] open:bg-white/[0.035]">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px]">
                  <span className="w-5 text-white/35">{i + 1}</span>
                  <span className="flex-1 truncate font-semibold text-white">{String(item[def.titleKey] ?? '') || '(untitled)'}</span>
                  <span className="hidden gap-1 group-open:flex">
                    <button type="button" onClick={(e) => (e.preventDefault(), move(i, -1))} className="rounded px-1.5 text-white/60 hover:bg-white/10" aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" onClick={(e) => (e.preventDefault(), move(i, 1))} className="rounded px-1.5 text-white/60 hover:bg-white/10" aria-label="Move down">
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm('Remove this item?')) onChange(list.filter((_, j) => j !== i));
                      }}
                      className="rounded px-1.5 text-red-300 hover:bg-white/10"
                      aria-label="Remove"
                    >
                      Remove
                    </button>
                  </span>
                  <span className="text-white/40 transition group-open:rotate-90">›</span>
                </summary>
                <div className="border-t border-white/[0.06] p-3">
                  <Fields defs={def.item} value={item} onChange={(v) => set(i, v as Obj)} />
                </div>
              </details>
            ))}
          </div>
          {(!def.max || list.length < def.max) && (
            <button type="button" onClick={() => onChange([...list, structuredClone(def.newItem)])} className="mt-2 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-[12.5px] font-semibold text-white/65 hover:text-white">
              + Add {def.label.replace(/s$/, '').toLowerCase()}
            </button>
          )}
        </fieldset>
      );
    }
    case 'json':
      return (
        <label className="block">
          <span className={lab}>{def.label}</span>
          <JsonField value={value} onChange={onChange} rows={def.rows} />
          <Help text={def.help} />
        </label>
      );
  }
}

export function Fields({ defs, value, onChange }: { defs: FieldDef[]; value: Obj; onChange: (v: Obj) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {defs.map((d) => (
        <div key={d.key} className={'half' in d && d.half ? '' : 'sm:col-span-2'}>
          <Field def={d} value={value?.[d.key]} onChange={(v) => onChange({ ...value, [d.key]: v })} />
        </div>
      ))}
    </div>
  );
}

/**
 * One editable config part with Save. `path` is the config key ("hero", "pricing", "assistant"…);
 * `root` fields edit that object, or pass `single` to edit a non-object value (e.g. a list).
 */
export function ConfigEditor({ path, value, defs, single, title, description }: { path: string; value: unknown; defs: FieldDef[]; single?: boolean; title?: string; description?: string }) {
  const [state, setState] = useState<unknown>(() => structuredClone(value));
  const [initial, setInitial] = useState(() => JSON.stringify(value));
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const dirty = useMemo(() => JSON.stringify(state) !== initial, [state, initial]);

  const save = () =>
    start(async () => {
      setResult(null);
      const r = await saveConfigPart(path, JSON.stringify(state), `Edited ${title ?? path}`);
      setResult(r);
      if (r.ok) setInitial(JSON.stringify(state));
    });

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5">
      {(title || description) && (
        <header className="mb-4">
          {title && <h2 className="text-[15px] font-bold text-white">{title}</h2>}
          {description && <p className="mt-0.5 text-[12.5px] text-white/50">{description}</p>}
        </header>
      )}
      {single ? <Field def={defs[0]} value={state} onChange={setState} /> : <Fields defs={defs} value={state as Obj} onChange={setState} />}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-white/[0.07] bg-[#0d1017]/95 px-5 py-3 backdrop-blur">
        <button type="button" disabled={!dirty || pending} onClick={save} className="rounded-lg bg-amber-400 px-4 py-2 text-[13px] font-bold text-black transition hover:bg-amber-300 disabled:opacity-40">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && (
          <button type="button" onClick={() => (setState(JSON.parse(initial)), setResult(null))} className="text-[12.5px] text-white/55 hover:text-white">
            Discard
          </button>
        )}
        {dirty && !pending && <span className="text-[12px] text-amber-200/80">Unsaved changes</span>}
        {result?.ok && !dirty && <span className="text-[12.5px] text-emerald-300">{result.message}</span>}
        {result && !result.ok && (
          <ul className="w-full list-disc pl-5 text-[12.5px] text-red-300">
            {result.errors?.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
