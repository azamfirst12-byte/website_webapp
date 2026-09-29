import Link from 'next/link';
import { AuthShell } from '@/components/admin/AuthShell';
import { ResetForm } from '@/components/admin/AuthForms';
import { adminForResetToken } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password', robots: { index: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const user = await adminForResetToken(token);
  return (
    <AuthShell title="Set a new password" subtitle={user ? `For ${user.username}` : undefined}>
      {user ? (
        <ResetForm token={token} />
      ) : (
        <p className="mt-6 text-[14px] text-white/70">
          This link has expired or was already used.{' '}
          <Link href="/admin/forgot" className="underline">
            Request a new one
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
