import { requireAdmin } from '@/lib/auth';
import { getActiveWorkspace } from '@/lib/workspace';
import { pipelineBoard } from '@/lib/crm';
import { assignableStaff } from '@/lib/admin-users';
import { money } from '@/lib/format';
import { can } from '@/lib/permissions';
import { PageHeader, btnCls, inputCls } from '@/components/admin/ui';
import { PipelineBoard } from '@/components/admin/PipelineBoard';

export const metadata = { title: 'Pipeline' };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ service?: string; assigned?: string }> }) {
  const session = await requireAdmin();
  const ws = await getActiveWorkspace();
  const sp = await searchParams;
  const c = ws.config;
  const [rows, staff] = await Promise.all([pipelineBoard(ws, { id: session.user.id, role: session.user.role }, sp), assignableStaff()]);
  const names = new Map(c.services.map((s) => [s.slug, s.name]));
  const open = rows.filter((r) => c.crm.stages.find((s) => s.key === r.stage)?.kind === 'open');
  const weighted = open.reduce((s, r) => s + (r.value * (c.crm.stages.find((x) => x.key === r.stage)?.probability ?? 0)) / 100, 0);
  return (
    <>
      <PageHeader
        title="Sales pipeline"
        subtitle={`${open.length} open opportunities · ${money(
          open.reduce((s, r) => s + r.value, 0),
          c.pricing.currency,
        )} total · ${money(weighted, c.pricing.currency)} weighted · won/lost from the last 60 days`}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="service" defaultValue={sp.service ?? ''} className={`${inputCls} w-auto`} aria-label="Service">
          <option value="">All services</option>
          {c.services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="assigned" defaultValue={sp.assigned ?? ''} className={`${inputCls} w-auto`} aria-label="Owner">
          <option value="">Everyone</option>
          <option value="me">Mine</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.username}
            </option>
          ))}
        </select>
        <button className={btnCls}>Apply</button>
      </form>
      <PipelineBoard
        stages={c.crm.stages}
        currency={c.pricing.currency}
        editable={can(session.user.role, 'leads.edit')}
        hot={c.scoring.highIntentThreshold}
        leads={rows.map((r) => ({
          id: Number(r.id),
          name: r.name || r.email || r.phone || `Lead #${r.id}`,
          company: r.company,
          stage: r.stage,
          score: r.score,
          value: r.value,
          service: r.interested_service ? (names.get(r.interested_service) ?? r.interested_service) : null,
          owner: r.assignee_name ?? null,
          demo: r.is_demo,
          followUp: r.next_follow_up_at,
        }))}
      />
    </>
  );
}
