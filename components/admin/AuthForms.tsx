'use client';

import Link from 'next/link';
import { useActionState, useRef, useState, type ReactNode } from 'react';
import { changePassword, login, logout, registerStaff, requestReset, resetPassword, updateAccount, type FormState } from '@/app/admin/login/actions';
import { authCls } from './AuthShell';

export function Alert({ s }: { s: FormState }) {
  if (s.error)
    return (
      <p className="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-[13px] text-red-100" role="alert">
        {s.error}
      </p>
    );
  if (s.ok)
    return (
      <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-[13px] text-emerald-100" role="status">
        {s.ok}
      </p>
    );
  return null;
}

function SignIn({ accounts }: { accounts: { username: string; role: string }[] }) {
  const [s, action, pending] = useActionState<FormState, FormData>(login, {});
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="space-y-4">
      <label className={authCls.label}>
        User ID or email
        <input ref={userRef} name="username" autoComplete="username" required autoFocus className={authCls.input} />
      </label>
      <label className={authCls.label}>
        Password
        <input ref={passRef} name="password" type="password" autoComplete="current-password" required className={authCls.input} />
      </label>
      <Alert s={s} />
      <button disabled={pending} className={authCls.primary}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center">
        <Link href="/admin/forgot" className="text-[13px] text-white/60 hover:text-white">
          Forgot user ID or password?
        </Link>
      </p>
      {accounts.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 text-[12px] text-white/55">Staff accounts:</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((u) => (
              <button
                key={u.username}
                type="button"
                onClick={() => {
                  if (userRef.current) userRef.current.value = u.username;
                  passRef.current?.focus();
                }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[12px] text-white/90 hover:bg-white/15"
              >
                <b className="mr-1">{u.username}</b>
                <span className="text-white/55">{u.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

function CreateAccount({ inviteEnabled }: { inviteEnabled: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(registerStaff, {});
  if (!inviteEnabled)
    return (
      <p className="rounded-xl border border-white/15 bg-white/[0.04] p-4 text-[13px] leading-relaxed text-white/70">
        New staff accounts are created by an admin in <b>Team</b>. Self sign-up can be allowed with <code className="text-white">ADMIN_INVITE_CODE</code>.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <label className={authCls.label}>
        Invite code
        <input name="invite" required autoComplete="off" className={authCls.input} placeholder="From your admin" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={authCls.label}>
          Full name
          <input name="full_name" required autoComplete="name" className={authCls.input} />
        </label>
        <label className={authCls.label}>
          User ID
          <input name="username" required autoComplete="username" className={authCls.input} />
        </label>
      </div>
      <label className={authCls.label}>
        Email <span className="text-white/45">(for recovery)</span>
        <input name="email" type="email" autoComplete="email" className={authCls.input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={authCls.label}>
          Password <span className="text-white/45">(10+)</span>
          <input name="password" type="password" minLength={10} required autoComplete="new-password" className={authCls.input} />
        </label>
        <label className={authCls.label}>
          Repeat
          <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className={authCls.input} />
        </label>
      </div>
      <Alert s={s} />
      <button disabled={pending} className={authCls.primary}>
        {pending ? 'Creating…' : 'Create staff account'}
      </button>
      <p className="text-[12px] text-white/45">New accounts start as Sales rep. An admin can change the role.</p>
    </form>
  );
}

export function AdminSignInCard({ accounts, inviteEnabled, notice }: { accounts: { username: string; role: string }[]; inviteEnabled: boolean; notice?: ReactNode }) {
  const [tab, setTab] = useState<'signin' | 'create'>('signin');
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1" role="tablist">
        {(
          [
            ['signin', 'Sign in'],
            ['create', 'Create account'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-[14px] font-semibold transition ${tab === k ? 'bg-white/15 text-white shadow' : 'text-white/60 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      {notice && <div className="mt-4">{notice}</div>}
      <div className="mt-5">{tab === 'signin' ? <SignIn accounts={accounts} /> : <CreateAccount inviteEnabled={inviteEnabled} />}</div>
    </>
  );
}

export function ForgotForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(requestReset, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className={authCls.label}>
        Your account email
        <input name="email" type="email" autoComplete="email" required autoFocus className={authCls.input} />
      </label>
      <Alert s={s} />
      <button disabled={pending} className={authCls.primary}>
        {pending ? 'Sending…' : 'Email me my user ID and a reset link'}
      </button>
      <p className="text-center">
        <Link href="/admin/login" className="text-[13px] text-white/60 hover:text-white">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className={authCls.label}>
        New password (10+ characters)
        <input name="password" type="password" minLength={10} required autoComplete="new-password" autoFocus className={authCls.input} />
      </label>
      <label className={authCls.label}>
        Repeat new password
        <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className={authCls.input} />
      </label>
      <Alert s={s} />
      <button disabled={pending} className={authCls.primary}>
        {pending ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

const pf = 'mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] text-white outline-none focus:border-white/30';

export function AccountForm({ username, email, fullName }: { username: string; email: string; fullName: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(updateAccount, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-white/65">
          Full name
          <input name="full_name" defaultValue={fullName} className={pf} />
        </label>
        <label className="block text-[12px] font-semibold text-white/65">
          User ID
          <input name="username" defaultValue={username} required autoComplete="username" className={pf} />
        </label>
      </div>
      <label className="block text-[12px] font-semibold text-white/65">
        Recovery email
        <input name="email" type="email" defaultValue={email} autoComplete="email" className={pf} />
      </label>
      <label className="block text-[12px] font-semibold text-white/65">
        Current password (to confirm)
        <input name="current" type="password" required autoComplete="current-password" className={pf} />
      </label>
      <Alert s={s} />
      <button disabled={pending} className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-50">
        {pending ? 'Saving…' : 'Save details'}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-[12px] font-semibold text-white/65">
        Current password
        <input name="current" type="password" required autoComplete="current-password" className={pf} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-white/65">
          New password (10+)
          <input name="password" type="password" minLength={10} required autoComplete="new-password" className={pf} />
        </label>
        <label className="block text-[12px] font-semibold text-white/65">
          Repeat
          <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className={pf} />
        </label>
      </div>
      <Alert s={s} />
      <button disabled={pending} className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-50">
        {pending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logout}>
      <button className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-white/60 hover:bg-white/5 hover:text-white">Sign out</button>
    </form>
  );
}
