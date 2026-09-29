// Field schemas for the Developer Control Center editors (plain data, built from the current config).
import type { FieldDef, Opt } from '@/components/developer/SchemaForm';
import { ICON_NAMES } from '@/components/site/Icon';
import { WEBHOOK_EVENTS } from './notify-events';
import { INTENT_CATEGORIES, PAGE_KEYS, SCORE_SIGNALS, SECTION_IDS, SUPPORT_ACTIONS, WEBSITE_ACTIONS, type WorkspaceConfig } from './workspace-types';
import { SIGNAL_LABELS } from './scoring';
import { ACTION_LABEL } from './tool-defs';
import { labelize } from './format';

const opts = (xs: readonly string[], label: (x: string) => string = labelize): Opt[] => xs.map((x) => ({ value: x, label: label(x) }));
const ctaFields: FieldDef[] = [
  { key: 'label', label: 'Label', type: 'text', half: true },
  { key: 'action', label: 'Action', type: 'select', options: [{ value: 'booking', label: 'Open booking popup' }, { value: 'contact', label: 'Go to contact form' }, { value: 'href', label: 'Link' }], half: true },
  { key: 'href', label: 'Link (when action = Link)', type: 'text', placeholder: '/pricing' },
];

export const VOICES = ['', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];

export function brandSchema(): FieldDef[] {
  return [
    { key: 'name', label: 'Business name', type: 'text', half: true },
    { key: 'logoText', label: 'Logo text', type: 'text', half: true, help: 'Shown next to the mark when no logo image is set.' },
    { key: 'tagline', label: 'Tagline', type: 'text' },
    { key: 'logoUrl', label: 'Logo image URL (optional)', type: 'url' },
    {
      key: 'colors',
      label: 'Colours',
      type: 'object',
      fields: [
        { key: 'brand', label: 'Primary', type: 'color', half: true },
        { key: 'brand2', label: 'Secondary', type: 'color', half: true },
        { key: 'accent', label: 'Accent', type: 'color', half: true },
        { key: 'bg', label: 'Background', type: 'color', half: true },
        { key: 'surface', label: 'Cards', type: 'color', half: true },
        { key: 'ink', label: 'Text', type: 'color', half: true },
      ],
    },
    { key: 'email', label: 'Email', type: 'text', half: true },
    { key: 'phone', label: 'Phone', type: 'text', half: true },
    { key: 'whatsapp', label: 'WhatsApp for hand-over (digits with country code)', type: 'text', half: true, help: 'Empty = NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER' },
    { key: 'hours', label: 'Opening hours', type: 'text', half: true },
    { key: 'address', label: 'Address / locations', type: 'text' },
    {
      key: 'social',
      label: 'Social profiles',
      type: 'object',
      fields: ['linkedin', 'instagram', 'facebook', 'x', 'youtube'].map((k) => ({ key: k, label: labelize(k), type: 'url' as const, half: true })),
    },
  ];
}

export function seoSchema(): FieldDef[] {
  return [
    { key: 'title', label: 'Page title (SEO)', type: 'text' },
    { key: 'description', label: 'Meta description', type: 'textarea', rows: 2 },
  ];
}

export function announcementSchema(): FieldDef[] {
  return [
    { key: 'text', label: 'Banner text', type: 'text' },
    { key: 'ctaLabel', label: 'Link label', type: 'text', half: true },
    { key: 'href', label: 'Link (#assistant opens the assistant)', type: 'text', half: true },
  ];
}

export function pagesSchema(): FieldDef[] {
  return [
    {
      key: 'pages',
      label: 'Pages',
      type: 'list',
      titleKey: 'label',
      newItem: { key: 'about', label: 'New page', path: '/about', enabled: true, inNav: true },
      help: 'Pages are fixed templates; you can rename, hide or remove them from the menu. Keys map to navigate_page actions.',
      item: [
        { key: 'key', label: 'Key', type: 'select', options: opts(PAGE_KEYS), half: true },
        { key: 'label', label: 'Menu label', type: 'text', half: true },
        { key: 'path', label: 'Path', type: 'text', half: true },
        { key: 'enabled', label: 'Enabled', type: 'bool', half: true },
        { key: 'inNav', label: 'Show in main menu', type: 'bool', half: true },
      ],
    },
  ];
}

