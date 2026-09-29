'use client';

import { useActionState } from 'react';
import { changeDeveloperPasswordAction, createDeveloperAction, type SaveResult } from '@/app/developer/actions';
import { devBtn, devInput } from './DevUi';

const Msg = ({ s }: { s: SaveResult }) => (
  <>
    {s.message && <p className="text-[12.5px] text-emerald-300">{s.message}</p>}
    {s.errors?.map((e) => (
      <p key={e} className="text-[12.5px] text-red-300">
        {e}
      </p>
    ))}
  </>
);

export function CreateDeveloper() {
  const [s, action, pending] = useActionState<SaveResult, FormData>(createDeveloperAction, { ok: false });
  return (
    <form action={action} className="space-y-2">
      <input name="username" required placeholder="Developer ID" className={devInput} />
      <input name="email" type="email" placeholder="Email (optional)" className={devInput} />
      <input name="password" required minLength={10} placeholder="Password (10+)" className={devInput} autoComplete="new-password" />
      <Msg s={s} />
      <button disabled={pending} className={devBtn}>
        Add developer
      </button>
    </form>
  );
}

export function DevPassword() {
  const [s, action, pending] = useActionState<SaveResult, FormData>(changeDeveloperPasswordAction, { ok: false });
  return (
    <form action={action} className="space-y-2">
      <input name="current" type="password" required placeholder="Current password" className={devInput} autoComplete="current-password" />
      <input name="password" type="password" required minLength={10} placeholder="New password (10+)" className={devInput} autoComplete="new-password" />
      <input name="confirm" type="password" required minLength={10} placeholder="Repeat new password" className={devInput} autoComplete="new-password" />
      <Msg s={s} />
      <button disabled={pending} className={devBtn}>
        Change password
      </button>
    </form>
  );
}
