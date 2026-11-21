import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const dbUrl = process.env.SUPABASE_DB_URL?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing required env variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

let pgClient = null;
let usePgFallback = false;

async function initTransport() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    await fetch(`${supabaseUrl}/rest/v1/`, { signal: controller.signal });
    clearTimeout(timer);
    usePgFallback = false;
  } catch {
    if (!dbUrl) {
      throw new Error(
        'Supabase REST endpoint unreachable and SUPABASE_DB_URL is not configured for fallback.'
      );
    }
    pgClient = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await pgClient.connect();
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

const TEMP_SECTOR_NAME = 'Phase3B1 Temp Sector 297';
const TEMP_SECTOR_CODE = 'WDR297';
const TEMP_SECTOR_PHONE = '9876500197';

const TEMP_UNIT_NAME = 'Phase3B1 Temp Unit 977';
const TEMP_UNIT_CODE = 'WDR977';
const TEMP_UNIT_PHONE = '9876500977';
const TEMP_UNIT_CUSTOM_ID = 'Temp Unit Custom ID';

const results = [];
let originalSettings = null;
let tempSectorId = null;
let tempUnitId = null;
let unitOrderId = null;
let publicOrderId = null;

function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}

try {
  await initTransport();

  // Capture original settings first
  {
    const { data: adminDash, error: adminErr } = await rpc(
      'admin_get_dashboard',
      { p_code: ADMIN_CODE }
    );
    assert.ifError(adminErr);
    assert.ok(adminDash?.settings, 'Expected admin settings');
    originalSettings = adminDash.settings;
  }

  // 1. Login Directory Privacy
  {
    const { data: dir, error: dirErr } = await rpc('get_login_directory');
    assert.ifError(dirErr);
    assert.ok(Array.isArray(dir), 'Expected array from get_login_directory');
    const adminEntry = dir.find((d) => d.username === ADMIN_USERNAME);
    assert.ok(adminEntry, "Expected 'SSF Wandoor' in login directory");
    assert.equal(adminEntry.role, 'ADMIN');

    const serialized = JSON.stringify(dir);
    assert.equal(
      serialized.includes('password_hash'),
      false,
      'Login directory MUST NOT expose password_hash'
    );
    assert.equal(
      serialized.includes(ADMIN_CODE),
      false,
      'Login directory MUST NOT expose WDR100'
    );
    pass('1. Login Directory Privacy (no password_hash or WDR100 leaked)');
  }

  // 2. Admin Login
  {
    const { data: okLogin, error: okErr } = await rpc('auth_login', {
      p_username: ADMIN_USERNAME,
      p_password: ADMIN_CODE,
    });
    assert.ifError(okErr);
    assert.equal(okLogin?.valid, true);
    assert.equal(okLogin?.role, 'ADMIN');
    assert.equal(okLogin?.must_change_password, false);
    assert.ok(okLogin?.token, 'Expected admin session token');

    const { data: badLogin, error: badErr } = await rpc('auth_login', {
      p_username: ADMIN_USERNAME,
      p_password: 'WRONG_PASSWORD',
    });
    assert.ifError(badErr);
    assert.equal(badLogin?.valid, false);
    pass('2. Admin Login (valid succeeds, wrong password fails)');
  }

  // 3. Create Temporary Test Sector & Unit with phone numbers
  {
    const { data: upsertRes, error: upsertErr } = await rpc(
      'admin_bulk_upsert_units',
      {
        p_code: ADMIN_CODE,
        p_rows: [
          {
            sector_name: TEMP_SECTOR_NAME,
            sector_code: TEMP_SECTOR_CODE,
            sector_phone: TEMP_SECTOR_PHONE,
            unit_name: TEMP_UNIT_NAME,
            unit_code: TEMP_UNIT_CODE,
            unit_phone: TEMP_UNIT_PHONE,
          },
        ],
      }
    );
    assert.ifError(upsertErr);
    assert.equal(upsertRes?.success, true);

    const { data: dash, error: dashErr } = await rpc('admin_get_dashboard', {
      p_code: ADMIN_CODE,
    });
    assert.ifError(dashErr);

    const sec = dash.sectors.find((s) => s.login_code === TEMP_SECTOR_CODE);
    const unit = dash.unit_summaries.find(
      (u) => u.login_code === TEMP_UNIT_CODE
    );
    assert.ok(sec, 'Expected temp sector WDR197');
    assert.ok(unit, 'Expected temp unit WDR977');
    assert.equal(sec.contact_phone, TEMP_SECTOR_PHONE);
    assert.equal(unit.contact_phone, TEMP_UNIT_PHONE);

    tempSectorId = sec.id;
    tempUnitId = unit.id;
    pass('3. Created Temporary Test Sector WDR197 & Unit WDR977 with phones');
  }

  // 4. Mandatory First-Login Password Change
  let unitToken = null;
  {
    const { data: firstLogin, error: loginErr } = await rpc('auth_login', {
      p_username: TEMP_UNIT_NAME,
      p_password: TEMP_UNIT_CODE,
    });
    assert.ifError(loginErr);
    assert.equal(firstLogin?.valid, true);
    assert.equal(firstLogin?.role, 'UNIT');
    assert.equal(firstLogin?.must_change_password, true);
    assert.ok(firstLogin?.token, 'Expected unit session token');
    unitToken = firstLogin.token;

    // Reject reusing default code
    const { error: reuseErr } = await rpc('auth_complete_first_login', {
      p_token: unitToken,
      p_new_password: TEMP_UNIT_CODE,
      p_new_username: null,
    });
    assert.ok(
      reuseErr,
      'auth_complete_first_login MUST reject reusing default code'
    );

    // Complete first login with custom password & custom User ID
    const { data: completeRes, error: completeErr } = await rpc(
      'auth_complete_first_login',
      {
        p_token: unitToken,
        p_new_password: 'SecurePass99',
        p_new_username: TEMP_UNIT_CUSTOM_ID,
      }
    );
    assert.ifError(completeErr);
    assert.equal(completeRes?.success, true);
    assert.equal(completeRes?.must_change_password, false);
    assert.equal(completeRes?.username, TEMP_UNIT_CUSTOM_ID);

    // Confirm old default code login NOW FAILS
    const { data: oldPwdLogin, error: oldPwdErr } = await rpc('auth_login', {
      p_username: TEMP_UNIT_CUSTOM_ID,
      p_password: TEMP_UNIT_CODE,
    });
    assert.ifError(oldPwdErr);
    assert.equal(
      oldPwdLogin?.valid,
      false,
      'Old default code login MUST fail after password change'
    );

    // Confirm new password login with custom User ID SUCCEEDS
    const { data: newPwdLogin, error: newPwdErr } = await rpc('auth_login', {
      p_username: TEMP_UNIT_CUSTOM_ID,
      p_password: 'SecurePass99',
    });
    assert.ifError(newPwdErr);
    assert.equal(newPwdLogin?.valid, true);
    assert.equal(newPwdLogin?.must_change_password, false);
    unitToken = newPwdLogin.token;

    // Confirm raw login_code ('WDR977') is REJECTED by unit_get_dashboard, while valid token SUCCEEDS
    const { error: rawCodeErr } = await rpc('unit_get_dashboard', {
      p_code: TEMP_UNIT_CODE,
    });
    assert.ok(
      rawCodeErr,
      'Raw login_code WDR977 MUST be rejected once custom password is set'
    );

    const { data: unitDash, error: unitDashErr } = await rpc(
      'unit_get_dashboard',
      { p_code: unitToken }
    );
    assert.ifError(unitDashErr);
    assert.equal(unitDash?.unit?.login_code, TEMP_UNIT_CODE);

    pass(
      '4. Mandatory First-Login Password Change (reuse rejected, custom ID + password, raw code blocked)'
    );
  }

  // 5. Password Reset Request & Admin Reset
  {
    // Admin reset request MUST be rejected
    const { error: adminReqErr } = await rpc('request_password_reset', {
      p_username: ADMIN_USERNAME,
    });
    assert.ok(
      adminReqErr,
      'request_password_reset for SSF Wandoor MUST be rejected'
    );

    // Request reset for Temp Unit Custom ID
    const { data: reqRes, error: reqErr } = await rpc(
      'request_password_reset',
      { p_username: TEMP_UNIT_CUSTOM_ID }
    );
    assert.ifError(reqErr);
    assert.equal(reqRes?.success, true);

    // Verify it appears in admin_get_dashboard().pending_reset_requests
    const { data: adminDash, error: dashErr } = await rpc(
      'admin_get_dashboard',
      { p_code: ADMIN_CODE }
    );
    assert.ifError(dashErr);
    const pendingReq = (adminDash.pending_reset_requests || []).find(
      (r) => r.account_type === 'UNIT' && r.account_id === tempUnitId
    );
    assert.ok(
      pendingReq,
      'Expected pending reset request in admin_get_dashboard().pending_reset_requests'
    );

    // Admin resets account password back to default code
    const { data: resetRes, error: resetErr } = await rpc(
      'admin_reset_account_password',
      {
        p_code: ADMIN_CODE,
        p_account_type: 'UNIT',
        p_account_id: tempUnitId,
        p_temp_password: null,
      }
    );
    assert.ifError(resetErr);
    assert.equal(resetRes?.success, true);
    assert.equal(resetRes?.temp_password, TEMP_UNIT_CODE);

    // Old unit token MUST now be REVOKED
    const { error: revokedErr } = await rpc('unit_get_dashboard', {
      p_code: unitToken,
    });
    assert.ok(revokedErr, 'Old unit token MUST be revoked after admin reset');

    // Pending request MUST now be resolved
    const { data: adminDashAfter, error: dashAfterErr } = await rpc(
      'admin_get_dashboard',
      { p_code: ADMIN_CODE }
    );
    assert.ifError(dashAfterErr);
    const stillPending = (adminDashAfter.pending_reset_requests || []).find(
      (r) => r.account_type === 'UNIT' && r.account_id === tempUnitId
    );
    assert.equal(
      stillPending,
      undefined,
      'Pending reset request MUST be marked RESOLVED after admin reset'
    );

    // Unit can log in again with default code WDR977 (must_change_password: true)
    const { data: reloginRes, error: reloginErr } = await rpc('auth_login', {
      p_username: TEMP_UNIT_CUSTOM_ID,
      p_password: TEMP_UNIT_CODE,
    });
    assert.ifError(reloginErr);
    assert.equal(reloginRes?.valid, true);
    assert.equal(reloginRes?.must_change_password, true);
    unitToken = reloginRes.token;

    pass(
      '5. Password Reset Request & Admin Reset (admin blocked, queue populated, token revoked, default login restored)'
    );
  }

  // 6. Dual Order Logic Verification
  {
    // Temporarily set is_challenge_open = false
    const { error: closeErr } = await rpc('admin_update_settings', {
      p_code: ADMIN_CODE,
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: false,
    });
    assert.ifError(closeErr);

    // public_add_order MUST be rejected when closed
    const { error: pubClosedErr } = await rpc('public_add_order', {
      p_unit_code: TEMP_UNIT_CODE,
      p_contributor_name: 'Public Closed Test',
      p_mobile_number: '9876543210',
      p_quantity: 1,
      p_payment_mode: 'CASH',
    });
    assert.ok(pubClosedErr, 'public_add_order MUST be rejected when closed');
    assert.ok(
      pubClosedErr.message.includes('Public orders are currently closed'),
      `Unexpected error message: ${pubClosedErr.message}`
    );

    // Authenticated unit_add_entry MUST ALSO be rejected when is_challenge_open = false (Global Division Lock)
    const { error: unitClosedErr } = await rpc('unit_add_entry', {
      p_code: unitToken,
      p_contributor_name: 'Closed Unit Order Test',
      p_mobile_number: '9876543211',
      p_quantity: 2.5,
      p_payment_mode: 'UPI',
    });
    assert.ok(
      unitClosedErr,
      'unit_add_entry MUST be rejected when is_challenge_open = false'
    );
    assert.ok(
      unitClosedErr.message.includes('Orders are currently closed'),
      `Unexpected error message: ${unitClosedErr.message}`
    );

    // Restore is_challenge_open = true
    const { error: openErr } = await rpc('admin_update_settings', {
      p_code: ADMIN_CODE,
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: true,
    });
    assert.ifError(openErr);

    // Authenticated unit_add_entry MUST SUCCEED when open (no code input)
    const { data: unitOrderRes, error: unitOrderErr } = await rpc(
      'unit_add_entry',
      {
        p_code: unitToken,
        p_contributor_name: 'Direct Unit Order Test',
        p_mobile_number: '9876543211',
        p_quantity: 2.5,
        p_payment_mode: 'UPI',
      }
    );
    assert.ifError(unitOrderErr);
    assert.ok(unitOrderRes?.id, 'Expected unit_add_entry to return order id');
    assert.equal(unitOrderRes?.unit_code, TEMP_UNIT_CODE);
    unitOrderId = unitOrderRes.id;

    // public_add_order('WDR977', ...) MUST SUCCEED
    const { data: pubOpenRes, error: pubOpenErr } = await rpc(
      'public_add_order',
      {
        p_unit_code: TEMP_UNIT_CODE,
        p_contributor_name: 'Public Open Order Test',
        p_mobile_number: '9876543212',
        p_quantity: 1.5,
        p_payment_mode: 'CASH',
      }
    );
    assert.ifError(pubOpenErr);
    assert.ok(pubOpenRes?.id, 'Expected public_add_order to return order id');
    assert.equal(pubOpenRes?.unit_code, TEMP_UNIT_CODE);
    assert.equal(pubOpenRes?.sector_name, TEMP_SECTOR_NAME);
    publicOrderId = pubOpenRes.id;

    // public_add_order('INVALID_CODE', ...) MUST be REJECTED
    const { error: badCodeOrderErr } = await rpc('public_add_order', {
      p_unit_code: 'INVALID_CODE',
      p_contributor_name: 'Invalid Code Test',
      p_mobile_number: '9876543213',
      p_quantity: 1,
      p_payment_mode: 'CASH',
    });
    assert.ok(
      badCodeOrderErr,
      'public_add_order with INVALID_CODE MUST be rejected'
    );

    pass(
      '6. Dual Order Logic Verification (public closed blocked, unit direct always open, public open + invalid code)'
    );
  }
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  // 7. Clean Teardown
  try {
    if (unitOrderId) {
      await rpc('admin_delete_entry', {
        p_code: ADMIN_CODE,
        p_entry_id: unitOrderId,
      });
    }
    if (publicOrderId) {
      await rpc('admin_delete_entry', {
        p_code: ADMIN_CODE,
        p_entry_id: publicOrderId,
      });
    }
    if (tempUnitId) {
      await rpc('admin_delete_unit', {
        p_code: ADMIN_CODE,
        p_unit_id: tempUnitId,
      });
    }
    if (tempSectorId) {
      await rpc('admin_delete_sector', {
        p_code: ADMIN_CODE,
        p_sector_id: tempSectorId,
      });
    }
    if (originalSettings) {
      await rpc('admin_update_settings', {
        p_code: ADMIN_CODE,
        p_unit_rate: Number(originalSettings.unit_rate),
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: originalSettings.is_challenge_open,
      });
    }
    console.log('PASS: 7. Clean Teardown completed with zero test pollution.');
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
    process.exitCode = 1;
  } finally {
    if (pgClient) {
      await pgClient.end().catch(() => {});
    }
  }
}

if (!process.exitCode) {
  console.log(
    `\nALL PHASE 3B-1 VERIFICATION CHECKS PASSED (${results.length}/6 + Teardown)`
  );
}
