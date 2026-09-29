import type { Metadata } from 'next';
import { WorkPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'Work' };

export default async function Page() {
  await requirePage('work');
  return <WorkPage />;
}
