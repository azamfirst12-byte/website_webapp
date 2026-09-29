// DELETES ALL DATA (workspaces, leads, conversations, analytics, staff and developer accounts).
// Tables are recreated, the default workspace and demo data re-seeded on the next page load.
// Usage: npm run db:reset -- --yes
import { connect } from './_env.mjs';

if (!process.argv.includes('--yes')) {
  console.error('This deletes every table and all data. Run again with --yes to confirm:  npm run db:reset -- --yes');
  process.exit(1);
}
const sql = await connect();
try {
  await sql.unsafe(`DROP TABLE IF EXISTS integration_logs, events, notifications, appointments, tasks, activities, conversations, leads, visitors,
    admin_resets, admin_users, developer_users, workspace_versions, workspaces, settings CASCADE`);
  console.log('All tables dropped. Open the site to recreate and re-seed them.');
} finally {
  await sql.end({ timeout: 5 });
}
