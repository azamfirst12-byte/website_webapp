import { editingWorkspace } from '@/lib/dev-workspace';
import {
  announcementSchema,
  brandSchema,
  caseStudiesSchema,
  faqSchema,
  heroSchema,
  homeSchema,
  industriesSchema,
  miscContentSchema,
  pagesSchema,
  pricingSchema,
  sectionsSchema,
  seoSchema,
  servicesSchema,
  testimonialsSchema,
} from '@/lib/dev-schemas';
import { ConfigEditor } from '@/components/developer/SchemaForm';
import { DevHeader, DevTabs } from '@/components/developer/DevUi';

export const metadata = { title: 'Site & content' };

const TABS = [
  { key: 'brand', label: 'Brand & SEO' },
  { key: 'pages', label: 'Pages & sections' },
  { key: 'hero', label: 'Hero & banner' },
  { key: 'services', label: 'Services' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'work', label: 'Examples' },
  { key: 'reviews', label: 'Testimonials' },
  { key: 'faq', label: 'FAQ' },
  { key: 'other', label: 'Other content' },
];

export default async function SiteContent({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { ws } = await editingWorkspace();
  const c = ws.config;
  const { tab = 'brand' } = await searchParams;
  // key forces a fresh editor after switching workspace
  const k = (p: string) => `${ws.id}:${ws.updated_at}:${p}`;
  return (
    <>
      <DevHeader title="Site & content" subtitle="Page structure, headings, images/videos, banners, service cards, pricing and all visible content. Saving publishes to the workspace immediately (drafts stay private)." />
      <DevTabs items={TABS} current={tab} />
      <div className="space-y-4">
        {tab === 'brand' && (
          <>
            <ConfigEditor key={k('brand')} path="brand" title="Brand" value={c.brand} defs={brandSchema()} />
            <ConfigEditor key={k('seo')} path="seo" title="SEO" value={c.seo} defs={seoSchema()} />
          </>
        )}
        {tab === 'pages' && (
          <>
            <ConfigEditor key={k('pages')} path="pages" title="Pages & navigation" value={c.pages} defs={pagesSchema()} single />
            <ConfigEditor key={k('home')} path="homeOrder" title="Home page layout" description="Order and visibility of home page sections." value={c.homeOrder} defs={homeSchema()} single />
            <ConfigEditor key={k('sections')} path="sections" title="Section headings & animation" value={c.sections} defs={sectionsSchema()} />
          </>
        )}
        {tab === 'hero' && (
          <>
            <ConfigEditor key={k('hero')} path="hero" title="Hero" value={c.hero} defs={heroSchema()} />
            <ConfigEditor key={k('ann')} path="announcement" title="Announcement banner" description="Turn on/off in Features." value={c.announcement} defs={announcementSchema()} />
          </>
        )}
        {tab === 'services' && (
          <>
            <ConfigEditor key={k('services')} path="services" title="Service cards" value={c.services} defs={servicesSchema(c)} single />
            <ConfigEditor key={k('ind')} path="industries" title="Industries" description="Used by the services/examples filters and filter_content." value={c.industries} defs={industriesSchema()} single />
          </>
        )}
        {tab === 'pricing' && <ConfigEditor key={k('pricing')} path="pricing" title="Pricing & plans" value={c.pricing} defs={pricingSchema(c)} />}
        {tab === 'work' && <ConfigEditor key={k('cases')} path="caseStudies" title="Examples / case studies" value={c.caseStudies} defs={caseStudiesSchema(c)} single />}
        {tab === 'reviews' && <ConfigEditor key={k('t')} path="testimonials" title="Testimonials" value={c.testimonials} defs={testimonialsSchema(c)} single />}
        {tab === 'faq' && <ConfigEditor key={k('faq')} path="faq" title="FAQ" description="Also part of the assistant’s knowledge." value={c.faq} defs={faqSchema()} single />}
        {tab === 'other' &&
          miscContentSchema().map((d) => (
            <ConfigEditor key={k(d.key)} path={d.key} title={d.label} value={(c as unknown as Record<string, unknown>)[d.key]} defs={d.type === 'object' ? d.fields : [d]} single={d.type !== 'object'} />
          ))}
      </div>
    </>
  );
}
