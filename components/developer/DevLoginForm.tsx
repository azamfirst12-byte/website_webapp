'use client';

import { useActionState } from 'react';
import { devLogin, devLogout, type DevFormState } from '@/app/developer/login/actions';
import { authCls } from '../admin/AuthShell';

export function DevLoginForm() {
  const [s, action, pending] = useActionState<DevFormState, FormData>(devLogin, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className={authCls.label}>
        Developer ID or email
        <input name="username" autoComplete="username" required autoFocus className={authCls.input} />
      </label>
      <label className={authCls.label}>
        Password
        <input name="password" type="password" autoComplete="current-password" required className={authCls.input} />
      </label>
      {s.error && (
        <p className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-[13px] text-red-100" role="alert">
          {s.error}
        </p>
      )}
      <button disabled={pending} className={authCls.primary}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function DevSignOut() {
  return (
    <form action={devLogout}>
      <button className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-white/60 hover:bg-white/5 hover:text-white">Sign out</button>
    </form>
  );
}
