import type { ReportShareMode } from './pdf/pdfAccounting';
import type { ReportPayload } from './reports';

/**
 * Unified formal monochrome PDF export entry point.
 * Dynamically imports the jsPDF / jspdf-autotable layout engine on demand so the
 * initial bundle remains lightweight and code-split cleanly.
 */
export async function exportReportPdf(
  payload: ReportPayload,
  mode?: ReportShareMode
): Promise<string> {
  const { exportFormalReportPdf } = await import('./pdf/pdfPresets');
  return exportFormalReportPdf(payload, mode);
}
