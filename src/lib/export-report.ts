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
/* Word (.doc) — HTML wrapped in Word-compatible markup                */
/* ------------------------------------------------------------------ */
export function downloadAsWord(content: string) {
  const raw = getReportText(content);
  const html = renderMarkdown(raw);

  const doc = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; padding: 20px; }
  h1 { font-size: 18pt; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 6px; margin-top: 20px; }
  h2 { font-size: 14pt; color: #2563eb; margin-top: 18px; }
  h3 { font-size: 12pt; color: #374151; margin-top: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th { background-color: #1e3a5f; color: white; padding: 8px 12px; text-align: left; font-weight: 600; font-size: 10pt; }
  td { padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 10pt; }
  tr:nth-child(even) td { background-color: #f9fafb; }
  strong { font-weight: 700; }
  em { font-style: italic; color: #6b7280; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 10pt; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: Consolas, monospace; font-size: 9pt; }
</style>
</head>
<body>
${html}
<br><hr>
<p style="font-size:9pt;color:#9ca3af;">BizTracker — Отчёт от ${new Date().toLocaleDateString("ru-RU")}</p>
</body>
</html>`;

  const blob = new Blob(["\ufeff" + doc], {
    type: "application/msword",
  });
  download(blob, `report-${datestamp()}.doc`);
}

/* ------------------------------------------------------------------ */
/* Excel (.xlsx) — tables parsed from markdown + summary sheet         */
/* ------------------------------------------------------------------ */
export async function downloadAsExcel(content: string) {
  const XLSX = await import("xlsx");
  const raw = getReportText(content);
  const wb = XLSX.utils.book_new();

  const tables = parseTables(raw);

  if (tables.length > 0) {
    tables.forEach((tbl, idx) => {
      const ws = XLSX.utils.aoa_to_sheet(tbl.rows);
      const name = tbl.title
        ? tbl.title.slice(0, 31).replace(/[\\/*?[\]:]/g, "")
        : `Таблица ${idx + 1}`;
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
  }

  const textLines = stripMarkdown(raw).split("\n").filter(Boolean);
  const textSheet = XLSX.utils.aoa_to_sheet(
    textLines.map((line) => [line]),
  );
  XLSX.utils.book_append_sheet(wb, textSheet, "Полный отчёт");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  download(blob, `report-${datestamp()}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* TXT (as before)                                                     */
/* ------------------------------------------------------------------ */
export function downloadAsText(content: string) {
  const raw = getReportText(content);
  const text = stripMarkdown(raw);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  download(blob, `report-${datestamp()}.txt`);
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
          if (/^#{1,4}\s+/.test(prev)) {
            title = prev.replace(/^#{1,4}\s+/, "");
          }
          break;
        }
      }

      const headerCells = splitRow(line);
      i += 2; // skip separator

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
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim().replace(/\*\*/g, ""));
}
