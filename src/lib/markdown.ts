export function renderMarkdown(md: string): string {
  let html = md;

  // Code blocks (```report ... ``` handled separately by caller)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    if (lang === "report") {
      return `<div class="report-block" data-report>${escapeHtml(code.trim())}</div>`;
    }
    return `<pre class="md-code"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Tables
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_, header, _sep, body) => {
      const ths = parseRow(header);
      const rows = body
        .trim()
        .split("\n")
        .map((r: string) => parseRow(r));
      let t = '<table class="md-table"><thead><tr>';
      ths.forEach((h: string) => (t += `<th>${h.trim()}</th>`));
      t += "</tr></thead><tbody>";
      rows.forEach((cols: string[]) => {
        t += "<tr>";
        cols.forEach((c: string) => (t += `<td>${c.trim()}</td>`));
        t += "</tr>";
      });
      t += "</tbody></table>";
      return t;
    },
  );

  // Headers
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^[*-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  // Ordered lists
  html = html.replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>");

  // Paragraphs
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<(h[1-4]|table|ul|ol|pre|div)/g, "<$1");
  html = html.replace(/<\/(h[1-4]|table|ul|ol|pre|div)>\s*<\/p>/g, "</$1>");
  html = html.replace(/<p>\s*<\/p>/g, "");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

function parseRow(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
