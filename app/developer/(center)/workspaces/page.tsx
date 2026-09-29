import { editingWorkspace } from '@/lib/dev-workspace';
import { listWorkspaces } from '@/lib/workspace';
import { TEMPLATES } from '@/lib/default-workspace';
import { ago } from '@/lib/format';
import { DevCard, DevHeader, devGhost } from '@/components/developer/DevUi';
import { CreateWorkspace } from '@/components/developer/CreateWorkspace';
import { activateWorkspaceAction, archiveWorkspaceAction, editWorkspaceAction } from '../../actions';

export const metadata = { title: 'Workspaces' };

export default async function Workspaces() {
  const [{ ws: editing }, list] = await Promise.all([editingWorkspace(), listWorkspaces()]);
  return (
    <>
      <DevHeader
        title="Client workspaces"
        subtitle="Each workspace is a complete, reusable client setup: brand, content, assistant, voice actions, CRM schema, analytics and integrations. One workspace is live per deployment (or pin one with ACTIVE_WORKSPACE for a per-client Vercel project)."
      />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <DevCard>
          <ul className="divide-y divide-white/[0.06]">
            {list.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-white">
                    {w.name} <code className="ml-1 text-[11.5px] font-normal text-white/40">{w.id}</code>
                  </p>
                  <p className="text-[12px] text-white/45">
                    {w.leads} leads · updated {ago(w.updated_at)}
                  </p>
                </div>
                {w.active ? (
                  <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200">LIVE</span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-bold uppercase text-white/45">{w.status}</span>
                )}
                {editing.id === w.id ? (
                  <span className="text-[12px] font-semibold text-amber-300">Editing</span>
                ) : (
                  <form action={editWorkspaceAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className={devGhost}>Edit</button>
                  </form>
                )}
                {!w.active && w.status !== 'archived' && (
                  <form action={activateWorkspaceAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className={devGhost}>Make live</button>
                  </form>
                )}
                {!w.active && w.status !== 'archived' && (
                  <form action={archiveWorkspaceAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className="text-[12px] text-white/40 hover:text-red-300">Archive</button>
                  </form>
                )}
                <a href={`/developer/api/export?ws=${w.id}`} className="text-[12px] text-white/50 hover:text-white">
                  Export JSON
                </a>
              </li>
            ))}
          </ul>
        </DevCard>
        <div className="space-y-4">
          <DevCard title="New client workspace">
            <CreateWorkspace templates={Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label }))} existing={list.map((w) => ({ id: w.id, name: w.name }))} />
          </DevCard>
          <DevCard title="Launch checklist for a new client">
            <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-white/60">
              <li>Create from a template or clone a similar client.</li>
              <li>Site & content: brand, colours, services, plans, FAQ, real reviews.</li>
              <li>AI assistant: name, voice, greeting, sales script, knowledge base.</li>
              <li>Voice actions: confirm section ids; add phrase mappings.</li>
              <li>CRM: stages, sources, custom fields, scoring thresholds.</li>
              <li>Integrations: webhooks to the client’s CRM / Sheets; alert emails.</li>
              <li>Make live (or deploy a separate project with ACTIVE_WORKSPACE).</li>
            </ol>
          </DevCard>
        </div>
      </div>
    </>
  );
}
