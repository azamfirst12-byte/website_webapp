import type { Metadata } from 'next';
import { ContactPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'Contact' };

export default async function Page() {
  await requirePage('contact');
  return <ContactPage />;
}
