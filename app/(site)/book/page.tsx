import type { Metadata } from 'next';
import { BookPage } from '@/components/site/Pages';
import { requirePage } from '@/lib/pages';

export const metadata: Metadata = { title: 'Book a consultation' };

export default async function Page() {
  await requirePage('book');
  return <BookPage />;
}
