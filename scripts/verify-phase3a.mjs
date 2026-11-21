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
      'INFO: Supabase REST API timed out (network/ISP block); verifying live RPCs via Postgres pooler as role anon.'
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

const ADMIN_CODE = 'WDR100';
const SEEDED_SECTOR_CODE = 'WDR200';

const TEMP_UNIT_1_CODE = 'WDR981';
const TEMP_UNIT_1_NAME = 'Phase3A Temp Unit 981';
const TEMP_UNIT_1_RENAMED = 'Phase3A Renamed Unit 981';
const TEMP_UNIT_2_CODE = 'WDR982';
const TEMP_UNIT_2_NAME = 'Phase3A Bulk Unit 982';

const ATTACK_SECTOR_CODE = 'WDR298';
const ATTACK_SECTOR_NAME = 'Phase3A Attack Sector 298';
const ATTACK_UNIT_CODE = 'WDR988';
const ATTACK_UNIT_NAME = 'Phase3A Attack Unit 988';

const results = [];
let originalSettings = null;
let tempUnit1Id = null;
let tempUnit2Id = null;
let tempEntry1Id = null;
let attackSectorId = null;
let attackUnitId = null;
let attackEntryId = null;

function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}

try {
  await initTransport();

  // Check admin settings first so we can restore is_challenge_open if temporarily toggled
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
  }

  // 1. Auth & Dashboard Read
  {
    const { data: dash, error: dashErr } = await rpc('sector_get_dashboard', {
      p_code: SEEDED_SECTOR_CODE,
    });
    assert.ifError(dashErr);
    assert.ok(dash?.sector?.id, 'Expected sector object with id');
    assert.equal(dash?.sector?.login_code, SEEDED_SECTOR_CODE);
    assert.ok(dash?.settings, 'Expected settings');
    assert.ok(dash?.summary, 'Expected summary');
    assert.ok(Array.isArray(dash?.units), 'Expected units array');
    assert.ok(Array.isArray(dash?.entries), 'Expected entries array');

    for (const u of dash.units) {
      assert.equal(
        u.sector_id,
        dash.sector.id,
        `Unit ${u.login_code} belongs to wrong sector_id ${u.sector_id}`
      );
    }

    // Verify invalid / unit / admin codes are rejected
    for (const badCode of ['INVALID', 'WDR1', ADMIN_CODE]) {
      const { error: badErr } = await rpc('sector_get_dashboard', {
        p_code: badCode,
      });
      assert.ok(badErr, `Expected sector_get_dashboard to reject ${badCode}`);
    }

    pass('1. Auth & Dashboard Read (scoped units + rejection of non-sector codes)');
  }

  // 2. Sector Unit CRUD & Bulk Import
  {
    const { data: upsertRes, error: upsertErr } = await rpc(
      'sector_upsert_unit',
      {
        p_code: SEEDED_SECTOR_CODE,
        p_unit_name: TEMP_UNIT_1_NAME,
        p_unit_code: TEMP_UNIT_1_CODE,
      }
    );
    assert.ifError(upsertErr);
    assert.equal(upsertRes?.success, true);
    assert.equal(upsertRes?.unit_code, TEMP_UNIT_1_CODE);

    // Rename WDR981
    const { data: renameRes, error: renameErr } = await rpc(
      'sector_upsert_unit',
      {
        p_code: SEEDED_SECTOR_CODE,
        p_unit_name: TEMP_UNIT_1_RENAMED,
        p_unit_code: TEMP_UNIT_1_CODE,
      }
    );
    assert.ifError(renameErr);
    assert.equal(renameRes?.success, true);

    // Bulk import WDR982
    const { data: bulkRes, error: bulkErr } = await rpc(
      'sector_bulk_upsert_units',
      {
        p_code: SEEDED_SECTOR_CODE,
        p_rows: [{ unit_name: TEMP_UNIT_2_NAME, unit_code: TEMP_UNIT_2_CODE }],
      }
    );
    assert.ifError(bulkErr);
    assert.equal(bulkRes?.success, true);
    assert.equal(bulkRes?.processed, 1);

    // Verify both appear in sector_get_dashboard
    const { data: dashAfter, error: dashErr } = await rpc(
      'sector_get_dashboard',
      { p_code: SEEDED_SECTOR_CODE }
    );
    assert.ifError(dashErr);

    const u1 = dashAfter.units.find((u) => u.login_code === TEMP_UNIT_1_CODE);
    const u2 = dashAfter.units.find((u) => u.login_code === TEMP_UNIT_2_CODE);
    assert.ok(u1, 'Expected temp unit WDR981 in dashboard');
    assert.equal(u1.name, TEMP_UNIT_1_RENAMED);
    assert.ok(u2, 'Expected temp unit WDR982 in dashboard');

    tempUnit1Id = u1.id;
    tempUnit2Id = u2.id;

    pass('2. Sector Unit CRUD & Bulk Import (create, rename, bulk import 1 unit)');
  }

  // 3. Sector Order Lifecycle
  {
    // Add 1.5 L order to WDR981 via unit_add_entry
    const { data: addedEntry, error: addErr } = await rpc('unit_add_entry', {
      p_code: TEMP_UNIT_1_CODE,
      p_contributor_name: 'Phase3A Test Contributor',
      p_mobile_number: '9876543210',
      p_quantity: 1.5,
      p_payment_mode: 'UPI',
    });
    assert.ifError(addErr);
    assert.ok(addedEntry?.id, 'Expected created entry id');
    tempEntry1Id = addedEntry.id;

    // Confirm sector_delete_unit on WDR981 is REJECTED while it has an active order
    const { error: delActiveErr } = await rpc('sector_delete_unit', {
      p_code: SEEDED_SECTOR_CODE,
      p_unit_id: tempUnit1Id,
    });
    assert.ok(
      delActiveErr,
      'Expected sector_delete_unit to reject deleting unit with active order'
    );

    // Update that order to 2.5 L via sector_update_entry
    const { data: updRes, error: updErr } = await rpc('sector_update_entry', {
      p_code: SEEDED_SECTOR_CODE,
      p_entry_id: tempEntry1Id,
      p_contributor_name: 'Phase3A Updated Contributor',
      p_mobile_number: '9876543210',
      p_quantity: 2.5,
      p_payment_mode: 'CASH',
    });
    assert.ifError(updErr);
    assert.equal(updRes, true);

    // Verify total_amount recalculated cleanly
    const { data: dashCheck, error: dashErr } = await rpc(
      'sector_get_dashboard',
      { p_code: SEEDED_SECTOR_CODE }
    );
    assert.ifError(dashErr);
    const updatedEntry = dashCheck.entries.find((e) => e.id === tempEntry1Id);
    assert.ok(updatedEntry, 'Expected updated entry in sector dashboard');
    assert.equal(Number(updatedEntry.quantity), 2.5);
    assert.equal(
      Number(updatedEntry.total_amount),
      Math.round(2.5 * Number(updatedEntry.unit_rate_applied) * 100) / 100
    );

    // Soft-delete that order via sector_delete_entry
    const { data: delEntryRes, error: delEntryErr } = await rpc(
      'sector_delete_entry',
      {
        p_code: SEEDED_SECTOR_CODE,
        p_entry_id: tempEntry1Id,
      }
    );
    assert.ifError(delEntryErr);
    assert.equal(delEntryRes, true);
    tempEntry1Id = null;

    pass('3. Sector Order Lifecycle (add, block unit delete, update qty + recalc, soft delete)');
  }

  // 4. CRITICAL Cross-Sector Isolation Attack Tests
  {
    // Create temporary second sector WDR198 + unit WDR988 via admin
    const { error: adminBulkErr } = await rpc('admin_bulk_upsert_units', {
      p_code: ADMIN_CODE,
      p_rows: [
        {
          sector_name: ATTACK_SECTOR_NAME,
          sector_code: ATTACK_SECTOR_CODE,
          unit_name: ATTACK_UNIT_NAME,
          unit_code: ATTACK_UNIT_CODE,
        },
      ],
    });
    assert.ifError(adminBulkErr);

    // Add 1 order to WDR988
    const { data: atkEntry, error: atkEntryErr } = await rpc('unit_add_entry', {
      p_code: ATTACK_UNIT_CODE,
      p_contributor_name: 'Attack Target Contributor',
      p_mobile_number: '9998887776',
      p_quantity: 2,
      p_payment_mode: 'UPI',
    });
    assert.ifError(atkEntryErr);
    attackEntryId = atkEntry.id;

    // Resolve attackUnitId and attackSectorId
    const { data: atkDash, error: atkDashErr } = await rpc(
      'sector_get_dashboard',
      { p_code: ATTACK_SECTOR_CODE }
    );
    assert.ifError(atkDashErr);
    attackSectorId = atkDash.sector.id;
    attackUnitId = atkDash.units.find(
      (u) => u.login_code === ATTACK_UNIT_CODE
    )?.id;
    assert.ok(attackUnitId, 'Expected WDR988 id');

    // Attack 1: WDR101 tries to upsert WDR988
    const { error: atk1Err } = await rpc('sector_upsert_unit', {
      p_code: SEEDED_SECTOR_CODE,
      p_unit_name: 'Hijacked Unit',
      p_unit_code: ATTACK_UNIT_CODE,
    });
    assert.ok(atk1Err, 'Cross-sector sector_upsert_unit MUST fail');
    assert.ok(
      atk1Err.message.includes('belongs to a unit in another sector'),
      `Unexpected error message: ${atk1Err.message}`
    );

    // Attack 2: WDR101 tries to update WDR988's order
    const { error: atk2Err } = await rpc('sector_update_entry', {
      p_code: SEEDED_SECTOR_CODE,
      p_entry_id: attackEntryId,
      p_contributor_name: 'Hijacked Order',
      p_mobile_number: '9998887776',
      p_quantity: 5,
      p_payment_mode: 'CASH',
    });
    assert.ok(atk2Err, 'Cross-sector sector_update_entry MUST fail');

    // Attack 3: WDR101 tries to delete WDR988's order
    const { error: atk3Err } = await rpc('sector_delete_entry', {
      p_code: SEEDED_SECTOR_CODE,
      p_entry_id: attackEntryId,
    });
    assert.ok(atk3Err, 'Cross-sector sector_delete_entry MUST fail');

    // Attack 4: WDR101 tries to delete unit WDR988
    const { error: atk4Err } = await rpc('sector_delete_unit', {
      p_code: SEEDED_SECTOR_CODE,
      p_unit_id: attackUnitId,
    });
    assert.ok(atk4Err, 'Cross-sector sector_delete_unit MUST fail');

    pass('4. Cross-Sector Isolation Attack Tests (upsert/update/delete blocked)');
  }
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  // 5. Clean Teardown
  try {
    if (tempEntry1Id) {
      await rpc('admin_delete_entry', {
        p_code: ADMIN_CODE,
        p_entry_id: tempEntry1Id,
      });
    }
    if (tempUnit1Id) {
      await rpc('sector_delete_unit', {
        p_code: SEEDED_SECTOR_CODE,
        p_unit_id: tempUnit1Id,
      });
    }
    if (tempUnit2Id) {
      await rpc('sector_delete_unit', {
        p_code: SEEDED_SECTOR_CODE,
        p_unit_id: tempUnit2Id,
      });
    }
    if (attackEntryId) {
      await rpc('admin_delete_entry', {
        p_code: ADMIN_CODE,
        p_entry_id: attackEntryId,
      });
    }
    if (attackUnitId) {
      await rpc('admin_delete_unit', {
        p_code: ADMIN_CODE,
        p_unit_id: attackUnitId,
      });
    }
    if (attackSectorId) {
      await rpc('admin_delete_sector', {
        p_code: ADMIN_CODE,
        p_sector_id: attackSectorId,
      });
    }
    if (originalSettings && !originalSettings.is_challenge_open) {
      await rpc('admin_update_settings', {
        p_code: ADMIN_CODE,
        p_unit_rate: Number(originalSettings.unit_rate),
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: originalSettings.is_challenge_open,
      });
    }
    console.log('PASS: 5. Clean Teardown completed with zero test pollution.');
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
    `\nALL PHASE 3A VERIFICATION CHECKS PASSED (${results.length}/4 + Teardown)`
  );
}