export function homeSchema(): FieldDef[] {
  return [
    { key: 'homeOrder', label: 'Home page sections (order)', type: 'order', options: opts(SECTION_IDS), help: 'Section ids are stable identifiers used by the voice action layer.' },
  ];
}

export function sectionsSchema(): FieldDef[] {
  return SECTION_IDS.map((id) => ({
    key: id,
    label: `Section: ${labelize(id)} (#${id})`,
    type: 'object' as const,
    fields: [
      { key: 'enabled', label: 'Visible', type: 'bool' as const, half: true },
      { key: 'animation', label: 'Entrance animation', type: 'select' as const, options: [{ value: 'fade', label: 'Fade up' }, { value: 'none', label: 'None' }], half: true },
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' as const, half: true },
      { key: 'heading', label: 'Heading', type: 'text' as const, half: true },
      { key: 'subheading', label: 'Subheading', type: 'textarea' as const, rows: 2 },
    ],
  }));
}

export function heroSchema(): FieldDef[] {
  return [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
    { key: 'heading', label: 'Heading', type: 'text', half: true },
    { key: 'highlight', label: 'Highlighted words', type: 'text', half: true },
    { key: 'subheading', label: 'Subheading', type: 'textarea', rows: 3 },
    { key: 'primaryCta', label: 'Primary button', type: 'object', fields: ctaFields },
    { key: 'secondaryCta', label: 'Secondary button', type: 'object', fields: ctaFields },
    { key: 'bullets', label: 'Bullet points', type: 'lines' },
    { key: 'media', label: 'Visual', type: 'select', options: [{ value: 'illustration', label: 'Built-in voice illustration' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video (autoplay, muted)' }], half: true },
    { key: 'mediaUrl', label: 'Image / video URL', type: 'url', half: true },
  ];
}

export function servicesSchema(c: WorkspaceConfig): FieldDef[] {
  return [
    {
      key: 'services',
      label: 'Services',
      type: 'list',
      titleKey: 'name',
      newItem: { slug: 'new-service', name: 'New service', icon: 'spark', category: 'Services', summary: '', description: '', industries: [], startingPrice: 0, priceUnit: 'one-time', timeline: '', features: [] },
      item: [
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'slug', label: 'Slug (URL + service card id)', type: 'text', half: true },
        { key: 'category', label: 'Category (tab)', type: 'text', half: true },
        { key: 'icon', label: 'Icon', type: 'select', options: opts(ICON_NAMES, (x) => x), half: true },
        { key: 'summary', label: 'Card summary', type: 'textarea', rows: 2 },
        { key: 'description', label: 'Full description', type: 'textarea', rows: 4 },
        { key: 'startingPrice', label: 'Starting price', type: 'number', half: true },
        { key: 'priceUnit', label: 'Price unit', type: 'text', half: true, placeholder: 'one-time / per month' },
        { key: 'timeline', label: 'Timeline', type: 'text', half: true },
        { key: 'popular', label: 'Show “Popular” badge', type: 'bool', half: true },
        { key: 'industries', label: 'Industries (for “show only services for…”)', type: 'multiselect', options: c.industries.map((i) => ({ value: i.key, label: i.label })) },
        { key: 'features', label: 'What’s included', type: 'lines' },
      ],
    },
  ];
}

export function industriesSchema(): FieldDef[] {
  return [
    {
      key: 'industries',
      label: 'Industries',
      type: 'list',
      titleKey: 'label',
      newItem: { key: 'new-industry', label: 'New industry' },
      item: [
        { key: 'key', label: 'Key (used by filter_content)', type: 'text', half: true },
        { key: 'label', label: 'Label', type: 'text', half: true },
      ],
    },
  ];
}

export function pricingSchema(c: WorkspaceConfig): FieldDef[] {
  return [
    { key: 'currency', label: 'Currency symbol', type: 'text', half: true },
    { key: 'annualDiscountPct', label: 'Annual billing discount %', type: 'number', half: true },
    { key: 'note', label: 'Note under the plans', type: 'textarea', rows: 2 },
    {
      key: 'plans',
      label: 'Plans',
      type: 'list',
      titleKey: 'name',
      newItem: { id: 'new-plan', name: 'New plan', tagline: '', monthly: 0, setupFee: 0, bestFor: '', features: [], ctaLabel: 'Choose' },
      item: [
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'id', label: 'Id (plan:<id> for actions)', type: 'text', half: true },
        { key: 'tagline', label: 'Tagline', type: 'text' },
        { key: 'monthly', label: 'Monthly price (0 = custom)', type: 'number', half: true },
        { key: 'setupFee', label: 'One-time setup', type: 'number', half: true },
        { key: 'bestFor', label: 'Best for', type: 'text', half: true },
        { key: 'ctaLabel', label: 'Button label', type: 'text', half: true },
        { key: 'highlighted', label: 'Highlight as most popular', type: 'bool' },
        { key: 'features', label: 'Features', type: 'lines' },
      ],
    },
    {
      key: 'comparison',
      label: 'Comparison table rows',
      type: 'list',
      titleKey: 'feature',
      newItem: { feature: 'New feature', values: {} },
      item: [
        { key: 'feature', label: 'Feature', type: 'text' },
        { key: 'values', label: 'Value per plan (use “Yes” for a tick, “—” for none)', type: 'record', keys: c.pricing.plans.map((p) => ({ value: p.id, label: p.name })), valueType: 'text' },
      ],
    },
  ];
}

export function caseStudiesSchema(c: WorkspaceConfig): FieldDef[] {
  return [
    {
      key: 'caseStudies',
      label: 'Case studies / examples',
      type: 'list',
      titleKey: 'client',
      newItem: { slug: 'new-example', client: 'Client', industry: c.industries[0]?.key ?? '', title: '', summary: '', metric: '', metricLabel: '', results: [], services: [], sample: false },
      item: [
        { key: 'client', label: 'Client', type: 'text', half: true },
        { key: 'slug', label: 'Slug', type: 'text', half: true },
        { key: 'industry', label: 'Industry', type: 'select', options: c.industries.map((i) => ({ value: i.key, label: i.label })), half: true },
        { key: 'sample', label: 'Sample (shows a “Sample” label)', type: 'bool', half: true },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'summary', label: 'Summary', type: 'textarea', rows: 2 },
        { key: 'metric', label: 'Headline metric', type: 'text', half: true, placeholder: '+38%' },
        { key: 'metricLabel', label: 'Metric label', type: 'text', half: true },
        { key: 'results', label: 'Results', type: 'lines' },
        { key: 'services', label: 'Related services', type: 'multiselect', options: c.services.map((s) => ({ value: s.slug, label: s.name })) },
      ],
    },
  ];
}

