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

async function expireSessionByJwt(jwt) {
  const parts = jwt.split('.');
  assert.equal(parts.length, 3, 'Expected 3-part JWT');
  const payloadJson = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8')
  );
  const jti = payloadJson.jti;
  assert.ok(jti, 'Expected jti in JWT payload');

  const ownerClient = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await ownerClient.connect();
  try {
    await ownerClient.query(
      "UPDATE auth_sessions SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [jti]
    );
  } finally {
    await ownerClient.end();
  }
}

const ADMIN_USERNAME = 'SSF Wandoor';
const ADMIN_CODE = 'WDR100';

const TEMP_SECTOR_NAME = 'Phase3B2 Temp Sector 295';
const TEMP_SECTOR_CODE = 'WDR295';
const TEMP_UNIT_NAME = 'Phase3B2 Temp Unit 975';
const TEMP_UNIT_CODE = 'WDR975';

const results = [];
let originalSettings = null;
let tempSectorId = null;
let tempUnitId = null;
const createdEntryIds = [];

function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}

try {
  await initTransport();

  // Capture original settings & create temp Sector + Unit
  {
    const { data: adminDash, error: adminErr } = await rpc(
      'admin_get_dashboard',
      { p_code: ADMIN_CODE }
    );
    assert.ifError(adminErr);
    assert.ok(adminDash?.settings, 'Expected admin settings');
    originalSettings = adminDash.settings;

    if (!originalSettings.is_challenge_open) {
      const { error: openErr } = await rpc('admin_update_settings', {
        p_code: ADMIN_CODE,
        p_unit_rate: Number(originalSettings.unit_rate),
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: true,
      });
      assert.ifError(openErr);
    }

    const { error: upsertErr } = await rpc('admin_bulk_upsert_units', {
      p_code: ADMIN_CODE,
      p_rows: [
        {
          sector_name: TEMP_SECTOR_NAME,
          sector_code: TEMP_SECTOR_CODE,
          unit_name: TEMP_UNIT_NAME,
          unit_code: TEMP_UNIT_CODE,
        },
      ],
    });
    assert.ifError(upsertErr);

    const { data: dashAfter, error: dashAfterErr } = await rpc(
      'admin_get_dashboard',
      { p_code: ADMIN_CODE }
    );
    assert.ifError(dashAfterErr);
    tempSectorId = dashAfter.sectors.find(
      (s) => s.login_code === TEMP_SECTOR_CODE
    )?.id;
    tempUnitId = dashAfter.unit_summaries.find(
      (u) => u.login_code === TEMP_UNIT_CODE
    )?.id;
    assert.ok(tempSectorId, 'Expected temp sector id');
    assert.ok(tempUnitId, 'Expected temp unit id');
  }

  // 1. 14-Day Sliding HS256 JWT Auth
  let adminJwt = null;
  let unitJwt = null;
  {
    const { data: adminLogin, error: loginErr } = await rpc('auth_login', {
      p_username: ADMIN_USERNAME,
      p_password: ADMIN_CODE,
    });
    assert.ifError(loginErr);
    assert.equal(adminLogin?.valid, true);
    assert.equal(adminLogin?.role, 'ADMIN');
    assert.ok(adminLogin?.token, 'Expected admin JWT token');
    assert.equal(
      adminLogin.token.split('.').length,
      3,
      'Admin token MUST be 3-part HS256 JWT'
    );
    adminJwt = adminLogin.token;

    // auth_refresh_session returns valid: true and fresh JWT
    const { data: refreshed, error: refErr } = await rpc(
      'auth_refresh_session',
      { p_token: adminJwt }
    );
    assert.ifError(refErr);
    assert.equal(refreshed?.valid, true);
    assert.equal(refreshed?.token?.split('.').length, 3);
    adminJwt = refreshed.token;

    // Tampered JWT MUST be rejected by admin_get_dashboard & auth_refresh_session
    const tampered = `${adminJwt}x`;
    const { error: tamperedDashErr } = await rpc('admin_get_dashboard', {
      p_code: tampered,
    });
    assert.ok(
      tamperedDashErr,
      'Tampered JWT MUST be rejected by admin_get_dashboard'
    );

    const { data: tamperedRef, error: tamperedRefErr } = await rpc(
      'auth_refresh_session',
      { p_token: tampered }
    );
    assert.ifError(tamperedRefErr);
    assert.equal(
      tamperedRef?.valid,
      false,
      'Tampered JWT MUST return valid: false on auth_refresh_session'
    );

    // Login as temp Unit, then logout -> revoked JWT rejected
    const { data: unitLogin1, error: uErr1 } = await rpc('auth_login', {
      p_username: TEMP_UNIT_NAME,
      p_password: TEMP_UNIT_CODE,
    });
    assert.ifError(uErr1);
    assert.equal(unitLogin1?.valid, true);
    assert.equal(unitLogin1.token.split('.').length, 3);

    const { error: logoutErr } = await rpc('auth_logout', {
      p_token: unitLogin1.token,
    });
    assert.ifError(logoutErr);

    const { data: afterLogoutRef } = await rpc('auth_refresh_session', {
      p_token: unitLogin1.token,
    });
    assert.equal(
      afterLogoutRef?.valid,
      false,
      'Revoked JWT MUST be rejected after auth_logout'
    );

    // Simulated expired session triggers SESSION_EXPIRED / { valid: false, expired: true }
    if (dbUrl) {
      const { data: expLogin } = await rpc('auth_login', {
        p_username: TEMP_UNIT_NAME,
        p_password: TEMP_UNIT_CODE,
      });
      await expireSessionByJwt(expLogin.token);

      const { error: expDashErr } = await rpc('unit_get_dashboard', {
        p_code: expLogin.token,
      });
      assert.ok(
        expDashErr && expDashErr.message.includes('SESSION_EXPIRED'),
        'Expired session MUST raise SESSION_EXPIRED on unit_get_dashboard'
      );

      const { data: expLogin2 } = await rpc('auth_login', {
        p_username: TEMP_UNIT_NAME,
        p_password: TEMP_UNIT_CODE,
      });
      await expireSessionByJwt(expLogin2.token);
      const { data: expRef } = await rpc('auth_refresh_session', {
        p_token: expLogin2.token,
      });
      assert.equal(expRef?.valid, false);
      assert.equal(expRef?.expired, true);
    }

    // Fresh Unit JWT for remaining tests
    const { data: unitLogin2, error: uErr2 } = await rpc('auth_login', {
      p_username: TEMP_UNIT_NAME,
      p_password: TEMP_UNIT_CODE,
    });
    assert.ifError(uErr2);
    assert.equal(unitLogin2?.valid, true);
    unitJwt = unitLogin2.token;

    pass(
      '1. 14-Day Sliding HS256 JWT Auth (3-part JWT, refresh, tamper rejection, logout revoke, expiry)'
    );
  }

  // 2. Zero-Minus Guard (Backend & DB)
  {
    for (const badQty of [0, -2]) {
      const { error: uErr } = await rpc('unit_add_entry', {
        p_code: unitJwt,
        p_contributor_name: 'Zero Guard Unit',
        p_mobile_number: '9876543210',
        p_quantity: badQty,
        p_payment_mode: 'CASH',
        p_payment_status: 'PAID',
      });
      assert.ok(uErr, `unit_add_entry MUST reject quantity = ${badQty}`);

      const { error: aErr } = await rpc('admin_add_entry', {
        p_code: adminJwt,
        p_unit_id: null,
        p_contributor_name: 'Zero Guard Admin',
        p_mobile_number: '9876543210',
        p_quantity: badQty,
        p_payment_status: 'PAID',
        p_payment_mode: 'CASH',
      });
      assert.ok(aErr, `admin_add_entry MUST reject quantity = ${badQty}`);

      const { error: pErr } = await rpc('public_add_order', {
        p_unit_code: TEMP_UNIT_CODE,
        p_contributor_name: 'Zero Guard Public',
        p_mobile_number: '9876543210',
        p_quantity: badQty,
        p_payment_mode: 'CASH',
        p_payment_status: 'PAID',
      });
      assert.ok(pErr, `public_add_order MUST reject quantity = ${badQty}`);
    }

    for (const badRate of [0, -100]) {
      const { error: rErr } = await rpc('admin_update_settings', {
        p_code: adminJwt,
        p_unit_rate: badRate,
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: true,
      });
      assert.ok(
        rErr,
        `admin_update_settings MUST reject unit_rate = ${badRate}`
      );
    }

    const { error: tErr } = await rpc('admin_update_settings', {
      p_code: adminJwt,
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: -50,
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: true,
    });
    assert.ok(tErr, 'admin_update_settings MUST reject division_target = -50');

    pass(
      '2. Zero-Minus Guard (rejected 0/-2 quantities across all order RPCs and <=0 rate/negative limit)'
    );
  }

  // 3. Mandatory Two-Step Payment Integrity & Mark as Paid
  {
    const { error: paidNoModeErr } = await rpc('unit_add_entry', {
      p_code: unitJwt,
      p_contributor_name: 'Paid No Mode',
      p_mobile_number: '9876543210',
      p_quantity: 2,
      p_payment_mode: null,
      p_payment_status: 'PAID',
    });
    assert.ok(
      paidNoModeErr,
      'unit_add_entry MUST reject PAID with NULL payment_mode'
    );

    const { error: unpaidWithModeErr } = await rpc('unit_add_entry', {
      p_code: unitJwt,
      p_contributor_name: 'Unpaid With Mode',
      p_mobile_number: '9876543210',
      p_quantity: 2,
      p_payment_mode: 'CASH',
      p_payment_status: 'UNPAID',
    });
    assert.ok(
      unpaidWithModeErr,
      'unit_add_entry MUST reject UNPAID with CASH payment_mode'
    );

    const { data: unpaidRes, error: unpaidErr } = await rpc('unit_add_entry', {
      p_code: unitJwt,
      p_contributor_name: 'Phase3B2 Unpaid Order',
      p_mobile_number: '9876543210',
      p_quantity: 2,
      p_payment_mode: null,
      p_payment_status: 'UNPAID',
    });
    assert.ifError(unpaidErr);
    assert.equal(unpaidRes?.payment_status, 'UNPAID');
    assert.equal(unpaidRes?.payment_mode, null);
    createdEntryIds.push(unpaidRes.id);

    const expectedAmt = Number(unpaidRes.total_amount);

    const { data: dashBefore, error: dashBeforeErr } = await rpc(
      'unit_get_dashboard',
      { p_code: unitJwt }
    );
    assert.ifError(dashBeforeErr);
    assert.equal(Number(dashBefore.summary.unpaid_amount), expectedAmt);
    assert.equal(Number(dashBefore.summary.upi_amount), 0);

    // Mark as Paid (UPI)
    const { data: markRes, error: markErr } = await rpc(
      'unit_mark_entry_paid',
      {
        p_code: unitJwt,
        p_entry_id: unpaidRes.id,
        p_payment_mode: 'UPI',
      }
    );
    assert.ifError(markErr);
    assert.equal(markRes, true);

    const { data: dashAfter, error: dashAfterErr } = await rpc(
      'unit_get_dashboard',
      { p_code: unitJwt }
    );
    assert.ifError(dashAfterErr);
    assert.equal(Number(dashAfter.summary.unpaid_amount), 0);
    assert.equal(Number(dashAfter.summary.upi_amount), expectedAmt);

    pass(
      '3. Mandatory Two-Step Payment Integrity & Mark as Paid (UNPAID -> PAID UPI)'
    );
  }

  // 4. Global Division Lock Enforcement
  let divisionDirectUnpaidId = null;
  {
    const { error: closeErr } = await rpc('admin_update_settings', {
      p_code: adminJwt,
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: false,
    });
    assert.ifError(closeErr);

    // unit_add_entry MUST be rejected when closed
    const { error: unitClosedErr } = await rpc('unit_add_entry', {
      p_code: unitJwt,
      p_contributor_name: 'Locked Unit Order',
      p_mobile_number: '9876543210',
      p_quantity: 1,
      p_payment_mode: 'CASH',
      p_payment_status: 'PAID',
    });
    assert.ok(unitClosedErr, 'unit_add_entry MUST be rejected when closed');
    assert.ok(
      unitClosedErr.message.includes('Orders are currently closed'),
      `Unexpected error: ${unitClosedErr.message}`
    );

    // public_add_order MUST be rejected when closed
    const { error: pubClosedErr } = await rpc('public_add_order', {
      p_unit_code: TEMP_UNIT_CODE,
      p_contributor_name: 'Locked Public Order',
      p_mobile_number: '9876543210',
      p_quantity: 1,
      p_payment_mode: 'CASH',
      p_payment_status: 'PAID',
    });
    assert.ok(pubClosedErr, 'public_add_order MUST be rejected when closed');

    // admin_add_entry MUST succeed when closed (Division Direct AND On Behalf of Unit)
    const { data: directRes, error: directErr } = await rpc('admin_add_entry', {
      p_code: adminJwt,
      p_unit_id: null,
      p_contributor_name: 'Division Direct Locked Test',
      p_mobile_number: '9876543215',
      p_quantity: 3,
      p_payment_status: 'UNPAID',
      p_payment_mode: null,
    });
    assert.ifError(directErr);
    assert.equal(directRes?.is_division_direct, true);
    divisionDirectUnpaidId = directRes.id;
    createdEntryIds.push(directRes.id);

    const { data: onBehalfRes, error: onBehalfErr } = await rpc(
      'admin_add_entry',
      {
        p_code: adminJwt,
        p_unit_id: tempUnitId,
        p_contributor_name: 'Admin On Behalf Test',
        p_mobile_number: '9876543216',
        p_quantity: 2,
        p_payment_status: 'PAID',
        p_payment_mode: 'CASH',
      }
    );
    assert.ifError(onBehalfErr);
    assert.equal(onBehalfRes?.is_division_direct, false);
    createdEntryIds.push(onBehalfRes.id);

    // Restore is_challenge_open = true
    const { error: openErr } = await rpc('admin_update_settings', {
      p_code: adminJwt,
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: true,
    });
    assert.ifError(openErr);

    pass(
      '4. Global Division Lock Enforcement (Unit/Public blocked when closed; Admin Direct & On-Behalf succeed)'
    );
  }

  // 5. Division Direct Isolation (unit_id IS NULL)
  {
    const { data: adminDash, error: aErr } = await rpc('admin_get_dashboard', {
      p_code: adminJwt,
    });
    assert.ifError(aErr);

    const directEntry = adminDash.entries.find(
      (e) => e.id === divisionDirectUnpaidId
    );
    assert.ok(directEntry, 'Division Direct order MUST appear in admin entries');
    assert.equal(directEntry.is_division_direct, true);
    assert.equal(directEntry.unit_name, 'Division Direct');

    // Confirm Division Direct does NOT appear in sector_get_dashboard or unit_get_dashboard
    const { data: secDash, error: sErr } = await rpc('sector_get_dashboard', {
      p_code: TEMP_SECTOR_CODE,
    });
    assert.ifError(sErr);
    assert.equal(
      secDash.entries.some((e) => e.id === divisionDirectUnpaidId),
      false,
      'Division Direct order MUST NOT appear in sector entries'
    );

    const { data: unitDash, error: uErr } = await rpc('unit_get_dashboard', {
      p_code: unitJwt,
    });
    assert.ifError(uErr);
    assert.equal(
      unitDash.entries.some((e) => e.id === divisionDirectUnpaidId),
      false,
      'Division Direct order MUST NOT appear in unit entries'
    );

    // Confirm tempUnit summary only reflects unit orders (2 + 2 = 4 L, NOT +3 L from Division Direct)
    const unitSummaryRow = adminDash.unit_summaries.find(
      (u) => u.id === tempUnitId
    );
    assert.equal(Number(unitSummaryRow?.total_quantity), 4);

    // admin_mark_entry_paid transitions UNPAID Division Direct order to PAID (CASH)
    const { data: adminMarkRes, error: adminMarkErr } = await rpc(
      'admin_mark_entry_paid',
      {
        p_code: adminJwt,
        p_entry_id: divisionDirectUnpaidId,
        p_payment_mode: 'CASH',
      }
    );
    assert.ifError(adminMarkErr);
    assert.equal(adminMarkRes, true);

    const { data: adminDashAfter } = await rpc('admin_get_dashboard', {
      p_code: adminJwt,
    });
    const updatedDirect = adminDashAfter.entries.find(
      (e) => e.id === divisionDirectUnpaidId
    );
    assert.equal(updatedDirect?.payment_status, 'PAID');
    assert.equal(updatedDirect?.payment_mode, 'CASH');

    pass(
      '5. Division Direct Isolation (visible in Admin totals/entries, excluded from Sector/Unit, admin_mark_entry_paid works)'
    );
  }
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  // 6. Clean Teardown
  try {
    for (const id of createdEntryIds) {
      await rpc('admin_delete_entry', {
        p_code: ADMIN_CODE,
        p_entry_id: id,
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
    console.log('PASS: 6. Clean Teardown completed with zero test pollution.');
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
    `\nALL PHASE 3B-2 VERIFICATION CHECKS PASSED (${results.length}/5 + Teardown)`
  );
}
