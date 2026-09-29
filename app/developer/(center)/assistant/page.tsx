import { editingWorkspace } from '@/lib/dev-workspace';
import { assistantSchema } from '@/lib/dev-schemas';
import { systemPrompt } from '@/lib/assistant-prompt';
import { allowedActions } from '@/lib/workspace';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevCard, DevHeader } from '@/components/developer/DevUi';

export const metadata = { title: 'AI assistant' };

export default async function AssistantPage() {
  const { ws } = await editingWorkspace();
  const c = ws.config;
  const prompt = systemPrompt(ws, 'voice', { returning: false });
  return (
    <>
      <DevHeader
        title="AI assistant"
        subtitle="Name, voice, greeting, personality, languages, sales script, qualification logic and knowledge base. The prompt, tools and voice are locked into each session token server-side, so visitors can't change them."
      />
      <div className="space-y-4">
        <ConfigEditor key={`${ws.id}:${ws.updated_at}`} path="assistant" title="Assistant" value={c.assistant} defs={assistantSchema().filter((d) => d.key !== 'allowedActions')} />
        <DevCard title={`Generated system prompt (voice) · ${prompt.length.toLocaleString()} characters · ${allowedActions(c).length} tools`}>
          <p className="mb-2 text-[12.5px] text-white/50">Read-only preview built from this workspace (services, plans, FAQ, knowledge base, sales script and rules). The text channel uses the same prompt with a chat style.</p>
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-[11.5px] leading-relaxed text-white/70">{prompt}</pre>
        </DevCard>
      </div>
    </>
  );
}
