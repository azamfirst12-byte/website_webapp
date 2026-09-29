'use client';

import { useActionState } from 'react';
import { demoDataAction } from '@/app/admin/actions';

type State = { error?: string; ok?: string };

function Msg({ s }: { s: State }) {
  if (s.error) return <p className="text-[12px] text-red-300">{s.error}</p>;
  if (s.ok) return <p className="text-[12px] text-emerald-300">{s.ok}</p>;
  return null;
}

export function DemoButton({ op, label, danger }: { op: 'load' | 'remove'; label: string; danger?: boolean }) {
  const [s, action, pending] = useActionState<State, FormData>(demoDataAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (op === 'remove' && !confirm('Remove all demo data? Only rows labelled DEMO are deleted; real leads and conversations stay.')) e.preventDefault();
        if (op === 'load' && !confirm('Load demo data? Existing demo rows are replaced; real data is not touched.')) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="op" value={op} />
      <button disabled={pending} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${danger ? 'bg-red-500/85 text-white hover:bg-red-500' : 'bg-white text-black hover:bg-white/90'}`}>
        {pending ? 'Working…' : label}
      </button>
      <Msg s={s} />
    </form>
  );
}

export function DemoBanner({ canManage }: { canManage: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3">
      <p className="text-[12.5px] text-amber-100">
        <b>Demo data is showing.</b> Leads, conversations and reports include sample records labelled <b>DEMO</b> — not real business performance.
      </p>
      {canManage && <DemoButton op="remove" label="Remove demo data" danger />}
    </div>
  );
}
