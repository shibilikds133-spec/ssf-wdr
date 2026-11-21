import type { CsvImportRow } from '../types';
import { calcLimitSharePercent } from './format';
import type { ReportPayload } from './reports';

const REQUIRED_UNIT_HEADERS = [
  'sector_name',
  'sector_code',
  'unit_name',
  'unit_code',
] as const;

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvBlob(filename: string, csvContent: string): void {
  const withBom = csvContent.startsWith('\uFEFF')
    ? csvContent
    : `\uFEFF${csvContent}`;
  const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  downloadCsvBlob(filename, `\uFEFF${lines.join('\r\n')}`);
}

export function buildReportCsvContent(payload: ReportPayload): string {
  const rowLines = payload.csvRows.map((row) =>
    row.map(escapeCsvCell).join(',')
  );
  const lines: string[] = [
    payload.csvHeaders.map(escapeCsvCell).join(','),
    ...rowLines,
  ];

  const isDivisionSummaryWithDirect =
    payload.role === 'ADMIN' &&
    payload.config.scope === 'ENTIRE_DIVISION' &&
    (payload.config.template === 'SECTOR_SUMMARY' ||
      payload.config.template === 'UNIT_SUMMARY') &&
    payload.divisionDirectBreakdown.totalOrders > 0;

  if (payload.matchedCount > 0) {
    if (isDivisionSummaryWithDirect) {
      const subtotalRow = [...payload.csvTotalRow];
      subtotalRow[1] =
        payload.config.template === 'SECTOR_SUMMARY'
          ? `Subtotal (${payload.sectorRows.length} Sectors)`
          : `Subtotal (${payload.unitRows.length} Units)`;
      lines.push(subtotalRow.map(escapeCsvCell).join(','));

      const direct = payload.divisionDirectBreakdown;
      const directShare =
        payload.divisionLimit > 0
          ? Number(
              calcLimitSharePercent(
                direct.totalLiters,
                payload.divisionLimit
              ).toFixed(1)
            )
          : 0;

      if (payload.config.template === 'SECTOR_SUMMARY') {
        lines.push(
          [
            '',
            'Division Direct (No Sector)',
            'DIRECT',
            '-',
            direct.totalOrders,
            direct.totalLiters,
            directShare,
            direct.cashAmount,
            direct.upiAmount,
            direct.unpaidAmount,
            direct.totalAmount,
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      } else {
        lines.push(
          [
            '',
            'Division Direct (No Unit)',
            'DIRECT',
            ...(payload.showSectorColumn ? ['Division'] : []),
            direct.totalOrders,
            direct.totalLiters,
            directShare,
            direct.cashAmount,
            direct.upiAmount,
            direct.unpaidAmount,
            direct.totalAmount,
          ]
            .map(escapeCsvCell)
            .join(',')
        );
      }

      const grand = payload.summary;
      const grandShare =
        payload.divisionLimit > 0
          ? Number(
              calcLimitSharePercent(
                grand.totalLiters,
                payload.divisionLimit
              ).toFixed(1)
            )
          : 0;
      const grandRow = [...payload.csvTotalRow];
      grandRow[1] = 'Division Grand Total';
      if (payload.config.template === 'SECTOR_SUMMARY') {
        grandRow[4] = grand.totalOrders;
        grandRow[5] = grand.totalLiters;
        grandRow[6] = grandShare;
        grandRow[7] = grand.cashAmount;
        grandRow[8] = grand.upiAmount;
        grandRow[9] = grand.unpaidAmount;
        grandRow[10] = grand.totalAmount;
      } else {
        const offset = payload.showSectorColumn ? 1 : 0;
        grandRow[3 + offset] = grand.totalOrders;
        grandRow[4 + offset] = grand.totalLiters;
        grandRow[5 + offset] = grandShare;
        grandRow[6 + offset] = grand.cashAmount;
        grandRow[7 + offset] = grand.upiAmount;
        grandRow[8 + offset] = grand.unpaidAmount;
        grandRow[9 + offset] = grand.totalAmount;
      }
      lines.push(grandRow.map(escapeCsvCell).join(','));
    } else if (payload.csvTotalRow.length > 0) {
      lines.push(payload.csvTotalRow.map(escapeCsvCell).join(','));
    }
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function exportReportCsv(payload: ReportPayload): void {
  const csvContent = buildReportCsvContent(payload);
  downloadCsvBlob(payload.csvFilename, csvContent);
}

export function downloadSampleUnitsCsv(): void {
  exportToCsv(
    'wandoor_units_template.csv',
    [...REQUIRED_UNIT_HEADERS, 'sector_phone', 'unit_phone'],
    [
      ['Sector 1', 'WDR101', 'Unit 1', 'WDR1', '9876543210', '9876543211'],
      ['Sector 2', 'WDR102', 'Unit 3', 'WDR3', '9876543212', '9876543213'],
    ]
  );
}

function parseCsvLine(line: string): string[] | null {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (inQuotes) {
    return null;
  }

  cells.push(current);
  return cells;
}

export function parseUnitsCsv(csvText: string): {
  rows: CsvImportRow[];
  errors: string[];
} {
  const rows: CsvImportRow[] = [];
  const errors: string[] = [];

  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rawLines = cleanText.split(/\r?\n/);

  const nonEmptyLines: { lineNumber: number; text: string }[] = [];
  rawLines.forEach((text, index) => {
    if (text.trim() !== '') {
      nonEmptyLines.push({ lineNumber: index + 1, text });
    }
  });

  if (nonEmptyLines.length === 0) {
    errors.push('CSV file is empty.');
    return { rows, errors };
  }

  const headerLine = nonEmptyLines[0];
  const parsedHeaders = parseCsvLine(headerLine.text);
  if (!parsedHeaders) {
    errors.push(`Line ${headerLine.lineNumber}: Unclosed quote in header row.`);
    return { rows, errors };
  }

  const normalizedHeaders = parsedHeaders.map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_')
  );
  const columnIndex: Record<(typeof REQUIRED_UNIT_HEADERS)[number], number> = {
    sector_name: normalizedHeaders.indexOf('sector_name'),
    sector_code: normalizedHeaders.indexOf('sector_code'),
    unit_name: normalizedHeaders.indexOf('unit_name'),
    unit_code: normalizedHeaders.indexOf('unit_code'),
  };
  const sectorPhoneIdx = normalizedHeaders.indexOf('sector_phone');
  const unitPhoneIdx = normalizedHeaders.indexOf('unit_phone');

  const missingHeaders = REQUIRED_UNIT_HEADERS.filter(
    (col) => columnIndex[col] === -1
  );
  if (missingHeaders.length > 0) {
    errors.push(
      `Line ${headerLine.lineNumber}: Missing required column(s): ${missingHeaders.join(', ')}. Expected: sector_name, sector_code, unit_name, unit_code.`
    );
    return { rows, errors };
  }

  for (let i = 1; i < nonEmptyLines.length; i++) {
    const { lineNumber, text } = nonEmptyLines[i];
    const cells = parseCsvLine(text);

    if (!cells) {
      errors.push(`Line ${lineNumber}: Malformed CSV row (unclosed quote).`);
      continue;
    }

    const sectorName = (cells[columnIndex.sector_name] ?? '').trim();
    const sectorCode = (cells[columnIndex.sector_code] ?? '')
      .trim()
      .toUpperCase();
    const unitName = (cells[columnIndex.unit_name] ?? '').trim();
    const unitCode = (cells[columnIndex.unit_code] ?? '').trim().toUpperCase();
    const sectorPhone =
      sectorPhoneIdx >= 0 ? (cells[sectorPhoneIdx] ?? '').trim() : '';
    const unitPhone =
      unitPhoneIdx >= 0 ? (cells[unitPhoneIdx] ?? '').trim() : '';

    const missingFields: string[] = [];
    if (!sectorName) missingFields.push('sector_name');
    if (!sectorCode) missingFields.push('sector_code');
    if (!unitName) missingFields.push('unit_name');
    if (!unitCode) missingFields.push('unit_code');

    if (missingFields.length > 0) {
      errors.push(
        `Line ${lineNumber}: Missing value for ${missingFields.join(', ')}.`
      );
      continue;
    }

    rows.push({
      sector_name: sectorName,
      sector_code: sectorCode,
      unit_name: unitName,
      unit_code: unitCode,
      ...(sectorPhone ? { sector_phone: sectorPhone } : {}),
      ...(unitPhone ? { unit_phone: unitPhone } : {}),
    });
  }

  return { rows, errors };
}

export function downloadSampleSectorUnitsCsv(): void {
  exportToCsv(
    'sample_sector_units.csv',
    ['Unit Name', 'Unit Code'],
    [
      ['Unit Alpha', 'WDR21'],
      ['Unit Beta', 'WDR22'],
    ]
  );
}

export function parseSectorUnitsCsv(csvText: string): {
  rows: { unit_name: string; unit_code: string }[];
  errors: string[];
} {
  const rows: { unit_name: string; unit_code: string }[] = [];
  const errors: string[] = [];

  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rawLines = cleanText.split(/\r?\n/);

  const nonEmptyLines: { lineNumber: number; text: string }[] = [];
  rawLines.forEach((text, index) => {
    if (text.trim() !== '') {
      nonEmptyLines.push({ lineNumber: index + 1, text });
    }
  });

  if (nonEmptyLines.length === 0) {
    errors.push('CSV file is empty.');
    return { rows, errors };
  }

  const headerLine = nonEmptyLines[0];
  const parsedHeaders = parseCsvLine(headerLine.text);
  if (!parsedHeaders) {
    errors.push(`Line ${headerLine.lineNumber}: Unclosed quote in header row.`);
    return { rows, errors };
  }

  const normalizedHeaders = parsedHeaders.map((h) =>
    h.trim().toLowerCase().replace(/[\s_]+/g, '')
  );

  const nameIdx = normalizedHeaders.findIndex(
    (h) => h === 'unitname' || h === 'name'
  );
  const codeIdx = normalizedHeaders.findIndex(
    (h) => h === 'unitcode' || h === 'code' || h === 'logincode'
  );

  if (nameIdx === -1 || codeIdx === -1) {
    errors.push(
      `Line ${headerLine.lineNumber}: Missing required header column(s). Expected: "Unit Name, Unit Code".`
    );
    return { rows, errors };
  }

  const seenCodes = new Set<string>();

  for (let i = 1; i < nonEmptyLines.length; i++) {
    const { lineNumber, text } = nonEmptyLines[i];
    const cells = parseCsvLine(text);

    if (!cells) {
      errors.push(`Line ${lineNumber}: Malformed CSV row (unclosed quote).`);
      continue;
    }

    const unitName = (cells[nameIdx] ?? '').trim();
    const unitCode = (cells[codeIdx] ?? '').trim().toUpperCase();

    if (!unitName && !unitCode) continue;

    if (!unitName) {
      errors.push(`Line ${lineNumber}: Unit Name is required.`);
      continue;
    }

    if (!unitCode) {
      errors.push(`Line ${lineNumber}: Unit Code is required.`);
      continue;
    }

    if (seenCodes.has(unitCode)) {
      errors.push(
        `Line ${lineNumber}: Duplicate Unit Code "${unitCode}" found in CSV.`
      );
      continue;
    }

    seenCodes.add(unitCode);
    rows.push({
      unit_name: unitName,
      unit_code: unitCode,
    });
  }

  return { rows, errors };
}
