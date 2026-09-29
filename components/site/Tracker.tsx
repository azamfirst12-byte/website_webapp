'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { flush, setEnabledEvents, trackEvent } from './track';
import { useSite } from './SiteProvider';

function TrackerInner() {
  const { ws } = useSite();
  const path = usePathname();
  const params = useSearchParams();
  const shown = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const firstRef = useRef(true);

  useEffect(() => setEnabledEvents(ws.analyticsEvents), [ws.analyticsEvents]);

  // Page view (also creates the anonymous visitor cookie).
  useEffect(() => {
    const body = {
      path,
      referrer: firstRef.current ? document.referrer || null : null,
      utm: { source: params.get('utm_source') ?? undefined, medium: params.get('utm_medium') ?? undefined, campaign: params.get('utm_campaign') ?? undefined },
    };
    firstRef.current = false;
    fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  }, [path, params]);

  // Engagement time per page (only while the tab is visible).
  useEffect(() => {
    shown.current = 0;
    visibleSince.current = document.visibilityState === 'visible' ? Date.now() : null;
    const report = (beacon: boolean) => {
      if (visibleSince.current) shown.current += Date.now() - visibleSince.current;
      visibleSince.current = null;
      if (shown.current > 1500) trackEvent({ type: 'engagement', path, meta: { ms: Math.min(shown.current, 30 * 60_000) } });
      shown.current = 0;
      flush(beacon);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') report(true);
      else visibleSince.current = Date.now();
    };
    const onHide = () => report(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      report(false);
    };
  }, [path]);

  // Section views (once per section per page view).
  useEffect(() => {
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.section;
          if (e.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            trackEvent({ type: 'section_view', name: id });
          }
        }
      },
      { threshold: 0.35 },
    );
    const t = setTimeout(() => document.querySelectorAll('[data-section]').forEach((el) => io.observe(el)), 400);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [path]);

  // CTA clicks: any element with data-cta.
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cta]');
      if (el) trackEvent({ type: 'cta_click', name: el.dataset.cta?.slice(0, 80) });
    };
    document.addEventListener('click', on);
    return () => document.removeEventListener('click', on);
  }, []);

  return null;
}

export function Tracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}
