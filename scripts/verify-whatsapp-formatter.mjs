import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const rootDir = process.cwd();
const cacheBase = path.join(rootDir, 'node_modules', '.cache');
fs.mkdirSync(cacheBase, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(cacheBase, 'payasam-wa-verify-'));
const entryPath = path.join(tmpDir, 'verify_entry.ts');
const outPath = path.join(tmpDir, 'verify_bundle.mjs');

fs.writeFileSync(
  entryPath,
  `
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/pdf/whatsappFormatter.ts'))};
export * from ${JSON.stringify(path.join(rootDir, 'src/utils/pdf/whatsappShare.ts'))};
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
    buildWhatsAppReportText,
    deliverWhatsAppReport,
    WHATSAPP_MAX_URI_LENGTH,
    getDefaultReportConfig,
    buildReportPayload,
    buildFormalPdfConfigFromPayload,
    buildFormalPdfFromPayload,
  } = mod;

  let passed = 0;
  const check = async (label, fn) => {
    await fn();
    passed += 1;
    console.log(`PASS [${passed}]: ${label}`);
  };

  // Build full 8-sector / 92-unit dataset (simulating full division data, with WDR12 code & soft-deleted entry)
  const sectors = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: i === 0 ? 'Wandoor Sector' : `Sector ${i + 1}`,
    login_code: `SEC0${i + 1}`,
  }));

  const units = Array.from({ length: 92 }, (_, i) => {
    const sectorId = (i % 8) + 1;
    return {
      id: i + 1,
      name: i === 0 ? 'Kodasseri North' : `Unit ${i + 1}`,
      login_code: i === 11 ? 'WDR12' : `WDR${100 + i}`,
      sector_id: sectorId,
      sector_name: sectors[sectorId - 1].name,
      total_entries: 1,
      total_quantity: 1,
      cash_amount: 0,
      upi_amount: 0,
      total_amount: 0,
    };
  });

  const entries = [
    // Unit 1 (Wandoor Sector): fractional quantities 0.5, 1.5, 2.25
    {
      id: 1,
      unit_id: 1,
      unit_name: 'Kodasseri North',
      sector_id: 1,
      sector_name: 'Wandoor Sector',
      is_division_direct: false,
      contributor_name: 'Ameen',
      mobile_number: '9847000001',
      quantity: 0.5,
      unit_rate_applied: 250,
      total_amount: 125,
      payment_status: 'PAID',
      payment_mode: 'CASH',
      created_at: '2026-11-22T09:00:00Z',
    },
    {
      id: 2,
      unit_id: 1,
      unit_name: 'Kodasseri North',
      sector_id: 1,
      sector_name: 'Wandoor Sector',
      is_division_direct: false,
      contributor_name: 'Babu',
      mobile_number: '9847000002',
      quantity: 1.5,
      unit_rate_applied: 250,
      total_amount: 375,
      payment_status: 'PAID',
      payment_mode: 'UPI',
      created_at: '2026-11-22T09:10:00Z',
    },
    {
      id: 3,
      unit_id: 1,
      unit_name: 'Kodasseri North',
      sector_id: 1,
      sector_name: 'Wandoor Sector',
      is_division_direct: false,
      contributor_name: 'Rashid',
      mobile_number: '9847000003',
      quantity: 2.25,
      unit_rate_applied: 250,
      total_amount: 562.5,
      payment_status: 'UNPAID',
      payment_mode: null,
      created_at: '2026-11-22T09:20:00Z',
    },
    // Soft-deleted entry on Unit 12 (WDR12) - MUST be excluded!
    {
      id: 999,
      unit_id: 12,
      unit_name: 'Unit 12',
      sector_id: 4,
      sector_name: 'Sector 4',
      is_division_direct: false,
      contributor_name: 'Deleted Buyer',
      mobile_number: '9847099999',
      quantity: 99,
      unit_rate_applied: 250,
      total_amount: 24750,
      payment_status: 'UNPAID',
      payment_mode: null,
      created_at: '2026-11-22T09:25:00Z',
      is_deleted: true,
    },
    // Extra entry across other units so most units have active orders
    ...units.slice(1, 92).map((u, idx) => ({
      id: 100 + idx,
      unit_id: u.id,
      unit_name: u.name,
      sector_id: u.sector_id,
      sector_name: u.sector_name,
      is_division_direct: false,
      contributor_name: `Customer ${idx + 1}`,
      mobile_number: `98471000${String(idx + 10).slice(-2)}`,
      quantity: 2,
      unit_rate_applied: 250,
      total_amount: 500,
      payment_status: idx % 3 === 0 ? 'UNPAID' : 'PAID',
      payment_mode: idx % 3 === 0 ? null : idx % 2 === 0 ? 'CASH' : 'UPI',
      created_at: '2026-11-22T10:00:00Z',
    })),
  ];

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
        total_units: 92,
        total_entries: entries.length - 1,
        total_quantity: 186.25,
        cash_amount: 0,
        upi_amount: 0,
        unpaid_amount: 0,
        total_amount: 0,
      },
      sectors,
      unit_summaries: units,
      entries,
    },
  };

  const sectorSource = {
    role: 'SECTOR',
    data: {
      sector: { id: 1, name: 'Wandoor Sector', login_code: 'SEC01' },
      settings: adminSource.data.settings,
      summary: adminSource.data.summary,
      units: units.filter((u) => u.sector_id === 1),
      entries: entries.filter((e) => e.sector_id === 1),
    },
  };

  const unitSource = {
    role: 'UNIT',
    data: {
      unit: {
        id: 1,
        name: 'Kodasseri North',
        username: 'kodasseri',
        login_code: 'WDR100',
        contact_phone: '9847000001',
        sector_id: 1,
        sector_name: 'Wandoor Sector',
      },
      settings: adminSource.data.settings,
      summary: {
        total_entries: 3,
        total_quantity: 4.25,
        cash_amount: 125,
        upi_amount: 375,
        unpaid_amount: 562.5,
        total_amount: 1062.5,
      },
      entries: entries.filter((e) => e.unit_id === 1),
    },
  };

  const forbiddenInStatus = [
    /Rs\./i,
    /₹/,
    /\bCash\b/i,
    /\bUPI\b/i,
    /\bUnpaid\b/i,
    /\bPaid\b/i,
    /\bAmount\b/i,
    /\bRate\b/i,
  ];

  // 1. Default mode = 'status' with STRICT ZERO-MONEY Lock across all 4 scopes
  await check('Default Order Status mode strictly excludes ALL money/payment terms across Admin, Sector & Unit portals', () => {
    const cases = [
      buildWhatsAppReportText({
        source: adminSource,
        config: getDefaultReportConfig('ADMIN', { template: 'SECTOR_SUMMARY' }),
      }),
      buildWhatsAppReportText({
        source: adminSource,
        config: getDefaultReportConfig('ADMIN', { template: 'UNIT_SUMMARY' }),
      }),
      buildWhatsAppReportText({
        source: sectorSource,
        config: getDefaultReportConfig('SECTOR', { template: 'UNIT_SUMMARY' }),
      }),
      buildWhatsAppReportText({
        source: unitSource,
        config: getDefaultReportConfig('UNIT', { template: 'DELIVERY_SHEET' }),
      }),
    ];

    for (const res of cases) {
      assert.equal(res.mode, 'status');
      for (const rx of forbiddenInStatus) {
        assert.equal(rx.test(res.text), false, `Found forbidden money token ${rx} in:\n${res.text}`);
      }
      // Verify WDR12 & SEC01 codes NEVER leak
      assert.equal(res.text.includes('WDR12'), false);
      assert.equal(res.text.includes('WDR100'), false);
      assert.equal(res.text.includes('SEC01'), false);
    }

    // Soft-deleted 99L MUST be excluded -> 3 orders (4.25L) + 91*2L (182L) = 186.25 L, 94 Orders
    assert.ok(cases[0].text.includes('186.25 L (94 Orders)'), `Expected full reconciled total 186.25 L (94 Orders), got:\n${cases[0].text}`);
  });

  // 2. Bold Sector + Normal Unit hierarchy lock
  await check('Division Unit-wise & Sector Unit-wise wrap Sector in *BOLD* and keep Unit lines normal weight', () => {
    const divUnitRes = buildWhatsAppReportText({
      source: adminSource,
      config: getDefaultReportConfig('ADMIN', { template: 'UNIT_SUMMARY' }),
      mode: 'status',
    });

    assert.ok(divUnitRes.text.includes('*WANDOOR SECTOR*'));
    assert.ok(divUnitRes.text.includes('1. Kodasseri North : 4.25 L (3 Orders)'));
    assert.equal(divUnitRes.text.includes('*Kodasseri North*'), false);

    // Ensure ALL 8 sectors & ALL 92 units appear (bypassing 10/page pagination!)
    for (let s = 2; s <= 8; s += 1) {
      assert.ok(divUnitRes.text.includes(`*SECTOR ${s}*`), `Missing bold header *SECTOR ${s}*`);
    }
    assert.ok(divUnitRes.text.includes('Unit 92 : 2 L (1 Order)'), 'Missing 92nd unit — truncation detected!');

    const secUnitRes = buildWhatsAppReportText({
      source: sectorSource,
      config: getDefaultReportConfig('SECTOR', { template: 'UNIT_SUMMARY' }),
      mode: 'status',
    });
    assert.ok(secUnitRes.text.includes('*WANDOOR SECTOR*'));
    assert.ok(secUnitRes.text.includes('*SECTOR TOTAL :'));
    assert.equal(secUnitRes.text.includes('*Kodasseri North*'), false);
  });

  // 3. Detailed Mode Math Reconciliation
  await check('Detailed mode preserves Cash + UPI + Unpaid === Total Amount with zero float drift', () => {
    const unitDetailed = buildWhatsAppReportText({
      source: unitSource,
      config: getDefaultReportConfig('UNIT', { template: 'DELIVERY_SHEET' }),
      mode: 'detailed',
    });
    assert.equal(unitDetailed.mode, 'detailed');
    assert.ok(unitDetailed.text.includes('Total Liters : 4.25 L'));
    assert.ok(unitDetailed.text.includes('Total Orders : 3'));
    assert.ok(unitDetailed.text.includes('Total Amount : Rs. 1,062.50'));
    assert.ok(unitDetailed.text.includes('Paid (Cash)  : Rs. 125'));
    assert.ok(unitDetailed.text.includes('Paid (UPI)   : Rs. 375'));
    assert.ok(unitDetailed.text.includes('Unpaid       : Rs. 562.50'));
    assert.equal(unitDetailed.text.includes('WDR100'), false);
  });

  // 4. Long-Message Safety Fallback (> 3,800 URI-encoded chars for 92-unit Detailed Report)
  await check('Long 92-unit Detailed Report triggers >3800 URI char fallback cleanly', async () => {
    const longDetailed = buildWhatsAppReportText({
      source: adminSource,
      config: getDefaultReportConfig('ADMIN', { template: 'UNIT_SUMMARY' }),
      mode: 'detailed',
    });
    assert.ok(
      longDetailed.encodedLength > WHATSAPP_MAX_URI_LENGTH,
      `Expected encodedLength > ${WHATSAPP_MAX_URI_LENGTH}, got ${longDetailed.encodedLength}`
    );

    // Mock navigator.share and verify web_share path runs cleanly
    const origNav = globalThis.navigator;
    let sharedPayload = null;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        share: async (payload) => {
          sharedPayload = payload;
        },
        clipboard: { writeText: async () => {} },
      },
    });

    const delivery = await deliverWhatsAppReport(longDetailed.text, longDetailed.title);
    assert.equal(delivery.method, 'web_share');
    assert.equal(sharedPayload?.text, longDetailed.text);

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: origNav,
    });
  });

  // 5. Status-Only PDF Mode check on Sector Summary & Unit Summary
  await check('Summary PDF presets in Order Status mode omit all money columns and print valid A4 PDFs', () => {
    const secPayload = buildReportPayload(
      adminSource,
      getDefaultReportConfig('ADMIN', { template: 'SECTOR_SUMMARY' })
    );
    const pdfCfg = buildFormalPdfConfigFromPayload(secPayload, 'status');
    assert.equal(pdfCfg.reportTitle, 'SECTOR-WISE ORDER STATUS');
    assert.equal(pdfCfg.showCashHandoverLine, false);
    assert.equal(
      pdfCfg.columns.some((c) => ['cash', 'upi', 'unpaid', 'total'].includes(c.key)),
      false
    );

    const doc = buildFormalPdfFromPayload(secPayload, 'status');
    const header = Buffer.from(doc.output('arraybuffer').slice(0, 5)).toString('ascii');
    assert.equal(header, '%PDF-');
  });

  console.log(`\nALL ${passed}/${passed} WHATSAPP STRUCTURED SHARE & STATUS-MODE CHECKS PASSED.`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
