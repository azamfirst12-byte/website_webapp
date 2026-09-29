import Link from 'next/link';
import { editingWorkspace } from '@/lib/dev-workspace';
import { one } from '@/lib/db';
import { LIVE_MODEL } from '@/lib/assistant-prompt';
import { TEXT_MODEL } from '@/lib/conversations';
import { mailConfigured } from '@/lib/mailer';
import { allowedActions, deployEnv, effectiveFeatures } from '@/lib/workspace';
import { DevCard, DevHeader } from '@/components/developer/DevUi';
import { TestGemini } from '@/components/developer/TestButtons';

export const metadata = { title: 'Overview' };

type Check = { label: string; ok: boolean | 'warn'; detail: string };

export default async function DevOverview() {
  const { ws, isActive } = await editingWorkspace();
  const c = ws.config;
  const f = effectiveFeatures(c);
  const counts = await one<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM leads WHERE workspace_id=?) AS leads, (SELECT COUNT(*) FROM conversations WHERE workspace_id=?) AS conversations,
            (SELECT COUNT(*) FROM events WHERE workspace_id=?) AS events, (SELECT COUNT(*) FROM admin_users WHERE active AND NOT is_demo) AS staff,
            (SELECT COUNT(*) FROM integration_logs WHERE workspace_id=? AND status='error' AND created_at > ?) AS hook_errors`,
    [ws.id, ws.id, ws.id, ws.id, Date.now() - 86_400_000],
  );
  const secret = process.env.AUTH_SECRET?.trim() ?? '';
  const liveLimit = Number(process.env.LIVE_SESSIONS_PER_IP_PER_HOUR || 12);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const checks: Check[] = [
    { label: 'Database', ok: true, detail: 'Connected (PostgreSQL)' },
    { label: 'GEMINI_API_KEY', ok: !!process.env.GEMINI_API_KEY, detail: process.env.GEMINI_API_KEY ? 'Set (server-only)' : 'Missing — voice and chat are disabled' },
    { label: 'Live model', ok: 'warn', detail: `${LIVE_MODEL} — model ids change; use “Test Gemini connection”` },
    { label: 'Text model', ok: true, detail: TEXT_MODEL },
    { label: 'AUTH_SECRET', ok: secret.length >= 32 ? true : secret.length >= 16 ? 'warn' : false, detail: secret.length >= 32 ? 'Strong' : secret.length >= 16 ? 'Works, but use 32+ random characters' : 'Missing / too short' },
    { label: 'Voice rate limit', ok: liveLimit >= 5 ? true : 'warn', detail: `${liveLimit} voice sessions per IP per hour${liveLimit < 5 ? ' — very strict; testers will hit it quickly' : ''}` },
    { label: 'Email (SMTP)', ok: mailConfigured() ? true : 'warn', detail: mailConfigured() ? 'Configured' : 'Not set — alerts & password resets are not emailed' },
    { label: 'Site URL', ok: site.startsWith('https://') ? true : 'warn', detail: site || 'NEXT_PUBLIC_SITE_URL not set' },
    { label: 'WhatsApp hand-over', ok: c.brand.whatsapp || process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER ? true : 'warn', detail: c.brand.whatsapp || process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || 'No number — hand-over shows email/phone instead' },
    { label: 'Developer ≠ Admin', ok: process.env.DEVELOPER_PASSWORD && process.env.DEVELOPER_PASSWORD === process.env.ADMIN_PASSWORD ? 'warn' : true, detail: 'Separate accounts, cookies and signing keys' },
    { label: 'Webhooks (24 h)', ok: Number(counts?.hook_errors ?? 0) ? 'warn' : true, detail: `${Number(counts?.hook_errors ?? 0)} failed deliveries` },
  ];
  const dot = (ok: Check['ok']) => (ok === true ? 'bg-emerald-400' : ok === 'warn' ? 'bg-amber-400' : 'bg-red-500');
  const links = [
    ['/developer/site', 'Site & content', 'Brand, pages, sections, hero, services, pricing, examples, FAQ'],
    ['/developer/assistant', 'AI assistant', 'Name, voice, greeting, personality, languages, sales script, knowledge base'],
    ['/developer/actions', 'Voice actions & DOM', 'Allowed actions, section identifiers, phrase mappings'],
    ['/developer/crm', 'CRM & scoring', 'Pipeline stages, sources, custom fields, assignment, lead scoring'],
    ['/developer/integrations', 'Integrations', 'Webhooks, email alerts, delivery log'],
    ['/developer/features', 'Features & environments', 'Toggles and per-environment overrides'],
  ];
  return (
    <>
      <DevHeader title="Developer Control Center" subtitle={`Technical configuration for ${c.brand.name}. Separate from the business admin at /admin — admin accounts have no access here.`} />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <DevCard title="Environment health">
          <ul className="divide-y divide-white/[0.05]">
            {checks.map((ch) => (
              <li key={ch.label} className="flex items-center gap-3 py-2 text-[13px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(ch.ok)}`} />
                <span className="w-40 shrink-0 font-semibold text-white">{ch.label}</span>
                <span className="min-w-0 break-words text-white/55">{ch.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <TestGemini />
          </div>
        </DevCard>
        <div className="space-y-4">
          <DevCard title="This workspace">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              {(
                [
                  ['Status', isActive ? 'Live' : 'Draft'],
                  ['Environment', deployEnv()],
                  ['Leads', counts?.leads],
                  ['Conversations', counts?.conversations],
                  ['Analytics events', counts?.events],
                  ['Active staff', counts?.staff],
                  ['Voice', f.voice ? 'On' : 'Off'],
                  ['Text chat', f.textChat ? 'On' : 'Off'],
                  ['Allowed actions', allowedActions(c).length],
                  ['Services / plans', `${c.services.length} / ${c.pricing.plans.length}`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-white/40">{k}</dt>
                  <dd className="font-semibold text-white">{String(v ?? 0)}</dd>
                </div>
              ))}
            </dl>
          </DevCard>
          <DevCard title="Architecture">
            <p className="text-[12.5px] leading-relaxed text-white/55">
              Voice → Gemini Live (ephemeral token; prompt, tools and voice locked server-side) → intent + function call → action engine in the page (safe, predefined actions only) → visual
              feedback + spoken reply → CRM / analytics events. Text chat uses the same prompt, tools and action engine via /api/chat.
            </p>
          </DevCard>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([href, t, d]) => (
          <Link key={href} href={href} className="rounded-2xl border border-white/[0.08] bg-[#0d1017] p-4 transition hover:border-amber-300/40">
            <p className="text-[14px] font-bold text-white">{t} →</p>
            <p className="mt-1 text-[12.5px] text-white/50">{d}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
