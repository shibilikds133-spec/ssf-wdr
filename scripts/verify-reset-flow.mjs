import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !dbUrl) {
  console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or SUPABASE_DB_URL');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const { Client } = pg;

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const suffix = Date.now().toString().slice(-6);
const testSectorName = `ResetTestSec_${suffix}`;
const testSectorCode = `RST${suffix.slice(-3)}S`;
const testUnitName = `ResetTestUnit_${suffix}`;
const testUnitCode = `RST${suffix.slice(-3)}U`;

let adminJwt = null;
let testSectorId = null;
let testUnitId = null;

async function main() {
  console.log('=== PASSWORD RESET FLOW END-TO-END AUDIT ===');

  // 1. Admin Login
  const { data: adminLogin, error: adminErr } = await supabase.rpc('auth_login', {
    p_username: 'SSF Wandoor',
    p_password: process.env.ADMIN_CODE || 'WDR100',
  });
  assert(!adminErr && adminLogin?.valid === true, `Admin login failed: ${adminErr?.message || adminLogin?.error}`);
  adminJwt = adminLogin.token;
  console.log('[PASS] 1. Admin login succeeded');

  // Create temp Sector & Unit via admin_bulk_upsert_units
  const { data: upsertRes, error: upsertErr } = await supabase.rpc('admin_bulk_upsert_units', {
    p_code: adminJwt,
    p_rows: [
      {
        sector_name: testSectorName,
        sector_code: testSectorCode,
        sector_phone: '9876543210',
        unit_name: testUnitName,
        unit_code: testUnitCode,
        unit_phone: '9876543211',
      },
    ],
  });
  assert(!upsertErr && upsertRes?.success === true, `Create sector/unit failed: ${upsertErr?.message || JSON.stringify(upsertRes)}`);

  const { data: initDash, error: initDashErr } = await supabase.rpc('admin_get_dashboard', {
    p_code: adminJwt,
  });
  assert(!initDashErr && initDash, `Initial admin dashboard failed: ${initDashErr?.message}`);
  const createdSec = (initDash.sectors || []).find((s) => s.login_code === testSectorCode);
  const createdUnit = (initDash.unit_summaries || []).find((u) => u.login_code === testUnitCode);
  assert(createdSec && createdUnit, 'Failed to locate newly created test sector/unit');
  testSectorId = createdSec.id;
  testUnitId = createdUnit.id;

  // 2. Protected Admin & Unknown Account checks
  const { error: adminResetErr } = await supabase.rpc('request_password_reset', {
    p_username: 'ssf wandoor',
  });
  assert(
    Boolean(adminResetErr) && /cannot be reset/i.test(adminResetErr.message),
    `Admin reset must be blocked, got: ${adminResetErr?.message}`
  );

  const { error: unknownResetErr } = await supabase.rpc('request_password_reset', {
    p_username: `NoSuchAccount_${suffix}`,
  });
  assert(
    Boolean(unknownResetErr) && /account not found/i.test(unknownResetErr.message),
    `Unknown account must fail cleanly, got: ${unknownResetErr?.message}`
  );
  console.log('[PASS] 2. Admin account protected & unknown User ID handled safely');

  // 3. Sector & Unit case-insensitive reset request + Duplicate guard
  const { data: secReq1, error: secReq1Err } = await supabase.rpc('request_password_reset', {
    p_username: testSectorName.toLowerCase(),
  });
  assert(!secReq1Err && secReq1?.success === true && secReq1?.already_pending === false, `Sector reset req 1 failed: ${secReq1Err?.message}`);

  const { data: secReq2, error: secReq2Err } = await supabase.rpc('request_password_reset', {
    p_username: testSectorName.toUpperCase(),
  });
  assert(!secReq2Err && secReq2?.success === true && secReq2?.already_pending === true, `Sector duplicate guard failed: ${JSON.stringify(secReq2)}`);

  const { data: unitReq1, error: unitReq1Err } = await supabase.rpc('request_password_reset', {
    p_username: testUnitName.toLowerCase(),
  });
  assert(!unitReq1Err && unitReq1?.success === true && unitReq1?.already_pending === false, `Unit reset req 1 failed: ${unitReq1Err?.message}`);

  // Verify Admin queue has exactly 1 pending row for each (no duplicates)
  const { data: dash1, error: dash1Err } = await supabase.rpc('admin_get_dashboard', {
    p_code: adminJwt,
  });
  assert(!dash1Err && dash1, `Admin dashboard fetch failed: ${dash1Err?.message}`);
  const secPending = (dash1.pending_reset_requests || []).filter(
    (r) => r.account_type === 'SECTOR' && r.account_id === testSectorId
  );
  const unitPending = (dash1.pending_reset_requests || []).filter(
    (r) => r.account_type === 'UNIT' && r.account_id === testUnitId
  );
  assert(secPending.length === 1, `Expected 1 pending sector request, got ${secPending.length}`);
  assert(unitPending.length === 1, `Expected 1 pending unit request, got ${unitPending.length}`);
  console.log('[PASS] 3. Case-insensitive Sector/Unit requests + duplicate guard verified');

  // 4. Dismiss Flow on Sector request
  const { error: dismissErr } = await supabase.rpc('admin_dismiss_reset_request', {
    p_code: adminJwt,
    p_request_id: secPending[0].id,
  });
  assert(!dismissErr, `Dismiss failed: ${dismissErr?.message}`);

  const { data: dash2 } = await supabase.rpc('admin_get_dashboard', { p_code: adminJwt });
  const secPendingAfter = (dash2.pending_reset_requests || []).filter(
    (r) => r.account_type === 'SECTOR' && r.account_id === testSectorId
  );
  assert(secPendingAfter.length === 0, 'Dismissed sector request still in pending queue');
  console.log('[PASS] 4. Admin dismiss flow cleanly cleared pending request');

  // 5. Establish an active pre-reset 14-day JWT for Unit, then Admin Reset
  const { data: initialUnitLogin, error: initUnitErr } = await supabase.rpc('auth_login', {
    p_username: testUnitName,
    p_password: testUnitCode,
  });
  assert(!initUnitErr && initialUnitLogin?.valid === true, `Initial unit login failed: ${initUnitErr?.message}`);
  const preResetJwt = initialUnitLogin.token;

  const { error: preDashErr } = await supabase.rpc('unit_get_dashboard', { p_code: preResetJwt });
  assert(!preDashErr, `Pre-reset unit dashboard failed: ${preDashErr?.message}`);

  const customTempPwd = `TMP${suffix}`;
  const { data: resetRes, error: resetErr } = await supabase.rpc('admin_reset_account_password', {
    p_code: adminJwt,
    p_account_type: 'UNIT',
    p_account_id: testUnitId,
    p_temp_password: customTempPwd,
  });
  assert(!resetErr && resetRes?.success === true && resetRes?.temp_password === customTempPwd, `Admin reset failed: ${resetErr?.message}`);

  // Verify pre-reset JWT is immediately revoked
  const { error: revokedDashErr } = await supabase.rpc('unit_get_dashboard', { p_code: preResetJwt });
  assert(Boolean(revokedDashErr), 'Pre-reset JWT should be rejected after admin reset');

  const { data: revokedRefresh } = await supabase.rpc('auth_refresh_session', { p_token: preResetJwt });
  assert(revokedRefresh?.valid === false, 'Pre-reset JWT refresh should return valid: false');

  // Verify Unit pending request was automatically resolved
  const { data: dash3 } = await supabase.rpc('admin_get_dashboard', { p_code: adminJwt });
  const unitPendingAfter = (dash3.pending_reset_requests || []).filter(
    (r) => r.account_type === 'UNIT' && r.account_id === testUnitId
  );
  assert(unitPendingAfter.length === 0, 'Unit pending request should be resolved after admin reset');
  console.log('[PASS] 5. Admin reset revoked active pre-reset JWT & resolved queue item');

  // 6. Temp Password Login -> Forced Setup -> Fresh 14-day JWT -> Old Temp Rejected
  const { data: tempLogin, error: tempLoginErr } = await supabase.rpc('auth_login', {
    p_username: testUnitName,
    p_password: customTempPwd,
  });
  assert(
    !tempLoginErr && tempLogin?.valid === true && tempLogin?.must_change_password === true,
    `Temp login failed or did not require password change: ${JSON.stringify(tempLogin)}`
  );
  const tempJwt = tempLogin.token;

  const finalPassword = `Secure#${suffix}`;
  const { data: setupRes, error: setupErr } = await supabase.rpc('auth_complete_first_login', {
    p_token: tempJwt,
    p_new_password: finalPassword,
    p_new_username: null,
  });
  assert(
    !setupErr &&
      setupRes?.success === true &&
      setupRes?.must_change_password === false &&
      typeof setupRes?.token === 'string' &&
      setupRes.token.split('.').length === 3 &&
      setupRes.token !== tempJwt,
    `First login setup did not issue fresh JWT: ${setupErr?.message || JSON.stringify(setupRes)}`
  );
  const freshJwt = setupRes.token;

  // Old tempJwt must be revoked after rotation
  const { data: oldTempRefresh } = await supabase.rpc('auth_refresh_session', { p_token: tempJwt });
  assert(oldTempRefresh?.valid === false, 'Old temp JWT should be revoked after first-login setup');

  // Fresh JWT must work on unit_get_dashboard
  const { error: freshDashErr } = await supabase.rpc('unit_get_dashboard', { p_code: freshJwt });
  assert(!freshDashErr, `Fresh post-setup JWT failed on unit_get_dashboard: ${freshDashErr?.message}`);

  // Old temp password must be strictly rejected
  const { data: oldPwdLogin } = await supabase.rpc('auth_login', {
    p_username: testUnitName,
    p_password: customTempPwd,
  });
  assert(oldPwdLogin?.valid === false, 'Old temporary password should be rejected after setup');

  // New password must succeed with must_change_password === false
  const { data: newPwdLogin, error: newPwdErr } = await supabase.rpc('auth_login', {
    p_username: testUnitName,
    p_password: finalPassword,
  });
  assert(
    !newPwdErr && newPwdLogin?.valid === true && newPwdLogin?.must_change_password === false,
    `New password login failed: ${newPwdErr?.message || JSON.stringify(newPwdLogin)}`
  );
  console.log('[PASS] 6. Temp login -> Forced setup -> Fresh 14-day JWT -> Old temp & JWT rejected');

  console.log('\nALL PASSWORD RESET FLOW CHECKS PASSED (6/6)');
}

async function teardown() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    if (testUnitId) {
      await client.query("DELETE FROM auth_sessions WHERE role = 'UNIT' AND entity_id = $1", [testUnitId]);
      await client.query("DELETE FROM password_reset_requests WHERE account_type = 'UNIT' AND account_id = $1", [testUnitId]);
      await client.query('DELETE FROM units WHERE id = $1', [testUnitId]);
    }
    if (testSectorId) {
      await client.query("DELETE FROM auth_sessions WHERE role = 'SECTOR' AND entity_id = $1", [testSectorId]);
      await client.query("DELETE FROM password_reset_requests WHERE account_type = 'SECTOR' AND account_id = $1", [testSectorId]);
      await client.query('DELETE FROM sectors WHERE id = $1', [testSectorId]);
    }
    console.log('[TEARDOWN] Cleaned up temporary test Sector, Unit, sessions, and reset requests.');
  } finally {
    await client.end();
  }
}

main()
  .catch((err) => {
    console.error('\nVERIFICATION FAILED:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await teardown();
    } catch (e) {
      console.error('Teardown error:', e);
    }
  });
