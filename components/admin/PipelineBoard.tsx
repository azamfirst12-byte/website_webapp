'use client';

import Link from 'next/link';
import { useOptimistic, useTransition, useState } from 'react';
import { moveStage } from '@/app/admin/actions';
import { money } from '@/lib/format';
import type { Stage } from '@/lib/workspace-types';

export interface BoardLead {
  id: number;
  name: string;
  company: string | null;
  stage: string;
  score: number;
  value: number;
  service: string | null;
  owner: string | null;
  demo: boolean;
  followUp: number | null;
}

/** Kanban pipeline: drag cards between stages (or use the menu on touch screens). */
export function PipelineBoard({ leads, stages, currency, editable, hot }: { leads: BoardLead[]; stages: Stage[]; currency: string; editable: boolean; hot: number }) {
  const [, start] = useTransition();
  const [items, move] = useOptimistic(leads, (state, p: { id: number; stage: string }) => state.map((l) => (l.id === p.id ? { ...l, stage: p.stage } : l)));
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState('');

  const doMove = (id: number, stage: string) =>
    start(async () => {
      move({ id, stage });
      try {
        await moveStage(id, stage);
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <>
      {error && <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">{error}</p>}
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {stages.map((st) => {
          const col = items.filter((l) => l.stage === st.key);
          const total = col.reduce((s, l) => s + l.value, 0);
          return (
            <section
              key={st.key}
              aria-label={st.label}
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setOver(st.key);
              }}
              onDragLeave={() => setOver((o) => (o === st.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = Number(e.dataTransfer.getData('text/plain'));
                if (id) doMove(id, st.key);
              }}
              className={`flex w-[270px] shrink-0 flex-col rounded-2xl border bg-[#0b1020] transition ${over === st.key ? 'border-brand2/60 bg-brand2/[0.05]' : 'border-white/[0.08]'}`}
            >
              <header className="border-b border-white/[0.06] px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-bold text-white">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 text-[11.5px] font-semibold text-white/60">{col.length}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-white/45">
                  {money(total, currency)} · {st.probability}%
                </p>
              </header>
              <div className="flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto p-2.5">
                {col.map((l) => (
                  <article
                    key={l.id}
                    draggable={editable}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(l.id))}
                    className={`rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/leads/${l.id}`} className="min-w-0 text-[13px] font-semibold leading-snug text-white hover:underline">
                        {l.name}
                        {l.company && <span className="block truncate text-[11.5px] font-normal text-white/45">{l.company}</span>}
                      </Link>
                      <span className={`shrink-0 rounded-full px-1.5 text-[11px] font-bold tabular-nums ${l.score >= hot ? 'bg-red-500/20 text-red-200' : 'bg-white/5 text-white/60'}`}>{l.score}</span>
                    </div>
                    {l.service && <p className="mt-1.5 truncate text-[11.5px] text-white/55">{l.service}</p>}
                    <div className="mt-2 flex items-center justify-between text-[11.5px]">
                      <span className="font-semibold text-white/80">{money(l.value, currency)}</span>
                      <span className="truncate text-white/40">{l.owner ?? 'Unassigned'}</span>
                    </div>
                    {l.demo && <span className="mt-1.5 inline-block rounded bg-amber-400/15 px-1.5 text-[9.5px] font-bold uppercase text-amber-200">Demo</span>}
                    {editable && (
                      <select
                        aria-label={`Move ${l.name}`}
                        value={l.stage}
                        onChange={(e) => doMove(l.id, e.target.value)}
                        className="mt-2 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[11.5px] text-white/60 lg:hidden"
                      >
                        {stages.map((s) => (
                          <option key={s.key} value={s.key} className="bg-[#0b1020]">
                            Move to {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </article>
                ))}
                {!col.length && <p className="py-6 text-center text-[11.5px] text-white/30">{editable ? 'Drop leads here' : 'Empty'}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
