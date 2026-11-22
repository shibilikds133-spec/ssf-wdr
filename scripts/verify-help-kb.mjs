import 'dotenv/config';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  isItemVisibleForRole,
  searchHelpKb,
} from '../src/utils/helpSearchEngine.ts';

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

const PREDICTION_CASES = [
  { query: 'paswrd maranu', role: 'LOGIN', expectedId: 'auth_forgot_password' },
  { query: 'login kayarunnilla', role: 'LOGIN', expectedId: 'auth_login_failed' },
  { query: 'unpiad paisa kiti', role: 'UNIT', expectedId: 'pay_mark_as_paid' },
  { query: 'gpay cash', role: 'UNIT', expectedId: 'pay_cash_upi' },
  { query: 'ordr lok aayo', role: 'UNIT', expectedId: 'order_global_lock' },
  { query: 'minus varunnilla', role: 'UNIT', expectedId: 'order_zero_minus' },
  { query: 'wdr kod evide', role: 'UNIT', expectedId: 'code_find_unit_code' },
  { query: 'reciept whatsapp', role: 'UNIT', expectedId: 'rep_whatsapp_receipt' },
  { query: 'vitharanam pdf downlaod', role: 'UNIT', expectedId: 'rep_pdf_csv' },
  { query: 'baki ullavar list', role: 'UNIT', expectedId: 'rep_unpaid_list' },
  { query: 'thetti delete', role: 'UNIT', expectedId: 'order_edit_delete' },
  { query: 'iphone instal', role: 'PUBLIC', expectedId: 'tech_install_pwa' },
  { query: 'quick entry sector unit select', role: 'PUBLIC', expectedId: 'public_quick_entry_steps' },
  { query: 'unit mattan 14 days', role: 'PUBLIC', expectedId: 'public_remembered_unit' },
  { query: 'code kanunnilla invalid code', role: 'PUBLIC', expectedId: 'public_code_privacy' },
  { query: 'പാസ്വേർഡ് മറന്നു', role: 'LOGIN', expectedId: 'auth_forgot_password' },
  { query: 'ഓർഡർ ചേർക്കാൻ', role: 'UNIT', expectedId: 'order_unit_add' },
  { query: 'പണം കിട്ടി', role: 'UNIT', expectedId: 'pay_mark_as_paid' },
  { query: 'aadya login password change', role: 'LOGIN', expectedId: 'auth_first_login' },
  { query: '14 days logout', role: 'UNIT', expectedId: 'auth_session_14days' },
  { query: '1.5 liter custom alavu', role: 'UNIT', expectedId: 'order_quantity_custom' },
  { query: 'paid select mandatory', role: 'UNIT', expectedId: 'pay_mandatory' },
  { query: 'login illathe public order', role: 'PUBLIC', expectedId: 'code_public_order' },
  { query: 'vere unit kanunnilla', role: 'UNIT', expectedId: 'code_unit_isolation' },
  { query: 'percentage gauge target', role: 'UNIT', expectedId: 'code_division_percent' },
  { query: 'division direct no unit', role: 'ADMIN', expectedId: 'admin_direct_order' },
  { query: 'approve reset request hub', role: 'ADMIN', expectedId: 'admin_reset_requests' },
  { query: 'vila limit settings', role: 'ADMIN', expectedId: 'admin_settings_control' },
  { query: 'sector unit manage phone', role: 'SECTOR', expectedId: 'sector_manage_units' },
  { query: 'docs guide malayalam', role: 'UNIT', expectedId: 'tech_docs_reopen' },
  { query: 'page slow refresh', role: 'UNIT', expectedId: 'tech_refresh_issue' },
];

const AUTOCOMPLETE_CASES = [
  { prefix: 'pas', role: 'LOGIN', expectedIds: ['auth_forgot_password', 'auth_first_login'] },
  { prefix: 'unp', role: 'UNIT', expectedIds: ['pay_mandatory', 'pay_mark_as_paid', 'rep_unpaid_list'] },
  { prefix: 'kod', role: 'UNIT', expectedIds: ['code_find_unit_code'] },
  { prefix: 'cod', role: 'UNIT', expectedIds: ['code_find_unit_code'] },
  { prefix: 'lok', role: 'UNIT', expectedIds: ['order_global_lock'] },
  { prefix: 'loc', role: 'UNIT', expectedIds: ['order_global_lock'] },
];

