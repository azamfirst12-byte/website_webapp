// Tiny .env loader for the CLI scripts (Next.js loads these files itself for the app).
import fs from 'node:fs';
import path from 'node:path';

if (process.env.DATABASE_URL) process.env.__WW_SHELL_DB = '1';
for (const name of ['.env.local', '.env']) {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function databaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Put your Neon/Postgres connection string in .env.local (or run: vercel env pull .env.local).');
    process.exit(1);
  }
  return url;
}

export async function connect() {
  const { default: postgres } = await import('postgres');
  const url = databaseUrl();
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return postgres(url, { max: 1, prepare: false, connect_timeout: 20, ssl: local || /sslmode=disable/.test(url) ? false : 'require', onnotice: () => {} });
}
