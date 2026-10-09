# website_webapp — AI voice-controlled business web app

A reusable platform that turns a traditional business website into an AI-enabled web app. Visitors **talk to the website** (or chat). An AI sales assistant **controls the page** through a safe action layer, **qualifies and scores** the visitor, **captures the lead with consent**, **requests a consultation** and writes a **conversation summary + next action into the CRM**. The sales team works in **/admin**. Technical setup lives in a separate **/developer** control center.

```
Talk → Navigate → Discover → Engage → Qualify → Capture → CRM → Follow-up → Convert → Analyze
```

The demo workspace is **Xynex Vision** (an AI web studio). A second template, **BrightSmile Dental**, shows how the same platform is reused for another industry.

> **Build status.** This project is based on your Ridgeline app (Postgres layer, Gemini Live engine, screen control, admin auth, charts, PWA). The package registry was blocked where this was produced, so the project was checked against type stubs rather than a real `next build`. What was run and verified:
> - The Postgres schema, first-run seed, demo data, CRM logic, every report query and the public API handlers against PostgreSQL 16.
> - Every admin and developer page's data loading, for each role.
> - The voice/text action layer in headless Chromium, with a scripted Live session.
>
> Run `npm install && npm run typecheck && npm run build` before deploying.

---

## 1. Quick start

```bash
cp .env.example .env.local        # fill in (section 3)
npm install
npm run dev                       # http://localhost:3000
```

| URL | What |
|---|---|
| `/` | Public website + assistant (voice & chat) |
| `/admin` | Business dashboard: leads, pipeline, conversations, appointments, tasks, reports, team |
| `/developer` | Developer Control Center: separate login and separate accounts |

On the first request, the app:
- creates the tables
- creates the default workspace
- creates the first admin from `ADMIN_*` (the first developer is created from `DEVELOPER_*` at the first `/developer` sign-in)
- loads the **demo data**, which is clearly labelled DEMO.

Requirements: Node 20.9+, PostgreSQL 13+ (Neon free tier works), and a Gemini API key.

## 2. What's in it (brief → code)

| Brief | Where |
|---|---|
| §1 AI sales assistant (intent, FAQs, pricing, qualification, lead capture, scoring, booking, hand-over, summaries) | `lib/assistant-prompt.ts` (prompt from workspace config), `lib/tool-defs.ts`, `app/api/crm/[op]`, `lib/conversations.ts` (AI summary → CRM) |
| §2–3 Voice control & navigation | `components/assistant/useGeminiLive.ts` (Gemini Live, barge-in, resumption), `useActionEngine.ts`, `view.ts`, `dom-control.ts` |
| §4 Context awareness ("the second option", "which is better for a small business?") | `get_view_context` → visible items in reading order (`data-item`), focused item, filters, form state. Returning visitors get their last summary in the prompt |
| §6 Action layer: 17 structured actions + visual feedback | `navigate_page, scroll_to_section, scroll_up, scroll_down, click_element, highlight_element, open_modal, close_modal, open_menu, select_tab, filter_content, search_content, fill_form, submit_lead, request_booking, read_content, compare_items` (+ `get_view_context, read_screen, go_back, qualify_lead, record_intent, request_human_handoff, assistant_panel`). Highlight glow, action chip, listening/hearing/thinking/speaking/acting states, transcript, Stop-speaking, mic on/off |
| Text chat channel | `components/assistant/useTextChat.ts`, `app/api/chat` (same prompt, tools and action engine) |
| §7 CRM & pipeline | `lib/crm.ts`, `lib/scoring.ts`. Pipeline: New → Contacted → Qualified → Proposal → Negotiation → Won/Lost (configurable) |
| §8 Separate Admin / Developer | `app/admin/*` + `lib/auth.ts` (cookie `ww_admin`), `app/developer/*` + `lib/dev-auth.ts` (separate table, cookie `ww_dev` scoped to `/developer`, separate signing key). Admin accounts never get developer access |
| §9 Developer Control Center | Site structure & content, AI behaviour, voice actions & DOM mappings, CRM schema & scoring, analytics events, webhooks, feature toggles & per-environment overrides, workspaces (templates/clone/activate), raw JSON with version history & rollback, export/import |
| §10 Admin dashboard | Dashboard, leads + profiles, kanban pipeline, conversations with transcripts & AI summaries, appointments, tasks/reminders, notifications, reports, team & roles, account, demo data |
| §11 Analytics | `lib/analytics.ts`. Every metric from the brief, plus filters for date range, lead source, service, stage, customer type and channel (voice/text) |
| §12 Seed data | `lib/demo-data.ts`: 170 visitors, 52 AI conversations (32 voice), 29 leads, 14 qualified, 7 active opportunities, 6 consultations, 4 won. All labelled DEMO and removable |
| §14 Reusable platform | Everything client-specific is one JSON workspace config (`lib/workspace-types.ts`) |

