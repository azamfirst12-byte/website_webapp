import { editingWorkspace } from '@/lib/dev-workspace';
import { integrationsSchema } from '@/lib/dev-schemas';
import { q } from '@/lib/db';
import { ago } from '@/lib/format';
import { WEBHOOK_EVENTS } from '@/lib/notify-events';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevCard, DevHeader, devGhost } from '@/components/developer/DevUi';
import { TestWebhook } from '@/components/developer/TestButtons';
import { clearIntegrationLogsAction } from '../../actions';

export const metadata = { title: 'Integrations' };

export default async function Integrations() {
  const { ws } = await editingWorkspace();
  const logs = await q<{ id: number; event: string; target: string; status: string; code: number | null; error: string | null; created_at: number }>(
    `SELECT id, event, target, status, code, error, created_at FROM integration_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 50`,
    [ws.id],
  );
  const env = [
    ['GEMINI_API_KEY', !!process.env.GEMINI_API_KEY, 'AI (voice + chat + summaries)'],
    ['DATABASE_URL', true, 'PostgreSQL (Neon)'],
    ['SMTP_HOST / SMTP_USER', !!(process.env.SMTP_HOST && process.env.SMTP_USER), 'Email alerts & password resets'],
    ['NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER', !!process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER, 'WhatsApp hand-over button'],
  ] as const;
  return (
    <>
      <DevHeader title="Integrations, APIs & webhooks" subtitle="Send CRM events to any external system. API keys stay in environment variables (never in the database)." />
      <div className="space-y-4">
        <ConfigEditor key={`${ws.id}:${ws.updated_at}`} path="integrations" title="Webhooks & alert emails" value={ws.config.integrations} defs={integrationsSchema()} />
        <div className="grid gap-4 lg:grid-cols-2">
          <DevCard title="Test a saved webhook">
            {ws.config.integrations.webhooks.length ? (
              <ul className="space-y-2">
                {ws.config.integrations.webhooks.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[13px]">
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">
                        {w.name} {!w.enabled && <span className="text-[11px] text-white/40">(disabled)</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-white/45">{w.url}</span>
                    </span>
                    <TestWebhook id={w.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-white/45">No webhooks yet. Add one above and save.</p>
            )}
            <p className="mt-3 text-[11.5px] text-white/40">Events: {WEBHOOK_EVENTS.join(', ')}</p>
          </DevCard>
          <DevCard title="Services (environment)">
            <ul className="space-y-1.5 text-[13px]">
              {env.map(([k, ok, d]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <code className="text-[12px] text-amber-200">{k}</code>
                  <span className="text-white/45">— {d}</span>
                </li>
              ))}
            </ul>
          </DevCard>
        </div>
        <DevCard title="Delivery log">
          {logs.length ? (
            <>
              <table className="w-full text-left text-[12.5px]">
                <tbody className="divide-y divide-white/[0.05]">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5 pr-3 text-white/45">{ago(l.created_at)}</td>
                      <td className="py-1.5 pr-3 font-mono text-amber-200">{l.event}</td>
                      <td className="py-1.5 pr-3 text-white/75">{l.target}</td>
                      <td className={`py-1.5 ${l.status === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{l.status === 'ok' ? `OK ${l.code ?? ''}` : l.error ?? `HTTP ${l.code}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <form action={clearIntegrationLogsAction} className="mt-3">
                <button className={devGhost}>Clear log</button>
              </form>
            </>
          ) : (
            <p className="text-[13px] text-white/45">No deliveries yet.</p>
          )}
        </DevCard>
      </div>
    </>
  );
}
