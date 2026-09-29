import { editingWorkspace } from '@/lib/dev-workspace';
import { listVersions } from '@/lib/workspace';
import { fmtDateTime } from '@/lib/format';
import { DevCard, DevHeader, devGhost } from '@/components/developer/DevUi';
import { RawEditor } from '@/components/developer/RawEditor';
import { restoreVersionAction } from '../../actions';

export const metadata = { title: 'Raw config & versions' };

export default async function JsonPage() {
  const { ws } = await editingWorkspace();
  const versions = await listVersions(ws.id);
  return (
    <>
      <DevHeader
        title="Raw configuration & version history"
        subtitle="The complete, portable workspace definition. Every save creates a version you can roll back to."
        actions={
          <a href={`/developer/api/export?ws=${ws.id}`} className={devGhost}>
            Download JSON
          </a>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <DevCard>
          <RawEditor key={`${ws.id}:${ws.updated_at}`} json={JSON.stringify(ws.config, null, 2)} />
        </DevCard>
        <DevCard title={`Versions (${versions.length})`}>
          <ul className="max-h-[720px] space-y-1.5 overflow-y-auto">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{v.note || 'Edit'}</span>
                  <span className="text-white/40">
                    #{v.id} · {fmtDateTime(v.created_at)} · {v.created_by}
                  </span>
                </span>
                {i === 0 ? (
                  <span className="text-[11px] font-bold text-emerald-300">CURRENT</span>
                ) : (
                  <form action={restoreVersionAction}>
                    <input type="hidden" name="version" value={v.id} />
                    <button className="rounded-md border border-white/12 px-2 py-1 text-[11.5px] text-white/70 hover:bg-white/10">Restore</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </DevCard>
      </div>
    </>
  );
}
