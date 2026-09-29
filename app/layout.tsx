import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';

const head = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-head', display: 'swap' });
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#070912',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions add attributes to <html>/<body> before React loads.
    <html lang="en" className={`${head.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-screen pb-[env(safe-area-inset-bottom)]" suppressHydrationWarning>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
