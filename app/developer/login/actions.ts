'use server';

import { redirect } from 'next/navigation';
import { clearDeveloperCookie, missingDevConfig, setDeveloperSessionCookie, verifyDeveloperLogin } from '@/lib/dev-auth';
import { clientIp, rateLimit } from '@/lib/http';

export interface DevFormState {
  error?: string;
}

export async function devLogin(_prev: DevFormState, fd: FormData): Promise<DevFormState> {
  if ((await missingDevConfig()).length) return { error: 'Developer login is not configured. See the settings listed above.' };
  if (!rateLimit(`devlogin:${await clientIp()}`, 5, 15 * 60 * 1000)) return { error: 'Too many attempts. Please wait 15 minutes.' };
  const username = String(fd.get('username') ?? '').slice(0, 100);
  const password = String(fd.get('password') ?? '').slice(0, 200);
  const user = await verifyDeveloperLogin(username, password);
  if (!user) {
    await new Promise((r) => setTimeout(r, 700));
    return { error: 'Incorrect developer credentials. (Admin accounts cannot sign in here.)' };
  }
  await setDeveloperSessionCookie(user);
  redirect('/developer');
}

export async function devLogout() {
  await clearDeveloperCookie();
  redirect('/developer/login');
}
