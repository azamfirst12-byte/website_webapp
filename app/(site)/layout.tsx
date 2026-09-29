import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getActiveWorkspace, toPublic } from '@/lib/workspace';
import { hexToTriplet } from '@/lib/format';
import { SiteProvider } from '@/components/site/SiteProvider';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { Modals } from '@/components/site/Modals';
import { Tracker } from '@/components/site/Tracker';
import { Assistant } from '@/components/assistant/Assistant';
import { DevicePreviewGate } from '@/components/site/DevicePreviewGate';

// Pages are rendered from the workspace config and cached; Developer saves revalidate them instantly.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const ws = await getActiveWorkspace();
  const c = ws.config;
  return {
    title: { default: c.seo.title, template: `%s — ${c.brand.name}` },
    description: c.seo.description,
    applicationName: c.brand.name,
    appleWebApp: { capable: true, title: c.brand.name, statusBarStyle: 'black-translucent' },
    openGraph: { siteName: c.brand.name, type: 'website', title: c.seo.title, description: c.seo.description },
    robots: { index: true, follow: true },
  };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const ws = await getActiveWorkspace();
  const pub = toPublic(ws);
  const col = ws.config.brand.colors;
  // Brand colours as CSS variables (see tailwind.config.ts).
  const vars = `:root{--brand:${hexToTriplet(col.brand)};--brand-2:${hexToTriplet(col.brand2)};--accent:${hexToTriplet(col.accent)};--bg:${hexToTriplet(col.bg, '7 9 18')};--surface:${hexToTriplet(col.surface, '15 19 34')};--ink:${hexToTriplet(col.ink, '232 235 247')};--highlight:${ws.config.actions.highlightColor || col.brand2}}`;
  return (
    <SiteProvider ws={pub}>
      <style dangerouslySetInnerHTML={{ __html: vars }} />
      <div className="relative flex min-h-screen flex-col overflow-x-clip">
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
      <Modals />
      <Assistant />
      <Tracker />
      <DevicePreviewGate />
    </SiteProvider>
  );
}
