import type { MetadataRoute } from 'next';
import { getActiveWorkspace } from '@/lib/workspace';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ws = await getActiveWorkspace();
  const c = ws.config;
  return {
    name: c.brand.name,
    short_name: c.brand.logoText || c.brand.name,
    description: c.seo.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: c.brand.colors.bg,
    theme_color: c.brand.colors.bg,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Pricing', url: '/pricing' },
      { name: 'Book a consultation', url: '/book' },
    ],
  };
}
