/**
 * Мини-рендерер Markdown для ответов ассистента (выводится через
 * dangerouslySetInnerHTML). Безопасность: ВЕСЬ входной текст полностью
 * экранируется (&, <, >, ", ') ДО применения markdown-правил, поэтому
 * HTML из ответа модели никогда не попадает в DOM как разметка.
 *
 * CSS-классы сохранены: md-table, md-code, md-inline-code,
 * report-block (data-report) — стили в globals.css.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseRow(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

// Сентинел для плейсхолдеров кода: NUL не встречается в тексте ответов
const S = "\u0000";
const PLACEHOLDER_RE = new RegExp(`${S}(\\d+)${S}`, "g");
const P_WRAP_RE = new RegExp(`<p>\\s*(${S}\\d+${S})\\s*</p>`, "g");

export function renderMarkdown(md: string): string {
  // 1. Полное экранирование ДО любых правил (и удаление случайных NUL)
  let html = escapeHtml(md.replace(/\u0000/g, ""));

  // 2. Кодовые блоки и inline-код прячем в плейсхолдеры, чтобы их содержимое
  //    не трогали остальные правила (жирный, списки, параграфы)
  const stash: string[] = [];
  const put = (rendered: string): string => {
    stash.push(rendered);
    return `${S}${stash.length - 1}${S}`;
  };

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang: string, code: string) => {
    if (lang === "report") {
      return put(`<div class="report-block" data-report>${code.trim()}</div>`);
    }
    return put(`<pre class="md-code"><code>${code.trim()}</code></pre>`);
  });

  html = html.replace(/`([^`\n]+)`/g, (_, code: string) =>
    put(`<code class="md-inline-code">${code}</code>`),
  );

  // 3. Таблицы
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_, header: string, _sep: string, body: string) => {
      const ths = parseRow(header);
      const rows = body
        .trim()
        .split("\n")
        .map((r) => parseRow(r));
      let t = '\n<table class="md-table"><thead><tr>';
      ths.forEach((h) => (t += `<th>${h}</th>`));
      t += "</tr></thead><tbody>";
      rows.forEach((cols) => {
        t += "<tr>";
        cols.forEach((c) => (t += `<td>${c}</td>`));
        t += "</tr>";
      });
      t += "</tbody></table>";
      return t;
    },
  );

  // 4. Заголовки
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // 5. Жирный и курсив
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 6. Списки: маркерные → <ul>, нумерованные → <ol>
  html = html.replace(/^[*-] (.+)$/gm, "<uli>$1</uli>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");
  html = html.replace(/(?:<uli>.*?<\/uli>\n?)+/g, (m) => {
    const items = m.replace(/<(\/?)uli>/g, "<$1li>").replace(/\n/g, "");
    return `<ul>${items}</ul>\n`;
  });
  html = html.replace(/(?:<oli>.*?<\/oli>\n?)+/g, (m) => {
    const items = m.replace(/<(\/?)oli>/g, "<$1li>").replace(/\n/g, "");
    return `<ol>${items}</ol>\n`;
  });

  // 7. Параграфы
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<(h[1-4]|table|ul|ol|pre|div)/g, "<$1");
  html = html.replace(/<\/(h[1-4]|table|ul|ol|pre|div)>\s*<\/p>/g, "</$1>");
  // Плейсхолдер кодового блока, оказавшийся один в параграфе, — не параграф
  html = html.replace(P_WRAP_RE, "$1");
  html = html.replace(/<p>\s*<\/p>/g, "");

  // 8. Переводы строк
  html = html.replace(/\n/g, "<br>");

  // 9. Возвращаем спрятанные блоки
  html = html.replace(PLACEHOLDER_RE, (_, i: string) => stash[Number(i)] ?? "");

  return html;
}
