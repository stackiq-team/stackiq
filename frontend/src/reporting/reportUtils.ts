import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { defaultLanguage, translate, type Language } from "../i18n/translations";

export type PdfTableRow = Array<string | number>;

const pageWidth = 210;
const pageHeight = 297;
const margin = 14;

export function createReport(title: string, subtitle?: string) {
  const doc = new jsPDF();

  doc.setProperties({
    title,
    subject: subtitle ?? title,
    creator: "StackIQ",
  });

  addHeader(doc, title, subtitle);

  return doc;
}

export function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 12);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, margin, 19);
  }

  doc.setTextColor(15, 23, 42);
}

export function addSectionTitle(doc: jsPDF, title: string, y: number) {
  const nextY = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, nextY);
  return nextY + 6;
}

export function addKeyValueGrid(
  doc: jsPDF,
  rows: Array<[string, string | number]>,
  y: number,
  columns = 2
) {
  let cursorY = ensureSpace(doc, y, 12);
  const columnWidth = (pageWidth - margin * 2) / columns;
  const rowHeight = 11;

  rows.forEach(([label, value], index) => {
    const column = index % columns;
    if (index > 0 && column === 0) cursorY += rowHeight;

    if (cursorY > pageHeight - 18) {
      doc.addPage();
      cursorY = margin;
    }

    const x = margin + column * columnWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(label.toUpperCase(), x, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, cursorY + 5, { maxWidth: columnWidth - 6 });
  });

  return cursorY + rowHeight + 3;
}

export function addParagraph(doc: jsPDF, text: string, y: number) {
  const nextY = ensureSpace(doc, y, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
  doc.text(lines, margin, nextY);
  return nextY + lines.length * 5 + 4;
}

export function addTable(
  doc: jsPDF,
  head: string[],
  body: PdfTableRow[],
  y: number,
  options: { fontSize?: number } = {}
) {
  autoTable(doc, {
    startY: ensureSpace(doc, y, 20),
    head: [head],
    body,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: options.fontSize ?? 8,
      cellPadding: 2,
      overflow: "linebreak",
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    : y + 8;
}

export function addFooter(doc: jsPDF, language: Language = defaultLanguage) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(translate(language, "report.generatedBy", { page, pageCount }), margin, pageHeight - 8);
  }
}

export function saveReport(doc: jsPDF, fileName: string, language: Language = defaultLanguage) {
  addFooter(doc, language);
  doc.save(fileName);
}

export function formatValue(value: unknown, language: Language = defaultLanguage) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? translate(language, "common.yes") : translate(language, "common.no");
  return String(value);
}

export function formatDate(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function getNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

export function ensureSpace(doc: jsPDF, y: number, neededHeight: number) {
  if (y + neededHeight <= pageHeight - 14) return y;
  doc.addPage();
  return margin;
}

export function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