export function testimonialsSchema(c: WorkspaceConfig): FieldDef[] {
  return [
    {
      key: 'testimonials',
      label: 'Testimonials',
      type: 'list',
      titleKey: 'name',
      newItem: { id: `t${Date.now() % 10000}`, name: '', role: '', company: '', industry: '', quote: '', rating: 5, sample: false },
      help: 'Use real client reviews. Placeholders keep the “Sample” label so they are never presented as genuine.',
      item: [
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'id', label: 'Id', type: 'text', half: true },
        { key: 'role', label: 'Role', type: 'text', half: true },
        { key: 'company', label: 'Company', type: 'text', half: true },
        { key: 'industry', label: 'Industry', type: 'select', options: [{ value: '', label: '—' }, ...c.industries.map((i) => ({ value: i.key, label: i.label }))], half: true },
        { key: 'rating', label: 'Rating (1–5)', type: 'number', half: true },
        { key: 'quote', label: 'Quote', type: 'textarea', rows: 3 },
        { key: 'sample', label: 'Sample placeholder', type: 'bool' },
      ],
    },
  ];
}

export function faqSchema(): FieldDef[] {
  return [
    {
      key: 'faq',
      label: 'FAQ',
      type: 'list',
      titleKey: 'q',
      newItem: { id: `faq-${Date.now() % 10000}`, q: '', a: '', category: 'other' },
      item: [
        { key: 'q', label: 'Question', type: 'text' },
        { key: 'a', label: 'Answer', type: 'textarea', rows: 3 },
        { key: 'id', label: 'Id (faq:<id>)', type: 'text', half: true },
        { key: 'category', label: 'Category', type: 'select', options: opts(INTENT_CATEGORIES), half: true },
      ],
    },
  ];
}

