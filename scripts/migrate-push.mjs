import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!dbUrl || dbUrl === 'PASTE_YOUR_POSTGRES_URI_HERE') {
  console.error(
    'Push migration failed: SUPABASE_DB_URL is missing or not configured in .env.'
  );
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(
  __dirname,
  '../supabase/push_notifications_migration.sql'
);

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

let connected = false;

try {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await client.connect();
  connected = true;
  await client.query(sql);
  console.log('Push notifications migration completed successfully');
} catch (error) {
  console.error(
    'Push migration failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    await client.end().catch(() => {});
  }
}