### How a voice request flows

```
Visitor speaks ─▶ Gemini Live (speech-to-text + intent; prompt/tools/voice locked in an ephemeral token)
             ─▶ function call, e.g. compare_items{kind:"plans"}
             ─▶ action engine in the page (allow-list check → predefined action only)
             ─▶ page reacts: scroll + highlight + popup, action chip "Comparing"
             ─▶ result back to the model ─▶ spoken answer + live transcript
             ─▶ /api/events (action ok/failed) · transcript synced every 20 s
End / 30 min idle ─▶ AI summary, intent, questions, next actions ─▶ lead timeline + follow-up task + notifications/webhooks
```

The API key never reaches the browser. `/api/live-token` issues a single-use token, and the model, system prompt, tools and voice are locked into it.

### DOM conventions (use them in any custom page)

| Attribute | Meaning |
|---|---|
| `data-section="pricing"` + `id` | Section the assistant can scroll to or read |
| `data-item="plan:growth" data-item-label="…"` | Item it can highlight, compare, or refer to by position |
| `data-tab-group` / `data-tab` | Tabs (`select_tab`) |
| `data-form="contact"` | Form (`fill_form`) |
| `data-ai="off"` | Locked: the assistant can't change it (consent boxes) |
| `data-ai-skip` | Hidden from the assistant |
| `data-cta="name"` | Counted as a CTA click |

## 3. Configuration

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon/Postgres. Use the pooled URL on Vercel |
| `GEMINI_API_KEY` | Server-only |
| `GEMINI_LIVE_MODEL` | Live model id. **Ids change often.** Use Developer → Overview → *Test Gemini connection* to verify it |
| `GEMINI_TEXT_MODEL` | Chat channel + summaries (default `gemini-2.5-flash`) |
| `GEMINI_VOICE` | Default voice. A workspace can override it (Developer → AI assistant) |
| `LIVE_SESSIONS_PER_IP_PER_HOUR` | Voice sessions per IP per hour. **1 is too strict for testing**; use 10–20 |
| `TEXT_MESSAGES_PER_IP_PER_HOUR` | Chat messages per IP per hour (default 120) |
| `NEXT_PUBLIC_SITE_URL` | Public URL (email links, sitemap) |
| `NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER` | Optional human hand-over via WhatsApp |
| `STORE_TIMEZONE` | Dashboard days/weeks, follow-up times (e.g. `Asia/Karachi`) |
| `AUTH_SECRET` | 32+ random characters. Signs admin and developer cookies (separate derived keys) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | First admin (role *admin*). Then manage staff in `/admin/team` |
| `ADMIN_INVITE_CODE` | Lets people self-register as *Sales rep*. Leave empty unless needed |
| `ADMIN_SHOW_ACCOUNTS` | `on` shows user-ID chips on the login page. Keep `off` in production |
| `DEVELOPER_USERNAME` / `DEVELOPER_PASSWORD` | First developer. **Use a different password from the admin one** |
| `SMTP_*`, `MAIL_FROM`, `SALES_NOTIFY_EMAIL` | Lead/booking/hand-over alerts and password resets. Without SMTP, dev prints emails to the terminal |
| `SEED_DEMO_DATA` | `off` = start empty |
| `ACTIVE_WORKSPACE` | Optional: pin this deployment to one workspace (one Vercel project per client) |

