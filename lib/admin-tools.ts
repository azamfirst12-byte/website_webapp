// Function declarations for the admin (CRM) copilot — voice and text use the same set.
// Plain JSON schema with Gemini's type names, so this file is safe on server and client.
// "page" tools run in the browser (navigate, read and operate the admin screens);
// every other tool runs on the server for the signed-in staff member, with their permissions.

type Schema = { type: 'OBJECT' | 'STRING' | 'BOOLEAN' | 'INTEGER' | 'NUMBER' | 'ARRAY'; description?: string; enum?: string[]; properties?: Record<string, Schema>; items?: Schema; required?: string[] };
export interface AdminToolDef {
  name: string;
  description: string;
  parameters: Schema;
}

const str = (description: string, e?: readonly string[]): Schema => ({ type: 'STRING', description, ...(e && e.length ? { enum: [...e] } : {}) });
const int = (description: string): Schema => ({ type: 'INTEGER', description });
const numb = (description: string): Schema => ({ type: 'NUMBER', description });
const bool = (description: string): Schema => ({ type: 'BOOLEAN', description });
const obj = (properties: Record<string, Schema>, required?: string[]): Schema => ({ type: 'OBJECT', properties, ...(required ? { required } : {}) });

export const ADMIN_PAGES = ['dashboard', 'leads', 'new_lead', 'pipeline', 'conversations', 'appointments', 'tasks', 'reports', 'notifications', 'team', 'account'] as const;
export type AdminPage = (typeof ADMIN_PAGES)[number];
export const ADMIN_PAGE_PATH: Record<AdminPage, string> = {
  dashboard: '/admin',
  leads: '/admin/leads',
  new_lead: '/admin/leads/new',
  pipeline: '/admin/pipeline',
  conversations: '/admin/conversations',
  appointments: '/admin/appointments',
  tasks: '/admin/tasks',
  reports: '/admin/reports',
  notifications: '/admin/notifications',
  team: '/admin/team',
  account: '/admin/account',
};

const RANGE = ['7d', '30d', '90d', '365d'] as const;
const TASK_TYPES = ['follow_up', 'call', 'email', 'meeting', 'reminder'] as const;
const APPT_STATUS = ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;

/** Tools executed in the browser. */
export const PAGE_TOOLS = new Set([
  'open_admin_page',
  'open_record',
  'read_screen',
  'read_page',
  'click_element',
  'fill_field',
  'select_option',
  'scroll_page',
  'go_back',
  'refresh_page',
  'assistant_panel',
]);

/** Server tools that change CRM data (the open page is refreshed after them). */
export const WRITE_TOOLS = new Set(['update_lead', 'change_stage', 'assign_lead', 'add_note', 'create_lead', 'create_task', 'complete_task', 'update_appointment']);