export function miscContentSchema(): FieldDef[] {
  return [
    { key: 'logos', label: 'Trust strip items', type: 'lines' },
    {
      key: 'stats',
      label: 'Stats',
      type: 'list',
      titleKey: 'value',
      newItem: { value: '', label: '' },
      item: [
        { key: 'value', label: 'Value', type: 'text', half: true },
        { key: 'label', label: 'Label', type: 'text', half: true },
      ],
    },
    {
      key: 'process',
      label: 'Process steps',
      type: 'list',
      titleKey: 'title',
      newItem: { title: '', text: '' },
      item: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea', rows: 2 },
      ],
    },
    {
      key: 'cta',
      label: 'Call-to-action band',
      type: 'object',
      fields: [
        { key: 'heading', label: 'Heading', type: 'text' },
        { key: 'subheading', label: 'Subheading', type: 'textarea', rows: 2 },
        { key: 'button', label: 'Button', type: 'object', fields: ctaFields },
      ],
    },
    {
      key: 'about',
      label: 'About page',
      type: 'object',
      fields: [
        { key: 'heading', label: 'Heading', type: 'text' },
        { key: 'intro', label: 'Intro', type: 'textarea', rows: 2 },
        { key: 'body', label: 'Body (blank line = new paragraph)', type: 'textarea', rows: 6 },
        {
          key: 'values',
          label: 'Values',
          type: 'list',
          titleKey: 'title',
          newItem: { title: '', text: '' },
          item: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'text', label: 'Text', type: 'textarea', rows: 2 },
          ],
        },
      ],
    },
    {
      key: 'contact',
      label: 'Contact form options',
      type: 'object',
      fields: [
        { key: 'budgets', label: 'Budget options', type: 'lines' },
        { key: 'timelines', label: 'Timeline options', type: 'lines' },
        { key: 'companySizes', label: 'Team size options', type: 'lines' },
        { key: 'successMessage', label: 'Thank-you message', type: 'textarea', rows: 2 },
      ],
    },
    {
      key: 'booking',
      label: 'Consultation booking',
      type: 'object',
      fields: [
        { key: 'heading', label: 'Heading', type: 'text' },
        { key: 'intro', label: 'Intro', type: 'textarea', rows: 2 },
        { key: 'durationMin', label: 'Duration (minutes)', type: 'number', half: true },
        { key: 'meetingType', label: 'Meeting type', type: 'text', half: true },
        { key: 'availability', label: 'Availability', type: 'text' },
      ],
    },
  ];
}

export function assistantSchema(): FieldDef[] {
  return [
    { key: 'name', label: 'Assistant name', type: 'text', half: true },
    { key: 'voice', label: 'Voice', type: 'select', options: VOICES.map((v) => ({ value: v, label: v || 'Default (GEMINI_VOICE)' })), half: true },
    { key: 'greeting', label: 'Greeting', type: 'textarea', rows: 2 },
    { key: 'personality', label: 'Personality & tone', type: 'textarea', rows: 3 },
    { key: 'languages', label: 'Languages (reply in the visitor’s language)', type: 'tags' },
    { key: 'salesScript', label: 'Sales script (the conversation flow)', type: 'textarea', rows: 8 },
    { key: 'qualificationQuestions', label: 'Qualification questions', type: 'lines' },
    { key: 'handoffMessage', label: 'Human hand-over message', type: 'textarea', rows: 2 },
    {
      key: 'knowledgeBase',
      label: 'Knowledge base',
      type: 'list',
      titleKey: 'title',
      newItem: { title: 'New topic', content: '' },
      help: 'Facts the assistant may use (policies, terms, platforms, discounts). Services, pricing and FAQ are included automatically.',
      item: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'content', label: 'Content', type: 'textarea', rows: 5 },
      ],
    },
    {
      key: 'quickPrompts',
      label: 'Suggestion chips',
      type: 'list',
      titleKey: 'label',
      newItem: { label: '💬 New', text: '' },
      max: 8,
      item: [
        { key: 'label', label: 'Chip label', type: 'text', half: true },
        { key: 'text', label: 'Sends', type: 'text', half: true },
      ],
    },
    { key: 'systemPromptExtra', label: 'Additional system instructions (advanced)', type: 'textarea', rows: 4, help: 'Appended to the generated system prompt. See the preview below.' },
  ];
}

