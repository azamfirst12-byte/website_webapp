import type { Metadata } from 'next';
import { PricingPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'Pricing' };

export default async function Page() {
  await requirePage('pricing');
  return <PricingPage />;
}
