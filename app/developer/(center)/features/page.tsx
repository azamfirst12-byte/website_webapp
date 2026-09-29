import { editingWorkspace } from '@/lib/dev-workspace';
import { environmentsSchema, featuresSchema } from '@/lib/dev-schemas';
import { deployEnv, effectiveFeatures } from '@/lib/workspace';
import { labelize } from '@/lib/format';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevCard, DevHeader } from '@/components/developer/DevUi';

export const metadata = { title: 'Features & environments' };

export default async function Features() {
  const { ws } = await editingWorkspace();
  const eff = effectiveFeatures(ws.config);
  return (
    <>
      <DevHeader title="Feature toggles & environment settings" subtitle="Switch modules on or off for this workspace, with optional overrides for production, preview and development deployments." />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <ConfigEditor key={`${ws.id}:${ws.updated_at}:f`} path="features" title="Features" value={ws.config.features} defs={featuresSchema()} />
          <ConfigEditor key={`${ws.id}:${ws.updated_at}:e`} path="environments" title="Environment overrides" value={ws.config.environments} defs={environmentsSchema()} />
        </div>
        <DevCard title={`Effective now (${deployEnv()})`}>
          <ul className="space-y-1.5 text-[13px]">
            {Object.entries(eff).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5">
                <span className="text-white/75">{labelize(k.replace(/([A-Z])/g, '_$1').toLowerCase())}</span>
                <span className={v ? 'font-semibold text-emerald-300' : 'text-white/40'}>{v ? 'On' : 'Off'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-white/40">Deployment-level settings (API keys, rate limits, time zone, demo seeding) live in environment variables — see the README.</p>
        </DevCard>
      </div>
    </>
  );
}