### Roles (`/admin/team`)

| Role | Access |
|---|---|
| Admin | Everything, incl. staff and demo data |
| Sales manager | All leads, assignment, reports, export |
| Sales rep | Their own and unassigned leads, their tasks, appointments |
| Viewer | Read-only leads and reports |

New leads go round-robin to active sales reps. Developers are a separate account type.

## 4. Reusing it for a new client

1. `/developer/workspaces` → **New client workspace** from a template (agency, clinic) or clone an existing one. It starts as a **draft**.
2. **Site & content**: brand/colours, pages, section order, hero, services, plans, examples, reviews, FAQ.
3. **AI assistant**: name, voice, greeting, personality, languages, sales script, qualification questions, knowledge base. A live preview of the generated system prompt is included.
4. **Voice actions & DOM**: allowed actions, section identifiers, custom phrase → action mappings.
5. **CRM & scoring**: stages, sources, custom fields, assignment, score points and thresholds.
6. **Integrations**: signed webhooks (Zapier/Make/n8n/HubSpot…), extra alert emails, test button and delivery log.
7. **Make live**, or deploy a separate Vercel project with `ACTIVE_WORKSPACE=<id>`.

Every save is versioned (roll back from *Raw config & versions*), and workspaces export/import as JSON.

## 5. Deploy (Vercel + Neon)

1. Vercel → Storage → Neon (free), connected to the project (sets `DATABASE_URL`).
2. Add the other variables from `.env.example`.
3. Deploy. The first request creates the tables, workspace, demo data and first admin.
4. Local dev against the same DB: `npx vercel env pull .env.local`.

**HTTPS is required** for the microphone. Pages are cached and revalidated when a developer saves, so the public site stays fast.

CLI helpers:

```bash
npm run reset-admin -- admin 'new-password' you@example.com     # staff recovery (also makes it an active admin)
npm run reset-developer -- developer 'new-password'             # developer recovery
npm run hash-password -- 'password'                             # hash for *_PASSWORD_HASH
npm run db:reset -- --yes                                       # DROP everything (re-seeds on next request)
```

## 6. Try it

1. Tap **Talk to Nova** and allow the mic. Say *"Show me your pricing"*: it scrolls there and highlights the plans.
2. *"Highlight the differences between these plans"* opens the comparison and it explains.
3. *"Which one is better for a small business?"* / *"Tell me more about the second option"*: it reads the screen context and highlights Growth.
4. *"Show me only services for e-commerce businesses"*, *"Open the contact form"*, *"Fill my name and email"*, *"Scroll down"*, *"What am I looking at right now?"*
5. *"I need a website for my fitness business"* → it asks qualification questions → *"Book me a consultation"* → give name, email and time.
6. Talk over it to interrupt, or press **Stop speaking**. Switch to **Chat** for the text channel.
7. Press **End**. In `/admin`: new lead with score, stage, summary, next action, follow-up task, consultation request, notification, transcript with every website action, and reports.

In development, the browser console has `window.__assistant.run('scroll_to_section', { section: 'pricing' })` to test any action without speaking.

## 7. Before going live

- Remove demo data (Admin → Account, or the banner) and replace sample testimonials and case studies. They are labelled "Sample" until you do.
- Set a strong `AUTH_SECRET` and different admin/developer passwords. Leave `ADMIN_INVITE_CODE` empty and set `ADMIN_SHOW_ACCOUNTS=off`.
- Set `LIVE_SESSIONS_PER_IP_PER_HOUR` to a sensible value, and check the Live model id with *Test Gemini connection*.
- Replace the privacy page text. Voice audio and conversations are processed by Google's Gemini API.
# website_webapp
