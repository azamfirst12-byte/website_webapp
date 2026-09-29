import { AuthShell } from '@/components/admin/AuthShell';
import { ForgotForm } from '@/components/admin/AuthForms';

export const metadata = { title: 'Forgot password', robots: { index: false } };

export default function Forgot() {
  return (
    <AuthShell title="Recover access" subtitle="We'll email your user ID and a reset link">
      <ForgotForm />
    </AuthShell>
  );
}
