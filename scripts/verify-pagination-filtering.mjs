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

const activeTokensToLogout = [];
const tempOrderIds = [];

function pass(label) {
  console.log(`[PASS] ${label}`);
}

try {
  await initTransport();

  console.log('=== SERVER-SIDE FILTERING & PAGINATION VERIFICATION ===');

  const { data: adminLogin, error: adminErr } = await rpc('auth_login', {
    p_username: ADMIN_USERNAME,
    p_password: ADMIN_CODE,
  });
  assert.ifError(adminErr);
  assert.equal(adminLogin?.valid, true);
  const adminJwt = adminLogin.token;
  activeTokensToLogout.push(adminJwt);

  const { data: adminDash, error: dashErr } = await rpc('admin_get_dashboard', {
    p_code: adminJwt,
  });
  assert.ifError(dashErr);
  const sectors = adminDash.sectors || [];
  const pandikkad = sectors.find((s) => s.login_code === 'WDR101');
  const chokkad = sectors.find((s) => s.login_code === 'WDR107');
  assert.ok(pandikkad, 'Expected SSF Pandikkad Sector (WDR101)');
  assert.ok(chokkad, 'Expected SSF Chokkad Sector (WDR107)');

  // ---------------------------------------------------------------------------
  // 1. admin_list_credentials: Sector Filtering, Role Tabs, Search & Pagination
  // ---------------------------------------------------------------------------
  {
    const { data: allRes, error: allErr } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'ALL',
      p_sector_id: null,
      p_search: '',
      p_page: 1,
      p_page_size: 10,
    });
    assert.ifError(allErr);
    assert.equal(allRes.total_count, 106);
    assert.equal(allRes.total_pages, 11);
    assert.equal(allRes.items.length, 10);

    const { data: p2Res, error: p2Err } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'ALL',
      p_sector_id: null,
      p_search: '',
      p_page: 2,
      p_page_size: 10,
    });
    assert.ifError(p2Err);
    assert.equal(p2Res.items.length, 10);
    const p1Keys = new Set(
      allRes.items.map((x) => `${x.account_type}-${x.account_id}`)
    );
    for (const item of p2Res.items) {
      assert.equal(
        p1Keys.has(`${item.account_type}-${item.account_id}`),
        false,
        'Page 1 and Page 2 must be disjoint'
      );
    }

    const { data: secOnly } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'SECTOR',
      p_sector_id: null,
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(secOnly.total_count, 10);

    const { data: unitOnly } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'UNIT',
      p_sector_id: null,
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(unitOnly.total_count, 96);

    const { data: panUnits } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'UNIT',
      p_sector_id: pandikkad.id,
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(panUnits.total_count, 10);
    assert.ok(panUnits.items.every((i) => i.account_type === 'UNIT'));
    assert.deepEqual(
      panUnits.items.map((i) => i.login_code),
      ['WDR1', 'WDR2', 'WDR3', 'WDR4', 'WDR5', 'WDR6', 'WDR7', 'WDR8', 'WDR9', 'WDR10']
    );

    const { data: panAll } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'ALL',
      p_sector_id: pandikkad.id,
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(panAll.total_count, 11);

    const { data: panSec } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'SECTOR',
      p_sector_id: pandikkad.id,
      p_search: '',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(panSec.total_count, 1);
    assert.equal(panSec.items[0].login_code, 'WDR101');

    const { data: valSearch } = await rpc('admin_list_credentials', {
      p_code: adminJwt,
      p_role_filter: 'ALL',
      p_sector_id: null,
      p_search: 'Valiyaparambu',
      p_page: 1,
      p_page_size: 20,
    });
    assert.equal(valSearch.total_count, 2);
    assert.deepEqual(
      valSearch.items.map((i) => i.login_code).sort(),
      ['WDR53', 'WDR78']
    );

    pass(
      '1. admin_list_credentials (ALL=106, SECTOR=10, UNIT=96, Pandikkad Units=10, ALL=11, SECTOR=1, Valiyaparambu=2, disjoint pages)'
    );
  }

  // ---------------------------------------------------------------------------
  // 2. admin_list_units: Sector Filter, Search, Sort & Pagination
  // ---------------------------------------------------------------------------
  {
    const { data: chokP1, error: uErr1 } = await rpc('admin_list_units', {
      p_code: adminJwt,
      p_sector_id: chokkad.id,
      p_search: '',
      p_sort: 'code',
      p_page: 1,
      p_page_size: 10,
    });
    assert.ifError(uErr1);
    assert.equal(chokP1.total_count, 15);
    assert.equal(chokP1.total_pages, 2);
    assert.equal(chokP1.items.length, 10);
    assert.ok(chokP1.totals !== undefined);

    const { data: chokP2 } = await rpc('admin_list_units', {
      p_code: adminJwt,
      p_sector_id: chokkad.id,
      p_search: '',
      p_sort: 'code',
      p_page: 2,
      p_page_size: 10,
    });
    assert.equal(chokP2.items.length, 5);

    const { data: wdr78Res } = await rpc('admin_list_units', {
      p_code: adminJwt,
      p_sector_id: null,
      p_search: 'WDR78',
      p_sort: 'code',
      p_page: 1,
      p_page_size: 10,
    });
    assert.equal(wdr78Res.total_count, 1);
    assert.equal(wdr78Res.items[0].login_code, 'WDR78');

    pass(
      '2. admin_list_units (Chokkad=15 across 2 pages, WDR78 search=1, server totals present)'
    );
  }

  // ---------------------------------------------------------------------------
  // 3. sector_list_units (Strictly Scoped to Own Sector WDR201 via JWT)
  // ---------------------------------------------------------------------------
  let sector2Jwt = null;
  {
    const { data: sec2Login, error: sec2Err } = await rpc('auth_login', {
      p_username: 'Test Sector 2',
      p_password: 'WDR201',
    });
    assert.ifError(sec2Err);
    assert.equal(sec2Login?.valid, true);
    sector2Jwt = sec2Login.token;
    activeTokensToLogout.push(sector2Jwt);

    const { data: secUnits, error: suErr } = await rpc('sector_list_units', {
      p_code: sector2Jwt,
      p_search: '',
      p_sort: 'code',
      p_page: 1,
      p_page_size: 10,
    });
    assert.ifError(suErr);
    assert.equal(secUnits.total_count, 2);
    assert.deepEqual(
      secUnits.items.map((u) => u.login_code),
      ['WDR204', 'WDR205']
    );

    const { data: secSearch } = await rpc('sector_list_units', {
      p_code: sector2Jwt,
      p_search: 'WDR205',
      p_sort: 'code',
      p_page: 1,
      p_page_size: 10,
    });
    assert.equal(secSearch.total_count, 1);
    assert.equal(secSearch.items[0].login_code, 'WDR205');

    pass('3. sector_list_units (WDR201 scoped to 2 units + search filtered to WDR205)');
  }

  // ---------------------------------------------------------------------------
  // 4. Entries Pagination & Filtering (admin_list_entries, sector_list_entries, unit_list_entries)
  // ---------------------------------------------------------------------------
  {
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

    const { data: unit3Login, error: u3Err } = await rpc('auth_login', {
      p_username: 'Test Unit 3',
      p_password: 'WDR204',
    });
    assert.ifError(u3Err);
    assert.equal(unit3Login?.valid, true);
    const unit3Jwt = unit3Login.token;
    activeTokensToLogout.push(unit3Jwt);

    const marker = `PaginateCheck_${Date.now().toString().slice(-5)}`;
    const specs = [
      { name: `${marker}_Unpaid`, phone: '9800000001', qty: 1, status: 'UNPAID', mode: null },
      { name: `${marker}_Cash`, phone: '9800000002', qty: 2, status: 'PAID', mode: 'CASH' },
      { name: `${marker}_UPI`, phone: '9800000003', qty: 3, status: 'PAID', mode: 'UPI' },
    ];

    for (const sp of specs) {
      const { data: ord, error: oErr } = await rpc('unit_add_entry', {
        p_code: unit3Jwt,
        p_contributor_name: sp.name,
        p_mobile_number: sp.phone,
        p_quantity: sp.qty,
        p_payment_status: sp.status,
        p_payment_mode: sp.mode,
      });
      assert.ifError(oErr);
      tempOrderIds.push(ord.id);
    }

    // Admin list entries with search + page_size=2
    const { data: admE1, error: aeErr1 } = await rpc('admin_list_entries', {
      p_code: adminJwt,
      p_sector_filter: 'ALL',
      p_unit_filter: 'ALL',
      p_payment_status: 'ALL',
      p_payment_mode: 'ALL',
      p_search: marker,
      p_page: 1,
      p_page_size: 2,
    });
    assert.ifError(aeErr1);
    assert.equal(admE1.total_count, 3);
    assert.equal(admE1.total_pages, 2);
    assert.equal(admE1.items.length, 2);

    const { data: admE2 } = await rpc('admin_list_entries', {
      p_code: adminJwt,
      p_sector_filter: 'ALL',
      p_unit_filter: 'ALL',
      p_payment_status: 'ALL',
      p_payment_mode: 'ALL',
      p_search: marker,
      p_page: 2,
      p_page_size: 2,
    });
    assert.equal(admE2.items.length, 1);

    // Sector list entries with UNPAID status filter
    const { data: secUnpaid, error: seErr } = await rpc('sector_list_entries', {
      p_code: sector2Jwt,
      p_unit_id: null,
      p_payment_status: 'UNPAID',
      p_payment_mode: 'ALL',
      p_search: marker,
      p_page: 1,
      p_page_size: 10,
    });
    assert.ifError(seErr);
    assert.equal(secUnpaid.total_count, 1);
    assert.equal(secUnpaid.items[0].contributor_name, `${marker}_Unpaid`);

    // Unit list entries with UPI mode filter + phone search
    const { data: unitUpi, error: ueErr } = await rpc('unit_list_entries', {
      p_code: unit3Jwt,
      p_payment_status: 'PAID',
      p_payment_mode: 'UPI',
      p_search: '9800000003',
      p_page: 1,
      p_page_size: 10,
    });
    assert.ifError(ueErr);
    assert.equal(unitUpi.total_count, 1);
    assert.equal(unitUpi.items[0].contributor_name, `${marker}_UPI`);

    // Unit list entries pagination page_size=2
    const { data: unitP1 } = await rpc('unit_list_entries', {
      p_code: unit3Jwt,
      p_payment_status: 'ALL',
      p_payment_mode: 'ALL',
      p_search: marker,
      p_page: 1,
      p_page_size: 2,
    });
    const { data: unitP2 } = await rpc('unit_list_entries', {
      p_code: unit3Jwt,
      p_payment_status: 'ALL',
      p_payment_mode: 'ALL',
      p_search: marker,
      p_page: 2,
      p_page_size: 2,
    });
    assert.equal(unitP1.total_count, 3);
    assert.equal(unitP1.items.length, 2);
    assert.equal(unitP2.items.length, 1);

    pass(
      '4. admin_list_entries, sector_list_entries & unit_list_entries (search, status/mode filters, 2-per-page pagination)'
    );
  }

  console.log('\nALL PAGINATION & FILTERING CHECKS PASSED (4/4)');
} catch (err) {
  console.error('\nVERIFICATION FAILED:', err);
  process.exitCode = 1;
} finally {
  try {
    if (pgClient) {
      if (tempOrderIds.length > 0) {
        await pgClient
          .query(`DELETE FROM entries WHERE id = ANY($1::int[])`, [
            tempOrderIds,
          ])
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
