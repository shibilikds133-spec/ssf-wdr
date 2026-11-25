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
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: supabaseAnonKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`REST probe status ${res.status}`);
    }
    usePgFallback = false;
  } catch {
    pgAnonClient = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await pgAnonClient.connect();
    usePgFallback = true;
    console.log(
      'INFO: Supabase REST API unreachable; verifying live RPCs via Postgres pooler as role anon.'
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

const createdRequestIds = [];
const createdEntryIds = [];

try {
  await initTransport();
  console.log('=== OPEN PUBLIC ORDER PORTAL & APPROVAL QUEUE VERIFICATION ===');

  // 1. Baseline snapshot
  const baselineEntriesRes = await ownerClient.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE is_deleted = false`
  );
  const baselineEntryCount = Number(baselineEntriesRes.rows[0].cnt);

  const { data: baselineLb, error: lbErr1 } = await rpc('public_get_leaderboard');
  assert.ifError(lbErr1);
  const baselineLiters = Number(baselineLb.summary.total_liters);
  const baselineOrders = Number(baselineLb.summary.total_orders);

  const adminCodeRes = await ownerClient.query(
    `SELECT value FROM app_settings WHERE key = 'admin_code'`
  );
  const adminCode = adminCodeRes.rows[0]?.value?.trim();
  assert.ok(adminCode, 'admin_code must exist in app_settings');

  const unitWdr202Res = await ownerClient.query(
    `SELECT id, name, sector_id FROM units WHERE UPPER(login_code) = 'WDR202' LIMIT 1`
  );
  const unitWdr202 = unitWdr202Res.rows[0];
  assert.ok(unitWdr202, 'Test unit WDR202 must exist');

  // 2. Verify get_public_unit_options returns sectors/units without login_code
  const { data: unitOpts, error: optsErr } = await rpc('get_public_unit_options');
  assert.ifError(optsErr);
  assert.ok(Array.isArray(unitOpts.sectors) && unitOpts.sectors.length > 0);
  assert.ok(Array.isArray(unitOpts.units) && unitOpts.units.length > 0);
  for (const u of unitOpts.units) {
    assert.equal(u.login_code, undefined, 'login_code must not be exposed');
    assert.equal(u.order_code, undefined, 'order_code must not be exposed');
  }
  console.log('PASS: get_public_unit_options returns sectors/units with zero codes');

  // 3. Submit Request A (without unit) and Request B (with WDR202) as anon
  const { data: reqA, error: reqAErr } = await rpc('submit_public_order_request', {
    p_customer_name: 'Verify Test Customer A',
    p_mobile: '9876543210',
    p_quantity: 2,
    p_unit_id: null,
  });
  assert.ifError(reqAErr);
  assert.ok(reqA?.id, 'Request A id returned');
  assert.equal(reqA.unit_id, null);
  assert.equal(reqA.sector_id, null);
  assert.equal(reqA.status, 'pending');
  createdRequestIds.push(reqA.id);

  const { data: reqB, error: reqBErr } = await rpc('submit_public_order_request', {
    p_customer_name: 'Verify Test Customer B',
    p_mobile: '9876543211',
    p_quantity: 3,
    p_unit_id: unitWdr202.id,
  });
  assert.ifError(reqBErr);
  assert.ok(reqB?.id, 'Request B id returned');
  assert.equal(reqB.unit_id, unitWdr202.id);
  assert.equal(reqB.sector_id, unitWdr202.sector_id);
  assert.equal(reqB.status, 'pending');
  createdRequestIds.push(reqB.id);
  console.log('PASS: Submitted Request A (no unit) & Request B (WDR202) as anon');

  // 3b. Assert fractional liters like 1.5 are rejected
  const { error: fracErr } = await rpc('submit_public_order_request', {
    p_customer_name: 'Verify Fractional Guard',
    p_mobile: '9876543212',
    p_quantity: 1.5,
    p_unit_id: null,
  });
  assert.ok(fracErr, 'Fractional quantity (1.5L) must be rejected');
  console.log('PASS: Fractional quantity (1.5L) rejected by submit_public_order_request');

  // 4. Assert official entries & leaderboard did NOT change while pending
  const afterSubmitEntriesRes = await ownerClient.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE is_deleted = false`
  );
  assert.equal(
    Number(afterSubmitEntriesRes.rows[0].cnt),
    baselineEntryCount,
    'Official entries count must not change while pending'
  );
  const { data: afterSubmitLb, error: lbErr2 } = await rpc('public_get_leaderboard');
  assert.ifError(lbErr2);
  assert.equal(Number(afterSubmitLb.summary.total_liters), baselineLiters);
  assert.equal(Number(afterSubmitLb.summary.total_orders), baselineOrders);
  console.log('PASS: Official entries and leaderboard unchanged while requests are pending');

  // 5. Assert anon CANNOT directly SELECT from public_order_requests
  if (!usePgFallback) {
    const { data: directData, error: directErr } = await supabase
      .from('public_order_requests')
      .select('*');
    assert.ok(
      directErr || (Array.isArray(directData) && directData.length === 0),
      'anon must not be able to read public_order_requests directly'
    );
  }
  await ownerClient.query('BEGIN');
  await ownerClient.query('SET LOCAL ROLE anon');
  let anonSelectBlocked = false;
  try {
    await ownerClient.query('SELECT * FROM public_order_requests');
  } catch {
    anonSelectBlocked = true;
  }
  await ownerClient.query('ROLLBACK');
  assert.equal(anonSelectBlocked, true, 'anon direct SELECT on public_order_requests must be blocked');
  console.log('PASS: anon direct SELECT on public_order_requests blocked by RLS/REVOKE');

  // 6. Test Division Admin listing & inline unit reassignment on Request A
  const { data: listPending, error: listErr } = await rpc('admin_get_public_order_requests', {
    p_token: adminCode,
    p_status: 'pending',
    p_search: 'Verify Test Customer',
  });
  assert.ifError(listErr);
  assert.ok(
    listPending.requests.some((r) => r.id === reqA.id) &&
      listPending.requests.some((r) => r.id === reqB.id),
    'Admin should see both pending test requests'
  );

  const { data: reassignedA, error: reassignErr } = await rpc(
    'admin_update_public_request_unit',
    {
      p_token: adminCode,
      p_request_id: reqA.id,
      p_unit_id: unitWdr202.id,
    }
  );
  assert.ifError(reassignErr);
  assert.equal(reassignedA.unit_id, unitWdr202.id);
  assert.equal(reassignedA.sector_id, unitWdr202.sector_id);
  console.log('PASS: Division Admin inline unit reassignment works');

  // 7. Test approval of Request A + double-approve guard + official entries increment
  const { data: approvedA, error: approveErr } = await rpc(
    'admin_approve_public_order_request',
    {
      p_token: adminCode,
      p_request_id: reqA.id,
      p_unit_id: unitWdr202.id,
      p_payment_status: 'UNPAID',
      p_payment_mode: null,
    }
  );
  assert.ifError(approveErr);
  assert.ok(approvedA?.entry_id, 'Approved entry_id returned');
  createdEntryIds.push(approvedA.entry_id);

  const { error: doubleApproveErr } = await rpc(
    'admin_approve_public_order_request',
    {
      p_token: adminCode,
      p_request_id: reqA.id,
      p_unit_id: unitWdr202.id,
      p_payment_status: 'UNPAID',
      p_payment_mode: null,
    }
  );
  assert.ok(doubleApproveErr, 'Double-approval must be rejected');

  const afterApproveEntriesRes = await ownerClient.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE is_deleted = false`
  );
  assert.equal(Number(afterApproveEntriesRes.rows[0].cnt), baselineEntryCount + 1);
  console.log('PASS: Approval increments official entries and blocks double-approve');

  // 7b. Isolated Order-Approval-Only Push Notification Check
  await ownerClient.query('BEGIN');
  await ownerClient.query('SET LOCAL ROLE anon');
  let anonPushSelectBlocked = false;
  try {
    await ownerClient.query('SELECT * FROM public_order_push_subscriptions');
  } catch {
    anonPushSelectBlocked = true;
  }
  await ownerClient.query('ROLLBACK');
  assert.equal(
    anonPushSelectBlocked,
    true,
    'anon direct SELECT on public_order_push_subscriptions must be blocked'
  );

  await ownerClient.query(
    `INSERT INTO public_order_push_subscriptions (request_id, endpoint, p256dh, auth)
     VALUES ($1, 'https://fcm.googleapis.com/fcm/send/verify-open-order-test', 'test-p256dh', 'test-auth')`,
    [reqA.id]
  );

  const claimRes1 = await ownerClient.query(
    `SELECT claim_public_order_approved_push($1) AS res`,
    [reqA.id]
  );
  const claim1 = claimRes1.rows[0]?.res;
  assert.equal(claim1?.claimed, true, 'First claim_public_order_approved_push must claim');
  assert.equal(claim1?.subscriptions?.length, 1, 'Should return 1 attached subscription');
  assert.equal(claim1?.notification?.url, '/order');
  assert.equal(claim1?.notification?.type, 'public_order_approved');
  assert.equal(
    `${claim1?.notification?.title ?? ''} ${claim1?.notification?.body ?? ''}`.includes('WDR202'),
    false,
    'Approval push must never expose unit order_code'
  );

  const claimRes2 = await ownerClient.query(
    `SELECT claim_public_order_approved_push($1) AS res`,
    [reqA.id]
  );
  assert.equal(claimRes2.rows[0]?.res?.claimed, false, 'Second claim must be deduplicated');
  console.log('PASS: Isolated approval-only push subscription, claim, dedup, and zero-code verified');

  // 8. Test reset of approved Request A -> official entries decrements back to baseline
  const { data: resetA, error: resetErr } = await rpc(
    'admin_reset_public_order_request',
    {
      p_token: adminCode,
      p_request_id: reqA.id,
    }
  );
  assert.ifError(resetErr);
  assert.equal(resetA.status, 'pending');

  const afterResetEntriesRes = await ownerClient.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE is_deleted = false`
  );
  assert.equal(
    Number(afterResetEntriesRes.rows[0].cnt),
    baselineEntryCount,
    'Resetting approved request must soft-delete linked entry and restore baseline count'
  );
  console.log('PASS: Resetting approved request cleanly reverts official entries');

  // 9. Test cancellation of Request B -> stays in cancelled status, never deleted
  const { data: cancelB, error: cancelErr } = await rpc(
    'admin_cancel_public_order_request',
    {
      p_token: adminCode,
      p_request_id: reqB.id,
    }
  );
  assert.ifError(cancelErr);
  assert.equal(cancelB.status, 'cancelled');

  const { data: cancelledList, error: cancelListErr } = await rpc(
    'admin_get_public_order_requests',
    {
      p_token: adminCode,
      p_status: 'cancelled',
      p_search: 'Verify Test Customer B',
    }
  );
  assert.ifError(cancelListErr);
  assert.ok(
    cancelledList.requests.some((r) => r.id === reqB.id && r.status === 'cancelled'),
    'Cancelled request must remain in cancelled view'
  );
  console.log('PASS: Cancellation transitions status to cancelled without deleting');

  console.log('ALL OPEN PUBLIC ORDER & APPROVAL QUEUE CHECKS PASSED!');
} finally {
  if (ownerClient) {
    if (createdEntryIds.length > 0) {
      await ownerClient
        .query(`DELETE FROM entries WHERE id = ANY($1::int[])`, [createdEntryIds])
        .catch(() => {});
    }
    if (createdRequestIds.length > 0) {
      await ownerClient
        .query(
          `DELETE FROM push_dispatch_log WHERE event_type = 'public_order_approved' AND (payload->>'request_id')::uuid = ANY($1::uuid[])`,
          [createdRequestIds]
        )
        .catch(() => {});
      await ownerClient
        .query(`DELETE FROM public_order_requests WHERE id = ANY($1::uuid[])`, [
          createdRequestIds,
        ])
        .catch(() => {});
    }
    await ownerClient
      .query(`DELETE FROM entries WHERE contributor_name LIKE 'Verify Test Customer%'`)
      .catch(() => {});
    await ownerClient
      .query(`DELETE FROM public_order_requests WHERE customer_name LIKE 'Verify Test Customer%'`)
      .catch(() => {});
    await ownerClient.end().catch(() => {});
  }
  if (pgAnonClient) {
    await pgAnonClient.end().catch(() => {});
  }
}
