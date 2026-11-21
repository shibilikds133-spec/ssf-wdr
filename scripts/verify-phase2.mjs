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
const pgClient = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const TEMP_SECTOR_CODE = 'WDR199';
const TEMP_SECTOR_NAME = 'Test Temp Sector 199';
const TEMP_UNIT_CODE = 'WDR99';
const TEMP_UNIT_NAME = 'Test Temp Unit 99';
const TEMP_CONTRIBUTOR = 'Phase2 Test Contributor';

let originalSettings = null;
let tempEntryId = null;
let tempUnitId = null;
let tempSectorId = null;
const results = [];

function pass(label) {
  results.push(label);
  console.log(`PASS: ${label}`);
}

try {
  await pgClient.connect();

  // 1. Verify verify_login_code
  {
    const { data: adminRes, error: adminErr } = await supabase.rpc(
      'verify_login_code',
      { p_code: 'WDR100' }
    );
    assert.ifError(adminErr);
    assert.equal(adminRes?.valid, true);
    assert.equal(adminRes?.role, 'ADMIN');

    const { data: unitRes, error: unitErr } = await supabase.rpc(
      'verify_login_code',
      { p_code: 'wdr1' }
    );
    assert.ifError(unitErr);
    assert.equal(unitRes?.valid, true);
    assert.equal(unitRes?.role, 'UNIT');

    const { data: sectorRes, error: sectorErr } = await supabase.rpc(
      'verify_login_code',
      { p_code: 'WDR101' }
    );
    assert.ifError(sectorErr);
    assert.equal(sectorRes?.valid, true);
    assert.equal(sectorRes?.role, 'SECTOR');

    const { data: invalidRes, error: invalidErr } = await supabase.rpc(
      'verify_login_code',
      { p_code: 'INVALID999' }
    );
    assert.ifError(invalidErr);
    assert.equal(invalidRes?.valid, false);

    pass('1. verify_login_code (ADMIN, lowercase UNIT, SECTOR, INVALID999)');
  }

  // 2. Verify get_public_stats() & zero PII
  {
    const { data: pubStats, error: pubErr } =
      await supabase.rpc('get_public_stats');
    assert.ifError(pubErr);
    assert.ok(pubStats?.settings, 'Expected settings in get_public_stats');
    assert.ok(pubStats?.division, 'Expected division in get_public_stats');
    assert.ok(Array.isArray(pubStats?.sectors), 'Expected sectors array');
    assert.ok(Array.isArray(pubStats?.units), 'Expected units array');

    const jsonText = JSON.stringify(pubStats);
    assert.equal(
      jsonText.includes('contributor_name'),
      false,
      'PII key contributor_name leaked in get_public_stats'
    );
    assert.equal(
      jsonText.includes('mobile_number'),
      false,
      'PII key mobile_number leaked in get_public_stats'
    );

    pass('2. get_public_stats() structure & zero PII check');
  }

  // 3. Verify admin_get_dashboard access control & payload
  {
    const { data: dash, error: dashErr } = await supabase.rpc(
      'admin_get_dashboard',
      { p_code: 'WDR100' }
    );
    assert.ifError(dashErr);
    assert.ok(dash?.settings);
    assert.ok(dash?.summary);
    assert.ok(Array.isArray(dash?.sectors));
    assert.ok(Array.isArray(dash?.unit_summaries));
    assert.ok(Array.isArray(dash?.entries));

    originalSettings = { ...dash.settings };

    const { error: unauthErr } = await supabase.rpc('admin_get_dashboard', {
      p_code: 'WDR1',
    });
    assert.ok(unauthErr, 'Expected error when calling admin_get_dashboard with unit code');

    pass('3. admin_get_dashboard (valid admin payload & unauthorized rejection)');
  }

  // 4. Verify admin_update_settings validation & update/restore
  {
    const { error: badRateErr } = await supabase.rpc('admin_update_settings', {
      p_code: 'WDR100',
      p_unit_rate: 0,
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: true,
    });
    assert.ok(badRateErr, 'Expected error for unit_rate = 0');

    const testRate = Number(originalSettings.unit_rate) + 50;
    const { data: updatedOk, error: updateErr } = await supabase.rpc(
      'admin_update_settings',
      {
        p_code: 'WDR100',
        p_unit_rate: testRate,
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: true,
      }
    );
    assert.ifError(updateErr);
    assert.equal(updatedOk, true);

    const { data: afterDash, error: afterErr } = await supabase.rpc(
      'admin_get_dashboard',
      { p_code: 'WDR100' }
    );
    assert.ifError(afterErr);
    assert.equal(Number(afterDash.settings.unit_rate), testRate);

    // Restore original settings immediately so entry tests use real settings
    const { error: restoreErr } = await supabase.rpc('admin_update_settings', {
      p_code: 'WDR100',
      p_unit_rate: Number(originalSettings.unit_rate),
      p_division_target: Number(originalSettings.division_target),
      p_challenge_title: originalSettings.challenge_title,
      p_is_challenge_open: Boolean(originalSettings.is_challenge_open),
    });
    assert.ifError(restoreErr);

    pass('4. admin_update_settings validation, update & clean restore');
  }

  // 5. Full Entry + Bulk Unit lifecycle
  {
    // Reject unit_code matching admin code
    const { error: adminCollideErr } = await supabase.rpc(
      'admin_bulk_upsert_units',
      {
        p_code: 'WDR100',
        p_rows: [
          {
            sector_name: TEMP_SECTOR_NAME,
            sector_code: TEMP_SECTOR_CODE,
            unit_name: 'Bad Unit',
            unit_code: 'WDR100',
          },
        ],
      }
    );
    assert.ok(adminCollideErr, 'Expected error when unit_code equals admin_code');

    // Upsert temp sector & unit
    const { data: upsertRes, error: upsertErr } = await supabase.rpc(
      'admin_bulk_upsert_units',
      {
        p_code: 'WDR100',
        p_rows: [
          {
            sector_name: TEMP_SECTOR_NAME,
            sector_code: TEMP_SECTOR_CODE,
            unit_name: TEMP_UNIT_NAME,
            unit_code: TEMP_UNIT_CODE,
          },
        ],
      }
    );
    assert.ifError(upsertErr);
    assert.equal(upsertRes?.success, true);
    assert.equal(upsertRes?.processed, 1);

    const { data: dash1, error: dash1Err } = await supabase.rpc(
      'admin_get_dashboard',
      { p_code: 'WDR100' }
    );
    assert.ifError(dash1Err);
    const createdUnit = dash1.unit_summaries.find(
      (u) => u.login_code === TEMP_UNIT_CODE
    );
    const createdSector = dash1.sectors.find(
      (s) => s.login_code === TEMP_SECTOR_CODE
    );
    assert.ok(createdUnit, 'Temp unit WDR99 must exist');
    assert.ok(createdSector, 'Temp sector WDR199 must exist');
    tempUnitId = createdUnit.id;
    tempSectorId = createdSector.id;

    // Ensure challenge is open temporarily if it happened to be closed
    if (!originalSettings.is_challenge_open) {
      const { error: openErr } = await supabase.rpc('admin_update_settings', {
        p_code: 'WDR100',
        p_unit_rate: Number(originalSettings.unit_rate),
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: true,
      });
      assert.ifError(openErr);
    }

    // Add 1.5 L entry via unit_add_entry
    const { data: addedEntry, error: addErr } = await supabase.rpc(
      'unit_add_entry',
      {
        p_code: TEMP_UNIT_CODE,
        p_contributor_name: TEMP_CONTRIBUTOR,
        p_mobile_number: '9876543210',
        p_quantity: 1.5,
        p_payment_mode: 'UPI',
      }
    );
    assert.ifError(addErr);
    assert.ok(addedEntry?.id, 'Expected inserted entry id');
    tempEntryId = addedEntry.id;

    // Reject invalid mobile on admin_update_entry
    const { error: badMobileErr } = await supabase.rpc('admin_update_entry', {
      p_code: 'WDR100',
      p_entry_id: tempEntryId,
      p_contributor_name: TEMP_CONTRIBUTOR,
      p_mobile_number: '12345',
      p_quantity: 2.5,
      p_payment_mode: 'CASH',
    });
    assert.ok(badMobileErr, 'Expected error for short mobile number');

    // Update entry to 2.5 L & confirm recalculated total_amount
    const { data: updateEntryOk, error: updateEntryErr } = await supabase.rpc(
      'admin_update_entry',
      {
        p_code: 'WDR100',
        p_entry_id: tempEntryId,
        p_contributor_name: `${TEMP_CONTRIBUTOR} Updated`,
        p_mobile_number: '9876543210',
        p_quantity: 2.5,
        p_payment_mode: 'CASH',
      }
    );
    assert.ifError(updateEntryErr);
    assert.equal(updateEntryOk, true);

    const { data: dash2, error: dash2Err } = await supabase.rpc(
      'admin_get_dashboard',
      { p_code: 'WDR100' }
    );
    assert.ifError(dash2Err);
    const updatedRow = dash2.entries.find((e) => e.id === tempEntryId);
    assert.ok(updatedRow, 'Updated entry must exist in admin dashboard');
    assert.equal(Number(updatedRow.quantity), 2.5);
    assert.equal(updatedRow.payment_mode, 'CASH');
    const expectedTotal = Number(
      (2.5 * Number(updatedRow.unit_rate_applied)).toFixed(2)
    );
    assert.equal(Number(updatedRow.total_amount), expectedTotal);

    // Reject deleting unit with active entry
    const { error: delUnitBlockedErr } = await supabase.rpc(
      'admin_delete_unit',
      {
        p_code: 'WDR100',
        p_unit_id: tempUnitId,
      }
    );
    assert.ok(
      delUnitBlockedErr,
      'Expected error when deleting unit with active entries'
    );

    // Soft-delete test entry
    const { data: delEntryOk, error: delEntryErr } = await supabase.rpc(
      'admin_delete_entry',
      {
        p_code: 'WDR100',
        p_entry_id: tempEntryId,
      }
    );
    assert.ifError(delEntryErr);
    assert.equal(delEntryOk, true);
    tempEntryId = null;

    // Delete temp unit
    const { data: delUnitOk, error: delUnitErr } = await supabase.rpc(
      'admin_delete_unit',
      {
        p_code: 'WDR100',
        p_unit_id: tempUnitId,
      }
    );
    assert.ifError(delUnitErr);
    assert.equal(delUnitOk, true);
    tempUnitId = null;

    // Delete temp sector
    const { data: delSectorOk, error: delSectorErr } = await supabase.rpc(
      'admin_delete_sector',
      {
        p_code: 'WDR100',
        p_sector_id: tempSectorId,
      }
    );
    assert.ifError(delSectorErr);
    assert.equal(delSectorOk, true);
    tempSectorId = null;

    // Verify zero dummy test rows remain in Postgres
    const leftoverUnits = await pgClient.query(
      'SELECT COUNT(*)::INT AS c FROM units WHERE login_code = $1',
      [TEMP_UNIT_CODE]
    );
    const leftoverSectors = await pgClient.query(
      'SELECT COUNT(*)::INT AS c FROM sectors WHERE login_code = $1',
      [TEMP_SECTOR_CODE]
    );
    const leftoverEntries = await pgClient.query(
      'SELECT COUNT(*)::INT AS c FROM entries WHERE contributor_name LIKE $1',
      [`${TEMP_CONTRIBUTOR}%`]
    );

    assert.equal(leftoverUnits.rows[0].c, 0, 'Temp unit row still present');
    assert.equal(leftoverSectors.rows[0].c, 0, 'Temp sector row still present');
    assert.equal(leftoverEntries.rows[0].c, 0, 'Temp entry row still present');

    pass(
      '5. Full lifecycle (bulk upsert, add entry, edit + recalc, delete guards, cleanup)'
    );
  }

  console.log('\n=== PHASE 2 VERIFICATION SUMMARY ===');
  for (const item of results) {
    console.log(`- [OK] ${item}`);
  }
  console.log('All Phase 2 live backend assertions passed with zero leftover test data.');
} catch (error) {
  console.error('\nPHASE 2 VERIFICATION FAILED:', error);
  process.exitCode = 1;
} finally {
  // Defensive cleanup if any assertion threw mid-run
  try {
    if (originalSettings) {
      await supabase.rpc('admin_update_settings', {
        p_code: 'WDR100',
        p_unit_rate: Number(originalSettings.unit_rate),
        p_division_target: Number(originalSettings.division_target),
        p_challenge_title: originalSettings.challenge_title,
        p_is_challenge_open: Boolean(originalSettings.is_challenge_open),
      });
    }
    if (pgClient) {
      await pgClient
        .query('DELETE FROM entries WHERE contributor_name LIKE $1', [
          `${TEMP_CONTRIBUTOR}%`,
        ])
        .catch(() => {});
      await pgClient
        .query('DELETE FROM units WHERE login_code = $1', [TEMP_UNIT_CODE])
        .catch(() => {});
      await pgClient
        .query('DELETE FROM sectors WHERE login_code = $1', [TEMP_SECTOR_CODE])
        .catch(() => {});
    }
  } finally {
    await pgClient.end().catch(() => {});
  }
}
