// Workspace configuration: everything that makes one client's site + assistant + CRM different.
// Shared by server and client code (no secrets here). Edited in the Developer Control Center.

export const SECTION_IDS = ['hero', 'logos', 'services', 'process', 'work', 'pricing', 'stats', 'testimonials', 'faq', 'cta', 'contact'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const PAGE_KEYS = ['home', 'services', 'pricing', 'work', 'about', 'contact', 'book'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/** Structured website actions the assistant may use (brief §6), plus assistant/CRM tools. */
export const WEBSITE_ACTIONS = [
  'navigate_page',
  'scroll_to_section',
  'scroll_up',
  'scroll_down',
  'click_element',
  'highlight_element',
  'open_modal',
  'close_modal',
  'open_menu',
  'select_tab',
  'filter_content',
  'search_content',
  'fill_form',
  'submit_lead',
  'request_booking',
  'read_content',
  'compare_items',
] as const;
export const SUPPORT_ACTIONS = ['get_view_context', 'read_screen', 'go_back', 'qualify_lead', 'record_intent', 'request_human_handoff', 'assistant_panel'] as const;
export type WebsiteAction = (typeof WEBSITE_ACTIONS)[number];
export type SupportAction = (typeof SUPPORT_ACTIONS)[number];
export type ActionName = WebsiteAction | SupportAction;
/** Always available: the assistant can't work safely without them. */
export const REQUIRED_ACTIONS: ActionName[] = ['get_view_context', 'read_screen', 'assistant_panel'];

export const MODALS = ['booking', 'contact', 'compare', 'service'] as const;
export type ModalKind = (typeof MODALS)[number];

export const INTENT_CATEGORIES = ['pricing', 'services', 'booking', 'support', 'timeline', 'portfolio', 'technical', 'comparison', 'contact', 'other'] as const;
export type IntentCategory = (typeof INTENT_CATEGORIES)[number];

/** Signals the scoring engine understands (points per signal are configured per workspace). */
export const SCORE_SIGNALS = [
  'has_email',
  'has_phone',
  'has_company',
  'service_selected',
  'requirements_detailed',
  'budget_known',
  'budget_high',
  'timeline_urgent',
  'timeline_soon',
  'decision_maker',
  'intent_high',
  'intent_medium',
  'booking_requested',
  'engaged_voice',
  'returning_visitor',
] as const;
export type ScoreSignal = (typeof SCORE_SIGNALS)[number];

export interface Cta {
  label: string;
  /** booking = open booking modal, contact = scroll to contact, href = link */
  action: 'booking' | 'contact' | 'href';
  href?: string;
}

export interface SectionText {
  enabled: boolean;
  eyebrow?: string;
  heading: string;
  subheading?: string;
  /** Entrance animation */
  animation?: 'fade' | 'none';
}

export interface Service {
  slug: string;
  name: string;
  icon: string;
  category: string;
  summary: string;
  description: string;
  industries: string[];
  startingPrice: number;
  priceUnit: string;
  timeline: string;
  features: string[];
  popular?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  /** Monthly price; 0 = custom / contact us */
  monthly: number;
  setupFee: number;
  bestFor: string;
  features: string[];
  highlighted?: boolean;
  ctaLabel: string;
}

export interface CaseStudy {
  slug: string;
  client: string;
  industry: string;
  title: string;
  summary: string;
  metric: string;
  metricLabel: string;
  results: string[];
  services: string[];
  sample?: boolean;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  industry: string;
  quote: string;
  rating: number;
  sample?: boolean;
}

export interface Faq {
  id: string;
  q: string;
  a: string;
  category: string;
}

export interface Stage {
  key: string;
  label: string;
  /** Win probability 0–100 for weighted pipeline value */
  probability: number;
  color: string;
  kind: 'open' | 'won' | 'lost';
}

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: string[];
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
}

export interface ActionMapping {
  /** What the visitor might say, e.g. "see the demo" */
  phrase: string;
  action: ActionName;
  /** Target for the action: section id, page key, modal, element label or data-item id */
  target: string;
}

export interface Features {
  voice: boolean;
  textChat: boolean;
  booking: boolean;
  handoff: boolean;
  compare: boolean;
  whatsappHandoff: boolean;
  announcementBar: boolean;
  demoContentNotice: boolean;
  autoOpenAssistant: boolean;
}

export interface WorkspaceConfig {
  version: 1;
  brand: {
    name: string;
    tagline: string;
    logoText: string;
    logoUrl: string;
    colors: { brand: string; brand2: string; accent: string; bg: string; surface: string; ink: string };
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    hours: string;
    social: { linkedin: string; instagram: string; facebook: string; x: string; youtube: string };
  };
  seo: { title: string; description: string };
  announcement: { text: string; ctaLabel: string; href: string };
  pages: { key: PageKey; label: string; path: string; enabled: boolean; inNav: boolean }[];
  homeOrder: SectionId[];
  sections: Record<SectionId, SectionText>;
  hero: {
    eyebrow: string;
    heading: string;
    highlight: string;
    subheading: string;
    primaryCta: Cta;
    secondaryCta: Cta;
    bullets: string[];
    media: 'illustration' | 'image' | 'video';
    mediaUrl: string;
  };
  logos: string[];
  industries: { key: string; label: string }[];
  services: Service[];
  process: { title: string; text: string }[];
  pricing: { currency: string; annualDiscountPct: number; plans: Plan[]; comparison: { feature: string; values: Record<string, string> }[]; note: string };
  caseStudies: CaseStudy[];
  stats: { value: string; label: string }[];
  testimonials: Testimonial[];
  faq: Faq[];
  cta: { heading: string; subheading: string; button: Cta };
  about: { heading: string; intro: string; body: string; values: { title: string; text: string }[] };
  contact: { budgets: string[]; timelines: string[]; companySizes: string[]; successMessage: string };
  booking: { heading: string; intro: string; durationMin: number; availability: string; meetingType: string };
  assistant: {
    name: string;
    voice: string;
    greeting: string;
    personality: string;
    languages: string[];
    allowedActions: ActionName[];
    systemPromptExtra: string;
    salesScript: string;
    qualificationQuestions: string[];
    knowledgeBase: { title: string; content: string }[];
    handoffMessage: string;
    quickPrompts: { label: string; text: string }[];
  };
  scoring: { qualifiedThreshold: number; highIntentThreshold: number; points: Record<ScoreSignal, number>; highBudgetMin: number };
  crm: {
    stages: Stage[];
    sources: string[];
    customerTypes: string[];
    customFields: CustomField[];
    assignment: 'round_robin' | 'manual';
    followUpHours: number;
    autoQualify: boolean;
  };
  actions: {
    sections: { id: string; label: string; page: PageKey }[];
    mappings: ActionMapping[];
    highlightColor: string;
  };
  analytics: { events: { key: string; label: string; enabled: boolean }[]; retentionDays: number };
  integrations: { webhooks: Webhook[]; notifyEmails: string[] };
  features: Features;
  /** Feature overrides per deployment environment (Vercel env or NODE_ENV). */
  environments: Record<'production' | 'preview' | 'development', Partial<Features>>;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'archived';
  updated_at: number;
}

/** Visitor-facing subset (no webhook secrets, prompts or internal rules) sent to the browser. */
export type PublicWorkspace = Omit<WorkspaceConfig, 'integrations' | 'scoring' | 'crm' | 'assistant' | 'analytics' | 'environments'> & {
  id: string;
  assistant: Pick<WorkspaceConfig['assistant'], 'name' | 'greeting' | 'languages' | 'quickPrompts' | 'allowedActions'>;
  analyticsEvents: string[];
};
