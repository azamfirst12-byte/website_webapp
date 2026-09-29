/**
 * PostgreSQL schema (Neon, Supabase, Vercel Postgres or any Postgres 13+).
 * Idempotent: safe to run on every cold start. Timestamps are BIGINT unix milliseconds.
 * Every business table carries workspace_id (one deployment can host several client workspaces)
 * and is_demo (seed rows are labelled and removable).
 */
const NOW_MS = `(floor(extract(epoch from clock_timestamp()) * 1000))::bigint`;

export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB  NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT ${NOW_MS}
);

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT   NOT NULL,
  status     TEXT   NOT NULL DEFAULT 'draft' CHECK (status IN ('active','draft','archived')),
  config     JSONB  NOT NULL,
  created_at BIGINT NOT NULL DEFAULT ${NOW_MS},
  updated_at BIGINT NOT NULL DEFAULT ${NOW_MS}
);

CREATE TABLE IF NOT EXISTS workspace_versions (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  config       JSONB  NOT NULL,
  note         TEXT   NOT NULL DEFAULT '',
  created_by   TEXT   NOT NULL DEFAULT '',
  created_at   BIGINT NOT NULL DEFAULT ${NOW_MS}
);
CREATE INDEX IF NOT EXISTS idx_wsv_ws ON workspace_versions(workspace_id, created_at DESC);