export function adminToolDefs(stages: string[], services: string[]): AdminToolDef[] {
  return [
    // ── page control (browser)
    {
      name: 'open_admin_page',
      description:
        'Open an admin page, optionally with list filters. leads: query, stage, band (hot|qualified|warm|cold), assigned (me|unassigned), sort (recent|score|value|follow_up). tasks: scope (mine|all|overdue|done). appointments: status (upcoming|requested|confirmed|completed|cancelled|all). conversations: channel (voice|text), query. reports: range.',
      parameters: obj(
        {
          page: str('Page to open', ADMIN_PAGES),
          query: str('Search text (leads, conversations)'),
          stage: str('Lead stage filter', stages),
          band: str('Lead score band', ['hot', 'qualified', 'warm', 'cold']),
          assigned: str('Owner filter', ['me', 'unassigned']),
          sort: str('Lead sort', ['recent', 'score', 'value', 'follow_up']),
          scope: str('Tasks tab', ['mine', 'all', 'overdue', 'done']),
          status: str('Appointments tab', ['upcoming', ...APPT_STATUS, 'all']),
          channel: str('Conversations channel', ['voice', 'text']),
          range: str('Reports date range', RANGE),
        },
        ['page'],
      ),
    },
    {
      name: 'open_record',
      description: 'Open one record\'s detail page: a lead (numeric id) or a conversation (id from find tools).',
      parameters: obj({ type: str('Record type', ['lead', 'conversation']), id: str('Record id') }, ['type', 'id']),
    },
    {
      name: 'read_screen',
      description: 'List the buttons, links, inputs and dropdowns visible on the admin page right now, each with an id (e1, e2…) for click_element / fill_field / select_option. Optional filter text.',
      parameters: obj({ filter: str('Only elements whose label contains this') }),
    },
    { name: 'read_page', description: 'Read the visible text of the current admin page (what the user is looking at).', parameters: obj({}) },
    { name: 'click_element', description: 'Click a button, link or tab by id from read_screen or by its visible label.', parameters: obj({ target: str('Element id like "e12", or the visible label') }, ['target']) },
    {
      name: 'fill_field',
      description: 'Type into an input or textarea on the page (by id or label). Set submit=true to press Enter afterwards.',
      parameters: obj({ target: str('Element id or label'), value: str('Text to enter'), submit: bool('Press Enter after typing') }, ['target', 'value']),
    },
    { name: 'select_option', description: 'Choose an option in a dropdown on the page (by id or label).', parameters: obj({ target: str('Element id or label'), option: str('Option text') }, ['target', 'option']) },
    { name: 'scroll_page', description: 'Scroll the admin page.', parameters: obj({ direction: str('Direction', ['up', 'down', 'top', 'bottom']) }, ['direction']) },
    { name: 'go_back', description: 'Go back to the previous admin page.', parameters: obj({}) },
    { name: 'refresh_page', description: 'Reload the data on the current page.', parameters: obj({}) },
    { name: 'assistant_panel', description: 'Control your own chat panel.', parameters: obj({ action: str('Action', ['minimize', 'expand', 'mute_mic', 'unmute_mic', 'clear_chat']) }, ['action']) },

    // ── CRM data (server)
    {
      name: 'crm_overview',
      description: 'Headline numbers for a period: leads, qualified, won/lost, won value, pipeline value, conversations, follow-up completion, plus what needs attention now (new leads today, overdue tasks, pending consultation requests).',
      parameters: obj({ range: str('Period (default 30d)', RANGE) }),
    },
    {
      name: 'find_leads',
      description: 'Search and list leads the user can see. Use for "show my hot leads", "who is in negotiation", "find Azam", "leads needing follow-up".',
      parameters: obj({
        query: str('Name, email, phone, company or requirement text'),
        stage: str('Stage', stages),
        band: str('Score band', ['hot', 'qualified', 'warm', 'cold']),
        assigned: str('Owner: "me", "unassigned", or a staff name'),
        sort: str('Sort', ['recent', 'score', 'value', 'follow_up']),
        open_only: bool('Only open (not won/lost) leads'),
        limit: int('Max results (default 10, max 25)'),
      }),
    },
    {
      name: 'get_lead',
      description: 'Full detail of one lead: contact, company, service, budget, timeline, score, stage, value, owner, AI summary, next action, recent timeline, open tasks and consultations. Pass lead_id, or name to look it up.',
      parameters: obj({ lead_id: int('Lead id'), name: str('Lead name/email if the id is unknown') }),
    },
    {
      name: 'create_lead',
      description: 'Create a new lead manually (after confirming the details with the user).',
      parameters: obj(
        {
          name: str('Full name'),
          email: str('Email'),
          phone: str('Phone'),
          company: str('Company'),
          service: str('Service of interest', services),
          requirements: str('What they need'),
          budget: str('Budget'),
          timeline: str('Timeline'),
          value: numb('Deal value'),
          source: str('Lead source (default manual)'),
        },
        ['name'],
      ),
    },
    {
      name: 'update_lead',
      description: 'Change fields of a lead. Only pass the fields to change.',
      parameters: obj(
        {
          lead_id: int('Lead id'),
          name: str('Name'),
          email: str('Email'),
          phone: str('Phone'),
          company: str('Company'),
          industry: str('Industry'),
          interested_service: str('Service', services),
          requirements: str('Requirements'),
          budget: str('Budget'),
          timeline: str('Timeline'),
          value: numb('Deal value'),
          next_action: str('Next action'),
          next_follow_up: str('Next follow-up date/time "YYYY-MM-DDTHH:MM" in the business time zone, or "none"'),
        },
        ['lead_id'],
      ),
    },
    {
      name: 'change_stage',
      description: 'Move a lead to another pipeline stage. Ask for a reason when marking it lost.',
      parameters: obj({ lead_id: int('Lead id'), stage: str('New stage', stages), lost_reason: str('Why it was lost') }, ['lead_id', 'stage']),
    },
    {
      name: 'assign_lead',
      description: 'Assign a lead to a staff member ("me", a name or username) or "unassigned".',
      parameters: obj({ lead_id: int('Lead id'), assignee: str('Who') }, ['lead_id', 'assignee']),
    },
    {
      name: 'add_note',
      description: 'Add a note to a lead, or log a call / email / meeting.',
      parameters: obj({ lead_id: int('Lead id'), text: str('Note text'), kind: str('Kind', ['note', 'call', 'email', 'meeting']) }, ['lead_id', 'text']),
    },
    {
      name: 'create_task',
      description: 'Create a follow-up task, optionally for a lead, with a due time.',
      parameters: obj(
        {
          title: str('Task title'),
          lead_id: int('Lead id (optional)'),
          due: str('Due "YYYY-MM-DDTHH:MM" in the business time zone'),
          type: str('Type', TASK_TYPES),
          priority: str('Priority', ['low', 'normal', 'high']),
          assignee: str('"me" (default) or a staff name — managers only'),
        },
        ['title'],
      ),
    },
    { name: 'list_tasks', description: 'List tasks: mine (default), all, overdue or done; optionally for one lead.', parameters: obj({ scope: str('Scope', ['mine', 'all', 'overdue', 'done']), lead_id: int('Lead id') }) },
    { name: 'complete_task', description: 'Mark a task done (or reopen it with done=false).', parameters: obj({ task_id: int('Task id'), done: bool('Done (default true)') }, ['task_id']) },
    {
      name: 'list_appointments',
      description: 'List consultations/appointments: upcoming (default), requested, confirmed, completed, cancelled or all.',
      parameters: obj({ status: str('Status', ['upcoming', ...APPT_STATUS, 'all']) }),
    },
    {
      name: 'update_appointment',
      description: 'Confirm, reschedule, complete or cancel a consultation; set the meeting link or notes.',
      parameters: obj(
        {
          appointment_id: int('Appointment id'),
          status: str('New status', APPT_STATUS),
          scheduled_at: str('Scheduled time "YYYY-MM-DDTHH:MM" in the business time zone'),
          meeting_link: str('Meeting link'),
          notes: str('Notes'),
        },
        ['appointment_id'],
      ),
    },
    {
      name: 'find_conversations',
      description: 'List recent AI website conversations (voice/text) with intent and outcome.',
      parameters: obj({ channel: str('Channel', ['voice', 'text']), outcome: str('Outcome', ['booking_requested', 'lead_captured', 'handoff', 'information', 'no_engagement']), query: str('Search text'), limit: int('Max (default 10)') }),
    },
    { name: 'get_conversation', description: 'AI summary, intent, outcome and the first part of the transcript of one website conversation.', parameters: obj({ conversation_id: str('Conversation id') }, ['conversation_id']) },
    {
      name: 'sales_report',
      description: 'Breakdown for a period: by lead source, by service, by sales rep, voice vs text, or pipeline by stage.',
      parameters: obj({ breakdown: str('Breakdown', ['source', 'service', 'rep', 'channel', 'pipeline']), range: str('Period (default 30d)', RANGE) }, ['breakdown']),
    },
    { name: 'list_team', description: 'Staff members who can own leads (for assignment).', parameters: obj({}) },
  ];
}

