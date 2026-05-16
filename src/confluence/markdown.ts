/**
 * Lightweight Markdown → Confluence storage format converter.
 *
 * Handles the most common patterns. For full fidelity, consider
 * adding a proper parser (e.g. marked/remark) later.
 */
export function markdownToStorage(md: string): string {
  let html = md;

  // Code blocks (fenced) — must come before inline processing
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      const langAttr = lang
        ? `<ac:parameter ac:name="language">${lang}</ac:parameter>`
        : "";
      return (
        `<ac:structured-macro ac:name="code">` +
        `${langAttr}<ac:plain-text-body><![CDATA[${code.trimEnd()}]]></ac:plain-text-body>` +
        `</ac:structured-macro>`
      );
    },
  );

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Unordered list items (simple, non-nested)
  html = html.replace(
    /^(?:- |\* )(.+)$/gm,
    "<li>$1</li>",
  );
  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /(<li>.*<\/li>\n?)+/g,
    (match) => `<ul>\n${match}</ul>\n`,
  );

  // Paragraphs: wrap remaining plain lines
  const lines = html.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("</ul") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<ac:") ||
      trimmed.startsWith("</ac:") ||
      trimmed.startsWith("<p>") ||
      trimmed.startsWith("<table")
    ) {
      result.push(line);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }

  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Read content from a file path or treat as inline content.
 * If the string ends in .md, read the file and convert.
 * If it ends in .html or .xml, read the file as-is (assume storage format).
 * Otherwise treat it as inline markdown and convert.
 */
export async function resolveBody(input: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");

  if (input.endsWith(".md")) {
    const content = await readFile(input, "utf-8");
    return markdownToStorage(content);
  }

  if (input.endsWith(".html") || input.endsWith(".xml")) {
    return readFile(input, "utf-8");
  }

  // Inline content — if it looks like HTML, pass through; otherwise convert
  if (input.trimStart().startsWith("<")) {
    return input;
  }
  return markdownToStorage(input);
}
