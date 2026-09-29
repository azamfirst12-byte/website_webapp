'use client';

import { useState, useTransition } from 'react';
import { testGeminiAction, testWebhookAction, type SaveResult } from '@/app/developer/actions';

function Result({ r }: { r: SaveResult | null }) {
  if (!r) return null;
  return (
    <div className="mt-2 text-[12.5px]">
      {r.message && <p className="text-emerald-300">{r.message}</p>}
      {r.errors?.map((e) => (
        <p key={e} className="text-red-300">
          {e}
        </p>
      ))}
    </div>
  );
}

export function TestGemini() {
  const [r, setR] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button disabled={pending} onClick={() => start(async () => setR(await testGeminiAction()))} className="rounded-lg bg-amber-400 px-3.5 py-2 text-[13px] font-bold text-black hover:bg-amber-300 disabled:opacity-50">
        {pending ? 'Testing…' : 'Test Gemini connection'}
      </button>
      <Result r={r} />
    </div>
  );
}

export function TestWebhook({ id }: { id: string }) {
  const [r, setR] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <button disabled={pending} onClick={() => start(async () => setR(await testWebhookAction(id)))} className="rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] font-semibold text-white/80 hover:bg-white/[0.06]">
        {pending ? 'Sending…' : 'Send test'}
      </button>
      <Result r={r} />
    </span>
  );
}