export function allowedActionsSchema(): FieldDef[] {
  return [
    {
      key: 'allowedActions',
      label: 'Allowed actions',
      type: 'multiselect',
      options: [...WEBSITE_ACTIONS, ...SUPPORT_ACTIONS].map((a) => ({ value: a, label: `${a} · ${ACTION_LABEL[a]}` })),
      help: 'Only these structured actions are given to the model and executed by the page. get_view_context, read_screen and assistant_panel are always on.',
    },
  ];
}

export function actionsSchema(c: WorkspaceConfig): FieldDef[] {
  return [
    { key: 'highlightColor', label: 'Highlight colour (visual feedback)', type: 'color', half: true },
    {
      key: 'sections',
      label: 'Section identifiers (scroll_to_section targets)',
      type: 'list',
      titleKey: 'id',
      newItem: { id: 'new-section', label: '', page: 'home' },
      help: 'Stable ids of sections the assistant can scroll to, and the page each lives on. Elements carry data-section="<id>".',
      item: [
        { key: 'id', label: 'Section id', type: 'text', half: true },
        { key: 'page', label: 'Page', type: 'select', options: opts(PAGE_KEYS), half: true },
        { key: 'label', label: 'Description for the assistant', type: 'text' },
      ],
    },
    {
      key: 'mappings',
      label: 'Custom phrase → action mappings',
      type: 'list',
      titleKey: 'phrase',
      newItem: { phrase: '', action: 'scroll_to_section', target: '' },
      help: 'Teach the assistant site-specific commands, e.g. “see the demo” → scroll_to_section(hero).',
      item: [
        { key: 'phrase', label: 'Visitor says (examples)', type: 'text' },
        { key: 'action', label: 'Action', type: 'select', options: [...WEBSITE_ACTIONS, ...SUPPORT_ACTIONS].map((a) => ({ value: a, label: a })), half: true },
        { key: 'target', label: 'Target (section / page / item / label)', type: 'text', half: true, help: `Item ids: plan:<id> (${c.pricing.plans.map((p) => p.id).join(', ')}), service:<slug>, case:<slug>, testimonial:<id>, faq:<id>, step:<n>` },
      ],
    },
  ];
}

export function crmSchema(): FieldDef[] {
  return [
    {
      key: 'stages',
      label: 'Pipeline stages',
      type: 'list',
      titleKey: 'label',
      newItem: { key: 'new_stage', label: 'New stage', probability: 50, color: '#64748b', kind: 'open' },
      help: 'Order = pipeline order. Needs exactly one “won” and one “lost” stage. Keys are stored on leads — renaming a key orphans existing leads.',
      item: [
        { key: 'label', label: 'Label', type: 'text', half: true },
        { key: 'key', label: 'Key', type: 'text', half: true },
        { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }], half: true },
        { key: 'probability', label: 'Win probability %', type: 'number', half: true },
        { key: 'color', label: 'Colour', type: 'color', half: true },
      ],
    },
    { key: 'sources', label: 'Lead sources', type: 'tags' },
    { key: 'customerTypes', label: 'Customer types', type: 'tags' },
    {
      key: 'customFields',
      label: 'Custom lead fields',
      type: 'list',
      titleKey: 'label',
      newItem: { key: 'new_field', label: 'New field', type: 'text' },
      item: [
        { key: 'label', label: 'Label', type: 'text', half: true },
        { key: 'key', label: 'Key', type: 'text', half: true },
        { key: 'type', label: 'Type', type: 'select', options: opts(['text', 'number', 'select', 'date']), half: true },
        { key: 'options', label: 'Options (for select)', type: 'tags' },
      ],
    },
    { key: 'assignment', label: 'New lead assignment', type: 'select', options: [{ value: 'round_robin', label: 'Round-robin across active sales reps' }, { value: 'manual', label: 'Leave unassigned' }], half: true },
    { key: 'followUpHours', label: 'First follow-up due after (hours)', type: 'number', half: true },
    { key: 'autoQualify', label: 'Move New/Contacted leads to “Qualified” when they reach the qualified score', type: 'bool' },
  ];
}

