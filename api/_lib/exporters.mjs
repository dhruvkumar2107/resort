/* CSV / XLSX export builders. All cell values are escaped to prevent
   spreadsheet formula injection (=, +, -, @ and control characters). */

import ExcelJS from "exceljs";

const DANGEROUS = /^[=+\-@\t\r]/;
const cleanCell = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // strip any control chars (incl. 0x00) that can smuggle formulas
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (DANGEROUS.test(s)) s = "'" + s;
  return s;
};

export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = cleanCell(c.value ? c.value(row) : row[c.key]);
        return '"' + String(value).replace(/"/g, '""') + '"';
      })
      .join(",")
  );
  // BOM so Excel opens UTF-8 correctly
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

export async function toXlsx(rows, columns) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Akshaya Milan";
  wb.created = new Date();
  const ws = wb.addWorksheet("Report");
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 6) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A3829" } };
  for (const row of rows) {
    ws.addRow(columns.map((c) => cleanCell(c.value ? c.value(row) : row[c.key])));
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function isoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function attachmentName(prefix, ext) {
  return `${prefix}-${isoDate()}.${ext}`;
}

export const CSV_MIME = "text/csv; charset=utf-8";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function sendExport(res, { buffer, mime, filename, auditNote }) {
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(buffer);
}