import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfigFromEnv } from "../core/index.js";
import { ConfluenceClient } from "../confluence/client.js";
import { resolveBody } from "../confluence/markdown.js";
import { formatError, baseUrl } from "./helpers.js";

let _client: ConfluenceClient | null = null;

function getClient(): ConfluenceClient {
  if (!_client) _client = new ConfluenceClient(loadConfigFromEnv());
  return _client;
}

export function registerConfluenceTools(server: McpServer): void {
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
    "confluence_search_cql",
    "Search Confluence content using CQL (Confluence Query Language) — more powerful than confluence_search_pages, supports full-text search across all spaces, filtering by label, date, type, etc.",
    {
      cql: z.string().describe("CQL query, e.g. 'type=page AND text ~ \"kubernetes\"' or 'type=page AND label = \"approved\" AND space.key = \"DEV\"'"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ cql, limit }) => {
      try {
        const results = await getClient().searchCQL(cql, limit ?? 25);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No results found." }] };
        }
        const base = baseUrl();
        const text = results.map((r) => {
          const space = r.space ? ` [${r.space.key}]` : "";
          const ver = r.version ? ` v${r.version.number}` : "";
          const url = r._links?.webui ? `\n  ${base}/wiki${r._links.webui}` : "";
          return `${r.title}${space}${ver} (id: ${r.id}, ${r.type})${url}`;
        }).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_list_templates",
    "List available Confluence page templates. Omit spaceKey to list global templates; provide it to include space-specific templates.",
    {
      spaceKey: z.string().optional().describe("Space key to list templates for (omit for global templates)"),
    },
    async ({ spaceKey }) => {
      try {
        const templates = await getClient().listTemplates(spaceKey);
        if (templates.length === 0) {
          return { content: [{ type: "text", text: "No templates found." }] };
        }
        const text = templates.map((t) => {
          const desc = t.description ? ` — ${t.description}` : "";
          return `${t.name}${desc}`;
        }).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_list_child_pages",
    "List child pages of a Confluence page",
    {
      pageId: z.string().describe("The parent page ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ pageId, limit }) => {
      try {
        const pages = await getClient().listChildPages(pageId, limit ?? 25);
        if (pages.length === 0) {
          return { content: [{ type: "text", text: "No child pages found." }] };
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
      body: z.string().optional().describe("Page content in Markdown or Confluence storage format (XHTML) — omit when using templateName"),
      templateName: z.string().optional().describe("Name of a template to use as the page body (use confluence_list_templates to see options)"),
      parentId: z.string().optional().describe("Parent page ID (omit for top-level)"),
      draft: z.boolean().optional().describe("Create as draft instead of published"),
    },
    async ({ spaceKey, title, body, templateName, parentId, draft }) => {
      try {
        const client = getClient();
        const space = await client.getSpaceByKey(spaceKey);

        let resolvedBody: string;
        if (templateName) {
          const templates = await client.listTemplates(spaceKey);
          const tpl = templates.find((t) => t.name.toLowerCase() === templateName.toLowerCase());
          if (!tpl) {
            const names = templates.map((t) => t.name).join(", ");
            return {
              content: [{ type: "text", text: `Template "${templateName}" not found. Available: ${names || "none"}` }],
              isError: true,
            };
          }
          resolvedBody = tpl.body?.storage?.value ?? "";
        } else if (body) {
          resolvedBody = await resolveBody(body);
        } else {
          return {
            content: [{ type: "text", text: "Provide either body content or a templateName." }],
            isError: true,
          };
        }

        const page = await client.createPage({
          spaceId: space.id,
          title,
          body: resolvedBody,
          parentId,
          status: draft ? "draft" : "current",
        });

        const base = baseUrl();
        const text = [
          `✓ Page created successfully.`,
          `  Title:  ${page.title}`,
          `  ID:     ${page.id}`,
          `  Space:  ${space.name} [${space.key}]`,
          `  Status: ${page.status}`,
          `  URL:    ${base}/wiki/pages/${page.id}`,
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
        const page = await getClient().updatePage({ pageId, title, body: resolvedBody, versionMessage });

        const base = baseUrl();
        const text = [
          `✓ Page updated successfully.`,
          `  Title:   ${page.title}`,
          `  ID:      ${page.id}`,
          `  Version: ${page.version.number}`,
          `  URL:     ${base}/wiki/pages/${page.id}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_copy_page",
    "Copy a Confluence page to a new location with a new title. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      pageId: z.string().describe("The page ID to copy"),
      title: z.string().describe("Title for the new copy"),
      destinationPageId: z.string().describe("Parent page ID where the copy will be placed"),
      copyAttachments: z.boolean().optional().describe("Also copy attachments (default false)"),
      copyLabels: z.boolean().optional().describe("Also copy labels (default false)"),
    },
    async ({ pageId, title, destinationPageId, copyAttachments, copyLabels }) => {
      try {
        const page = await getClient().copyPage({ pageId, title, destinationPageId, copyAttachments, copyLabels });
        const base = baseUrl();
        const text = [
          `✓ Page copied successfully.`,
          `  Title: ${page.title}`,
          `  ID:    ${page.id}`,
          `  URL:   ${base}/wiki/pages/${page.id}`,
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
        const client = getClient();
        const page = await client.getPage(pageId);
        await client.deletePage(pageId);
        return { content: [{ type: "text", text: `✓ Deleted page "${page.title}" (id: ${pageId})` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_list_comments",
    "List comments on a Confluence page",
    {
      pageId: z.string().describe("The Confluence page ID"),
      limit: z.number().optional().describe("Max results (default 25)"),
    },
    async ({ pageId, limit }) => {
      try {
        const comments = await getClient().listComments(pageId, limit ?? 25);
        if (comments.length === 0) {
          return { content: [{ type: "text", text: "No comments." }] };
        }
        const text = comments.map((c) => {
          const author = c.history?.createdBy?.displayName ?? "Unknown";
          const date = c.history?.createdDate ? new Date(c.history.createdDate).toLocaleDateString() : "";
          const body = c.body?.storage?.value ?? "";
          return `[${author}${date ? ` · ${date}` : ""}]\n${body}`;
        }).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_add_comment",
    "Add a comment to a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      pageId: z.string().describe("The Confluence page ID"),
      text: z.string().describe("Comment text (plain text or Confluence storage format XHTML)"),
    },
    async ({ pageId, text }) => {
      try {
        const body = text.trimStart().startsWith("<") ? text : `<p>${text}</p>`;
        await getClient().addComment(pageId, body);
        return { content: [{ type: "text", text: "✓ Comment added." }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_list_labels",
    "List labels on a Confluence page",
    { pageId: z.string().describe("The Confluence page ID") },
    async ({ pageId }) => {
      try {
        const labels = await getClient().listLabels(pageId);
        if (labels.length === 0) {
          return { content: [{ type: "text", text: "No labels." }] };
        }
        return { content: [{ type: "text", text: labels.map((l) => l.name).join(", ") }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_add_labels",
    "Add labels to a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      pageId: z.string().describe("The Confluence page ID"),
      labels: z.array(z.string()).describe("Label names to add"),
    },
    async ({ pageId, labels }) => {
      try {
        const result = await getClient().addLabels(pageId, labels);
        const text = `✓ Added labels: ${result.map((l) => l.name).join(", ")}`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_remove_label",
    "Remove a label from a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      pageId: z.string().describe("The Confluence page ID"),
      label: z.string().describe("Label name to remove"),
    },
    async ({ pageId, label }) => {
      try {
        await getClient().removeLabel(pageId, label);
        return { content: [{ type: "text", text: `✓ Removed label "${label}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_list_attachments",
    "List all attachments on a Confluence page",
    { pageId: z.string().describe("The Confluence page ID") },
    async ({ pageId }) => {
      try {
        const attachments = await getClient().listAttachments(pageId);
        if (attachments.length === 0) {
          return { content: [{ type: "text", text: "No attachments found." }] };
        }
        const base = baseUrl();
        const text = attachments
          .map((a) => {
            const downloadUrl = a._links?.download ? `${base}/wiki${a._links.download}` : "";
            return [
              `${a.title} (id: ${a.id}, ${a.mediaType}${a.fileSize ? `, ${a.fileSize} bytes` : ""})`,
              ...(downloadUrl ? [`  ${downloadUrl}`] : []),
            ].join("\n");
          })
          .join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "confluence_upload_attachment",
    "Upload a file as an attachment to a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      pageId: z.string().describe("The page ID to attach the file to"),
      filePath: z.string().describe("Absolute path to the file to upload"),
      comment: z.string().optional().describe("Optional comment for the attachment"),
    },
    async ({ pageId, filePath, comment }) => {
      try {
        const att = await getClient().uploadAttachment({ pageId, filePath, comment });
        const base = baseUrl();
        const downloadUrl = att._links?.download ? `${base}/wiki${att._links.download}` : "";
        const text = [
          `✓ Attachment uploaded successfully.`,
          `  File:     ${att.title}`,
          `  ID:       ${att.id}`,
          `  Type:     ${att.mediaType}`,
          ...(downloadUrl ? [`  Download: ${downloadUrl}`] : []),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );
}
