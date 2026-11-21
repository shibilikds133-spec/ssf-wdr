import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function run() {
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });

  try {
    const reportsMod = await vite.ssrLoadModule('/src/utils/reports.ts');
    const pdfMod = await vite.ssrLoadModule('/src/utils/exportPdf.ts');
    const csvMod = await vite.ssrLoadModule('/src/utils/csv.ts');

    const {
      buildReportPayload,
      buildUnitDailyBreakdown,
      getDefaultReportConfig,
      normalizeReportConfig,
    } = reportsMod;
    const { buildReportPrintHtml } = pdfMod;
    const { buildReportCsvContent } = csvMod;

    // Fixed reference time: 22 Nov 2026, 01:30 AM IST (2026-11-21T20:00:00Z)
    const now = new Date('2026-11-21T20:00:00.000Z');

    const sectors = [
      { id: 101, name: 'SSF Pandikkad Sector', login_code: 'WDR101' },
      { id: 102, name: 'SSF Wandoor Sector', login_code: 'WDR102' },
      { id: 103, name: 'SSF Kalikavu Sector', login_code: 'WDR103' },
    ];

    const units = [
      {
        id: 1,
        name: 'Pallipadi',
        login_code: 'WDR1',
        sector_id: 101,
        sector_name: 'SSF Pandikkad Sector',
        sector_code: 'WDR101',
        total_entries: 2,
        total_quantity: 5,
        cash_amount: 500,
        upi_amount: 0,
        paid_amount: 500,
        unpaid_amount: 750,
        unpaid_entries: 1,
        total_amount: 1250,
      },
      {
        id: 2,
        name: 'Zero Unit',
        login_code: 'WDR99',
        sector_id: 101,
        sector_name: 'SSF Pandikkad Sector',
        sector_code: 'WDR101',
        total_entries: 0,
        total_quantity: 0,
        cash_amount: 0,
        upi_amount: 0,
        paid_amount: 0,
        unpaid_amount: 0,
        unpaid_entries: 0,
        total_amount: 0,
      },
      {
        id: 3,
        name: 'Wandoor Town',
        login_code: 'WDR3',
        sector_id: 102,
        sector_name: 'SSF Wandoor Sector',
        sector_code: 'WDR102',
        total_entries: 1,
        total_quantity: 4,
        cash_amount: 0,
        upi_amount: 1000,
        paid_amount: 1000,
        unpaid_amount: 0,
        unpaid_entries: 0,
        total_amount: 1000,
      },
    ];

    const entries = [
      // Unit 1 (Sector 101): Today (22 Nov IST), Cash Paid
      {
        id: 1001,
        unit_id: 1,
        unit_name: 'Pallipadi',
        sector_id: 101,
        sector_name: 'SSF Pandikkad Sector',
        is_division_direct: false,
        contributor_name: 'Ameen, "Al-Barakah" (മലയാളം)',
        mobile_number: '9876543210',
        quantity: 2,
        unit_rate_applied: 250,
        total_amount: 500,
        payment_status: 'PAID',
        payment_mode: 'CASH',
        created_at: '2026-11-21T19:00:00.000Z', // 2026-11-22 00:30 IST
      },
      // Unit 1 (Sector 101): 4 days ago (18 Nov IST), Unpaid
      {
        id: 1002,
        unit_id: 1,
        unit_name: 'Pallipadi',
        sector_id: 101,
        sector_name: 'SSF Pandikkad Sector',
        is_division_direct: false,
        contributor_name: 'Basheer <script>alert(1)</script>',
        mobile_number: '9876543211',
        quantity: 3,
        unit_rate_applied: 250,
        total_amount: 750,
        payment_status: 'UNPAID',
        payment_mode: null,
        created_at: '2026-11-18T10:00:00.000Z',
      },
      // Unit 3 (Sector 102): Older (15 Oct IST), UPI Paid
      {
        id: 1003,
        unit_id: 3,
        unit_name: 'Wandoor Town',
        sector_id: 102,
        sector_name: 'SSF Wandoor Sector',
        is_division_direct: false,
        contributor_name: 'Faisal',
        mobile_number: '9876543212',
        quantity: 4,
        unit_rate_applied: 250,
        total_amount: 1000,
        payment_status: 'PAID',
        payment_mode: 'UPI',
        created_at: '2026-10-15T06:00:00.000Z',
      },
      // Division Direct Order: Today (22 Nov IST), UPI Paid
      {
        id: 1004,
        unit_id: null,
        unit_name: 'Division Direct',
        sector_id: null,
        sector_name: 'Division',
        is_division_direct: true,
        contributor_name: 'Hameed Direct',
        mobile_number: '9876543213',
        quantity: 10,
        unit_rate_applied: 250,
        total_amount: 2500,
        payment_status: 'PAID',
        payment_mode: 'UPI',
        created_at: '2026-11-21T19:30:00.000Z', // 2026-11-22 01:00 IST
      },
      // Division Direct Order: Unpaid
      {
        id: 1005,
        unit_id: null,
        unit_name: 'Division Direct',
        sector_id: null,
        sector_name: 'Division',
        is_division_direct: true,
        contributor_name: 'Kareem Direct Unpaid',
        mobile_number: '9876543214',
        quantity: 5,
        unit_rate_applied: 250,
        total_amount: 1250,
        payment_status: 'UNPAID',
        payment_mode: null,
        created_at: '2026-11-20T08:00:00.000Z',
      },
    ];

    const adminData = {
      settings: {
        unit_rate: 250,
        division_target: 100,
        challenge_title: 'SSF Wandoor Division Payasam Challenge',
        is_challenge_open: true,
      },
      summary: {
        total_units: 3,
        total_entries: 5,
        total_quantity: 24,
        cash_amount: 500,
        upi_amount: 3500,
        paid_amount: 4000,
        unpaid_amount: 2000,
        unpaid_entries: 2,
        total_amount: 6000,
        division_direct_entries: 2,
        division_direct_quantity: 15,
        division_direct_amount: 3750,
      },
      sectors,
      unit_summaries: units,
      entries,
    };

    // 1. Division ENTIRE_DIVISION Detailed Orders + Filename
    const divAllOrders = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'ENTIRE_DIVISION',
        template: 'DETAILED_ORDERS',
      }),
      now
    );
    assert.equal(divAllOrders.pdfFilename, 'ssf_division_all_orders_20261122.pdf');
    assert.equal(divAllOrders.csvFilename, 'ssf_division_all_orders_20261122.csv');
    assert.equal(divAllOrders.matchedCount, 5);
    assert.equal(divAllOrders.summary.totalLiters, 24);
    assert.equal(divAllOrders.summary.totalAmount, 6000);
    assert.equal(divAllOrders.divisionDirectBreakdown.totalOrders, 2);
    assert.equal(divAllOrders.divisionDirectBreakdown.totalLiters, 15);
    assert.equal(divAllOrders.showSectorColumn, true);
    assert.equal(divAllOrders.showUnitColumn, true);
    assert.equal(divAllOrders.orientation, 'landscape');

    // 2. Division ENTIRE_DIVISION Sector Summary: Division Direct MUST NOT inflate sectors
    const divSectorSummary = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'ENTIRE_DIVISION',
        template: 'SECTOR_SUMMARY',
        includeZeroOrderUnits: true,
      }),
      now
    );
    assert.equal(divSectorSummary.sectorRows.length, 3);
    assert.equal(divSectorSummary.tableTotals.totalOrders, 3);
    assert.equal(divSectorSummary.tableTotals.totalLiters, 9);
    assert.equal(divSectorSummary.tableTotals.totalAmount, 2250);
    // Grand totals include Division Direct (9 + 15 = 24 L, 2250 + 3750 = 6000)
    assert.equal(divSectorSummary.summary.totalOrders, 5);
    assert.equal(divSectorSummary.summary.totalLiters, 24);
    assert.equal(divSectorSummary.summary.totalAmount, 6000);

    // Excluding zero-order sectors removes Kalikavu (103)
    const divSectorNonZero = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'ENTIRE_DIVISION',
        template: 'SECTOR_SUMMARY',
        includeZeroOrderUnits: false,
      }),
      now
    );
    assert.equal(divSectorNonZero.sectorRows.length, 2);

    // 3. Division ENTIRE_DIVISION Unit Summary: Division Direct MUST NOT inflate units
    const divUnitSummary = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'ENTIRE_DIVISION',
        template: 'UNIT_SUMMARY',
        includeZeroOrderUnits: true,
      }),
      now
    );
    assert.equal(divUnitSummary.unitRows.length, 3);
    assert.equal(divUnitSummary.tableTotals.totalOrders, 3);
    assert.equal(divUnitSummary.tableTotals.totalLiters, 9);
    assert.equal(divUnitSummary.summary.totalLiters, 24);

    // 4. Division SECTOR_SPECIFIC & UNIT_SPECIFIC + Column Hiding + Filenames
    const adminSectorSummary = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'SECTOR_SPECIFIC',
        sectorId: 101,
        template: 'UNIT_SUMMARY',
      }),
      now
    );
    assert.equal(
      adminSectorSummary.csvFilename,
      'ssf_sector_WDR101_unit_summary_20261122.csv'
    );
    assert.equal(adminSectorSummary.unitRows.length, 2); // Pallipadi + Zero Unit
    assert.equal(adminSectorSummary.summary.totalLiters, 5);
    assert.equal(adminSectorSummary.showSectorColumn, false);

    const adminUnitDelivery = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'UNIT_SPECIFIC',
        unitId: 1,
        template: 'DELIVERY_SHEET',
      }),
      now
    );
    assert.equal(
      adminUnitDelivery.pdfFilename,
      'ssf_unit_WDR1_delivery_sheet_20261122.pdf'
    );
    assert.equal(adminUnitDelivery.matchedCount, 2);
    assert.equal(adminUnitDelivery.showSectorColumn, false);
    assert.equal(adminUnitDelivery.showUnitColumn, false);
    assert.equal(adminUnitDelivery.orientation, 'portrait');

    // 5. Division DIVISION_DIRECT
    const divDirectOrders = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        scope: 'DIVISION_DIRECT',
        template: 'DETAILED_ORDERS',
      }),
      now
    );
    assert.equal(
      divDirectOrders.pdfFilename,
      'ssf_division_direct_orders_20261122.pdf'
    );
    assert.equal(divDirectOrders.matchedCount, 2);
    assert.ok(divDirectOrders.orderRows.every((r) => r.isDivisionDirect === true));

    // 6. Sector Portal Isolation (even with dirty foreign/direct entries injected)
    const sectorDataDirty = {
      sector: sectors[0],
      settings: adminData.settings,
      summary: {
        total_units: 2,
        total_entries: 2,
        total_quantity: 5,
        cash_amount: 500,
        upi_amount: 0,
        paid_amount: 500,
        unpaid_amount: 750,
        unpaid_entries: 1,
        total_amount: 1250,
      },
      units: [
        units[0],
        units[1],
        units[2], // Dirty foreign unit from sector 102
      ],
      entries: [
        // Note: simulate real sector_get_dashboard entries (no sector_id property) + dirty entries
        { ...entries[0], sector_id: undefined },
        { ...entries[1], sector_id: undefined },
        entries[2], // Dirty unit 3 entry from sector 102
        entries[3], // Dirty Division Direct entry
      ],
    };

    const sectorAll = buildReportPayload(
      { role: 'SECTOR', data: sectorDataDirty },
      // Attempt to pass unauthorized ADMIN scope & template
      {
        ...getDefaultReportConfig('SECTOR'),
        scope: 'ENTIRE_DIVISION',
        template: 'SECTOR_SUMMARY',
      },
      now
    );
    assert.equal(sectorAll.config.scope, 'ENTIRE_SECTOR');
    assert.equal(sectorAll.config.template, 'DETAILED_ORDERS');
    assert.equal(sectorAll.matchedCount, 2);
    assert.ok(
      sectorAll.orderRows.every(
        (r) => !r.isDivisionDirect && (r.unitId === 1 || r.unitId === 2)
      )
    );

    const sectorForeignUnit = buildReportPayload(
      { role: 'SECTOR', data: sectorDataDirty },
      getDefaultReportConfig('SECTOR', {
        scope: 'UNIT_SPECIFIC',
        unitId: 3, // Foreign unit
        template: 'DELIVERY_SHEET',
      }),
      now
    );
    assert.equal(sectorForeignUnit.isSelectionIncomplete, true);
    assert.equal(sectorForeignUnit.matchedCount, 0);

    // 7. Unit Portal Isolation (even with dirty foreign/direct entries injected)
    const unitDataDirty = {
      unit: {
        id: 1,
        name: 'Pallipadi',
        username: 'wdr1',
        login_code: 'WDR1',
        contact_phone: '9876543210',
        sector_id: 101,
        sector_name: 'SSF Pandikkad Sector',
      },
      settings: adminData.settings,
      summary: {
        total_entries: 2,
        total_quantity: 5,
        cash_amount: 500,
        upi_amount: 0,
        paid_amount: 500,
        unpaid_amount: 750,
        unpaid_entries: 1,
        total_amount: 1250,
      },
      entries: [entries[0], entries[1], entries[2], entries[3]],
    };

    const unitPayload = buildReportPayload(
      { role: 'UNIT', data: unitDataDirty },
      {
        ...getDefaultReportConfig('UNIT'),
        scope: 'ENTIRE_DIVISION',
        template: 'UNIT_SUMMARY',
      },
      now
    );
    assert.equal(unitPayload.config.scope, 'THIS_UNIT');
    assert.equal(unitPayload.config.template, 'DELIVERY_SHEET');
    assert.equal(
      unitPayload.pdfFilename,
      'ssf_unit_WDR1_delivery_sheet_20261122.pdf'
    );
    assert.equal(unitPayload.matchedCount, 2);
    assert.ok(unitPayload.orderRows.every((r) => r.unitId === 1));

    const dailyRows = buildUnitDailyBreakdown(
      unitDataDirty.entries,
      unitDataDirty.unit.id
    );
    assert.equal(dailyRows.length, 2);
    assert.equal(dailyRows[0].dateKey, '2026-11-22');
    assert.equal(dailyRows[1].dateKey, '2026-11-18');

    // 8. UNPAID_DUES Lock & Payment Mode Auto-Reset
    const normalizedUnpaid = normalizeReportConfig({
      role: 'ADMIN',
      scope: 'ENTIRE_DIVISION',
      sectorId: null,
      unitId: null,
      template: 'UNPAID_DUES',
      paymentStatus: 'PAID',
      paymentMode: 'UPI',
      datePreset: 'ALL',
      dateFrom: '',
      dateTo: '',
      includeZeroOrderUnits: true,
      sortBy: 'LATEST',
    });
    assert.equal(normalizedUnpaid.paymentStatus, 'UNPAID');
    assert.equal(normalizedUnpaid.paymentMode, 'ALL');

    const unpaidPayload = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      normalizedUnpaid,
      now
    );
    assert.equal(unpaidPayload.matchedCount, 2);
    assert.equal(unpaidPayload.summary.unpaidAmount, 2000);
    assert.equal(unpaidPayload.summary.paidAmount, 0);
    assert.ok(
      unpaidPayload.orderRows.every((r) => r.paymentStatus === 'UNPAID')
    );

    const resetMode = normalizeReportConfig({
      ...getDefaultReportConfig('ADMIN'),
      paymentStatus: 'UNPAID',
      paymentMode: 'CASH',
    });
    assert.equal(resetMode.paymentMode, 'ALL');

    // 9. Date Presets (TODAY, LAST_7_DAYS, CUSTOM with reversed dates)
    const todayPayload = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', { datePreset: 'TODAY' }),
      now
    );
    assert.equal(todayPayload.matchedCount, 2); // IDs 1001 & 1004 (both 22 Nov IST)

    const last7Payload = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', { datePreset: 'LAST_7_DAYS' }),
      now
    );
    assert.equal(last7Payload.matchedCount, 4); // All except 15 Oct (1003)

    const customPayload = buildReportPayload(
      { role: 'ADMIN', data: adminData },
      getDefaultReportConfig('ADMIN', {
        datePreset: 'CUSTOM',
        dateFrom: '2026-11-22',
        dateTo: '2026-11-20', // intentionally reversed
      }),
      now
    );
    assert.equal(customPayload.config.dateFrom, '2026-11-20');
    assert.equal(customPayload.config.dateTo, '2026-11-22');
    assert.equal(customPayload.matchedCount, 3); // 1001, 1004, 1005

    // 10. Empty / 0-match filter safety (no NaN / Infinity)
    const emptyPayload = buildReportPayload(
      {
        role: 'ADMIN',
        data: {
          ...adminData,
          settings: { ...adminData.settings, division_target: 0 },
        },
      },
      getDefaultReportConfig('ADMIN', {
        datePreset: 'CUSTOM',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-02',
      }),
      now
    );
    assert.equal(emptyPayload.matchedCount, 0);
    for (const [k, v] of Object.entries(emptyPayload.summary)) {
      assert.equal(
        Number.isFinite(v),
        true,
        `Summary field ${k} must be finite on empty dataset`
      );
      assert.equal(v, 0);
    }

    // 11. PDF HTML & CSV Output Checks
    const adminHtml = buildReportPrintHtml(divSectorSummary);
    assert.ok(adminHtml.includes('#381932'));
    assert.ok(adminHtml.includes('<span class="ssf-mark">SSF</span>'));
    assert.ok(adminHtml.includes('Division Grand Total'));
    assert.ok(adminHtml.includes('Generated from <span class="ssf-mark">SSF</span> Wandoor Payasam Challenge Portal'));

    const sectorHtml = buildReportPrintHtml(sectorAll);
    assert.ok(sectorHtml.includes('#043326'));

    const unitHtml = buildReportPrintHtml(unitPayload);
    assert.ok(unitHtml.includes('#EC5E27'));
    assert.ok(unitHtml.includes('tick-box'));
    assert.equal(
      unitHtml.includes('<script>alert(1)</script>'),
      false,
      'Raw <script> tag must be escaped in PDF HTML'
    );
    assert.ok(unitHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));

    const unitCsv = buildReportCsvContent(unitPayload);
    assert.ok(unitCsv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
    assert.ok(
      unitCsv.includes('"Ameen, ""Al-Barakah"" (മലയാളം)"'),
      'CSV must properly quote and escape commas, double quotes, and preserve Malayalam UTF-8'
    );

    const sectorSummaryCsv = buildReportCsvContent(divSectorSummary);
    assert.ok(sectorSummaryCsv.includes('Subtotal (3 Sectors)'));
    assert.ok(sectorSummaryCsv.includes('Division Direct (No Sector)'));
    assert.ok(sectorSummaryCsv.includes('Division Grand Total'));

    console.log('ALL REPORTS ENGINE CHECKS PASSED (11/11 suites)');
  } finally {
    await vite.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
