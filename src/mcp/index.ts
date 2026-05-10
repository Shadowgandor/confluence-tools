#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConfluenceClient, loadConfigFromEnv, ConfluenceApiError } from "../core/index.js";
import { resolveBody } from "../core/markdown.js";

// ── Client singleton ───────────────────────────────────────────────

let _client: ConfluenceClient | null = null;

function getClient(): ConfluenceClient {
  if (!_client) {
    const config = loadConfigFromEnv();
    _client = new ConfluenceClient(config);
  }
  return _client;
}

function formatError(err: unknown): string {
  if (err instanceof ConfluenceApiError) {
    return `Confluence API error ${err.statusCode}: ${err.message}${err.data ? "\n" + JSON.stringify(err.data, null, 2) : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Server setup ───────────────────────────────────────────────────

const server = new McpServer({
  name: "confluence",
  version: "0.1.0",
});

// ── Tools ──────────────────────────────────────────────────────────

server.tool(
  "confluence_auth",
  "Verify the Confluence connection and list accessible spaces",
  {},
  async () => {
    try {
      const spaces = await getClient().verifyConnection();
      const text = [
        "Connected successfully.",
        `Found ${spaces.length} space(s):`,
        ...spaces.map((s) => `• ${s.name} [${s.key}] (id: ${s.id})`),
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_list_spaces",
  "List available Confluence spaces",
  { limit: z.number().optional().describe("Max number of spaces to return (default 25)") },
  async ({ limit }) => {
    try {
      const spaces = await getClient().listSpaces(limit ?? 25);
      const text = spaces
        .map((s) => `${s.name} [${s.key}] (id: ${s.id}, ${s.status})`)
        .join("\n");
      return { content: [{ type: "text", text: text || "No spaces found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_read_page",
  "Read a Confluence page by its ID, returning title, metadata, and body content",
  { pageId: z.string().describe("The Confluence page ID") },
  async ({ pageId }) => {
    try {
      const page = await getClient().getPage(pageId);
      const text = [
        `Title: ${page.title}`,
        `ID: ${page.id}`,
        `Status: ${page.status}`,
        `Version: ${page.version.number}`,
        `Space ID: ${page.spaceId}`,
        "",
        "--- Body (storage format) ---",
        page.body?.storage?.value ?? "(empty)",
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_search_pages",
  "Search for pages in a Confluence space by title",
  {
    spaceKey: z.string().describe("The space key (e.g. 'DEV', 'HR')"),
    title: z.string().optional().describe("Filter by page title (partial match)"),
    limit: z.number().optional().describe("Max results (default 25)"),
  },
  async ({ spaceKey, title, limit }) => {
    try {
      const pages = await getClient().searchPages({ spaceKey, title, limit });
      if (pages.length === 0) {
        return { content: [{ type: "text", text: "No pages found." }] };
      }
      const text = pages
        .map((p) => `${p.title} (id: ${p.id}, v${p.version?.number ?? "?"})`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_create_page",
  "Create a new Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    spaceKey: z.string().describe("The space key to create the page in"),
    title: z.string().describe("Page title"),
    body: z.string().describe("Page content in Markdown or Confluence storage format (XHTML)"),
    parentId: z.string().optional().describe("Parent page ID (omit for top-level)"),
    draft: z.boolean().optional().describe("Create as draft instead of published"),
  },
  async ({ spaceKey, title, body, parentId, draft }) => {
    try {
      const client = getClient();
      const space = await client.getSpaceByKey(spaceKey);
      const resolvedBody = await resolveBody(body);

      const page = await client.createPage({
        spaceId: space.id,
        title,
        body: resolvedBody,
        parentId,
        status: draft ? "draft" : "current",
      });

      const text = [
        `✓ Page created successfully.`,
        `  Title:  ${page.title}`,
        `  ID:     ${page.id}`,
        `  Space:  ${space.name} [${space.key}]`,
        `  Status: ${page.status}`,
        `  URL:    ${process.env.CONFLUENCE_URL}/pages/${page.id}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_update_page",
  "Update an existing Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    pageId: z.string().describe("The page ID to update"),
    title: z.string().optional().describe("New title (omit to keep current)"),
    body: z.string().optional().describe("New content in Markdown or Confluence storage format"),
    versionMessage: z.string().optional().describe("Version change message"),
  },
  async ({ pageId, title, body, versionMessage }) => {
    try {
      const resolvedBody = body ? await resolveBody(body) : undefined;
      const page = await getClient().updatePage({
        pageId,
        title,
        body: resolvedBody,
        versionMessage,
      });

      const text = [
        `✓ Page updated successfully.`,
        `  Title:   ${page.title}`,
        `  ID:      ${page.id}`,
        `  Version: ${page.version.number}`,
        `  URL:     ${process.env.CONFLUENCE_URL}/pages/${page.id}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "confluence_delete_page",
  "Delete a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
  { pageId: z.string().describe("The page ID to delete") },
  async ({ pageId }) => {
    try {
      // Fetch page info first so we can report what was deleted
      const page = await getClient().getPage(pageId);
      await getClient().deletePage(pageId);

      return {
        content: [
          { type: "text", text: `✓ Deleted page "${page.title}" (id: ${pageId})` },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

// ── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Confluence MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
