import 'server-only';
import { cookies } from 'next/headers';
import { activeWorkspaceId, getWorkspace } from './workspace';
import { requireDeveloper } from './dev-auth';

export const DEV_WS_COOKIE = 'ww_dev_ws';

/** The workspace the developer is editing (defaults to the live one). Requires a developer session. */
export async function editingWorkspace() {
  // Every developer page and action goes through here, so pages are protected even though
  // layouts and pages render in parallel.
  await requireDeveloper();
  const chosen = (await cookies()).get(DEV_WS_COOKIE)?.value;
  const ws = (chosen && (await getWorkspace(chosen))) || (await getWorkspace(await activeWorkspaceId()));
  if (!ws) throw new Error('No workspace found. Open the public site once to initialise the database.');
  return { ws, isActive: ws.id === (await activeWorkspaceId()) };
}
