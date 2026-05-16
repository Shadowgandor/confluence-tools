import { describe, it, expect } from "vitest";
import { markdownToStorage, resolveBody } from "./markdown.js";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("markdownToStorage", () => {
  it("converts headings", () => {
    expect(markdownToStorage("# Title")).toBe("<h1>Title</h1>");
    expect(markdownToStorage("## Sub")).toBe("<h2>Sub</h2>");
    expect(markdownToStorage("### H3")).toBe("<h3>H3</h3>");
    expect(markdownToStorage("###### H6")).toBe("<h6>H6</h6>");
  });

  it("does not convert non-heading hash lines", () => {
    const result = markdownToStorage("#nospace");
    expect(result).not.toContain("<h1>");
  });

  it("converts bold", () => {
    expect(markdownToStorage("**bold**")).toBe("<p><strong>bold</strong></p>");
  });

  it("converts italic", () => {
    expect(markdownToStorage("*italic*")).toBe("<p><em>italic</em></p>");
  });

  it("converts bold+italic", () => {
    expect(markdownToStorage("***both***")).toBe(
      "<p><strong><em>both</em></strong></p>",
    );
  });

  it("converts inline code", () => {
    expect(markdownToStorage("`code`")).toBe("<p><code>code</code></p>");
  });

  it("converts links", () => {
    expect(markdownToStorage("[text](https://example.com)")).toBe(
      '<p><a href="https://example.com">text</a></p>',
    );
  });

  it("converts unordered lists", () => {
    const md = "- one\n- two\n- three";
    const result = markdownToStorage(md);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>one</li>");
    expect(result).toContain("<li>two</li>");
    expect(result).toContain("<li>three</li>");
    expect(result).toContain("</ul>");
  });

  it("converts fenced code blocks with language", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const result = markdownToStorage(md);
    expect(result).toContain('<ac:structured-macro ac:name="code">');
    expect(result).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>');
    expect(result).toContain("const x = 1;");
  });

  it("converts fenced code blocks without language", () => {
    const md = "```\nplain code\n```";
    const result = markdownToStorage(md);
    expect(result).toContain('<ac:structured-macro ac:name="code">');
    expect(result).not.toContain("ac:parameter");
    expect(result).toContain("plain code");
  });

  it("wraps plain text in paragraphs", () => {
    expect(markdownToStorage("Hello world")).toBe("<p>Hello world</p>");
  });

  it("handles mixed content", () => {
    const md = "# Title\n\nSome **bold** text.\n\n- item";
    const result = markdownToStorage(md);
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<li>item</li>");
  });

  it("collapses excessive newlines", () => {
    const md = "A\n\n\n\n\nB";
    const result = markdownToStorage(md);
    expect(result).not.toMatch(/\n{3,}/);
  });
});

describe("resolveBody", () => {
  it("passes through HTML content", async () => {
    const result = await resolveBody("<p>Hello</p>");
    expect(result).toBe("<p>Hello</p>");
  });

  it("converts inline markdown", async () => {
    const result = await resolveBody("**bold** text");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("reads and converts .md files", async () => {
    const path = join(tmpdir(), `test-${Date.now()}.md`);
    await writeFile(path, "# Test\n\nHello");
    try {
      const result = await resolveBody(path);
      expect(result).toContain("<h1>Test</h1>");
      expect(result).toContain("<p>Hello</p>");
    } finally {
      await unlink(path);
    }
  });

  it("reads .html files as-is", async () => {
    const path = join(tmpdir(), `test-${Date.now()}.html`);
    await writeFile(path, "<div>Raw HTML</div>");
    try {
      const result = await resolveBody(path);
      expect(result).toBe("<div>Raw HTML</div>");
    } finally {
      await unlink(path);
    }
  });
});
