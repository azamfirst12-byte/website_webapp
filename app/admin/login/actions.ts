'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, createSessionToken, missingAuthConfig, requireAdmin, sessionCookieOptions } from '@/lib/auth';
import { createResetToken, createStaff, getAdminByEmail, getAdminById, getAdminByUsername, resetPasswordWithToken, setAccount, setPassword, verifyLogin } from '@/lib/admin-users';
import { checkPasswordHash, EMAIL_RE, passwordProblem, safeEqual, USERNAME_RE } from '@/lib/passwords';
import { sendMail } from '@/lib/mailer';
import { siteUrl } from '@/lib/site';
import { clientIp, rateLimit, requestIsHttps } from '@/lib/http';

export interface FormState {
  error?: string;
  ok?: string;
}

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? '').slice(0, max);
const slow = () => new Promise((r) => setTimeout(r, 600));

/** Non-secret hint so the public site can show staff tools (device preview) without reading the session. */
async function setStaffHint(on: boolean) {
  const jar = await cookies();
  if (on) jar.set('ww_staff', '1', { path: '/', sameSite: 'lax', secure: await requestIsHttps(), maxAge: 12 * 3600 });
  else jar.delete('ww_staff');
}

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  if ((await missingAuthConfig()).length) return { error: 'Admin login is not configured. See the settings listed above.' };
  if (!rateLimit(`login:${await clientIp()}`, 5, 15 * 60 * 1000)) return { error: 'Too many attempts. Please wait 15 minutes and try again.' };
  const username = str(fd, 'username', 100);
  const password = str(fd, 'password');
  if (!username || !password) return { error: 'Enter your user ID and password.' };
  const user = await verifyLogin(username, password);
  if (!user) {
    await slow();
    return { error: 'Incorrect user ID or password, or the account is disabled.' };
  }
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(user.id, user.session_version), await sessionCookieOptions());
  await setStaffHint(true);
  redirect('/admin');
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  await setStaffHint(false);
  redirect('/admin/login');
}

export async function requestReset(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`forgot:${await clientIp()}`, 5, 60 * 60 * 1000)) return { error: 'Too many requests. Please try again in an hour.' };
  const email = str(fd, 'email').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  const admin = await getAdminByEmail(email);
  let result: Awaited<ReturnType<typeof sendMail>> | null = null;
  if (admin) {
    const { token, minutes } = await createResetToken(admin.id);
    const link = `${siteUrl()}/admin/reset?token=${token}`;
    result = await sendMail(
      admin.email,
      'Admin — your user ID and password reset link',
      `Hello,\n\nSomeone (hopefully you) asked to recover the admin login.\n\nYour user ID: ${admin.username}\n\nTo set a new password, open this link within ${minutes} minutes:\n${link}\n\nIf you didn't ask for this, ignore this email; your password stays the same.\n`,
    );
  } else await slow();
  const generic = 'If that email belongs to a staff account, we have sent the user ID and a reset link to it. The link works for 30 minutes.';
  if (result === 'logged') return { ok: `${generic} (Development: SMTP isn't set up, so the message was printed in the terminal.)` };
  if (result === 'unconfigured' || result === 'failed') return { error: 'The email could not be sent. Check the SMTP settings, or reset from the server with "npm run reset-admin".' };
  return { ok: generic };
}

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`reset:${await clientIp()}`, 10, 60 * 60 * 1000)) return { error: 'Too many attempts. Please try again later.' };
  const pw = str(fd, 'password');
  const problem = passwordProblem(pw, str(fd, 'confirm'));
  if (problem) return { error: problem };
  if (!(await resetPasswordWithToken(str(fd, 'token', 100), pw))) return { error: 'This reset link has expired or was already used. Request a new one.' };
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/admin/login?reset=1');
}

export async function updateAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const me = (await getAdminById(session.user.id))!;
  const username = str(fd, 'username', 60).trim();
  const email = str(fd, 'email').trim().toLowerCase();
  const fullName = str(fd, 'full_name', 80).trim();
  if (!USERNAME_RE.test(username)) return { error: 'User ID must be 3–60 characters: letters, numbers, dot, dash or underscore.' };
  if (email && !EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (!checkPasswordHash(str(fd, 'current'), me.password_hash)) return { error: 'Your current password is incorrect.' };
  const taken = await getAdminByUsername(username);
  if (taken && taken.id !== me.id) return { error: 'That user ID is already taken.' };
  await setAccount(me.id, username, email, fullName || me.full_name);
  return { ok: 'Account details saved.' };
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const me = (await getAdminById(session.user.id))!;
  if (!checkPasswordHash(str(fd, 'current'), me.password_hash)) return { error: 'Your current password is incorrect.' };
  const pw = str(fd, 'password');
  const problem = passwordProblem(pw, str(fd, 'confirm'));
  if (problem) return { error: problem };
  await setPassword(me.id, pw);
  const updated = (await getAdminById(me.id))!;
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(updated.id, updated.session_version), await sessionCookieOptions());
  return { ok: 'Password changed. Other devices have been signed out.' };
}

/** "Create account" tab: needs ADMIN_INVITE_CODE. New accounts get the Sales rep role; an admin can change it. */
export async function registerStaff(_prev: FormState, fd: FormData): Promise<FormState> {
  const invite = process.env.ADMIN_INVITE_CODE?.trim();
  if (!invite) return { error: 'New staff accounts are turned off. Set ADMIN_INVITE_CODE to allow them.' };
  if (!rateLimit(`adminreg:${await clientIp()}`, 5, 60 * 60 * 1000)) return { error: 'Too many attempts. Please try again later.' };
  if ((await missingAuthConfig()).length) return { error: 'Admin login is not configured yet.' };
  const code = str(fd, 'invite', 100).trim();
  const username = str(fd, 'username', 60).trim();
  const email = str(fd, 'email').trim().toLowerCase();
  const fullName = str(fd, 'full_name', 80).trim();
  const pw = str(fd, 'password');
  if (!code || !safeEqual(code, invite)) {
    await slow();
    return { error: 'That invite code is not valid.' };
  }
  if (!USERNAME_RE.test(username)) return { error: 'User ID must be 3–60 characters: letters, numbers, dot, dash or underscore.' };
  if (email && !EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (await getAdminByUsername(username)) return { error: 'That user ID is already taken.' };
  if (email && (await getAdminByEmail(email))) return { error: 'That email already has an account.' };
  const problem = passwordProblem(pw, str(fd, 'confirm'));
  if (problem) return { error: problem };
  const user = await createStaff({ username, email, fullName: fullName || username, role: 'sales', password: pw });
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(user.id, user.session_version), await sessionCookieOptions());
  await setStaffHint(true);
  redirect('/admin');
}
