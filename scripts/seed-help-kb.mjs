import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!dbUrl || dbUrl === 'PASTE_YOUR_POSTGRES_URI_HERE') {
  console.error(
    'Help KB seed failed: SUPABASE_DB_URL is missing or not configured in .env.'
  );
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kbPath = path.resolve(__dirname, '../supabase/help_kb_v1.json');

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

let connected = false;

try {
  const raw = fs.readFileSync(kbPath, 'utf8');
  const kb = JSON.parse(raw);

  if (
    !kb ||
    typeof kb !== 'object' ||
    !Number.isInteger(kb.version) ||
    kb.version < 1 ||
    !Array.isArray(kb.categories) ||
    kb.categories.length === 0 ||
    !Array.isArray(kb.items) ||
    kb.items.length === 0
  ) {
    throw new Error(
      'Invalid help_kb_v1.json format: expected integer version >= 1, non-empty categories, and non-empty items.'
    );
  }

  const payload = {
    categories: kb.categories,
    items: kb.items,
  };

  await client.connect();
  connected = true;

  const result = await client.query(
    `
    INSERT INTO help_kb_store (id, version, payload, updated_at)
    VALUES (1, $1, $2::jsonb, now())
    ON CONFLICT (id) DO UPDATE
    SET version = EXCLUDED.version,
        payload = EXCLUDED.payload,
        updated_at = now()
    RETURNING
      version,
      jsonb_array_length(payload->'categories') AS category_count,
      jsonb_array_length(payload->'items') AS item_count
    `,
    [kb.version, JSON.stringify(payload)]
  );

  const row = result.rows[0];
  console.log(
    `Help KB seed completed successfully (version=${row.version}, categories=${row.category_count}, items=${row.item_count})`
  );
} catch (error) {
  console.error(
    'Help KB seed failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    await client.end().catch(() => {});
  }
}
