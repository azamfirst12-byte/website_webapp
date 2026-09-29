import type { Metadata } from 'next';
import { AboutPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'About' };

export default async function Page() {
  await requirePage('about');
  return <AboutPage />;
}
