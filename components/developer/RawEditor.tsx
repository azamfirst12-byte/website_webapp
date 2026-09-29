'use client';

import { useRef, useState, useTransition } from 'react';
import { saveRawConfig, type SaveResult } from '@/app/developer/actions';

/** Full workspace config as JSON, with import from a file (e.g. exported from another deployment). */
export function RawEditor({ json }: { json: string }) {
  const [text, setText] = useState(json);
  const [note, setNote] = useState('');
  const [r, setR] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  let parseError = '';
  try {
    JSON.parse(text);
  } catch (e) {
    parseError = (e as Error).message;
  }
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={28} className="w-full rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-white/85 outline-none focus:border-amber-300/50" />
      {parseError && <p className="mt-1 text-[12px] text-red-300">JSON error: {parseError}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Version note (optional)" className="w-64 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[13px] text-white outline-none" />
        <button
          disabled={pending || !!parseError || text === json}
          onClick={() =>
            start(async () => {
              if (!confirm('Replace the whole configuration of this workspace?')) return;
              setR(await saveRawConfig(text, note));
            })
          }
          className="rounded-lg bg-amber-400 px-4 py-2 text-[13px] font-bold text-black hover:bg-amber-300 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Validate & save'}
        </button>
        <button onClick={() => file.current?.click()} className="rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-semibold text-white/80 hover:bg-white/[0.06]">
          Import file…
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const raw = JSON.parse(await f.text());
            setText(JSON.stringify(raw.config ?? raw, null, 2));
            setNote(`Imported ${f.name}`);
          }}
        />
        {text !== json && (
          <button onClick={() => setText(json)} className="text-[12.5px] text-white/50 hover:text-white">
            Revert
          </button>
        )}
      </div>
      {r?.ok && <p className="mt-2 text-[12.5px] text-emerald-300">{r.message}</p>}
      {r && !r.ok && (
        <ul className="mt-2 list-disc pl-5 text-[12.5px] text-red-300">
          {r.errors?.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
