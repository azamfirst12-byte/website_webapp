'use client';

import { useActionState } from 'react';
import { createStaffAction, resetStaffPasswordAction } from '@/app/admin/actions';
import { ROLE_HELP, ROLE_LABEL, ROLES } from '@/lib/permissions';
import { inputCls, btnCls, btnGhost } from './ui';

type S = { error?: string; ok?: string };
const Msg = ({ s }: { s: S }) => (s.error ? <p className="text-[12.5px] text-red-300">{s.error}</p> : s.ok ? <p className="text-[12.5px] text-emerald-300">{s.ok}</p> : null);

export function CreateStaffForm() {
  const [s, action, pending] = useActionState<S, FormData>(createStaffAction, {});
  return (
    <form action={action} className="space-y-2">
      <input name="full_name" placeholder="Full name" className={inputCls} />
      <input name="username" required placeholder="User ID" className={inputCls} />
      <input name="email" type="email" placeholder="Email (for password recovery)" className={inputCls} />
      <select name="role" defaultValue="sales" className={inputCls} aria-label="Role">
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]} — {ROLE_HELP[r]}
          </option>
        ))}
      </select>
      <input name="password" type="text" required minLength={10} placeholder="Temporary password (10+)" className={inputCls} autoComplete="off" />
      <Msg s={s} />
      <button disabled={pending} className={`${btnCls} w-full`}>
        {pending ? 'Creating…' : 'Create staff account'}
      </button>
    </form>
  );
}

export function ResetStaffPassword({ id }: { id: number }) {
  const [s, action, pending] = useActionState<S, FormData>(resetStaffPasswordAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="password" required minLength={10} placeholder="New password" className={`${inputCls} w-40`} autoComplete="off" />
      <button disabled={pending} className={btnGhost}>
        Reset
      </button>
      <Msg s={s} />
    </form>
  );
}
