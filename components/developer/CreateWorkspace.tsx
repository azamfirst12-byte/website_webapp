'use client';

import { useActionState } from 'react';
import { createWorkspaceAction, type SaveResult } from '@/app/developer/actions';
import { devBtn, devInput } from './DevUi';

export function CreateWorkspace({ templates, existing }: { templates: { key: string; label: string }[]; existing: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<SaveResult, FormData>(createWorkspaceAction, { ok: false });
  return (
    <form action={action} className="space-y-2.5">
      <input name="name" required placeholder="Client / business name" className={devInput} />
      <input name="id" required pattern="[a-z0-9][a-z0-9-]{0,60}" placeholder="workspace-id (lowercase, dashes)" className={devInput} />
      <select name="from" className={devInput} aria-label="Start from">
        {templates.map((t) => (
          <option key={t.key} value={`template:${t.key}`}>
            Template: {t.label}
          </option>
        ))}
        {existing.map((w) => (
          <option key={w.id} value={`clone:${w.id}`}>
            Clone: {w.name} ({w.id})
          </option>
        ))}
      </select>
      {s.message && <p className="text-[12.5px] text-emerald-300">{s.message}</p>}
      {s.errors?.map((e) => (
        <p key={e} className="text-[12.5px] text-red-300">
          {e}
        </p>
      ))}
      <button disabled={pending} className={devBtn}>
        {pending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}
