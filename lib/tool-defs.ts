// Function declarations for the assistant (Gemini Live + text chat use the same set).
// Plain JSON schema with Gemini's type names, so this file is safe on server and client.
import { INTENT_CATEGORIES, MODALS, type ActionName, type WorkspaceConfig } from './workspace-types';

type Schema = { type: 'OBJECT' | 'STRING' | 'BOOLEAN' | 'INTEGER' | 'NUMBER' | 'ARRAY'; description?: string; enum?: string[]; properties?: Record<string, Schema>; items?: Schema; required?: string[] };
export interface ToolDef {
  name: ActionName;
  description: string;
  parameters: Schema;
}

const str = (description: string, e?: readonly string[]): Schema => ({ type: 'STRING', description, ...(e && e.length ? { enum: [...e] } : {}) });
const bool = (description: string): Schema => ({ type: 'BOOLEAN', description });
const obj = (properties: Record<string, Schema>, required?: string[]): Schema => ({ type: 'OBJECT', properties, ...(required ? { required } : {}) });
const arr = (description: string, items: Schema = { type: 'STRING' }): Schema => ({ type: 'ARRAY', description, items });

const CONTACT_FIELDS = {
  name: str('Full name'),
  email: str('Email address, exactly as confirmed with the visitor'),
  phone: str('Phone / WhatsApp number with country code'),
  company: str('Company or business name'),
};