let preTestUnit = null;
let preTestAdminWhatsapp = null;
const tokensToLogout = [];

try {
  await initTransport();
  console.log('=== SMART HELP ASSISTANT KB & PREDICTION VERIFICATION ===');

  const phoneSnap = await ownerClient.query(
    `SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'`
  );
  preTestAdminWhatsapp = {
    existed: phoneSnap.rows.length > 0,
    value: phoneSnap.rows[0]?.value ?? '',
  };

  // 1. DB Sync Short-Circuit Check
  const { data: syncCold, error: syncColdErr } = await rpc('get_help_kb_sync', {
    p_client_version: 0,
  });
  assert.ifError(syncColdErr);
  assert.equal(syncCold?.up_to_date, false, 'Expected up_to_date=false for client version 0');
  assert.equal(syncCold?.version, 2, 'Expected KB version 2');
  assert.equal(syncCold?.payload?.categories?.length, 7, 'Expected 7 categories');
  assert.equal(syncCold?.payload?.items?.length, 29, 'Expected 29 KB items');
  console.log('PASS: 1. get_help_kb_sync(0) returned v2 payload (7 categories, 29 items)');

  const { data: syncWarm, error: syncWarmErr } = await rpc('get_help_kb_sync', {
    p_client_version: 2,
  });
  assert.ifError(syncWarmErr);
  assert.equal(syncWarm?.up_to_date, true, 'Expected up_to_date=true when client is on v2');
  assert.equal(syncWarm?.version, 2, 'Expected version=2 on short-circuit response');
  assert.equal('payload' in syncWarm, false, 'Expected payload to be omitted on short-circuit');
  console.log('PASS: 2. get_help_kb_sync(2) short-circuited with up_to_date=true and NO payload');

  // 2. Auth Login & Refresh Piggyback Check on dedicated test unit WDR202
  const unitRes = await ownerClient.query(
    `SELECT id, username, password_hash, must_change_password
     FROM units WHERE login_code = 'WDR202'`
  );
  assert.equal(unitRes.rows.length, 1, 'Expected dedicated test unit WDR202 to exist');
  preTestUnit = unitRes.rows[0];

  if (preTestUnit.password_hash !== null) {
    await ownerClient.query(
      `UPDATE units SET password_hash = NULL, must_change_password = true WHERE id = $1`,
      [preTestUnit.id]
    );
  }

  const { data: loginData, error: loginErr } = await rpc('auth_login', {
    p_username: preTestUnit.username,
    p_password: 'WDR202',
  });
  assert.ifError(loginErr);
  assert.equal(loginData?.valid, true, 'Expected WDR202 login to succeed');
  assert.equal(loginData?.help_kb_version, 2, 'Expected auth_login to piggyback help_kb_version=2');
  tokensToLogout.push(loginData.token);

  const { data: refreshData, error: refreshErr } = await rpc('auth_refresh_session', {
    p_token: loginData.token,
  });
  assert.ifError(refreshErr);
  assert.equal(refreshData?.valid, true, 'Expected auth_refresh_session to succeed');
  assert.equal(refreshData?.help_kb_version, 2, 'Expected auth_refresh_session to piggyback help_kb_version=2');
  if (refreshData?.token) tokensToLogout.push(refreshData.token);

  await rpc('auth_logout', { p_token: loginData.token });
  console.log('PASS: 3. auth_login & auth_refresh_session on WDR202 piggybacked help_kb_version=2');

  // 3. Prediction Engine Accuracy Suite (28 real-world queries)
  const kbPayload = syncCold.payload;
  let top1Hits = 0;
  let top3Hits = 0;
  let totalSearchMs = 0;

  // Warm WeakMap index and Latin-fuzzy + Malayalam JIT paths before measuring steady-state latency
  const indexStart = performance.now();
  searchHelpKb(kbPayload, 'password', 'LOGIN', 3);
  const indexWarmMs = performance.now() - indexStart;
  searchHelpKb(kbPayload, 'unpiad paisa', 'UNIT', 3);
  searchHelpKb(kbPayload, 'പാസ്വേർഡ് മറന്നു', 'LOGIN', 3);

  for (const tc of PREDICTION_CASES) {
    const start = performance.now();
    const results = searchHelpKb(kbPayload, tc.query, tc.role, 3);
    totalSearchMs += performance.now() - start;

    const topIds = results.map((r) => r.item.id);
    const rank = topIds.indexOf(tc.expectedId);
    if (rank === 0) top1Hits += 1;
    if (rank >= 0 && rank < 3) {
      top3Hits += 1;
    } else {
      console.error(
        `FAIL query "${tc.query}" (${tc.role}): expected "${tc.expectedId}", got [${topIds.join(', ')}]`
      );
    }
  }

  const avgMs = totalSearchMs / PREDICTION_CASES.length;
  assert.equal(
    top3Hits,
    PREDICTION_CASES.length,
    `Expected 100% Top-3 accuracy, got ${top3Hits}/${PREDICTION_CASES.length}`
  );
  assert.ok(avgMs < 2, `Expected average search latency < 2ms, got ${avgMs.toFixed(4)}ms`);
  console.log(
    `PASS: 4. Prediction Accuracy (${PREDICTION_CASES.length} queries): Top-3=${top3Hits}/${PREDICTION_CASES.length} (100%), Top-1=${top1Hits}/${PREDICTION_CASES.length} (${((top1Hits / PREDICTION_CASES.length) * 100).toFixed(1)}%), avg=${avgMs.toFixed(4)}ms (cold index=${indexWarmMs.toFixed(3)}ms)`
  );

  // 4. Role Isolation Checks
  const unitAdminProbe = searchHelpKb(kbPayload, 'division direct', 'UNIT', 5);
  assert.equal(
    unitAdminProbe.some((r) => r.item.id === 'admin_direct_order'),
    false,
    'UNIT role must never receive ADMIN-only admin_direct_order'
  );
  const sectorAdminProbe = searchHelpKb(kbPayload, 'password hub approve', 'SECTOR', 5);
  assert.equal(
    sectorAdminProbe.some((r) => r.item.id === 'admin_reset_requests'),
    false,
    'SECTOR role must never receive ADMIN-only admin_reset_requests'
  );
  const adminItem = kbPayload.items.find((i) => i.id === 'admin_direct_order');
  assert.equal(isItemVisibleForRole(adminItem, 'PUBLIC'), false);
  assert.equal(isItemVisibleForRole(adminItem, 'ADMIN'), true);
  const publicItems = kbPayload.items.filter((i) => isItemVisibleForRole(i, 'PUBLIC'));
  assert.equal(publicItems.length, 13, `Expected 13 PUBLIC items, got ${publicItems.length}`);
  assert.equal(
    publicItems.some((i) =>
      ['auth_forgot_password', 'admin_settings_control', 'admin_reset_requests', 'sector_manage_units', 'order_unit_add'].includes(i.id)
    ),
    false,
    'PUBLIC role must never receive portal/admin/login-only items'
  );
  console.log('PASS: 5. Strict role-aware isolation verified across ADMIN/SECTOR/UNIT/PUBLIC');

  // 5. Instant Autocomplete Prefix Checks (2-3 chars)
  for (const ac of AUTOCOMPLETE_CASES) {
    const hits = searchHelpKb(kbPayload, ac.prefix, ac.role, 3).map((r) => r.item.id);
    const matched = ac.expectedIds.some((id) => hits.includes(id));
    assert.ok(
      matched,
      `Autocomplete "${ac.prefix}" (${ac.role}) expected one of [${ac.expectedIds.join(', ')}], got [${hits.join(', ')}]`
    );
  }
  console.log(`PASS: 6. Instant 3-char autocomplete verified (${AUTOCOMPLETE_CASES.length}/${AUTOCOMPLETE_CASES.length})`);

  // 6. Division Admin WhatsApp Number Setting & Sync Propagation Check
  {
    const { data: adminLogin, error: adminLoginErr } = await rpc('auth_login', {
      p_username: 'SSF Wandoor',
      p_password: 'WDR100',
    });
    assert.ifError(adminLoginErr);
    assert.equal(adminLogin?.valid, true, 'Expected Admin WDR100 login to succeed');
    const adminJwt = adminLogin.token;
    tokensToLogout.push(adminJwt);

    const { data: dashBefore, error: dashBeforeErr } = await rpc('admin_get_dashboard', {
      p_code: adminJwt,
    });
    assert.ifError(dashBeforeErr);
    const curSettings = dashBefore?.settings;
    assert.ok(curSettings, 'Expected admin_get_dashboard to return settings');

    const { data: updOk, error: updErr } = await rpc('admin_update_settings', {
      p_code: adminJwt,
      p_unit_rate: Number(curSettings.unit_rate),
      p_division_target: Number(curSettings.division_target),
      p_challenge_title: String(curSettings.challenge_title),
      p_is_challenge_open: Boolean(curSettings.is_challenge_open),
      p_admin_whatsapp_phone: '9876543210',
    });
    assert.ifError(updErr);
    assert.equal(updOk, true, 'Expected admin_update_settings to return true');

    const { data: dashAfter, error: dashAfterErr } = await rpc('admin_get_dashboard', {
      p_code: adminJwt,
    });
    assert.ifError(dashAfterErr);
    assert.equal(
      dashAfter?.settings?.admin_whatsapp_phone,
      '9876543210',
      'Expected admin_get_dashboard to return updated admin_whatsapp_phone'
    );

    const { data: syncWithPhone, error: syncPhoneErr } = await rpc('get_help_kb_sync', {
      p_client_version: 2,
    });
    assert.ifError(syncPhoneErr);
    assert.equal(syncWithPhone?.up_to_date, true);
    assert.equal(syncWithPhone?.admin_whatsapp_phone, '9876543210');
    assert.equal('payload' in syncWithPhone, false, 'Expected payload to stay omitted on short-circuit');

    const { data: unitPhoneCheck, error: unitPhoneErr } = await rpc('auth_login', {
      p_username: preTestUnit.username,
      p_password: 'WDR202',
    });
    assert.ifError(unitPhoneErr);
    assert.equal(unitPhoneCheck?.valid, true);
    assert.equal(unitPhoneCheck?.help_kb_version, 2);
    assert.equal(unitPhoneCheck?.admin_whatsapp_phone, '9876543210');
    tokensToLogout.push(unitPhoneCheck.token);

    await rpc('auth_logout', { p_token: adminJwt });
    await rpc('auth_logout', { p_token: unitPhoneCheck.token });
    console.log('PASS: 7. Division Admin WhatsApp number persisted, synced in short-circuit & auth responses');
  }
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  try {
    if (ownerClient && preTestAdminWhatsapp) {
      if (preTestAdminWhatsapp.existed) {
        await ownerClient.query(
          `UPDATE app_settings SET value = $1 WHERE key = 'admin_whatsapp_phone'`,
          [preTestAdminWhatsapp.value]
        );
      } else {
        await ownerClient.query(
          `DELETE FROM app_settings WHERE key = 'admin_whatsapp_phone'`
        );
      }
    }
    if (ownerClient && preTestUnit && preTestUnit.password_hash !== null) {
      await ownerClient.query(
        `UPDATE units
         SET password_hash = $1,
             must_change_password = $2
         WHERE id = $3`,
        [preTestUnit.password_hash, preTestUnit.must_change_password, preTestUnit.id]
      );
    }
    for (const tok of tokensToLogout) {
      await rpc('auth_logout', { p_token: tok }).catch(() => {});
    }
    console.log('PASS: 8. Clean teardown restored WDR202 and pre-test admin_whatsapp_phone states.');
  } catch (cleanupErr) {
    console.error('Cleanup error:', cleanupErr);
    process.exitCode = 1;
  } finally {
    if (pgAnonClient) await pgAnonClient.end().catch(() => {});
    if (ownerClient) await ownerClient.end().catch(() => {});
  }
}

if (!process.exitCode) {
  console.log('\nALL SMART HELP ASSISTANT VERIFICATION CHECKS PASSED');
}
