import { editingWorkspace } from '@/lib/dev-workspace';
import { crmSchema, scoringSchema } from '@/lib/dev-schemas';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevHeader } from '@/components/developer/DevUi';

export const metadata = { title: 'CRM & scoring' };

export default async function CrmPage() {
  const { ws } = await editingWorkspace();
  const c = ws.config;
  return (
    <>
      <DevHeader title="CRM schema, pipeline & lead scoring" subtitle="Pipeline stages, lead sources, customer types, custom fields, assignment rules and the qualification scoring used by the assistant and forms." />
      <div className="space-y-4">
        <ConfigEditor key={`${ws.id}:${ws.updated_at}:crm`} path="crm" title="CRM & pipeline" value={c.crm} defs={crmSchema()} />
        <ConfigEditor key={`${ws.id}:${ws.updated_at}:scoring`} path="scoring" title="Lead scoring" description="Scores are recalculated whenever a lead changes. The AI's intent judgement (qualify_lead) is one of the signals." value={c.scoring} defs={scoringSchema()} />
      </div>
    </>
  );
}
