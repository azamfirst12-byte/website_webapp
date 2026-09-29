import { editingWorkspace } from '@/lib/dev-workspace';
import { actionsSchema, allowedActionsSchema } from '@/lib/dev-schemas';
import { toolDefs } from '@/lib/tool-defs';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevCard, DevHeader } from '@/components/developer/DevUi';

export const metadata = { title: 'Voice actions & DOM' };

export default async function ActionsPage() {
  const { ws } = await editingWorkspace();
  const c = ws.config;
  const defs = toolDefs(c);
  return (
    <>
      <DevHeader
        title="Voice actions & DOM mappings"
        subtitle="The assistant never gets free browser control: natural language → structured function call → this action layer → a predefined website action. Configure which actions exist, the stable section identifiers they target, and site-specific phrases."
      />
      <div className="space-y-4">
        <ConfigEditor key={`${ws.id}:${ws.updated_at}:allowed`} path="assistant.allowedActions" title="Allowed actions" value={c.assistant.allowedActions} defs={allowedActionsSchema()} single />
        <ConfigEditor key={`${ws.id}:${ws.updated_at}:actions`} path="actions" title="Targets & mappings" value={c.actions} defs={actionsSchema(c)} />
        <DevCard title="DOM conventions (for custom pages and components)">
          <ul className="space-y-1.5 text-[12.5px] text-white/60">
            <li>
              <code className="text-amber-200">data-section=&quot;pricing&quot;</code> + <code className="text-amber-200">id</code> — a section the assistant can scroll to and read.
            </li>
            <li>
              <code className="text-amber-200">data-item=&quot;plan:growth&quot; data-item-label=&quot;…&quot;</code> — an item it can highlight, compare and refer to by position (“the second option”).
            </li>
            <li>
              <code className="text-amber-200">data-tab-group / data-tab</code> — tabs for select_tab · <code className="text-amber-200">data-form=&quot;contact&quot;</code> — forms for fill_form.
            </li>
            <li>
              <code className="text-amber-200">data-ai=&quot;off&quot;</code> — locked: the assistant can’t change it (consent checkboxes) · <code className="text-amber-200">data-ai-skip</code> — hidden from the assistant.
            </li>
            <li>
              <code className="text-amber-200">data-cta=&quot;name&quot;</code> — tracked as a CTA click in analytics.
            </li>
          </ul>
        </DevCard>
        <DevCard title={`Function declarations sent to the model (${defs.length})`}>
          <div className="grid gap-2 md:grid-cols-2">
            {defs.map((d) => (
              <details key={d.name} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                <summary className="cursor-pointer text-[13px] font-semibold text-white">
                  {d.name} {!c.assistant.allowedActions.includes(d.name) && !['get_view_context', 'read_screen', 'assistant_panel'].includes(d.name) && <span className="ml-1 text-[11px] text-red-300">disabled</span>}
                </summary>
                <p className="mt-1 text-[12px] text-white/55">{d.description}</p>
                <pre className="mt-1 overflow-auto text-[11px] text-white/45">{JSON.stringify(d.parameters.properties, null, 1)}</pre>
              </details>
            ))}
          </div>
        </DevCard>
      </div>
    </>
  );
}
