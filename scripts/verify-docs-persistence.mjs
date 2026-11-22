import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!supabaseUrl || !supabaseAnonKey || !dbUrl) {
  console.error(
    'Missing required env variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_DB_URL).'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let ownerClient = null;
let pgAnonClient = null;
let usePgFallback = false;

async function initTransport() {
  ownerClient = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await ownerClient.connect();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    await fetch(`${supabaseUrl}/rest/v1/`, { signal: controller.signal });
    clearTimeout(timer);
    usePgFallback = false;
  } catch {
    pgAnonClient = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await pgAnonClient.connect();
    usePgFallback = true;
    console.log(
      'INFO: Supabase REST API timed out; verifying live RPCs via Postgres pooler as role anon.'
    );
  }
}

async function rpc(fnName, params = {}) {
  if (!usePgFallback) {
    return supabase.rpc(fnName, params);
  }

  const keys = Object.keys(params);
  const values = keys.map((k) => {
    const v = params[k];
    return Array.isArray(v) || (typeof v === 'object' && v !== null)
      ? JSON.stringify(v)
      : v;
  });
  const argSql = keys
    .map((k, idx) => {
      const v = params[k];
      const cast =
        Array.isArray(v) || (typeof v === 'object' && v !== null)
          ? '::jsonb'
          : '';
      return `${k} := $${idx + 1}${cast}`;
    })
    .join(', ');

  try {
    await pgAnonClient.query('BEGIN');
    await pgAnonClient.query('SET LOCAL ROLE anon');
    const result = await pgAnonClient.query(
      `SELECT ${fnName}(${argSql}) AS res`,
      values
    );
    await pgAnonClient.query('COMMIT');
    return { data: result.rows[0]?.res ?? null, error: null };
  } catch (err) {
    await pgAnonClient.query('ROLLBACK').catch(() => {});
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

const results = [];
const tokensToLogout = [];

let preTestSector = null;
let preTestUnit = null;
let preTestAdminSeen = null;

function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}

try {
  await initTransport();
  console.log('=== MALAYALAM DOCS PERSISTENCE VERIFICATION ===');

  // Snapshot pre-test state for WDR200, WDR202, and admin_seen_doc_pages
  {
    const secRes = await ownerClient.query(
      `SELECT id, username, password_hash, must_change_password, seen_doc_pages
       FROM sectors WHERE login_code = 'WDR200'`
    );
    assert.equal(secRes.rows.length, 1, 'Expected test sector WDR200 to exist');
    preTestSector = secRes.rows[0];

    const unitRes = await ownerClient.query(
      `SELECT id, username, password_hash, must_change_password, seen_doc_pages
       FROM units WHERE login_code = 'WDR202'`
    );
    assert.equal(unitRes.rows.length, 1, 'Expected test unit WDR202 to exist');
    preTestUnit = unitRes.rows[0];

    const adminSettingRes = await ownerClient.query(
      `SELECT value FROM app_settings WHERE key = 'admin_seen_doc_pages'`
    );
    preTestAdminSeen = {
      existed: adminSettingRes.rows.length > 0,
      value: adminSettingRes.rows[0]?.value ?? '[]',
    };

    // Prepare clean test slate on WDR200, WDR202, and admin_seen_doc_pages
    await ownerClient.query(
      `UPDATE sectors
       SET seen_doc_pages = '{}',
           password_hash = NULL,
           must_change_password = true
       WHERE id = $1`,
      [preTestSector.id]
    );
    await ownerClient.query(
      `UPDATE units
       SET seen_doc_pages = '{}',
           password_hash = NULL,
           must_change_password = true
       WHERE id = $1`,
      [preTestUnit.id]
    );
    await ownerClient.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('admin_seen_doc_pages', '[]')
       ON CONFLICT (key) DO UPDATE SET value = '[]'`
    );
  }

  // 1. Unit Account (WDR202) Persistence Across Refresh, Logout & Re-Login
  {
    const { data: login1, error: loginErr1 } = await rpc('auth_login', {
      p_username: preTestUnit.username,
      p_password: 'WDR202',
    });
    assert.ifError(loginErr1);
    assert.equal(login1?.valid, true, 'Unit WDR202 login must succeed');
    assert.equal(login1?.role, 'UNIT');
    assert.ok(Array.isArray(login1?.seen_doc_pages), 'Expected seen_doc_pages array');
    assert.deepEqual(login1.seen_doc_pages, []);
    const jwt1 = login1.token;
    tokensToLogout.push(jwt1);

    // Call auth_mark_doc_page_seen twice (idempotent, zero duplicates)
    const { data: mark1, error: markErr1 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'unit_dashboard' }
    );
    assert.ifError(markErr1);
    assert.equal(mark1?.success, true);
    assert.deepEqual(mark1?.seen_doc_pages, ['unit_dashboard']);

    const { data: mark2, error: markErr2 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'UNIT_DASHBOARD' }
    );
    assert.ifError(markErr2);
    assert.equal(mark2?.success, true);
    assert.deepEqual(
      mark2?.seen_doc_pages,
      ['unit_dashboard'],
      'Duplicate mark calls must not duplicate page key'
    );

    // Verify auth_refresh_session returns persisted seen_doc_pages
    const { data: refreshed, error: refreshErr } = await rpc(
      'auth_refresh_session',
      { p_token: jwt1 }
    );
    assert.ifError(refreshErr);
    assert.equal(refreshed?.valid, true);
    assert.deepEqual(refreshed?.seen_doc_pages, ['unit_dashboard']);

    // Logout & perform fresh login to confirm cross-session persistence
    await rpc('auth_logout', { p_token: jwt1 });
    const { data: login2, error: loginErr2 } = await rpc('auth_login', {
      p_username: preTestUnit.username,
      p_password: 'WDR202',
    });
    assert.ifError(loginErr2);
    assert.equal(login2?.valid, true);
    assert.deepEqual(login2?.seen_doc_pages, ['unit_dashboard']);
    tokensToLogout.push(login2.token);

    pass('1. Unit (WDR202) seen_doc_pages idempotent + persists across refresh, logout & re-login');
  }

  // 2. Sector Account (WDR200) Persistence Across Refresh, Logout & Re-Login
  {
    const { data: login1, error: loginErr1 } = await rpc('auth_login', {
      p_username: preTestSector.username,
      p_password: 'WDR200',
    });
    assert.ifError(loginErr1);
    assert.equal(login1?.valid, true, 'Sector WDR200 login must succeed');
    assert.equal(login1?.role, 'SECTOR');
    assert.deepEqual(login1?.seen_doc_pages, []);
    const jwt1 = login1.token;
    tokensToLogout.push(jwt1);

    const { data: mark1, error: markErr1 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'sector_dashboard' }
    );
    assert.ifError(markErr1);
    assert.equal(mark1?.success, true);
    assert.deepEqual(mark1?.seen_doc_pages, ['sector_dashboard']);

    const { data: mark2, error: markErr2 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'sector_dashboard' }
    );
    assert.ifError(markErr2);
    assert.deepEqual(mark2?.seen_doc_pages, ['sector_dashboard']);

    const { data: refreshed, error: refreshErr } = await rpc(
      'auth_refresh_session',
      { p_token: jwt1 }
    );
    assert.ifError(refreshErr);
    assert.equal(refreshed?.valid, true);
    assert.deepEqual(refreshed?.seen_doc_pages, ['sector_dashboard']);

    await rpc('auth_logout', { p_token: jwt1 });
    const { data: login2, error: loginErr2 } = await rpc('auth_login', {
      p_username: preTestSector.username,
      p_password: 'WDR200',
    });
    assert.ifError(loginErr2);
    assert.equal(login2?.valid, true);
    assert.deepEqual(login2?.seen_doc_pages, ['sector_dashboard']);
    tokensToLogout.push(login2.token);

    pass('2. Sector (WDR200) seen_doc_pages idempotent + persists across refresh, logout & re-login');
  }

  // 3. Division Admin (WDR100) Persistence Across Refresh, Logout & Re-Login
  let adminJwtForValidation = null;
  {
    const { data: login1, error: loginErr1 } = await rpc('auth_login', {
      p_username: 'SSF Wandoor',
      p_password: 'WDR100',
    });
    assert.ifError(loginErr1);
    assert.equal(login1?.valid, true, 'Admin WDR100 login must succeed');
    assert.equal(login1?.role, 'ADMIN');
    assert.deepEqual(login1?.seen_doc_pages, []);
    const jwt1 = login1.token;
    tokensToLogout.push(jwt1);

    const { data: mark1, error: markErr1 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'admin_dashboard' }
    );
    assert.ifError(markErr1);
    assert.equal(mark1?.success, true);
    assert.deepEqual(mark1?.seen_doc_pages, ['admin_dashboard']);

    const { data: mark2, error: markErr2 } = await rpc(
      'auth_mark_doc_page_seen',
      { p_code: jwt1, p_page_key: 'admin_dashboard' }
    );
    assert.ifError(markErr2);
    assert.deepEqual(mark2?.seen_doc_pages, ['admin_dashboard']);

    const { data: refreshed, error: refreshErr } = await rpc(
      'auth_refresh_session',
      { p_token: jwt1 }
    );
    assert.ifError(refreshErr);
    assert.equal(refreshed?.valid, true);
    assert.deepEqual(refreshed?.seen_doc_pages, ['admin_dashboard']);

    await rpc('auth_logout', { p_token: jwt1 });
    const { data: login2, error: loginErr2 } = await rpc('auth_login', {
      p_username: 'SSF Wandoor',
      p_password: 'WDR100',
    });
    assert.ifError(loginErr2);
    assert.equal(login2?.valid, true);
    assert.deepEqual(login2?.seen_doc_pages, ['admin_dashboard']);
    adminJwtForValidation = login2.token;
    tokensToLogout.push(adminJwtForValidation);

    pass('3. Division Admin (WDR100) admin_seen_doc_pages idempotent + persists across refresh, logout & re-login');
  }

  // 4. Reject Invalid Page Key & Unauthorized Session
  {
    const { error: emptyKeyErr } = await rpc('auth_mark_doc_page_seen', {
      p_code: adminJwtForValidation,
      p_page_key: '   ',
    });
    assert.ok(emptyKeyErr, 'Empty page key must be rejected');

    const { error: unauthErr } = await rpc('auth_mark_doc_page_seen', {
      p_code: 'INVALID_SESSION_TOKEN',
      p_page_key: 'admin_dashboard',
    });
    assert.ok(unauthErr, 'Invalid session token must be rejected');

    pass('4. Validation & session authorization checks enforced');
  }
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  try {
    if (ownerClient) {
      if (preTestSector) {
        await ownerClient.query(
          `UPDATE sectors
           SET seen_doc_pages = $1,
               password_hash = $2,
               must_change_password = $3
           WHERE id = $4`,
          [
            preTestSector.seen_doc_pages ?? [],
            preTestSector.password_hash,
            preTestSector.must_change_password,
            preTestSector.id,
          ]
        );
      }
      if (preTestUnit) {
        await ownerClient.query(
          `UPDATE units
           SET seen_doc_pages = $1,
               password_hash = $2,
               must_change_password = $3
           WHERE id = $4`,
          [
            preTestUnit.seen_doc_pages ?? [],
            preTestUnit.password_hash,
            preTestUnit.must_change_password,
            preTestUnit.id,
          ]
        );
      }
      if (preTestAdminSeen) {
        if (preTestAdminSeen.existed) {
          await ownerClient.query(
            `UPDATE app_settings SET value = $1 WHERE key = 'admin_seen_doc_pages'`,
            [preTestAdminSeen.value]
          );
        } else {
          await ownerClient.query(
            `DELETE FROM app_settings WHERE key = 'admin_seen_doc_pages'`
          );
        }
      }
    }

    for (const tok of tokensToLogout) {
      await rpc('auth_logout', { p_token: tok }).catch(() => {});
    }

    console.log('PASS: 5. Clean teardown restored pre-test account & admin states.');
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
    process.exitCode = 1;
  } finally {
    if (pgAnonClient) {
      await pgAnonClient.end().catch(() => {});
    }
    if (ownerClient) {
      await ownerClient.end().catch(() => {});
    }
  }
}

if (!process.exitCode) {
  console.log(
    `\nALL DOCS PERSISTENCE VERIFICATION CHECKS PASSED (${results.length}/4 + Teardown)`
  );
}
