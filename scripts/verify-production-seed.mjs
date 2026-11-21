import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../supabase/schema.sql');
const seedPath = path.resolve(__dirname, '../supabase/seed_production.sql');

let pgClient = null;
let usePgFallback = false;

async function initTransport() {
  pgClient = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    await fetch(`${supabaseUrl}/rest/v1/`, { signal: controller.signal });
    clearTimeout(timer);
    usePgFallback = false;
  } catch {
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
    await pgClient.query('BEGIN');
    await pgClient.query('SET LOCAL ROLE anon');
    const result = await pgClient.query(
      `SELECT ${fnName}(${argSql}) AS res`,
      values
    );
    await pgClient.query('COMMIT');
    return { data: result.rows[0]?.res ?? null, error: null };
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

const ADMIN_USERNAME = 'SSF Wandoor';
const ADMIN_CODE = 'WDR100';

const EXPECTED_SECTOR_COUNTS = {
  WDR101: { name: 'SSF Pandikkad Sector', count: 10 },
  WDR102: { name: 'SSF Kodasseri Sector', count: 10 },
  WDR103: { name: 'SSF Wandoor Sector', count: 8 },
  WDR104: { name: 'SSF Thiruvali Sector', count: 9 },
  WDR105: { name: 'SSF Kalikavu Sector', count: 14 },
  WDR106: { name: 'SSF Porur Sector', count: 13 },
  WDR107: { name: 'SSF Chokkad Sector', count: 15 },
  WDR108: { name: 'SSF Karuvarakundu Sector', count: 13 },
  WDR200: { name: 'Test Sector 1', count: 2 },
  WDR201: { name: 'Test Sector 2', count: 2 },
};

const createdOrderIds = [];
const activeTokensToLogout = [];
let tempUnit299Id = null;
let testUnit203Id = null;

function pass(label) {
  console.log(`[PASS] ${label}`);
}

try {
  await initTransport();

  console.log('=== PRODUCTION SEED & TEST ACCOUNT ISOLATION VERIFICATION ===');

  // ---------------------------------------------------------------------------
  // SUITE 1: Exact Count & Code Mapping Audit
  // ---------------------------------------------------------------------------
  let adminJwt = null;
  {
    const { data: adminLogin, error: adminErr } = await rpc('auth_login', {
      p_username: ADMIN_USERNAME,
      p_password: ADMIN_CODE,
    });
    assert.ifError(adminErr);
    assert.equal(adminLogin?.valid, true, 'Admin login must succeed');
    assert.equal(adminLogin?.role, 'ADMIN');
    assert.equal(adminLogin?.must_change_password, false);
    adminJwt = adminLogin.token;
    activeTokensToLogout.push(adminJwt);

    const { data: dash, error: dashErr } = await rpc('admin_get_dashboard', {
      p_code: adminJwt,
    });
    assert.ifError(dashErr);

    const sectors = dash.sectors || [];
    const units = dash.unit_summaries || [];

    assert.equal(
      sectors.length,
      10,
      `Expected exactly 10 sectors (8 real + 2 test), got ${sectors.length}`
    );
    assert.equal(
      units.length,
      96,
      `Expected exactly 96 units (92 real + 4 test), got ${units.length}`
    );

    for (const [code, spec] of Object.entries(EXPECTED_SECTOR_COUNTS)) {
      const sec = sectors.find((s) => s.login_code === code);
      assert.ok(sec, `Missing sector ${code}`);
      assert.equal(sec.name, spec.name, `Sector ${code} name mismatch`);
      const secUnits = units.filter((u) => u.sector_id === sec.id);
      assert.equal(
        secUnits.length,
        spec.count,
        `Sector ${code} (${spec.name}) expected ${spec.count} units, got ${secUnits.length}`
      );
    }

    const wdr200 = sectors.find((s) => s.login_code === 'WDR200');
    const wdr201 = sectors.find((s) => s.login_code === 'WDR201');
    const wdr200Codes = units
      .filter((u) => u.sector_id === wdr200.id)
      .map((u) => u.login_code)
      .sort();
    const wdr201Codes = units
      .filter((u) => u.sector_id === wdr201.id)
      .map((u) => u.login_code)
      .sort();
    assert.deepEqual(wdr200Codes, ['WDR202', 'WDR203']);
    assert.deepEqual(wdr201Codes, ['WDR204', 'WDR205']);

    pass('1. Exact Count & Code Mapping Audit (10 sectors, 96 units, per-sector breakdown & Admin login)');
  }

  // ---------------------------------------------------------------------------
  // SUITE 2: Data Integrity & Clean Slate Check
  // ---------------------------------------------------------------------------
  let wdr53Username = null;
  let wdr78Username = null;
  {
    const secCheck = await pgClient.query(`
      SELECT COUNT(*)::INT AS bad_count
      FROM sectors
      WHERE username IS NULL OR TRIM(username) = '' OR contact_phone IS NULL
    `);
    assert.equal(secCheck.rows[0].bad_count, 0, 'Sectors have NULL/empty username or NULL contact_phone');

    const unitCheck = await pgClient.query(`
      SELECT COUNT(*)::INT AS bad_count
      FROM units
      WHERE username IS NULL OR TRIM(username) = '' OR contact_phone IS NULL
    `);
    assert.equal(unitCheck.rows[0].bad_count, 0, 'Units have NULL/empty username or NULL contact_phone');

    const dupCheck = await pgClient.query(`
      SELECT LOWER(username) AS uname, COUNT(*)::INT AS cnt
      FROM (
        SELECT username FROM sectors
        UNION ALL
        SELECT username FROM units
      ) all_u
      GROUP BY LOWER(username)
      HAVING COUNT(*) > 1
    `);
    assert.equal(
      dupCheck.rows.length,
      0,
      `Found duplicate case-insensitive usernames: ${JSON.stringify(dupCheck.rows)}`
    );

    const valiyaRes = await pgClient.query(`
      SELECT u.login_code, u.name, u.username, s.login_code AS sector_code
      FROM units u
      JOIN sectors s ON s.id = u.sector_id
      WHERE u.login_code IN ('WDR53', 'WDR78')
      ORDER BY u.login_code ASC
    `);
    assert.equal(valiyaRes.rows.length, 2, 'Expected both WDR53 and WDR78');
    const wdr53 = valiyaRes.rows.find((r) => r.login_code === 'WDR53');
    const wdr78 = valiyaRes.rows.find((r) => r.login_code === 'WDR78');
    assert.equal(wdr53.name, 'Valiyaparambu');
    assert.equal(wdr53.sector_code, 'WDR106');
    assert.equal(wdr78.name, 'Valiyaparambu');
    assert.equal(wdr78.sector_code, 'WDR107');
    assert.notEqual(
      wdr53.username.toLowerCase(),
      wdr78.username.toLowerCase(),
      'WDR53 and WDR78 must have distinct usernames'
    );
    wdr53Username = wdr53.username;
    wdr78Username = wdr78.username;

    // Verify all 92 real units (WDR1-WDR92) have 0 active entries, password_hash IS NULL, must_change_password = true
    const realUnitsCheck = await pgClient.query(`
      SELECT
        u.login_code,
        u.password_hash IS NOT NULL AS has_pwd,
        u.must_change_password,
        COUNT(e.id) FILTER (WHERE e.is_deleted = false)::INT AS active_entries
      FROM units u
      LEFT JOIN entries e ON e.unit_id = u.id
      WHERE u.login_code NOT IN ('WDR202', 'WDR203', 'WDR204', 'WDR205')
      GROUP BY u.id, u.login_code, u.password_hash, u.must_change_password
    `);
    assert.equal(realUnitsCheck.rows.length, 92, `Expected 92 real units, got ${realUnitsCheck.rows.length}`);
    for (const r of realUnitsCheck.rows) {
      assert.equal(r.active_entries, 0, `Real unit ${r.login_code} has ${r.active_entries} active entries (expected 0)`);
      assert.equal(r.has_pwd, false, `Real unit ${r.login_code} should have password_hash IS NULL`);
      assert.equal(r.must_change_password, true, `Real unit ${r.login_code} should have must_change_password = true`);
    }

    pass(`2. Data Integrity & Clean Slate Check (92 real units have 0 entries; WDR53='${wdr53Username}', WDR78='${wdr78Username}')`);
  }

  // ---------------------------------------------------------------------------
  // SUITE 3: Full Manual-Workflow Parity Test (on WDR200 & WDR202 Test Accounts)
  // ---------------------------------------------------------------------------
  {
    // 3a. Sector Login & Dashboard
    const { data: secLogin, error: secLoginErr } = await rpc('auth_login', {
      p_username: 'Test Sector 1',
      p_password: 'WDR200',
    });
    assert.ifError(secLoginErr);
    assert.equal(secLogin?.valid, true);
    assert.equal(secLogin?.must_change_password, true);
    assert.equal(secLogin?.token?.split('.').length, 3);
    activeTokensToLogout.push(secLogin.token);

    const { data: secDash, error: secDashErr } = await rpc(
      'sector_get_dashboard',
      { p_code: secLogin.token }
    );
    assert.ifError(secDashErr);
    const secUnitCodes = (secDash?.units || []).map((u) => u.login_code).sort();
    assert.deepEqual(secUnitCodes, ['WDR202', 'WDR203']);

    // 3b. Unit First-Login + Direct Order + Mark Paid + Public Order + Reset Cycle
    const { data: unitLogin, error: unitLoginErr } = await rpc('auth_login', {
      p_username: 'Test Unit 1',
      p_password: 'WDR202',
    });
    assert.ifError(unitLoginErr);
    assert.equal(unitLogin?.valid, true);
    assert.equal(unitLogin?.must_change_password, true);
    const unit202Id = unitLogin.entity_id;

    const { data: setupRes, error: setupErr } = await rpc(
      'auth_complete_first_login',
      {
        p_token: unitLogin.token,
        p_new_password: 'TestPass#202',
        p_new_username: null,
      }
    );
    assert.ifError(setupErr);
    assert.equal(setupRes?.success, true);
    assert.equal(setupRes?.must_change_password, false);
    const activeUnitJwt = setupRes.token || unitLogin.token;

    // Ensure challenge is open for order test
    const { data: pubStats } = await rpc('get_public_stats');
    const wasOpen = pubStats?.settings?.is_challenge_open ?? true;
    if (!wasOpen) {
      await rpc('admin_update_settings', {
        p_code: adminJwt,
        p_unit_rate: Number(pubStats.settings.unit_rate) || 250,
        p_division_target: Number(pubStats.settings.division_target) || 10000,
        p_challenge_title: pubStats.settings.challenge_title,
        p_is_challenge_open: true,
      });
    }

    const { data: directOrder, error: directErr } = await rpc(
      'unit_add_entry',
      {
        p_code: activeUnitJwt,
        p_contributor_name: 'Parity Direct Buyer',
        p_mobile_number: '9876543202',
        p_quantity: 2,
        p_payment_status: 'UNPAID',
        p_payment_mode: null,
      }
    );
    assert.ifError(directErr);
    assert.ok(directOrder?.id, 'Expected direct order id');
    createdOrderIds.push(directOrder.id);

    const { data: paidRes, error: paidErr } = await rpc(
      'unit_mark_entry_paid',
      {
        p_code: activeUnitJwt,
        p_entry_id: directOrder.id,
        p_payment_mode: 'UPI',
      }
    );
    assert.ifError(paidErr);
    assert.equal(paidRes, true);

    const { data: pubOrder, error: pubErr } = await rpc('public_add_order', {
      p_unit_code: 'WDR202',
      p_contributor_name: 'Parity Public Buyer',
      p_mobile_number: '9876543203',
      p_quantity: 1,
      p_payment_status: 'PAID',
      p_payment_mode: 'CASH',
    });
    assert.ifError(pubErr);
    assert.ok(pubOrder?.id, 'Expected public order id');
    createdOrderIds.push(pubOrder.id);

    // Admin resets WDR202 back to default (WDR202, must_change_password: true)
    const { data: resetRes, error: resetErr } = await rpc(
      'admin_reset_account_password',
      {
        p_code: adminJwt,
        p_account_type: 'UNIT',
        p_account_id: unit202Id,
        p_temp_password: null,
      }
    );
    assert.ifError(resetErr);
    assert.equal(resetRes?.success, true);
    assert.equal(resetRes?.temp_password, 'WDR202');

    // Old JWT must be rejected
    const { error: revokedErr } = await rpc('unit_get_dashboard', {
      p_code: activeUnitJwt,
    });
    assert.ok(revokedErr, 'Old unit JWT must be rejected after admin reset');

    // Default login works again
    const { data: relogin, error: reloginErr } = await rpc('auth_login', {
      p_username: 'Test Unit 1',
      p_password: 'WDR202',
    });
    assert.ifError(reloginErr);
    assert.equal(relogin?.valid, true);
    assert.equal(relogin?.must_change_password, true);
    await rpc('auth_logout', { p_token: relogin.token });

    // Soft-delete both test orders so WDR202 stays clean
    for (const entryId of createdOrderIds.splice(0)) {
      const { error: delErr } = await rpc('admin_delete_entry', {
        p_code: adminJwt,
        p_entry_id: entryId,
      });
      assert.ifError(delErr);
    }

    pass('3. Full Manual-Workflow Parity Test on WDR200 & WDR202 (First-login, Direct Unpaid->Paid, Public Order, Admin Reset)');
  }

  // ---------------------------------------------------------------------------
  // SUITE 4: Non-Destructive Production Account Smoke Test (WDR101, WDR1, WDR53, WDR78)
  // ---------------------------------------------------------------------------
  {
    const smokeTargets = [
      { username: 'SSF Pandikkad Sector', code: 'WDR101', role: 'SECTOR' },
      { username: 'Pallipadi', code: 'WDR1', role: 'UNIT' },
      { username: wdr53Username, code: 'WDR53', role: 'UNIT' },
      { username: wdr78Username, code: 'WDR78', role: 'UNIT' },
    ];

    for (const target of smokeTargets) {
      const { data: loginRes, error: loginErr } = await rpc('auth_login', {
        p_username: target.username,
        p_password: target.code,
      });
      assert.ifError(loginErr);
      assert.equal(
        loginRes?.valid,
        true,
        `Smoke login failed for ${target.username} (${target.code})`
      );
      assert.equal(loginRes?.role, target.role);
      assert.equal(loginRes?.must_change_password, true);

      if (target.code === 'WDR101') {
        const { data: wdr101Dash, error: wdr101Err } = await rpc(
          'sector_get_dashboard',
          { p_code: loginRes.token }
        );
        assert.ifError(wdr101Err);
        const wdr101UnitCodes = (wdr101Dash?.units || []).map(
          (u) => u.login_code
        );
        assert.equal(wdr101UnitCodes.length, 10);
        for (let i = 1; i <= 10; i++) {
          assert.ok(
            wdr101UnitCodes.includes(`WDR${i}`),
            `WDR101 dashboard missing WDR${i}`
          );
        }
      }

      // Immediately revoke smoke session
      const { error: logoutErr } = await rpc('auth_logout', {
        p_token: loginRes.token,
      });
      assert.ifError(logoutErr);
    }

    pass('4. Non-Destructive Production Account Smoke Test (WDR101, WDR1, WDR53, WDR78 login + immediate logout)');
  }

  // ---------------------------------------------------------------------------
  // SUITE 5: Sequence Sync & Manual Creation Parity Test
  // ---------------------------------------------------------------------------
  {
    const { data: upsert299, error: upsert299Err } = await rpc(
      'sector_upsert_unit',
      {
        p_code: 'WDR200',
        p_unit_name: 'Temp Parity Unit 299',
        p_unit_code: 'WDR299',
      }
    );
    assert.ifError(upsert299Err);
    assert.equal(upsert299?.success, true);

    const { data: secDash } = await rpc('sector_get_dashboard', {
      p_code: 'WDR200',
    });
    const u299 = (secDash?.units || []).find((u) => u.login_code === 'WDR299');
    assert.ok(u299?.id, 'Expected WDR299 to be created without PK collision');
    tempUnit299Id = u299.id;

    const { data: del299, error: del299Err } = await rpc('sector_delete_unit', {
      p_code: 'WDR200',
      p_unit_id: tempUnit299Id,
    });
    assert.ifError(del299Err);
    assert.equal(del299, true);
    tempUnit299Id = null;

    pass('5. Sequence Sync & Manual Creation Parity Test (create & delete WDR299 via sector_upsert_unit)');
  }

  // ---------------------------------------------------------------------------
  // SUITE 6: Idempotency & Password-Preservation Test
  // ---------------------------------------------------------------------------
  {
    // Customize WDR203 password & contact_phone, then re-run seed_production.sql & schema.sql
    const { data: u203Login } = await rpc('auth_login', {
      p_username: 'Test Unit 2',
      p_password: 'WDR203',
    });
    assert.equal(u203Login?.valid, true);
    testUnit203Id = u203Login.entity_id;

    const { data: u203Setup, error: u203SetupErr } = await rpc(
      'auth_complete_first_login',
      {
        p_token: u203Login.token,
        p_new_password: 'KeepMe#203',
        p_new_username: null,
      }
    );
    assert.ifError(u203SetupErr);
    assert.equal(u203Setup?.success, true);
    if (u203Setup?.token) {
      activeTokensToLogout.push(u203Setup.token);
    }

    await rpc('admin_update_account_contact', {
      p_code: adminJwt,
      p_account_type: 'UNIT',
      p_account_id: testUnit203Id,
      p_contact_phone: '9876540203',
    });

    // Re-run seed_production.sql and schema.sql
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pgClient.query(seedSql);
    await pgClient.query(schemaSql);

    // Assert counts remain 10 sectors / 96 units and WDR203 password & phone were preserved
    const countsRes = await pgClient.query(`
      SELECT
        (SELECT COUNT(*)::INT FROM sectors) AS sec_cnt,
        (SELECT COUNT(*)::INT FROM units) AS unit_cnt
    `);
    assert.equal(countsRes.rows[0].sec_cnt, 10);
    assert.equal(countsRes.rows[0].unit_cnt, 96);

    const wdr203Row = await pgClient.query(
      `SELECT password_hash IS NOT NULL AS has_pwd, must_change_password, contact_phone FROM units WHERE login_code = 'WDR203'`
    );
    assert.equal(wdr203Row.rows[0].has_pwd, true, 'Re-running seed must NOT overwrite custom password_hash');
    assert.equal(wdr203Row.rows[0].must_change_password, false, 'Re-running seed must NOT reset must_change_password');
    assert.equal(wdr203Row.rows[0].contact_phone, '9876540203', 'Re-running seed must NOT overwrite contact_phone');

    // Reset WDR203 back to clean default state
    await rpc('admin_reset_account_password', {
      p_code: adminJwt,
      p_account_type: 'UNIT',
      p_account_id: testUnit203Id,
      p_temp_password: null,
    });
    await rpc('admin_update_account_contact', {
      p_code: adminJwt,
      p_account_type: 'UNIT',
      p_account_id: testUnit203Id,
      p_contact_phone: '',
    });
    testUnit203Id = null;

    pass('6. Idempotency & Password-Preservation Test (re-ran seed_production.sql & schema.sql with zero overwrites)');
  }

  console.log('\nALL PRODUCTION SEED VERIFICATION SUITES PASSED (6/6)');
} catch (err) {
  console.error('\nVERIFICATION FAILED:', err);
  process.exitCode = 1;
} finally {
  try {
    if (pgClient) {
      if (tempUnit299Id) {
        await pgClient
          .query(`DELETE FROM units WHERE id = $1 AND login_code = 'WDR299'`, [
            tempUnit299Id,
          ])
          .catch(() => {});
      }
      if (createdOrderIds.length > 0) {
        await pgClient
          .query(`DELETE FROM entries WHERE id = ANY($1::int[])`, [
            createdOrderIds,
          ])
          .catch(() => {});
      }
      if (testUnit203Id) {
        await pgClient
          .query(
            `UPDATE units SET password_hash = NULL, must_change_password = true, contact_phone = '' WHERE id = $1`,
            [testUnit203Id]
          )
          .catch(() => {});
      }
      for (const tok of activeTokensToLogout) {
        await rpc('auth_logout', { p_token: tok }).catch(() => {});
      }
      await pgClient.end();
    }
  } catch (cleanupErr) {
    console.error('Teardown warning:', cleanupErr);
  }
}
