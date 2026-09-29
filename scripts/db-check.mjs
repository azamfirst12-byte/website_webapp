// Shows which database the app will use and whether it is reachable.
// Usage: npm run db:check
import { connect, databaseUrl } from './_env.mjs';

const fromShell = process.env.__WW_SHELL_DB === '1';
const url = databaseUrl();
let u;
try {
  u = new URL(url);
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(1);
}
console.log(`DATABASE_URL source : ${fromShell ? 'Windows/system environment variable (overrides .env files!)' : '.env.local / .env'}`);
console.log(`Host                : ${u.hostname}`);
console.log(`Database            : ${u.pathname.slice(1)}`);
console.log(`User                : ${decodeURIComponent(u.username)}`);
const sql = await connect();
try {
  const [r] = await sql`SELECT current_database() AS db, version() AS v`;
  console.log(`Connected ✓         : ${r.db} — ${String(r.v).split(',')[0]}`);
  const dbs = await sql`SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1`;
  console.log(`Databases on host   : ${dbs.map((d) => d.datname).join(', ')}`);
  const t = await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log(`Tables in public    : ${t[0].n}${t[0].n === 0 ? ' (empty — the app will create them on the first request)' : ''}`);
} catch (e) {
  console.error(`Connection failed   : ${e.message}`);
  if (/does not exist/.test(e.message)) console.error('→ This host has no such database. Copy the URL from Neon → Connect with the right branch AND database selected.');
  if (/TIMEOUT|ENOTFOUND|ECONN/i.test(e.message)) console.error('→ Network problem reaching Neon (VPN/firewall/antivirus, or a wrong host).');
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
