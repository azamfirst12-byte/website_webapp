import type { ReactNode } from 'react';
import { after } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { can, ROLE_LABEL } from '@/lib/permissions';
import { getActiveWorkspace } from '@/lib/workspace';
import { one } from '@/lib/db';
import { sweepStaleConversations } from '@/lib/conversations';
import { AdminNav, type NavItem } from '@/components/admin/AdminNav';
import { NotificationBell } from '@/components/admin/NotificationBell';
import { SignOutButton } from '@/components/admin/AuthForms';
import { DemoBanner } from '@/components/admin/DemoData';
import { AdminAssistant } from '@/components/admin/assistant/AdminAssistant';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Admin', template: '%s · Admin' }, robots: { index: false } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const role = session.user.role;
  const counts = await one<{ unread: number; requested: number; overdue: number; demo: number }>(
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL) AS unread,
            (SELECT COUNT(*) FROM appointments WHERE workspace_id=? AND status='requested') AS requested,
            (SELECT COUNT(*) FROM tasks WHERE workspace_id=? AND done_at IS NULL AND due_at < ? AND (assigned_to=? OR ?)) AS overdue,
            (SELECT COUNT(*) FROM leads WHERE workspace_id=? AND is_demo) AS demo`,
    [session.user.id, ws.id, ws.id, Date.now(), session.user.id, can(role, 'tasks.manage_all'), ws.id],
  );
  // Close + summarise conversations whose visitors left without pressing "End".
  after(() => sweepStaleConversations().catch(() => {}));

  const items: NavItem[] = [
    { href: '/admin', label: 'Dashboard', icon: 'home' },
    { href: '/admin/leads', label: 'Leads', icon: 'user' },
    { href: '/admin/pipeline', label: 'Pipeline', icon: 'flow' },
    { href: '/admin/conversations', label: 'Conversations', icon: 'chat' },
    { href: '/admin/appointments', label: 'Appointments', icon: 'calendar', badge: Number(counts?.requested ?? 0) },
    { href: '/admin/tasks', label: 'Tasks & follow-ups', icon: 'check', badge: Number(counts?.overdue ?? 0) },
    ...(can(role, 'reports.view') ? [{ href: '/admin/reports', label: 'Reports', icon: 'chart' }] : []),
    { href: '/admin/notifications', label: 'Notifications', icon: 'bell', badge: Number(counts?.unread ?? 0) },
    ...(can(role, 'team.manage') ? [{ href: '/admin/team', label: 'Team', icon: 'shield' }] : []),
    { href: '/admin/account', label: 'Account', icon: 'user' },
  ];

  return (
    <div className="min-h-screen bg-[#060811] text-white">
      <AdminNav items={items} brand={ws.config.brand.name} user={{ name: session.user.name, role: ROLE_LABEL[role] }}>
        <a href="/" target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-[13px] text-white/60 hover:bg-white/5 hover:text-white">
          View website ↗
        </a>
        <SignOutButton />
      </AdminNav>
      <div className="lg:pl-[240px]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-2 px-4 pt-4 sm:px-6">
          <NotificationBell />
        </div>
        <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-2 sm:px-6">
          {Number(counts?.demo ?? 0) > 0 && <DemoBanner canManage={can(role, 'demo.manage')} />}
          {children}
        </main>
      </div>
      <AdminAssistant name={ws.config.assistant.name} userName={session.user.name} />
    </div>
  );
}
