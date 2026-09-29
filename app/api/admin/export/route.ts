import { adminFromRequest } from '@/lib/auth';
import { leadsCsv } from '@/lib/analytics';
import { bad } from '@/lib/http';
import { getActiveWorkspace } from '@/lib/workspace';
import { parseReportFilters } from '@/lib/report-filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV of leads for the current report filters. */
export async function GET(req: Request) {
  const s = await adminFromRequest('export');
  if (!s) return bad('Not allowed.', 403);
  const ws = await getActiveWorkspace();
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const csv = await leadsCsv(ws, parseReportFilters(params));
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
