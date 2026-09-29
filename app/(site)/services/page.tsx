import type { Metadata } from 'next';
import { ServicesPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'Services' };

export default async function Page() {
  await requirePage('services');
  return <ServicesPage />;
}