-- ─────────── Staff (business admin area) ───────────
CREATE TABLE IF NOT EXISTS admin_users (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT   NOT NULL,
  email           TEXT   NOT NULL DEFAULT '',
  full_name       TEXT   NOT NULL DEFAULT '',
  role            TEXT   NOT NULL DEFAULT 'sales' CHECK (role IN ('admin','manager','sales','viewer')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash   TEXT   NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_login_at   BIGINT,
  is_demo         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  updated_at      BIGINT NOT NULL DEFAULT ${NOW_MS}
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(lower(username));

CREATE TABLE IF NOT EXISTS admin_resets (
  token_hash TEXT PRIMARY KEY,
  admin_id   BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  used_at    BIGINT
);

-- ─────────── Developers (technical control center) — separate from staff ───────────
CREATE TABLE IF NOT EXISTS developer_users (
  id              BIGSERIAL PRIMARY KEY,
  username        TEXT   NOT NULL,
  email           TEXT   NOT NULL DEFAULT '',
  password_hash   TEXT   NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_login_at   BIGINT,
  created_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  updated_at      BIGINT NOT NULL DEFAULT ${NOW_MS}
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_users_username ON developer_users(lower(username));

-- ─────────── Visitors & conversations ───────────
CREATE TABLE IF NOT EXISTS visitors (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT   NOT NULL,
  first_seen   BIGINT NOT NULL DEFAULT ${NOW_MS},
  last_seen    BIGINT NOT NULL DEFAULT ${NOW_MS},
  visits       INTEGER NOT NULL DEFAULT 1,
  source       TEXT   NOT NULL DEFAULT 'direct',
  referrer     TEXT,
  landing_path TEXT,
  device       TEXT,
  is_demo      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_visitors_ws_first ON visitors(workspace_id, first_seen);

CREATE TABLE IF NOT EXISTS conversations (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT   NOT NULL,
  visitor_id        TEXT   NOT NULL,
  lead_id           BIGINT,
  channel           TEXT   NOT NULL CHECK (channel IN ('voice','text')),
  status            TEXT   NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  started_at        BIGINT NOT NULL DEFAULT ${NOW_MS},
  last_activity_at  BIGINT NOT NULL DEFAULT ${NOW_MS},
  ended_at          BIGINT,
  transcript        JSONB  NOT NULL DEFAULT '[]',
  turn_count        INTEGER NOT NULL DEFAULT 0,
  action_count      INTEGER NOT NULL DEFAULT 0,
  failed_actions    INTEGER NOT NULL DEFAULT 0,
  summary           JSONB,
  intent            TEXT,
  intent_category   TEXT,
  outcome           TEXT,
  success           BOOLEAN,
  handoff           BOOLEAN NOT NULL DEFAULT FALSE,
  language          TEXT,
  entry_path        TEXT,
  is_demo           BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_conv_ws_started ON conversations(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_open ON conversations(status, last_activity_at) WHERE status = 'open';

-- ─────────── CRM ───────────
CREATE TABLE IF NOT EXISTS leads (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        TEXT   NOT NULL,
  visitor_id          TEXT,
  name                TEXT   NOT NULL DEFAULT '',
  email               TEXT,
  phone               TEXT,
  company             TEXT,
  industry            TEXT,
  customer_type       TEXT,
  company_size        TEXT,
  source              TEXT   NOT NULL DEFAULT 'manual',
  channel             TEXT,
  interested_service  TEXT,
  requirements        TEXT,
  budget              TEXT,
  timeline            TEXT,
  decision_maker      BOOLEAN,
  intent_level        TEXT,
  score               INTEGER NOT NULL DEFAULT 0,
  score_breakdown     JSONB  NOT NULL DEFAULT '{}',
  stage               TEXT   NOT NULL DEFAULT 'new',
  value               DOUBLE PRECISION NOT NULL DEFAULT 0,
  assigned_to         BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  last_interaction_at BIGINT,
  next_follow_up_at   BIGINT,
  summary             TEXT,
  next_action         TEXT,
  tags                JSONB  NOT NULL DEFAULT '[]',
  custom              JSONB  NOT NULL DEFAULT '{}',
  lost_reason         TEXT,
  won_at              BIGINT,
  stage_changed_at    BIGINT NOT NULL DEFAULT ${NOW_MS},
  consent             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          BIGINT NOT NULL DEFAULT ${NOW_MS},
  updated_at          BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo             BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_leads_ws_created ON leads(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ws_stage   ON leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned   ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_email      ON leads(workspace_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_visitor    ON leads(visitor_id);

CREATE TABLE IF NOT EXISTS activities (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    TEXT   NOT NULL,
  lead_id         BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id TEXT,
  type            TEXT   NOT NULL,
  title           TEXT   NOT NULL,
  body            TEXT,
  meta            JSONB  NOT NULL DEFAULT '{}',
  by_user_id      BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_act_lead ON activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_act_ws   ON activities(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT   NOT NULL,
  lead_id      BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  title        TEXT   NOT NULL,
  type         TEXT   NOT NULL DEFAULT 'follow_up',
  priority     TEXT   NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  due_at       BIGINT,
  assigned_to  BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  done_at      BIGINT,
  created_by   BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(workspace_id, done_at, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);

CREATE TABLE IF NOT EXISTS appointments (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    TEXT   NOT NULL,
  lead_id         BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id TEXT,
  topic           TEXT   NOT NULL DEFAULT 'Consultation',
  service         TEXT,
  preferred_time  TEXT,
  scheduled_at    BIGINT,
  duration_min    INTEGER NOT NULL DEFAULT 30,
  status          TEXT   NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled','no_show')),
  channel         TEXT,
  notes           TEXT,
  meeting_link    TEXT,
  created_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  updated_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_appt_ws ON appointments(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT   NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  type         TEXT   NOT NULL,
  title        TEXT   NOT NULL,
  body         TEXT,
  link         TEXT,
  read_at      BIGINT,
  created_at   BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at DESC);

-- ─────────── Analytics events ───────────
CREATE TABLE IF NOT EXISTS events (
  id              BIGSERIAL PRIMARY KEY,
  workspace_id    TEXT   NOT NULL,
  visitor_id      TEXT,
  conversation_id TEXT,
  type            TEXT   NOT NULL,
  name            TEXT,
  path            TEXT,
  channel         TEXT,
  ok              BOOLEAN,
  meta            JSONB  NOT NULL DEFAULT '{}',
  created_at      BIGINT NOT NULL DEFAULT ${NOW_MS},
  is_demo         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_events_ws_type ON events(workspace_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_conv    ON events(conversation_id);

-- ─────────── Integrations log ───────────
CREATE TABLE IF NOT EXISTS integration_logs (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id TEXT   NOT NULL,
  event        TEXT   NOT NULL,
  target       TEXT   NOT NULL,
  status       TEXT   NOT NULL,
  code         INTEGER,
  error        TEXT,
  created_at   BIGINT NOT NULL DEFAULT ${NOW_MS}
);
CREATE INDEX IF NOT EXISTS idx_intlog_ws ON integration_logs(workspace_id, created_at DESC);
`;

/** Every table, children first (for scripts/reset-db.mjs). */
export const TABLES = [
  'integration_logs',
  'events',
  'notifications',
  'appointments',
  'tasks',
  'activities',
  'conversations',
  'leads',
  'visitors',
  'admin_resets',
  'admin_users',
  'developer_users',
  'workspace_versions',
  'workspaces',
  'settings',
];
