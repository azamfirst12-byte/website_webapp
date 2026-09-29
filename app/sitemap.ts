import type { MetadataRoute } from 'next';
import { getActiveWorkspace } from '@/lib/workspace';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const ws = await getActiveWorkspace();
  const pages = ws.config.pages.filter((p) => p.enabled).map((p) => ({ url: `${site}${p.path}`, changeFrequency: 'weekly' as const, priority: p.key === 'home' ? 1 : 0.7 }));
  const services = ws.config.services.map((s) => ({ url: `${site}/services/${s.slug}`, changeFrequency: 'monthly' as const, priority: 0.6 }));
  return [...pages, ...services];
}