/** Friendly labels for the action lines in the chat panel. */
export const ADMIN_TOOL_LABEL: Record<string, string> = {
  open_admin_page: 'Opening page',
  open_record: 'Opening record',
  read_screen: 'Reading the screen',
  read_page: 'Reading the page',
  click_element: 'Clicking',
  fill_field: 'Typing',
  select_option: 'Choosing',
  scroll_page: 'Scrolling',
  go_back: 'Going back',
  refresh_page: 'Refreshing',
  assistant_panel: 'Panel',
  crm_overview: 'Checking the numbers',
  find_leads: 'Searching leads',
  get_lead: 'Looking up lead',
  create_lead: 'Creating lead',
  update_lead: 'Updating lead',
  change_stage: 'Moving stage',
  assign_lead: 'Assigning lead',
  add_note: 'Adding note',
  create_task: 'Creating task',
  list_tasks: 'Checking tasks',
  complete_task: 'Updating task',
  list_appointments: 'Checking consultations',
  update_appointment: 'Updating consultation',
  find_conversations: 'Searching conversations',
  get_conversation: 'Reading conversation',
  sales_report: 'Building report',
  list_team: 'Checking the team',
};

/** Bookkeeping reads that are saved but not shown as action lines. */
export const QUIET_TOOLS = new Set(['read_screen', 'read_page']);
