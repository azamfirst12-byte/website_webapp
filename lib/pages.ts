import 'server-only';
import { notFound } from 'next/navigation';
import { getActiveWorkspace } from './workspace';
import type { PageKey } from './workspace-types';

/** 404 when a page is switched off in Developer › Site › Pages. */
export async function requirePage(key: PageKey) {
  const ws = await getActiveWorkspace();
  if (!ws.config.pages.some((p) => p.key === key && p.enabled)) notFound();
  return ws;
}
