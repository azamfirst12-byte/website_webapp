import type { Metadata } from 'next';
import { getActiveWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Privacy' };

export default async function Privacy() {
  const ws = await getActiveWorkspace();
  const b = ws.config.brand;
  return (
    <section className="py-16">
      <div className="container-x max-w-3xl space-y-5 text-[15px] leading-relaxed text-white/75">
        <h1 className="h-display text-4xl">Privacy</h1>
        <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-[13px] text-amber-100">Template text — replace it with your own privacy policy reviewed by your adviser.</p>
        <p>
          {b.name} uses this website and its AI assistant to answer questions and arrange consultations. When you talk to the assistant, your words are sent to our AI
          provider to generate replies, and the conversation is stored so our team can follow up.
        </p>
        <p>
          We only save your name, email, phone or company when you choose to share them. We use an anonymous cookie to understand how the site is used (pages viewed,
          time on page) and to remember your conversation while you browse.
        </p>
        <p>Microphone audio is streamed only while the voice assistant is on, and you can switch it off at any time. We do not sell personal data.</p>
        <p>
          To see, correct or delete your data, contact <a className="text-brand2 underline" href={`mailto:${b.email}`}>{b.email}</a>.
        </p>
      </div>
    </section>
  );
}
