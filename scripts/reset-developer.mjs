// Emergency developer reset — no email needed. Works against the same Postgres database the site uses.
// Usage:
//   npm run reset-developer -- <username> <new-password> [email]
// Updates that developer's password (and email if given), or creates the developer if it doesn't exist.
// Developer accounts are separate from admin/staff accounts.
// Signs out every existing login of that developer.
import crypto from 'node:crypto';
import { connect } from './_env.mjs';

const [username, password, email] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run reset-developer -- <username> <new-password> [email]');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const sql = await connect();
try {
  const [{ exists }] = await sql`SELECT to_regclass('public.developer_users') IS NOT NULL AS exists`;
  if (!exists) {
    console.error('The database has no tables yet. Open the site once (any page) so they are created, then run this again.');
    process.exit(1);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
  const now = Date.now();
  const [existing] = await sql`SELECT id FROM developer_users WHERE lower(username) = lower(${username})`;
  if (existing) {
    await sql`UPDATE developer_users SET password_hash = ${hash}, email = COALESCE(${email ? email.toLowerCase() : null}, email),
      session_version = session_version + 1, updated_at = ${now} WHERE id = ${existing.id}`;
    console.log(`Password reset for "${username}". Existing logins of this developer were signed out.`);
  } else {
    await sql`INSERT INTO developer_users (username, email, password_hash) VALUES (${username}, ${(email ?? '').toLowerCase()}, ${hash})`;
    console.log(`Created developer "${username}".`);
  }
  const all = await sql`SELECT username, email FROM developer_users ORDER BY id`;
  console.log('Developer accounts:', all.map((a) => `${a.username}${a.email ? ` <${a.email}>` : ''}`).join(', '));
} finally {
  await sql.end({ timeout: 5 });
}
