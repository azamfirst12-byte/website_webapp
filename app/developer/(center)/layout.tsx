import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireDeveloper } from '@/lib/dev-auth';
import { editingWorkspace } from '@/lib/dev-workspace';
import { deployEnv } from '@/lib/workspace';
import { AdminNav } from '@/components/admin/AdminNav';
import { DevSignOut } from '@/components/developer/DevLoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Developer', template: '%s · Developer' }, robots: { index: false } };

const NAV = [
  { href: '/developer', label: 'Overview', icon: 'home' },
  { href: '/developer/workspaces', label: 'Client workspaces', icon: 'layout' },
  { href: '/developer/site', label: 'Site & content', icon: 'globe' },
  { href: '/developer/assistant', label: 'AI assistant', icon: 'sparkles' },
  { href: '/developer/actions', label: 'Voice actions & DOM', icon: 'mic' },
  { href: '/developer/crm', label: 'CRM & scoring', icon: 'flow' },
  { href: '/developer/analytics', label: 'Analytics events', icon: 'chart' },
  { href: '/developer/integrations', label: 'Integrations', icon: 'bolt' },
  { href: '/developer/features', label: 'Features & environments', icon: 'filter' },
  { href: '/developer/json', label: 'Raw config & versions', icon: 'code' },
  { href: '/developer/account', label: 'Developer accounts', icon: 'shield' },
];

export default async function DevLayout({ children }: { children: ReactNode }) {
  const dev = await requireDeveloper();
  const { ws, isActive } = await editingWorkspace();
  return (
    <div className="min-h-screen bg-[#07090f] text-white">
      <AdminNav items={NAV} brand="Platform" user={{ name: dev.user.username, role: 'Developer' }} accent="developer">
        <a href="/" target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-[13px] text-white/60 hover:bg-white/5 hover:text-white">
          View live site ↗
        </a>
        <DevSignOut />
      </AdminNav>
      <div className="lg:pl-[240px]">
        <div className="border-b border-white/[0.07] bg-[#0b0e16]">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-4 py-3 text-[12.5px] sm:px-6">
            <span className="text-white/45">Editing workspace</span>
            <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 font-semibold text-white">
              {ws.name} <code className="ml-1 text-[11px] text-white/40">{ws.id}</code>
            </span>
            {isActive ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200">LIVE — changes publish immediately</span> : <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">DRAFT — not visible to visitors</span>}
            <span className="ml-auto text-white/35">env: {deployEnv()}</span>
            <Link href="/developer/workspaces" className="font-semibold text-amber-300 hover:underline">
              Switch
            </Link>
          </div>
        </div>
        <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