export function scoringSchema(): FieldDef[] {
  return [
    { key: 'qualifiedThreshold', label: 'Qualified at score', type: 'number', half: true },
    { key: 'highIntentThreshold', label: 'High-intent (hot) at score', type: 'number', half: true },
    { key: 'highBudgetMin', label: '“High budget” when the stated budget reaches', type: 'number', half: true },
    { key: 'points', label: 'Points per signal (score is capped at 100)', type: 'record', keys: SCORE_SIGNALS.map((s) => ({ value: s, label: SIGNAL_LABELS[s] })), valueType: 'number' },
  ];
}

export function analyticsSchema(): FieldDef[] {
  return [
    {
      key: 'events',
      label: 'Tracked events',
      type: 'list',
      titleKey: 'label',
      newItem: { key: 'custom_event', label: 'Custom event', enabled: true },
      help: 'Disabled events are not stored. Custom keys can be sent by your own scripts to /api/events (types section_view, cta_click, engagement, action).',
      item: [
        { key: 'label', label: 'Label', type: 'text', half: true },
        { key: 'key', label: 'Event type', type: 'text', half: true },
        { key: 'enabled', label: 'Enabled', type: 'bool' },
      ],
    },
    { key: 'retentionDays', label: 'Keep raw events for (days)', type: 'number', half: true },
  ];
}

export function integrationsSchema(): FieldDef[] {
  return [
    { key: 'notifyEmails', label: 'Extra notification emails', type: 'tags', help: 'In addition to SALES_NOTIFY_EMAIL / ADMIN_EMAIL.' },
    {
      key: 'webhooks',
      label: 'Webhooks',
      type: 'list',
      titleKey: 'name',
      newItem: { id: `wh_${Date.now().toString(36)}`, name: 'New webhook', url: 'https://', events: ['lead.created'], secret: '', enabled: true },
      help: 'POST JSON {event, workspace, sent_at, data}. Signed with X-Webhook-Signature: sha256=HMAC(secret, body). Works with Zapier, Make, n8n, HubSpot/Zoho via middleware, Google Sheets scripts.',
      item: [
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'id', label: 'Id', type: 'text', half: true },
        { key: 'url', label: 'URL (https)', type: 'url' },
        { key: 'secret', label: 'Signing secret', type: 'password', half: true },
        { key: 'enabled', label: 'Enabled', type: 'bool', half: true },
        { key: 'events', label: 'Events', type: 'multiselect', options: [{ value: '*', label: 'All events' }, ...WEBHOOK_EVENTS.map((e) => ({ value: e, label: e }))] },
      ],
    },
  ];
}

export function featuresSchema(): FieldDef[] {
  const f: [string, string, string][] = [
    ['voice', 'Voice assistant', 'Gemini Live voice with website control'],
    ['textChat', 'Text chat', 'Same assistant and actions over text'],
    ['booking', 'Consultation booking', 'Booking popup, /book page and request_booking'],
    ['handoff', 'Human hand-over', 'request_human_handoff + team notification'],
    ['whatsappHandoff', 'WhatsApp button on hand-over', 'Needs a WhatsApp number'],
    ['compare', 'Compare plans/services', 'Compare popup and compare_items'],
    ['announcementBar', 'Announcement bar', 'Thin banner above the header'],
    ['demoContentNotice', 'Label sample content', 'Footer note when sample testimonials / case studies are shown'],
    ['autoOpenAssistant', 'Open chat automatically', 'Opens the text chat once per visit after ~9 s'],
  ];
  return f.map(([key, label, help]) => ({ key, label, help, type: 'bool' as const }));
}

export function environmentsSchema(): FieldDef[] {
  const keys = ['voice', 'textChat', 'booking', 'handoff', 'whatsappHandoff', 'compare', 'announcementBar', 'demoContentNotice', 'autoOpenAssistant'];
  return (['production', 'preview', 'development'] as const).map((env) => ({
    key: env,
    label: `${labelize(env)} overrides`,
    type: 'json' as const,
    rows: 4,
    help: `Feature values that differ in ${env}, e.g. {"voice": false}. Keys: ${keys.join(', ')}. Environment = VERCEL_ENV or NODE_ENV.`,
  }));
}
