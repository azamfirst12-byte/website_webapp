import 'server-only';
import { getConversation, type Conversation } from './conversations';
import { s, visitorId } from './http';
import { getActiveWorkspace } from './workspace';

/** Workspace + visitor for public API routes (creates the anonymous visitor cookie if needed). */
export async function publicContext() {
  const ws = await getActiveWorkspace();
  const v = await visitorId(true);
  return { ws, visitor: v!.id, isNewVisitor: v!.isNew };
}

/** The conversation, only if it belongs to this visitor and workspace. */
export async function ownConversation(id: unknown, visitor: string, workspaceId: string): Promise<Conversation | null> {
  const cid = s(id, 40);
  if (!cid) return null;
  const c = await getConversation(cid);
  if (!c || c.visitor_id !== visitor || c.workspace_id !== workspaceId) return null;
  return c;
}
