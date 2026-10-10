import 'server-only';
import postgres from 'postgres';
import { SCHEMA } from './schema';
import { seed } from './seed';

/**
 * PostgreSQL connection (Neon / Supabase / Vercel Postgres / any Postgres).
 * Set DATABASE_URL (Vercel's Neon integration also sets POSTGRES_URL).
 *
 * Queries use `?` placeholders (converted to $1, $2…) so the SQL reads like before.
 */

type Sql = postgres.Sql<Record<string, never>>;
type Tx = postgres.TransactionSql<Record<string, never>>;
type Runner = Sql | Tx;

const g = globalThis as unknown as { __wwsql?: Sql; __wwready?: Promise<void>; __wwurl?: string; __wwjsonfix?: Promise<void> };

/** "ep-abc-pooler.region.aws.neon.tech/website_webapp" — for logs, never the password. */
export function describeUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(unparsable DATABASE_URL)';
  }
}

function databaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Create a free Postgres database (e.g. Neon) and add its connection string to .env / Vercel.');
  return url;
}

function client(): Sql {
  const url = databaseUrl();
  // In dev the pool survives hot reloads; if DATABASE_URL changed, drop the old pool instead of reusing it.
  if (g.__wwsql && g.__wwurl === url) return g.__wwsql;
  if (g.__wwsql) {
    void g.__wwsql.end({ timeout: 2 }).catch(() => {});
    g.__wwready = undefined;
  }
  g.__wwurl = url;
  console.log(`[db] connecting to ${describeUrl(url)}`);
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || url.includes('host=/');
  const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  g.__wwsql = postgres(url, {
    max: serverless ? 3 : 10,
    // Keep connections open between requests: each new one costs ~5 network round trips (TLS + login).
    idle_timeout: serverless ? 20 : 600,
    connect_timeout: 15,
    // Neon/Supabase poolers (PgBouncer, transaction mode) don't support prepared statements.
    prepare: false,
    ssl: local || /sslmode=disable/.test(url) ? false : 'require',
    onnotice: () => {},
    // COUNT()/SUM() come back as int8/numeric strings by default; return plain numbers.
    types: {
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  }) as unknown as Sql;
  return g.__wwsql;
}

/**
 * Convert `?` placeholders to $1..$n (our SQL never uses a literal ?).
 * `?::jsonb` becomes `$n::text::jsonb`: callers pass JSON.stringify(...) text, and without the text cast
 * postgres.js sees a jsonb parameter and JSON-encodes that text a second time (storing a JSON *string*).
 */
function toPg(text: string) {
  let n = 0;
  return text.replace(/\?(::jsonb\b)?/g, (_m, jsonb?: string) => `$${++n}${jsonb ? '::text::jsonb' : ''}`);
}

/** jsonb columns that older versions stored double-encoded (as a JSON string holding the real JSON). */
const JSON_COLUMNS: [string, string][] = [
  ['settings', 'value'],
  ['workspaces', 'config'],
  ['workspace_versions', 'config'],
  ['conversations', 'transcript'],
  ['conversations', 'summary'],
  ['leads', 'score_breakdown'],
  ['leads', 'tags'],
  ['leads', 'custom'],
  ['activities', 'meta'],
  ['events', 'meta'],
];
const JSON_FIX_KEY = 'json_fix_v1';

/** One-time repair: decode double-encoded jsonb values in place (values that aren't valid JSON text are left alone). */
async function repairDoubleEncodedJson(sql: Sql) {
  const [done] = await sql.unsafe(`SELECT 1 AS ok FROM settings WHERE key = '${JSON_FIX_KEY}'`);
  if (done) return;
  await sql.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(727274)');
    const [again] = await tx.unsafe(`SELECT 1 AS ok FROM settings WHERE key = '${JSON_FIX_KEY}'`);
    if (again) return;
    await tx.unsafe(`CREATE OR REPLACE FUNCTION pg_temp.ww_unwrap_json(v jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
      BEGIN
        IF v IS NULL OR jsonb_typeof(v) <> 'string' THEN RETURN v; END IF;
        BEGIN RETURN (v #>> '{}')::jsonb; EXCEPTION WHEN others THEN RETURN v; END;
      END $f$`);
    for (const [table, col] of JSON_COLUMNS) {
      await tx.unsafe(`UPDATE ${table} SET ${col} = pg_temp.ww_unwrap_json(${col}) WHERE jsonb_typeof(${col}) = 'string' AND ltrim(${col} #>> '{}') ~ '^[\\[{"]'`);
    }
    await tx.unsafe(`INSERT INTO settings (key, value) VALUES ('${JSON_FIX_KEY}', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
  });
}

/** Bump when lib/schema.ts changes, so existing databases get the new tables/indexes. */
const SCHEMA_VERSION = 'ww-schema-1';

/**
 * Creates tables and seeds the catalog once per process. Normally a single quick query
 * (the schema version stored as a table comment); the full setup only runs on a new/old database.
 */
function ready(): Promise<void> {
  return schemaReady().then(() => {
    // Runs once per process after the schema is in place (a settings flag makes it a no-op afterwards).
    g.__wwjsonfix ??= repairDoubleEncodedJson(client()).catch((e) => console.error('[db] JSON repair skipped:', (e as Error).message));
    return g.__wwjsonfix;
  });
}

function schemaReady(): Promise<void> {
  if (!g.__wwready) {
    g.__wwready = (async () => {
      const sql = client();
      const [row] = await sql.unsafe(`SELECT obj_description(to_regclass('public.workspaces'), 'pg_class') AS v`);
      if (row?.v === SCHEMA_VERSION) return;
      // Refuse to mix with another app's tables (e.g. the Ridgeline store also has "leads" and "admin_users").
      const [clash] = await sql.unsafe(
        `SELECT string_agg(t.table_name, ', ') AS tables FROM information_schema.tables t
         WHERE t.table_schema = current_schema() AND t.table_name IN ('leads','admin_users','admin_resets','events','tasks','notifications','conversations','visitors','appointments','activities','settings')
           AND to_regclass('public.workspaces') IS NULL`,
      );
      if (clash?.tables) {
        throw new Error(
          `This database already contains tables from another app (${clash.tables}). ` +
            `website_webapp needs its own database: create a new one (Neon → your project → Databases → New database) ` +
            `and point DATABASE_URL at it. Nothing was changed in the existing database.`,
        );
      }
      await sql.begin(async (tx) => {
        await tx.unsafe('SELECT pg_advisory_xact_lock(727273)'); // concurrent cold starts wait here
        await tx.unsafe(SCHEMA);
        await seed(runner(tx));
        await tx.unsafe(`COMMENT ON TABLE workspaces IS '${SCHEMA_VERSION}'`);
      });
    })().catch((e) => {
      g.__wwready = undefined; // retry on next request
      throw e;
    });
  }
  return g.__wwready;
}

export interface Db {
  /** All rows */
  q<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** First row or undefined */
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | undefined>;
  /** Number of affected rows */
  exec(text: string, params?: unknown[]): Promise<number>;
}

function runner(r: Runner): Db {
  return {
    async q<T>(text: string, params: unknown[] = []) {
      // plain array (not postgres.js's Result subclass) so it serialises cleanly to client components
      return Array.from(await r.unsafe(toPg(text), params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
    },
    async one<T>(text: string, params: unknown[] = []) {
      const rows = (await r.unsafe(toPg(text), params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
      return rows[0];
    },
    async exec(text: string, params: unknown[] = []) {
      const res = await r.unsafe(toPg(text), params as postgres.ParameterOrJSON<never>[]);
      return res.count;
    },
  };
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  return runner(client()).q<T>(text, params);
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  await ready();
  return runner(client()).one<T>(text, params);
}

export async function exec(text: string, params: unknown[] = []): Promise<number> {
  await ready();
  return runner(client()).exec(text, params);
}

/** Run several statements atomically. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ready();
  return (await client().begin((t) => fn(runner(t)))) as T;
}

/** Close the pool (scripts/tests). */
export async function closeDb() {
  await g.__wwsql?.end({ timeout: 5 });
  g.__wwsql = undefined;
  g.__wwready = undefined;
}
