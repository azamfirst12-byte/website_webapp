// Generates a hashed password for .env (ADMIN_PASSWORD_HASH or DEVELOPER_PASSWORD_HASH), so the plain password isn't stored.
// Usage: npm run hash-password -- "your-strong-password"
import crypto from 'node:crypto';

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Usage: npm run hash-password -- "your-strong-password"   (at least 10 characters)');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
console.log(`scrypt:${salt}:${hash}   ← paste as ADMIN_PASSWORD_HASH or DEVELOPER_PASSWORD_HASH`);
console.log(`AUTH_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
