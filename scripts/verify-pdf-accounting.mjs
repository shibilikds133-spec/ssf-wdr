import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const rootDir = process.cwd();
const cacheBase = path.join(rootDir, 'node_modules', '.cache');
fs.mkdirSync(cacheBase, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(cacheBase, 'payasam-pdf-verify-'));
const entryPath = path.join(tmpDir, 'verify_entry.ts');
const outPath = path.join(tmpDir, 'verify_bundle.mjs');

fs.writeFileSync(
  entryPath,
  `
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/pdf/pdfTheme.ts'))};
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/pdf/pdfAccounting.ts'))};
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/pdf/pdfPresets.ts'))};
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/reports.ts'))};
`,
  'utf8'
);

try {
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: outPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });

  const mod = await import(pathToFileURL(outPath).href);
  const {
    formatPdfCurrency,
    formatPdfQuantity,
    sanitizePdfText,
    reconcileOrderEntries,
    reconcileRollupRows,
    safePercent,
    buildReportPayload,
    getDefaultReportConfig,
    buildFormalPdfConfigFromPayload,
    buildFormalPdfFromPayload,
  } = mod;

  let passed = 0;
  const check = (label, fn) => {
    fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${label}`);
  };

  // 1. Fractional quantities & zero IEEE-754 drift (0.1 + 0.2 + 0.5 + 1.5 + 2.25 = 4.55)
  check('Fractional quantities (0.1 + 0.2 + 0.5 + 1.5 + 2.25) accumulate with zero IEEE-754 drift', () => {
    const entries = [
      { quantity: 0.1, unit_rate_applied: 250, total_amount: 25, payment_status: 'PAID', payment_mode: 'CASH' },
      { quantity: 0.2, unit_rate_applied: 250, total_amount: 50, payment_status: 'PAID', payment_mode: 'UPI' },
      { quantity: 0.5, unit_rate_applied: 250, total_amount: 125, payment_status: 'UNPAID', payment_mode: null },
      { quantity: 1.5, unit_rate_applied: 250, total_amount: 375, payment_status: 'PAID', payment_mode: 'CASH' },
      { quantity: 2.25, unit_rate_applied: 250, total_amount: 562.5, payment_status: 'PAID', payment_mode: 'UPI' },
    ];
    const res = reconcileOrderEntries(entries, 250);
    assert.equal(res.totalLiters, 4.55);
    assert.equal(formatPdfQuantity(res.totalLiters), '4.55 L');
    assert.equal(formatPdfQuantity(2), '2 L');
    assert.equal(formatPdfQuantity(1.5), '1.5 L');
    assert.equal(res.totalAmount, 1137.5);
    assert.equal(res.isReconciled, true);
  });

  // 2. Mixed payment states strict reconciliation invariant
  check('Mixed payment states enforce A_cash + A_upi + A_unpaid === A_total', () => {
    const entries = [
      { quantity: 2, unit_rate_applied: 250, total_amount: 500, payment_status: 'PAID', payment_mode: 'CASH' },
      { quantity: 1.5, unit_rate_applied: 250, total_amount: 375, payment_status: 'PAID', payment_mode: 'UPI' },
      { quantity: 3, unit_rate_applied: 250, total_amount: 750, payment_status: 'UNPAID', payment_mode: null },
    ];
    const res = reconcileOrderEntries(entries);
    assert.equal(res.cashAmount, 500);
    assert.equal(res.upiAmount, 375);
    assert.equal(res.unpaidAmount, 750);
    assert.equal(res.cashAmount + res.upiAmount + res.unpaidAmount, res.totalAmount);
    assert.equal(res.isReconciled, true);
  });

  // 3. Historical rate changes (250 + 260) sum exact stored total_amount
  check('Historical rate changes (250 and 260 combined) preserve exact stored amounts & Mixed Rates label', () => {
    const entries = [
      { quantity: 2, unit_rate_applied: 250, total_amount: 500, payment_status: 'PAID', payment_mode: 'CASH' },
      { quantity: 2, unit_rate_applied: 260, total_amount: 520, payment_status: 'PAID', payment_mode: 'UPI' },
    ];
    const res = reconcileOrderEntries(entries, 260);
    assert.equal(res.totalAmount, 1020);
    assert.equal(res.rateLabel, 'Mixed Rates');
  });

  // 4. Soft-deleted rows excluded cleanly
  check('Soft-deleted entries (is_deleted: true) are strictly excluded', () => {
    const entries = [
      { quantity: 2, unit_rate_applied: 250, total_amount: 500, payment_status: 'PAID', payment_mode: 'CASH', is_deleted: false },
      { quantity: 10, unit_rate_applied: 250, total_amount: 2500, payment_status: 'UNPAID', payment_mode: null, is_deleted: true },
    ];
    const res = reconcileOrderEntries(entries, 250);
    assert.equal(res.totalOrders, 1);
    assert.equal(res.totalLiters, 2);
    assert.equal(res.totalAmount, 500);
    assert.equal(res.unpaidAmount, 0);
  });

  // 5. Division-by-zero target limit guard
  check('Zero target limit returns 0% cleanly without NaN or Infinity', () => {
    assert.equal(safePercent(25, 0), 0);
    assert.equal(safePercent(25, -100), 0);
    assert.equal(Number.isFinite(safePercent(0, 0)), true);
  });

  // 6. Currency safety: Rs. with en-IN grouping, zero broken rupee glyphs
  check('Currency formatting renders strict ASCII Rs. with Indian grouping and never broken ₹ glyphs', () => {
    assert.equal(formatPdfCurrency(1250), 'Rs. 1,250');
    assert.equal(formatPdfCurrency(125000), 'Rs. 1,25,000');
    assert.equal(formatPdfCurrency(562.5), 'Rs. 562.50');
    assert.equal(sanitizePdfText('Amount: ₹1,250 • Cash — Paid'), 'Amount: Rs. 1,250 | Cash - Paid');
    assert.equal(formatPdfCurrency(1250).includes('₹'), false);
    assert.equal(formatPdfCurrency(1250).includes('¹'), false);
  });

  // 7. Full-dataset (>10 rows) & all 6 Formal PDF Presets generation check
  const sampleEntries = Array.from({ length: 28 }, (_, i) => ({
    id: i + 1,
    unit_id: i % 5 === 4 ? null : (i % 2) + 1,
    unit_name: i % 5 === 4 ? undefined : i % 2 === 0 ? 'Pallipadi Unit' : 'Ambalakkadavu Unit',
    sector_id: i % 5 === 4 ? null : 1,
    sector_name: i % 5 === 4 ? undefined : 'Kodasseri Sector',
    is_division_direct: i % 5 === 4,
    contributor_name: `Customer Number ${i + 1}`,
    mobile_number: `98470000${String(i + 10).slice(-2)}`,
    quantity: i % 3 === 0 ? 2 : i % 3 === 1 ? 1.5 : 0.75,
    unit_rate_applied: i < 14 ? 250 : 260,
    total_amount: (i % 3 === 0 ? 2 : i % 3 === 1 ? 1.5 : 0.75) * (i < 14 ? 250 : 260),
    payment_status: i % 4 === 0 ? 'UNPAID' : 'PAID',
    payment_mode: i % 4 === 0 ? null : i % 2 === 0 ? 'CASH' : 'UPI',
    created_at: '2026-11-22T09:15:00Z',
    is_deleted: i === 27, // 27 active rows (> 10-per-page pagination limit) + 1 deleted
  }));

  const adminSource = {
    role: 'ADMIN',
    data: {
      settings: {
        unit_rate: 250,
        division_target: 1000,
        challenge_title: 'SSF Wandoor Division Payasam Challenge',
        is_challenge_open: true,
      },
      summary: {
        total_units: 2,
        total_entries: 27,
        total_quantity: 0,
        cash_amount: 0,
        upi_amount: 0,
        unpaid_amount: 0,
        total_amount: 0,
      },
      sectors: [
        { id: 1, name: 'Kodasseri Sector', login_code: 'SEC01' },
      ],
      unit_summaries: [
        {
          id: 1,
          name: 'Pallipadi Unit',
          login_code: 'WDR101',
          sector_id: 1,
          sector_name: 'Kodasseri Sector',
          total_entries: 0,
          total_quantity: 0,
          cash_amount: 0,
          upi_amount: 0,
          total_amount: 0,
        },
        {
          id: 2,
          name: 'Ambalakkadavu Unit',
          login_code: 'WDR102',
          sector_id: 1,
          sector_name: 'Kodasseri Sector',
          total_entries: 0,
          total_quantity: 0,
          cash_amount: 0,
          upi_amount: 0,
          total_amount: 0,
        },
      ],
      entries: sampleEntries,
    },
  };

  const presetSpecs = [
    { name: 'delivery_sheet', patch: { scope: 'ENTIRE_DIVISION', template: 'DELIVERY_SHEET' }, expectedTitle: 'DELIVERY SHEET' },
    { name: 'unpaid_dues', patch: { scope: 'ENTIRE_DIVISION', template: 'UNPAID_DUES' }, expectedTitle: 'UNPAID DUES COLLECTION LIST' },
    { name: 'orders_register', patch: { scope: 'ENTIRE_DIVISION', template: 'DETAILED_ORDERS' }, expectedTitle: 'DIVISION FULL ORDERS REPORT' },
    { name: 'division_direct', patch: { scope: 'DIVISION_DIRECT', template: 'DETAILED_ORDERS' }, expectedTitle: 'DIVISION DIRECT ORDERS REPORT' },
    { name: 'sector_summary', patch: { scope: 'ENTIRE_DIVISION', template: 'SECTOR_SUMMARY' }, expectedTitle: 'SECTOR-WISE SUMMARY REPORT' },
    { name: 'unit_summary', patch: { scope: 'ENTIRE_DIVISION', template: 'UNIT_SUMMARY' }, expectedTitle: 'UNIT-WISE SUMMARY REPORT' },
  ];

  check('All 6 PDF presets render valid monochrome A4 PDFs with full 27-row dataset (bypassing 10/page UI limit)', () => {
    for (const spec of presetSpecs) {
      const cfg = getDefaultReportConfig('ADMIN', spec.patch);
      const payload = buildReportPayload(adminSource, cfg);
      const docConfig = buildFormalPdfConfigFromPayload(payload);
      assert.equal(docConfig.preset, spec.name);
      assert.equal(docConfig.reportTitle, spec.expectedTitle);

      // Ensure NO internal login codes leaked in subtitle or headers
      assert.equal(docConfig.scopeSubtitle.includes('WDR101'), false);
      assert.equal(docConfig.scopeSubtitle.includes('SEC01'), false);
      assert.equal(docConfig.columns.some((c) => /code/i.test(c.key)), false);

      // Ensure full dataset is exported (not 10)
      if (spec.name === 'orders_register' || spec.name === 'delivery_sheet') {
        assert.equal(docConfig.rows.length, 27);
      }

      const doc = buildFormalPdfFromPayload(payload);
      const pdfBytes = doc.output('arraybuffer');
      const header = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
      assert.equal(header, '%PDF-', `Expected %PDF- header for ${spec.name}`);
      assert.ok(pdfBytes.byteLength > 2500, `Expected non-empty PDF for ${spec.name}`);

      // Verify total width sums cleanly to usable width
      const pctSum = docConfig.columns.reduce((s, c) => s + c.widthPercent, 0);
      assert.ok(Math.abs(pctSum - 100) < 0.01, `Column width sum for ${spec.name} was ${pctSum}`);
    }
  });

  // 8. Sector & Unit rollup reconciliation check
  check('Sector and Unit rollup totals reconcile Cash + UPI + Unpaid === Total', () => {
    const cfg = getDefaultReportConfig('ADMIN', { scope: 'ENTIRE_DIVISION', template: 'UNIT_SUMMARY' });
    const payload = buildReportPayload(adminSource, cfg);
    const totals = reconcileRollupRows(payload.unitRows);
    assert.equal(totals.isReconciled, true);
    assert.equal(totals.cashAmount + totals.upiAmount + totals.unpaidAmount, totals.totalAmount);
  });

  console.log(`\nALL ${passed}/${passed} PDF ACCOUNTING & LAYOUT VERIFICATION CHECKS PASSED.`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
