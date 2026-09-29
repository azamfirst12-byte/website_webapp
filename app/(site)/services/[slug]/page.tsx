import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServiceDetail } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';
import { getActiveWorkspace } from '@/lib/workspace';

export async function generateStaticParams() {
  const ws = await getActiveWorkspace();
  return ws.config.services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ws = await getActiveWorkspace();
  const s = ws.config.services.find((x) => x.slug === slug);
  return s ? { title: s.name, description: s.summary } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await requirePage('services');
  if (!ws.config.services.some((s) => s.slug === slug)) notFound();
  return <ServiceDetail slug={slug} />;
}
