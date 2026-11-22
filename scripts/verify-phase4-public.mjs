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

let createdOrderId = null;
let preTestChallengeOpen = null;

try {
  await initTransport();
  console.log('=== PHASE 4 PUBLIC LEADERBOARD & QUICK ENTRY VERIFICATION ===');

  const openSnap = await ownerClient.query(
    `SELECT value FROM app_settings WHERE key = 'is_challenge_open'`
  );
  preTestChallengeOpen =
    openSnap.rows.length > 0 ? openSnap.rows[0].value : 'true';

  if (preTestChallengeOpen !== 'true') {
    await ownerClient.query(
      `UPDATE app_settings SET value = 'true' WHERE key = 'is_challenge_open'`
    );
  }

  // Locate dedicated test unit WDR202 (never mutate production accounts)
  const wdr202Res = await ownerClient.query(
    `SELECT u.id, u.name, u.login_code, u.sector_id, s.name AS sector_name
     FROM units u
     JOIN sectors s ON s.id = u.sector_id
     WHERE u.login_code = 'WDR202'`
  );
  assert.equal(wdr202Res.rows.length, 1, 'Expected dedicated test unit WDR202');
  const testUnit = wdr202Res.rows[0];

  // Fetch all login codes + sensitive strings to audit zero leakage
  const allCodesRes = await ownerClient.query(
    `SELECT login_code FROM units UNION ALL SELECT login_code FROM sectors`
  );
  const allCodes = allCodesRes.rows.map((r) => String(r.login_code).toUpperCase());

  // 1. Call public_get_leaderboard() as anon -> assert ZERO unit codes, passwords, or PII
  const { data: lbBefore, error: lbErr } = await rpc('public_get_leaderboard');
  assert.ifError(lbErr);
  assert.ok(lbBefore?.summary, 'Expected summary in public_get_leaderboard');
  assert.ok(Array.isArray(lbBefore?.sectors), 'Expected sectors array');
  assert.ok(Array.isArray(lbBefore?.units), 'Expected units array');

  const serializedLb = JSON.stringify(lbBefore);
  for (const forbiddenKey of [
    'login_code',
    'order_code',
    'password_hash',
    'contact_phone',
    'contributor_name',
    'mobile_number',
    'username',
  ]) {
    assert.equal(
      serializedLb.includes(`"${forbiddenKey}"`),
      false,
      `Forbidden field "${forbiddenKey}" leaked in public_get_leaderboard`
    );
  }

  const upperSerialized = serializedLb.toUpperCase();
  for (const code of allCodes) {
    assert.equal(
      upperSerialized.includes(`"${code}"`),
      false,
      `Unit/Sector code "${code}" leaked in public_get_leaderboard`
    );
  }

  const perLiterRate = Number(lbBefore.summary.per_liter_rate);
  assert.ok(perLiterRate > 0, 'Expected positive per_liter_rate');
  const beforeLiters = Number(lbBefore.summary.total_liters);
  const beforeOrders = Number(lbBefore.summary.total_orders);
  console.log(
    `PASS: 1. public_get_leaderboard() anon response clean (${lbBefore.sectors.length} sectors, ${lbBefore.units.length} units, 0 codes/PII exposed)`
  );

  // 2. Call public_add_order against WDR202 with WRONG code -> must reject INVALID_UNIT_CODE
  const { error: wrongCodeErr } = await rpc('public_add_order', {
    p_unit_id: testUnit.id,
    p_unit_code: 'WRONG999',
    p_contributor_name: 'Phase4 Audit Probe',
    p_mobile: '9876501234',
    p_quantity: 2,
    p_payment_status: 'PAID',
    p_payment_mode: 'UPI',
  });
  assert.ok(wrongCodeErr, 'Expected wrong unit code to be rejected');
  assert.ok(
    wrongCodeErr.message.includes('INVALID_UNIT_CODE'),
    `Expected INVALID_UNIT_CODE error, got: ${wrongCodeErr.message}`
  );
  console.log('PASS: 2. public_add_order rejected wrong code with INVALID_UNIT_CODE');

  // 3. Zero-minus guard check
  const { error: zeroQtyErr } = await rpc('public_add_order', {
    p_unit_id: testUnit.id,
    p_unit_code: testUnit.login_code,
    p_contributor_name: 'Phase4 Audit Zero',
    p_mobile: '9876501234',
    p_quantity: -1,
    p_payment_status: 'PAID',
    p_payment_mode: 'UPI',
  });
  assert.ok(zeroQtyErr, 'Expected negative quantity to be rejected');
  console.log('PASS: 3. Zero-Minus Guard rejected non-positive quantity');

  // 4. Call public_add_order with valid WDR202 code, 2L, PAID/UPI -> succeeds and updates leaderboard
  const { data: createdOrder, error: createErr } = await rpc('public_add_order', {
    p_unit_id: testUnit.id,
    p_unit_code: '  wdr202  ', // verify case-insensitive trim
    p_contributor_name: 'Phase4 Verification Buyer',
    p_mobile: '9876501234',
    p_quantity: 2,
    p_payment_status: 'PAID',
    p_payment_mode: 'UPI',
  });
  assert.ifError(createErr);
  assert.ok(createdOrder?.id, 'Expected created order id');
  createdOrderId = createdOrder.id;
  assert.equal(createdOrder.unit_name, testUnit.name);
  assert.equal(createdOrder.sector_name, testUnit.sector_name);
  assert.equal(Number(createdOrder.quantity), 2);
  assert.equal(Number(createdOrder.total_amount), 2 * perLiterRate);
  assert.equal(createdOrder.payment_status, 'PAID');
  assert.equal(createdOrder.payment_mode, 'UPI');
  assert.equal('unit_code' in createdOrder, false, 'Must not return unit_code');

  const { data: lbAfter, error: lbAfterErr } = await rpc('public_get_leaderboard');
  assert.ifError(lbAfterErr);
  assert.equal(Number(lbAfter.summary.total_orders), beforeOrders + 1);
  assert.equal(
    Number(lbAfter.summary.total_liters),
    Math.round((beforeLiters + 2) * 100) / 100
  );
  console.log(
    `PASS: 4. Valid public_add_order on WDR202 succeeded (id=${createdOrderId}) and leaderboard incremented accurately (+2L, +1 order)`
  );

  // 5. Verify 'public' role works in push_subscriptions + clean removal
  const dummyEndpoint = `https://updates.push.services.mozilla.com/wpush/v2/test-phase4-${Date.now()}`;
  await ownerClient.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, account_id, role)
     VALUES ($1, 'test_p256dh', 'test_auth', NULL, 'public')`,
    [dummyEndpoint]
  );
  const pubSubCheck = await ownerClient.query(
    `SELECT role, account_id FROM push_subscriptions WHERE endpoint = $1`,
    [dummyEndpoint]
  );
  assert.equal(pubSubCheck.rows[0]?.role, 'public');
  assert.equal(pubSubCheck.rows[0]?.account_id, null);
  await ownerClient.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [
    dummyEndpoint,
  ]);
  console.log("PASS: 5. push_subscriptions accepts role='public' with account_id=NULL");

  // 6. Toggle is_challenge_open = false -> assert ORDERS_CLOSED, then restore
  await ownerClient.query(
    `UPDATE app_settings SET value = 'false' WHERE key = 'is_challenge_open'`
  );
  const { error: closedErr } = await rpc('public_add_order', {
    p_unit_id: testUnit.id,
    p_unit_code: testUnit.login_code,
    p_contributor_name: 'Phase4 Closed Check',
    p_mobile: '9876501234',
    p_quantity: 1,
    p_payment_status: 'UNPAID',
    p_payment_mode: null,
  });
  assert.ok(closedErr, 'Expected ORDERS_CLOSED when challenge is locked');
  assert.ok(
    closedErr.message.includes('ORDERS_CLOSED'),
    `Expected ORDERS_CLOSED error, got: ${closedErr.message}`
  );
  console.log('PASS: 6. Global lock enforcement verified (ORDERS_CLOSED when closed)');
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  try {
    if (ownerClient) {
      if (preTestChallengeOpen !== null) {
        await ownerClient.query(
          `UPDATE app_settings SET value = $1 WHERE key = 'is_challenge_open'`,
          [preTestChallengeOpen]
        );
      }
      if (createdOrderId !== null) {
        await ownerClient.query(
          `DELETE FROM push_dispatch_log WHERE (payload->'notification'->>'order_id')::INT = $1`,
          [createdOrderId]
        ).catch(() => {});
        await ownerClient.query(`DELETE FROM entries WHERE id = $1`, [
          createdOrderId,
        ]);
      }
    }
    console.log('PASS: 7. Clean teardown removed test order and restored settings.');
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
    process.exitCode = 1;
  } finally {
    if (pgAnonClient) await pgAnonClient.end().catch(() => {});
    if (ownerClient) await ownerClient.end().catch(() => {});
  }
}

if (!process.exitCode) {
  console.log('\nALL PHASE 4 PUBLIC LEADERBOARD VERIFICATION CHECKS PASSED');
}
