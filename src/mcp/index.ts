#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfigFromEnv, AtlassianApiError } from "../core/index.js";
import { resolveBody } from "../confluence/markdown.js";
import { ConfluenceClient } from "../confluence/client.js";
import { JiraClient } from "../jira/client.js";

// ── Client singletons ─────────────────────────────────────────────

let _confluenceClient: ConfluenceClient | null = null;
let _jiraClient: JiraClient | null = null;

function getConfluenceClient(): ConfluenceClient {
  if (!_confluenceClient) {
    _confluenceClient = new ConfluenceClient(loadConfigFromEnv());
  }
  return _confluenceClient;
}

function getJiraClient(): JiraClient {
  if (!_jiraClient) {
    _jiraClient = new JiraClient(loadConfigFromEnv());
  }
  return _jiraClient;
}

function formatError(err: unknown): string {
  if (err instanceof AtlassianApiError) {
    return `Atlassian API error ${err.statusCode}: ${err.message}${err.data ? "\n" + JSON.stringify(err.data, null, 2) : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── Server setup ───────────────────────────────────────────────────

const server = new McpServer({
  name: "atlassian",
  version: "0.2.0",
});

// ── Confluence tools ───────────────────────────────────────────────

server.tool(
  "confluence_auth",
  "Verify the Confluence connection and list accessible spaces",
  {},
  async () => {
    try {
      const spaces = await getConfluenceClient().verifyConnection();
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
      const spaces = await getConfluenceClient().listSpaces(limit ?? 25);
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
      const page = await getConfluenceClient().getPage(pageId);
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
      const pages = await getConfluenceClient().searchPages({ spaceKey, title, limit });
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
    body: z.string().optional().describe("Page content in Markdown or Confluence storage format (XHTML) — omit when using templateName"),
    templateName: z.string().optional().describe("Name of a template to use as the page body (use confluence_list_templates to see options)"),
    parentId: z.string().optional().describe("Parent page ID (omit for top-level)"),
    draft: z.boolean().optional().describe("Create as draft instead of published"),
  },
  async ({ spaceKey, title, body, templateName, parentId, draft }) => {
    try {
      const client = getConfluenceClient();
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

      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Page created successfully.`,
        `  Title:  ${page.title}`,
        `  ID:     ${page.id}`,
        `  Space:  ${space.name} [${space.key}]`,
        `  Status: ${page.status}`,
        `  URL:    ${baseUrl}/wiki/pages/${page.id}`,
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
      const page = await getConfluenceClient().updatePage({
        pageId,
        title,
        body: resolvedBody,
        versionMessage,
      });

      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Page updated successfully.`,
        `  Title:   ${page.title}`,
        `  ID:      ${page.id}`,
        `  Version: ${page.version.number}`,
        `  URL:     ${baseUrl}/wiki/pages/${page.id}`,
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
      const client = getConfluenceClient();
      const page = await client.getPage(pageId);
      await client.deletePage(pageId);

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
      const page = await getConfluenceClient().copyPage({ pageId, title, destinationPageId, copyAttachments, copyLabels });
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Page copied successfully.`,
        `  Title: ${page.title}`,
        `  ID:    ${page.id}`,
        `  URL:   ${baseUrl}/wiki/pages/${page.id}`,
      ].join("\n");
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
      const results = await getConfluenceClient().searchCQL(cql, limit ?? 25);
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No results found." }] };
      }
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = results.map((r) => {
        const space = r.space ? ` [${r.space.key}]` : "";
        const ver = r.version ? ` v${r.version.number}` : "";
        const url = r._links?.webui ? `\n  ${baseUrl}/wiki${r._links.webui}` : "";
        return `${r.title}${space}${ver} (id: ${r.id}, ${r.type})${url}`;
      }).join("\n");
      return { content: [{ type: "text", text }] };
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
      const comments = await getConfluenceClient().listComments(pageId, limit ?? 25);
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
      await getConfluenceClient().addComment(pageId, body);
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
      const labels = await getConfluenceClient().listLabels(pageId);
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
      const result = await getConfluenceClient().addLabels(pageId, labels);
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
      await getConfluenceClient().removeLabel(pageId, label);
      return { content: [{ type: "text", text: `✓ Removed label "${label}"` }] };
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
      const templates = await getConfluenceClient().listTemplates(spaceKey);
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
      const pages = await getConfluenceClient().listChildPages(pageId, limit ?? 25);
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
  "confluence_upload_attachment",
  "Upload a file as an attachment to a Confluence page. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    pageId: z.string().describe("The page ID to attach the file to"),
    filePath: z.string().describe("Absolute path to the file to upload"),
    comment: z.string().optional().describe("Optional comment for the attachment"),
  },
  async ({ pageId, filePath, comment }) => {
    try {
      const att = await getConfluenceClient().uploadAttachment({ pageId, filePath, comment });
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const downloadUrl = att._links?.download ? `${baseUrl}/wiki${att._links.download}` : "";
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

server.tool(
  "confluence_list_attachments",
  "List all attachments on a Confluence page",
  { pageId: z.string().describe("The Confluence page ID") },
  async ({ pageId }) => {
    try {
      const attachments = await getConfluenceClient().listAttachments(pageId);
      if (attachments.length === 0) {
        return { content: [{ type: "text", text: "No attachments found." }] };
      }
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = attachments
        .map((a) => {
          const downloadUrl = a._links?.download ? `${baseUrl}/wiki${a._links.download}` : "";
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

// ── Jira tools ─────────────────────────────────────────────────────

server.tool(
  "jira_auth",
  "Verify the Jira connection and list accessible projects",
  {},
  async () => {
    try {
      const projects = await getJiraClient().verifyConnection();
      const text = [
        "Connected successfully.",
        `Found ${projects.length} project(s):`,
        ...projects.map((p) => `• ${p.name} [${p.key}] (id: ${p.id})`),
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_projects",
  "List available Jira projects",
  { limit: z.number().optional().describe("Max number of projects to return (default 25)") },
  async ({ limit }) => {
    try {
      const projects = await getJiraClient().listProjects(limit ?? 25);
      const text = projects
        .map((p) => `${p.name} [${p.key}] (id: ${p.id})`)
        .join("\n");
      return { content: [{ type: "text", text: text || "No projects found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_get_issue",
  "Get a Jira issue by key, returning summary, status, assignee, and description",
  { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const client = getJiraClient();
      const issue = await client.getIssue(issueKey);
      const desc = client.descriptionToText(issue);
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `Key: ${issue.key}`,
        `Summary: ${issue.fields.summary}`,
        `Type: ${issue.fields.issuetype.name}`,
        `Status: ${issue.fields.status.name}`,
        `Priority: ${issue.fields.priority?.name ?? "—"}`,
        `Assignee: ${issue.fields.assignee?.displayName ?? "Unassigned"}`,
        `Reporter: ${issue.fields.reporter?.displayName ?? "—"}`,
        `Labels: ${issue.fields.labels?.join(", ") || "—"}`,
        `Created: ${issue.fields.created}`,
        `Updated: ${issue.fields.updated}`,
        `URL: ${baseUrl}/browse/${issue.key}`,
        "",
        "--- Description ---",
        desc || "(empty)",
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_search_issues",
  "Search for Jira issues using JQL or filters",
  {
    jql: z.string().optional().describe("Raw JQL query (overrides other filters)"),
    project: z.string().optional().describe("Filter by project key"),
    status: z.string().optional().describe("Filter by status name"),
    assignee: z.string().optional().describe("Filter by assignee name"),
    type: z.string().optional().describe("Filter by issue type (Bug, Task, Story, etc.)"),
    limit: z.number().optional().describe("Max results (default 25)"),
  },
  async ({ jql, project, status, assignee, type, limit }) => {
    try {
      const issues = await getJiraClient().searchIssues({
        jql, project, status, assignee, type, limit,
      });
      if (issues.length === 0) {
        return { content: [{ type: "text", text: "No issues found." }] };
      }
      const text = issues
        .map((i) => `${i.key} — ${i.fields.summary} [${i.fields.status.name}] (${i.fields.issuetype.name}, ${i.fields.assignee?.displayName ?? "Unassigned"})`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_create_issue",
  "Create a new Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    projectKey: z.string().describe("The project key (e.g. 'PROJ')"),
    issueType: z.string().describe("Issue type (Bug, Task, Story, Epic, etc.)"),
    summary: z.string().describe("Issue summary/title"),
    description: z.string().optional().describe("Issue description (plain text)"),
    priority: z.string().optional().describe("Priority (Highest, High, Medium, Low, Lowest)"),
    labels: z.array(z.string()).optional().describe("Labels to apply"),
    parentKey: z.string().optional().describe("Parent issue key for creating a subtask (e.g. 'PROJ-10')"),
  },
  async ({ projectKey, issueType, summary, description, priority, labels, parentKey }) => {
    try {
      const client = getJiraClient();
      const issue = await client.createIssue({
        projectKey, issueType, summary, description, priority, labels, parentKey,
      });

      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Issue created successfully.`,
        `  Key:     ${issue.key}`,
        `  Summary: ${issue.fields.summary}`,
        `  Type:    ${issue.fields.issuetype.name}`,
        `  Status:  ${issue.fields.status.name}`,
        `  URL:     ${baseUrl}/browse/${issue.key}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_update_issue",
  "Update an existing Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The issue key to update (e.g. 'PROJ-123')"),
    summary: z.string().optional().describe("New summary/title"),
    description: z.string().optional().describe("New description (plain text)"),
    priority: z.string().optional().describe("New priority"),
    labels: z.array(z.string()).optional().describe("New labels (replaces existing)"),
  },
  async ({ issueKey, summary, description, priority, labels }) => {
    try {
      const client = getJiraClient();
      const issue = await client.updateIssue({
        issueKey, summary, description, priority, labels,
      });

      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Issue updated successfully.`,
        `  Key:     ${issue.key}`,
        `  Summary: ${issue.fields.summary}`,
        `  Status:  ${issue.fields.status.name}`,
        `  URL:     ${baseUrl}/browse/${issue.key}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_transition_issue",
  "Transition a Jira issue to a new status. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')"),
    transitionName: z.string().optional().describe("Target transition name (omit to list available transitions)"),
  },
  async ({ issueKey, transitionName }) => {
    try {
      const client = getJiraClient();
      const transitions = await client.getTransitions(issueKey);

      if (!transitionName) {
        const text = [
          `Available transitions for ${issueKey}:`,
          ...transitions.map((t) => `• ${t.name} → ${t.to.name} (id: ${t.id})`),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      }

      const match = transitions.find(
        (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
      );
      if (!match) {
        const available = transitions.map((t) => `${t.name} → ${t.to.name}`).join(", ");
        return {
          content: [{ type: "text", text: `No transition named "${transitionName}". Available: ${available}` }],
          isError: true,
        };
      }

      await client.transitionIssue(issueKey, match.id);
      return {
        content: [{ type: "text", text: `✓ Transitioned ${issueKey} → ${match.to.name}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_delete_issue",
  "Delete a Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  { issueKey: z.string().describe("The issue key to delete (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const client = getJiraClient();
      const issue = await client.getIssue(issueKey);
      await client.deleteIssue(issueKey);

      return {
        content: [
          { type: "text", text: `✓ Deleted issue ${issueKey} "${issue.fields.summary}"` },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_epic_issues",
  "List all issues belonging to a Jira epic",
  {
    epicKey: z.string().describe("The epic issue key (e.g. 'PROJ-5')"),
    limit: z.number().optional().describe("Max results (default 50)"),
  },
  async ({ epicKey, limit }) => {
    try {
      const issues = await getJiraClient().listEpicIssues(epicKey, limit ?? 50);
      if (issues.length === 0) {
        return { content: [{ type: "text", text: "No issues found in this epic." }] };
      }
      const text = issues
        .map((i) => `${i.key} — ${i.fields.summary} [${i.fields.status.name}] (${i.fields.issuetype.name})`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_boards",
  "List Jira boards (Scrum and Kanban)",
  { limit: z.number().optional().describe("Max results (default 25)") },
  async ({ limit }) => {
    try {
      const boards = await getJiraClient().listBoards(limit ?? 25);
      if (boards.length === 0) {
        return { content: [{ type: "text", text: "No boards found." }] };
      }
      const text = boards
        .map((b) => `${b.name} (id: ${b.id}, ${b.type}${b.location ? `, project: ${b.location.projectKey}` : ""})`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_sprints",
  "List sprints on a Jira board",
  {
    boardId: z.number().describe("The board ID (from jira_list_boards)"),
    state: z.enum(["active", "future", "closed"]).optional().describe("Filter by sprint state (omit to return all)"),
  },
  async ({ boardId, state }) => {
    try {
      const sprints = await getJiraClient().listSprints(boardId, state);
      if (sprints.length === 0) {
        return { content: [{ type: "text", text: "No sprints found." }] };
      }
      const text = sprints.map((s) => {
        const dates = s.startDate && s.endDate
          ? ` (${new Date(s.startDate).toLocaleDateString()} – ${new Date(s.endDate).toLocaleDateString()})`
          : "";
        return `${s.name} — ${s.state}${dates} (id: ${s.id})`;
      }).join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_move_to_sprint",
  "Move one or more Jira issues to a sprint. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    sprintId: z.number().describe("The sprint ID (from jira_list_sprints)"),
    issueKeys: z.array(z.string()).describe("Issue keys to move (e.g. ['PROJ-1', 'PROJ-2'])"),
  },
  async ({ sprintId, issueKeys }) => {
    try {
      await getJiraClient().moveToSprint(sprintId, issueKeys);
      return { content: [{ type: "text", text: `✓ Moved ${issueKeys.join(", ")} to sprint ${sprintId}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_search_users",
  "Search for Jira users by name or email — useful for finding accountIds to use with assignee fields",
  {
    query: z.string().describe("Name or email to search for"),
    limit: z.number().optional().describe("Max results (default 10)"),
  },
  async ({ query, limit }) => {
    try {
      const users = await getJiraClient().searchUsers(query, limit ?? 10);
      if (users.length === 0) {
        return { content: [{ type: "text", text: "No users found." }] };
      }
      const text = users
        .map((u) => `${u.displayName}${u.emailAddress ? ` <${u.emailAddress}>` : ""} — accountId: ${u.accountId}${u.active ? "" : " (inactive)"}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_worklogs",
  "List work log entries on a Jira issue",
  { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const worklogs = await getJiraClient().listWorklogs(issueKey);
      if (worklogs.length === 0) {
        return { content: [{ type: "text", text: "No work logged." }] };
      }
      const text = worklogs.map((w) => {
        const author = w.author?.displayName ?? "Unknown";
        const date = new Date(w.started).toLocaleDateString();
        return `${author} · ${date} · ${w.timeSpent}`;
      }).join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_log_work",
  "Log time worked on a Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')"),
    timeSpent: z.string().describe("Time spent, e.g. '2h', '30m', '1d 2h'"),
    started: z.string().optional().describe("When work started (ISO datetime, defaults to now)"),
    comment: z.string().optional().describe("Work description"),
  },
  async ({ issueKey, timeSpent, started, comment }) => {
    try {
      const log = await getJiraClient().addWorklog({ issueKey, timeSpent, started, comment });
      const text = [
        `✓ Logged ${log.timeSpent} on ${issueKey}.`,
        `  Started: ${new Date(log.started).toLocaleString()}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_link_types",
  "List available Jira issue link types (e.g. Blocks, Clones, Relates)",
  {},
  async () => {
    try {
      const types = await getJiraClient().listIssueLinkTypes();
      const text = types
        .map((t) => `${t.name} — outward: "${t.outward}", inward: "${t.inward}"`)
        .join("\n");
      return { content: [{ type: "text", text: text || "No link types found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_issue_links",
  "List links on a Jira issue",
  { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const links = await getJiraClient().listIssueLinks(issueKey);
      if (links.length === 0) {
        return { content: [{ type: "text", text: "No issue links." }] };
      }
      const text = links.map((l) => {
        if (l.outwardIssue) {
          return `${l.type.outward}: ${l.outwardIssue.key} — ${l.outwardIssue.fields.summary} [${l.outwardIssue.fields.status.name}] (link id: ${l.id})`;
        }
        if (l.inwardIssue) {
          return `${l.type.inward}: ${l.inwardIssue.key} — ${l.inwardIssue.fields.summary} [${l.inwardIssue.fields.status.name}] (link id: ${l.id})`;
        }
        return `${l.type.name} (link id: ${l.id})`;
      }).join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_link_issues",
  "Link two Jira issues together. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The source issue key (outward side, e.g. 'PROJ-1')"),
    linkType: z.string().describe("Link type name (e.g. 'Blocks', 'Clones', 'Relates to') — use jira_list_link_types to see options"),
    targetIssueKey: z.string().describe("The target issue key (inward side, e.g. 'PROJ-2')"),
  },
  async ({ issueKey, linkType, targetIssueKey }) => {
    try {
      await getJiraClient().linkIssues(issueKey, linkType, targetIssueKey);
      return { content: [{ type: "text", text: `✓ Linked: ${issueKey} "${linkType}" ${targetIssueKey}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_remove_issue_link",
  "Remove a link between two Jira issues. IMPORTANT: Ask the user for confirmation before calling this tool.",
  { linkId: z.string().describe("The link ID to remove (from jira_list_issue_links)") },
  async ({ linkId }) => {
    try {
      await getJiraClient().removeIssueLink(linkId);
      return { content: [{ type: "text", text: `✓ Link ${linkId} removed.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_comments",
  "List comments on a Jira issue",
  { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const comments = await getJiraClient().listComments(issueKey);
      if (comments.length === 0) {
        return { content: [{ type: "text", text: "No comments." }] };
      }
      const client = getJiraClient();
      const text = comments.map((c) => {
        const author = c.author?.displayName ?? "Unknown";
        const date = new Date(c.created).toLocaleDateString();
        const body = client.descriptionToText({ fields: { description: c.body } } as never);
        return `[${author} · ${date}]\n${body}`;
      }).join("\n\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_add_comment",
  "Add a comment to a Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')"),
    text: z.string().describe("Comment text (plain text)"),
  },
  async ({ issueKey, text }) => {
    try {
      await getJiraClient().addComment(issueKey, text);
      return { content: [{ type: "text", text: `✓ Comment added to ${issueKey}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_upload_attachment",
  "Upload a file as an attachment to a Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
  {
    issueKey: z.string().describe("The issue key to attach the file to (e.g. 'PROJ-123')"),
    filePath: z.string().describe("Absolute path to the file to upload"),
  },
  async ({ issueKey, filePath }) => {
    try {
      const att = await getJiraClient().uploadAttachment({ issueKey, filePath });
      const baseUrl = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
      const text = [
        `✓ Attachment uploaded successfully.`,
        `  File:     ${att.filename}`,
        `  ID:       ${att.id}`,
        `  Type:     ${att.mimeType}`,
        `  Size:     ${att.size} bytes`,
        ...(att.content ? [`  Download: ${att.content}`] : []),
        `  Issue:    ${baseUrl}/browse/${issueKey}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

server.tool(
  "jira_list_attachments",
  "List all attachments on a Jira issue",
  { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
  async ({ issueKey }) => {
    try {
      const attachments = await getJiraClient().listAttachments(issueKey);
      if (attachments.length === 0) {
        return { content: [{ type: "text", text: "No attachments found." }] };
      }
      const text = attachments
        .map((a) => `${a.filename} (id: ${a.id}, ${a.mimeType}, ${a.size} bytes)\n  ${a.content}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: formatError(err) }], isError: true };
    }
  },
);

// ── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Atlassian MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
