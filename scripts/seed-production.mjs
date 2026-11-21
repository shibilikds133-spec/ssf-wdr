import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!dbUrl || dbUrl === 'PASTE_YOUR_POSTGRES_URI_HERE') {
  console.error(
    'Seed failed: SUPABASE_DB_URL is missing or not configured in .env.'
  );
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedPath = path.resolve(__dirname, '../supabase/seed_production.sql');

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  const sql = fs.readFileSync(seedPath, 'utf8');
  await client.connect();
  await client.query(sql);
  console.log('Production & Test accounts seed completed successfully');
} catch (error) {
  console.error(
    'Seed failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
} finally {
  try {
    await client.end();
  } catch {
    // Ignore close errors
  }
}