export function toolDefs(c: WorkspaceConfig): ToolDef[] {
  const pages = c.pages.filter((p) => p.enabled).map((p) => p.key);
  const sections = [...new Set([...c.actions.sections.map((s) => s.id), ...c.homeOrder])];
  const services = c.services.map((s) => s.slug);
  const industries = c.industries.map((i) => i.key);
  return [
    {
      name: 'navigate_page',
      description: 'Open a page of the website. Use page="service" with a service slug to open one service in detail.',
      parameters: obj({ page: str('Page to open', [...pages, 'service']), slug: str('Service slug when page="service"', services) }, ['page']),
    },
    {
      name: 'scroll_to_section',
      description: 'Smoothly scroll to a section (navigates to the page that holds it first) and briefly highlight it.',
      parameters: obj({ section: str('Stable section identifier', sections) }, ['section']),
    },
    { name: 'scroll_up', description: 'Scroll the page up.', parameters: obj({ amount: str('How far', ['little', 'page', 'top']) }) },
    { name: 'scroll_down', description: 'Scroll the page down.', parameters: obj({ amount: str('How far', ['little', 'page', 'bottom']) }) },
    {
      name: 'click_element',
      description: 'Click a configured button, link, tab, accordion or call-to-action, by element id from read_screen or by its visible label.',
      parameters: obj({ target: str('Element id like "e12", or the visible label') }, ['target']),
    },
    {
      name: 'highlight_element',
      description:
        'Scroll to and visually highlight an item or section so the visitor sees what you are talking about. Targets: item ids from get_view_context (e.g. "plan:growth", "service:ecommerce-store", "case:harbor-realty", "testimonial:t2", "faq:faq-cost"), a section id, or a visible label.',
      parameters: obj({ target: str('Item id, section id or label') }, ['target']),
    },
    {
      name: 'open_modal',
      description: 'Open a popup: booking (consultation request form), contact (contact form), compare (side-by-side comparison), service (quick view of one service).',
      parameters: obj({ modal: str('Popup to open', MODALS), item: str('Service slug for modal="service"') }, ['modal']),
    },
    { name: 'close_modal', description: 'Close the open popup or menu.', parameters: obj({}) },
    { name: 'open_menu', description: 'Open the navigation menu (main) or the Services submenu.', parameters: obj({ menu: str('Menu', ['main', 'services']) }, ['menu']) },
    {
      name: 'select_tab',
      description: 'Switch a tab group, e.g. group="billing" tab="annual"|"monthly" on pricing, or group="category" tab="AI" on services.',
      parameters: obj({ group: str('Tab group', ['billing', 'category']), tab: str('Tab to select') }, ['group', 'tab']),
    },
    {
      name: 'filter_content',
      description: 'Filter services or work examples by industry (e.g. "show only services for e-commerce businesses"). Use industry="all" to clear.',
      parameters: obj({ collection: str('What to filter', ['services', 'work']), industry: str('Industry key', [...industries, 'all']) }, ['collection', 'industry']),
    },
    {
      name: 'search_content',
      description: 'Search services, FAQs and examples on the site and show matching results on screen.',
      parameters: obj({ query: str('Search words'), collection: str('Where to search', ['services', 'faq', 'work', 'all']) }, ['query']),
    },
    {
      name: 'fill_form',
      description: 'Fill fields of the contact or booking form on screen with details the visitor said (opens the form if needed). Does NOT submit.',
      parameters: obj(
        {
          form: str('Form', ['contact', 'booking']),
          fields: obj({
            ...CONTACT_FIELDS,
            message: str('What they need, in their words'),
            service: str('Service slug', services),
            budget: str('Budget range'),
            timeline: str('Timeline'),
            company_size: str('Team size'),
            preferred_time: str('Preferred meeting day/time'),
          }),
        },
        ['form', 'fields'],
      ),
    },
    {
      name: 'submit_lead',
      description:
        'Save or update the visitor as a lead in the CRM. Only after the visitor agreed to share their details / be contacted. Pass everything you know; missing fields can be sent later.',
      parameters: obj(
        {
          ...CONTACT_FIELDS,
          industry: str('Industry of their business'),
          service: str('Service slug they are most interested in', services),
          requirements: str('What they need, concisely, in English'),
          budget: str('Budget as stated'),
          timeline: str('When they want to start / launch'),
          company_size: str('Team size'),
          decision_maker: bool('Whether they decide on the purchase'),
          consent: bool('true when the visitor agreed to be contacted'),
        },
        ['consent'],
      ),
    },
    {
      name: 'request_booking',
      description: 'Request a consultation for the visitor. Needs their name and an email or phone (pass them here if not saved yet) and a preferred time.',
      parameters: obj({ ...CONTACT_FIELDS, preferred_time: str('Preferred day and time, as the visitor said it'), service: str('Service slug', services), notes: str('Anything the team should know') }, [
        'preferred_time',
      ]),
    },
    {
      name: 'read_content',
      description: 'Read the text currently visible on screen (scope="visible"), a whole section, the page, or one item — to answer "what am I looking at?" or "tell me more about this".',
      parameters: obj({ scope: str('What to read', ['visible', 'section', 'page', 'item']), target: str('Section id or item id for scope section/item') }, ['scope']),
    },
    {
      name: 'compare_items',
      description: 'Show a side-by-side comparison of plans or services and return their details. With no items, compares the items currently visible.',
      parameters: obj({ kind: str('What to compare', ['plans', 'services']), items: arr('Plan ids or service slugs (2-4)') }),
    },
    {
      name: 'get_view_context',
      description:
        'What the visitor is looking at right now: page, section in view, open popup, active filters/tabs, form values, and the visible items in reading order (first, second, third…). Call it whenever they say "this", "these", "the second one", "which is better".',
      parameters: obj({}),
    },
    {
      name: 'read_screen',
      description: 'List clickable elements, fields and tabs visible now, each with an id for click_element. Use when no dedicated action fits.',
      parameters: obj({ filter: str('Optional word to narrow the list') }),
    },
    { name: 'go_back', description: 'Go back to the previous page or section.', parameters: obj({}) },
    {
      name: 'qualify_lead',
      description: 'Record qualification answers as you learn them (call again as you learn more). Also set your judgement of buying intent.',
      parameters: obj({
        industry: str('Their industry'),
        company_size: str('Team size'),
        budget: str('Budget as stated'),
        timeline: str('Timeline as stated'),
        needs: str('Main need / goal, concise'),
        service: str('Best-matching service slug', services),
        decision_maker: bool('Decision maker?'),
        intent_level: str('Buying intent', ['low', 'medium', 'high']),
        customer_type: str('Customer type', c.crm.customerTypes),
      }),
    },
    {
      name: 'record_intent',
      description: "Log the visitor's question/intent category for analytics (once per distinct question).",
      parameters: obj({ category: str('Intent category', INTENT_CATEGORIES), question: str('The question, short, in English') }, ['category']),
    },
    {
      name: 'request_human_handoff',
      description: 'Hand the conversation to a human (visitor asks for a person, is frustrated, or needs something you cannot do). Notifies the sales team.',
      parameters: obj({ reason: str('Why'), urgency: str('Urgency', ['low', 'normal', 'high']) }, ['reason']),
    },
    {
      name: 'assistant_panel',
      description: 'Control your own chat panel: minimize (keep listening), expand, mute_mic, unmute_mic, clear_chat.',
      parameters: obj({ action: str('Action', ['minimize', 'expand', 'mute_mic', 'unmute_mic', 'clear_chat']) }, ['action']),
    },
  ];
}

export const ACTION_LABEL: Record<ActionName, string> = {
  navigate_page: 'Opening page',
  scroll_to_section: 'Scrolling to section',
  scroll_up: 'Scrolling up',
  scroll_down: 'Scrolling down',
  click_element: 'Clicking',
  highlight_element: 'Highlighting',
  open_modal: 'Opening',
  close_modal: 'Closing popup',
  open_menu: 'Opening menu',
  select_tab: 'Switching tab',
  filter_content: 'Filtering',
  search_content: 'Searching',
  fill_form: 'Filling the form',
  submit_lead: 'Saving your details',
  request_booking: 'Requesting consultation',
  read_content: 'Reading the screen',
  compare_items: 'Comparing',
  get_view_context: 'Looking at the screen',
  read_screen: 'Looking at the screen',
  go_back: 'Going back',
  qualify_lead: 'Noting your needs',
  record_intent: 'Noting your question',
  request_human_handoff: 'Contacting the team',
  assistant_panel: 'Adjusting chat',
};

/** Actions that are bookkeeping, not visible website control (excluded from "voice command" counts). */
export const SILENT_ACTIONS: ActionName[] = ['get_view_context', 'read_screen', 'qualify_lead', 'record_intent', 'read_content'];
