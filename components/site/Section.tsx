'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { SectionId } from '@/lib/workspace-types';
import { useSite } from './SiteProvider';

/**
 * Page section with a stable identifier (id + data-section) that the assistant's action layer
 * targets (scroll_to_section, highlight_element, read_content). Heading text comes from the workspace.
 */
export function Section({
  id,
  sectionKey,
  label,
  children,
  className = '',
  heading = true,
  center = true,
}: {
  id: string;
  sectionKey?: SectionId;
  label?: string;
  children: ReactNode;
  className?: string;
  heading?: boolean;
  center?: boolean;
}) {
  const { ws } = useSite();
  const t = sectionKey ? ws.sections[sectionKey] : undefined;
  const ref = useRef<HTMLElement>(null);
  const animate = (t?.animation ?? 'fade') === 'fade';

  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('in');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate]);

  return (
    <section ref={ref} id={id} data-section={id} aria-label={label ?? t?.heading ?? id} className={`relative py-16 sm:py-24 ${animate ? 'reveal' : ''} ${className}`}>
      <div className="container-x">
        {heading && t && (t.heading || t.eyebrow) && (
          <div className={`mb-10 max-w-3xl sm:mb-14 ${center ? 'mx-auto text-center' : ''}`}>
            {t.eyebrow && <span className="eyebrow">{t.eyebrow}</span>}
            <h2 className="h-display mt-4 text-3xl leading-[1.1] sm:text-[44px]">{t.heading}</h2>
            {t.subheading && <p className="mt-4 text-[16px] leading-relaxed text-white/65 sm:text-[17px]">{t.subheading}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function SampleBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200" title="Illustrative placeholder — replace in Developer › Site">
      Sample
    </span>
  );
}
