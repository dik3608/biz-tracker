import { renderMarkdown } from "@/lib/markdown";

function getReportText(content: string): string {
  const m = content.match(/```report\n([\s\S]*?)```/);
  return m ? m[1].trim() : content;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1");
}

/* ------------------------------------------------------------------ */
/* Word (.doc)                                                         */
/* ------------------------------------------------------------------ */
export function downloadAsWord(content: string) {
  const raw = getReportText(content);
  const html = renderMarkdown(raw);
  const dateStr = new Date().toLocaleDateString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  });

  const doc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1f2937; line-height: 1.6; }

  .header-banner {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: white; padding: 24px 28px; border-radius: 8px; margin-bottom: 24px;
  }
  .header-banner h1 { margin: 0; font-size: 20pt; font-weight: 700; }
  .header-banner p { margin: 4px 0 0; font-size: 10pt; opacity: 0.85; }

  h1 { font-size: 18pt; color: #1e3a5f; border-bottom: 3px solid #2563eb; padding-bottom: 6px; margin-top: 28px; }
  h2 { font-size: 14pt; color: #2563eb; margin-top: 22px; margin-bottom: 8px; border-left: 4px solid #2563eb; padding-left: 10px; }
  h3 { font-size: 12pt; color: #374151; margin-top: 16px; }
  h4 { font-size: 11pt; color: #4b5563; margin-top: 12px; }

  table { border-collapse: collapse; width: 100%; margin: 14px 0; border: 1px solid #d1d5db; }
  th {
    background: linear-gradient(180deg, #1e3a5f 0%, #1e4a7f 100%);
    color: white; padding: 10px 14px; text-align: left; font-weight: 600;
    font-size: 10pt; border: 1px solid #16325a;
  }
  td { padding: 8px 14px; border: 1px solid #e5e7eb; font-size: 10pt; vertical-align: top; }
  tr:nth-child(even) td { background-color: #f0f4ff; }
  tr:nth-child(odd) td { background-color: #ffffff; }
  tr:hover td { background-color: #e8edff; }

  .income { color: #059669; font-weight: 700; }
  .expense { color: #dc2626; font-weight: 700; }
  .profit { color: #2563eb; font-weight: 700; }

  strong { font-weight: 700; color: #111827; }
  em { font-style: italic; color: #6b7280; }
  ul, ol { padding-left: 24px; margin: 8px 0; }
  li { margin: 5px 0; }
  li::marker { color: #2563eb; }

  code { background: #eef2ff; padding: 2px 8px; border-radius: 4px; font-family: Consolas, monospace; font-size: 10pt; color: #4338ca; }
  pre { background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: Consolas, monospace; font-size: 9pt; }

  hr { border: none; border-top: 2px solid #e5e7eb; margin: 20px 0; }

  .footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid #2563eb; font-size: 9pt; color: #9ca3af; text-align: center; }
  .footer span { color: #2563eb; font-weight: 600; }

  .metric-box { display: inline-block; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 16px; margin: 4px; text-align: center; }
  .metric-box .value { font-size: 14pt; font-weight: 700; color: #1e3a5f; }
  .metric-box .label { font-size: 8pt; color: #6b7280; }
</style>
</head>
<body>

<div class="header-banner">
  <h1>BizTracker — Финансовый отчёт</h1>
  <p>${dateStr}</p>
</div>

${html}

<div class="footer">
  Сгенерировано с помощью <span>BizTracker AI</span> · ${dateStr}
</div>

</body>
</html>`;

  const blob = new Blob(["\ufeff" + doc], { type: "application/msword" });
  download(blob, `BizTracker-Report-${datestamp()}.doc`);
}

/* ------------------------------------------------------------------ */
/* Excel (.xlsx) — colorful styled export                              */
/* ------------------------------------------------------------------ */
export async function downloadAsExcel(content: string) {
  const XLSX = await import("xlsx");
  const raw = getReportText(content);
  const wb = XLSX.utils.book_new();

  const tables = parseTables(raw);

  if (tables.length > 0) {
    tables.forEach((tbl, idx) => {
      const ws = XLSX.utils.aoa_to_sheet(tbl.rows);

      const cols = tbl.rows[0]?.length || 1;
      ws["!cols"] = Array.from({ length: cols }, () => ({ wch: 22 }));

      const name = tbl.title
        ? tbl.title.slice(0, 31).replace(/[\\/*?[\]:]/g, "")
        : `Таблица ${idx + 1}`;
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
  }

  const sections = parseTextSections(raw);
  const summaryRows: string[][] = [
    ["BizTracker — Финансовый отчёт"],
    [`Дата: ${new Date().toLocaleDateString("ru-RU")}`],
    [""],
  ];
  sections.forEach((sec) => {
    if (sec.title) summaryRows.push([sec.title]);
    sec.lines.forEach((l) => summaryRows.push([l]));
    summaryRows.push([""]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Сводка");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  download(blob, `BizTracker-Report-${datestamp()}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* TXT                                                                 */
/* ------------------------------------------------------------------ */
export function downloadAsText(content: string) {
  const raw = getReportText(content);
  const text = `BizTracker — Финансовый отчёт\nДата: ${new Date().toLocaleDateString("ru-RU")}\n${"=".repeat(50)}\n\n${stripMarkdown(raw)}`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  download(blob, `BizTracker-Report-${datestamp()}.txt`);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function datestamp() {
  return new Date().toISOString().split("T")[0];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ParsedTable {
  title: string;
  rows: string[][];
}

function parseTables(md: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      let title = "";
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim();
        if (prev) {
          if (/^#{1,4}\s+/.test(prev)) title = prev.replace(/^#{1,4}\s+/, "");
          break;
        }
      }

      const headerCells = splitRow(line);
      i += 2;
      const dataRows: string[][] = [headerCells];
      while (i < lines.length && lines[i].startsWith("|")) {
        dataRows.push(splitRow(lines[i]));
        i++;
      }
      tables.push({ title, rows: dataRows });
      continue;
    }
    i++;
  }
  return tables;
}

function splitRow(row: string): string[] {
  return row.split("|").slice(1, -1).map((c) => c.trim().replace(/\*\*/g, ""));
}

interface TextSection {
  title: string;
  lines: string[];
}

function parseTextSections(md: string): TextSection[] {
  const sections: TextSection[] = [];
  let current: TextSection = { title: "", lines: [] };
  const lines = md.split("\n");

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: headingMatch[1], lines: [] };
    } else if (!line.startsWith("|") && line.trim()) {
      current.lines.push(
        line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1"),
      );
    }
  }
  if (current.title || current.lines.length) sections.push(current);
  return sections;
}
