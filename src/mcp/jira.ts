import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfigFromEnv } from "../core/index.js";
import { JiraClient } from "../jira/client.js";
import { formatError, baseUrl } from "./helpers.js";

let _client: JiraClient | null = null;

function getClient(): JiraClient {
  if (!_client) _client = new JiraClient(loadConfigFromEnv());
  return _client;
}

export function registerJiraTools(server: McpServer): void {
  server.tool(
    "jira_auth",
    "Verify the Jira connection and list accessible projects",
    {},
    async () => {
      try {
        const projects = await getClient().verifyConnection();
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
        const projects = await getClient().listProjects(limit ?? 25);
        const text = projects.map((p) => `${p.name} [${p.key}] (id: ${p.id})`).join("\n");
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
        const client = getClient();
        const issue = await client.getIssue(issueKey);
        const desc = client.descriptionToText(issue);
        const base = baseUrl();
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
          `URL: ${base}/browse/${issue.key}`,
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
        const issues = await getClient().searchIssues({ jql, project, status, assignee, type, limit });
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
        const issue = await getClient().createIssue({ projectKey, issueType, summary, description, priority, labels, parentKey });
        const base = baseUrl();
        const text = [
          `✓ Issue created successfully.`,
          `  Key:     ${issue.key}`,
          `  Summary: ${issue.fields.summary}`,
          `  Type:    ${issue.fields.issuetype.name}`,
          `  Status:  ${issue.fields.status.name}`,
          `  URL:     ${base}/browse/${issue.key}`,
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
        const issue = await getClient().updateIssue({ issueKey, summary, description, priority, labels });
        const base = baseUrl();
        const text = [
          `✓ Issue updated successfully.`,
          `  Key:     ${issue.key}`,
          `  Summary: ${issue.fields.summary}`,
          `  Status:  ${issue.fields.status.name}`,
          `  URL:     ${base}/browse/${issue.key}`,
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
        const client = getClient();
        const transitions = await client.getTransitions(issueKey);

        if (!transitionName) {
          const text = [
            `Available transitions for ${issueKey}:`,
            ...transitions.map((t) => `• ${t.name} → ${t.to.name} (id: ${t.id})`),
          ].join("\n");
          return { content: [{ type: "text", text }] };
        }

        const match = transitions.find((t) => t.name.toLowerCase() === transitionName.toLowerCase());
        if (!match) {
          const available = transitions.map((t) => `${t.name} → ${t.to.name}`).join(", ");
          return {
            content: [{ type: "text", text: `No transition named "${transitionName}". Available: ${available}` }],
            isError: true,
          };
        }

        await client.transitionIssue(issueKey, match.id);
        return { content: [{ type: "text", text: `✓ Transitioned ${issueKey} → ${match.to.name}` }] };
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
        const client = getClient();
        const issue = await client.getIssue(issueKey);
        await client.deleteIssue(issueKey);
        return { content: [{ type: "text", text: `✓ Deleted issue ${issueKey} "${issue.fields.summary}"` }] };
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
        const issues = await getClient().listEpicIssues(epicKey, limit ?? 50);
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
        const boards = await getClient().listBoards(limit ?? 25);
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
        const sprints = await getClient().listSprints(boardId, state);
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
        await getClient().moveToSprint(sprintId, issueKeys);
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
        const users = await getClient().searchUsers(query, limit ?? 10);
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
    "jira_list_link_types",
    "List available Jira issue link types (e.g. Blocks, Clones, Relates)",
    {},
    async () => {
      try {
        const types = await getClient().listIssueLinkTypes();
        const text = types.map((t) => `${t.name} — outward: "${t.outward}", inward: "${t.inward}"`).join("\n");
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
        const links = await getClient().listIssueLinks(issueKey);
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
        await getClient().linkIssues(issueKey, linkType, targetIssueKey);
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
        await getClient().removeIssueLink(linkId);
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
        const client = getClient();
        const comments = await client.listComments(issueKey);
        if (comments.length === 0) {
          return { content: [{ type: "text", text: "No comments." }] };
        }
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
        await getClient().addComment(issueKey, text);
        return { content: [{ type: "text", text: `✓ Comment added to ${issueKey}.` }] };
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
        const worklogs = await getClient().listWorklogs(issueKey);
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
        const log = await getClient().addWorklog({ issueKey, timeSpent, started, comment });
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
    "jira_list_attachments",
    "List all attachments on a Jira issue",
    { issueKey: z.string().describe("The issue key (e.g. 'PROJ-123')") },
    async ({ issueKey }) => {
      try {
        const attachments = await getClient().listAttachments(issueKey);
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

  server.tool(
    "jira_upload_attachment",
    "Upload a file as an attachment to a Jira issue. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      issueKey: z.string().describe("The issue key to attach the file to (e.g. 'PROJ-123')"),
      filePath: z.string().describe("Absolute path to the file to upload"),
    },
    async ({ issueKey, filePath }) => {
      try {
        const att = await getClient().uploadAttachment({ issueKey, filePath });
        const base = baseUrl();
        const text = [
          `✓ Attachment uploaded successfully.`,
          `  File:     ${att.filename}`,
          `  ID:       ${att.id}`,
          `  Type:     ${att.mimeType}`,
          `  Size:     ${att.size} bytes`,
          ...(att.content ? [`  Download: ${att.content}`] : []),
          `  Issue:    ${base}/browse/${issueKey}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "jira_list_subtasks",
    "List all subtasks of a Jira issue",
    {
      issueKey: z.string().describe("The parent issue key (e.g. 'PROJ-42')"),
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async ({ issueKey, limit }) => {
      try {
        const subtasks = await getClient().listSubtasks(issueKey, limit ?? 50);
        if (subtasks.length === 0) {
          return { content: [{ type: "text", text: "No subtasks found." }] };
        }
        const text = subtasks
          .map((i) => `${i.key} — ${i.fields.summary} [${i.fields.status.name}]`)
          .join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "jira_create_sprint",
    "Create a new sprint on a Jira board. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      boardId: z.number().describe("The board ID (from jira_list_boards)"),
      name: z.string().describe("Sprint name"),
      goal: z.string().optional().describe("Sprint goal"),
      startDate: z.string().optional().describe("Start date (ISO 8601, e.g. '2024-06-01T00:00:00.000Z')"),
      endDate: z.string().optional().describe("End date (ISO 8601)"),
    },
    async ({ boardId, name, goal, startDate, endDate }) => {
      try {
        const sprint = await getClient().createSprint({ boardId, name, goal, startDate, endDate });
        const text = [
          `✓ Sprint created.`,
          `  Name:  ${sprint.name}`,
          `  ID:    ${sprint.id}`,
          `  State: ${sprint.state}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "jira_update_sprint",
    "Update a Jira sprint's name, goal, or dates. IMPORTANT: Ask the user for confirmation before calling this tool.",
    {
      sprintId: z.number().describe("The sprint ID (from jira_list_sprints)"),
      name: z.string().optional().describe("New sprint name"),
      goal: z.string().optional().describe("New sprint goal"),
      startDate: z.string().optional().describe("New start date (ISO 8601)"),
      endDate: z.string().optional().describe("New end date (ISO 8601)"),
    },
    async ({ sprintId, name, goal, startDate, endDate }) => {
      try {
        const sprint = await getClient().updateSprint(sprintId, { name, goal, startDate, endDate });
        return { content: [{ type: "text", text: `✓ Updated sprint "${sprint.name}" (id: ${sprint.id}).` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "jira_close_sprint",
    "Close a Jira sprint (moves remaining open issues to backlog). IMPORTANT: Ask the user for confirmation before calling this tool.",
    { sprintId: z.number().describe("The sprint ID to close (from jira_list_sprints)") },
    async ({ sprintId }) => {
      try {
        const sprint = await getClient().closeSprint(sprintId);
        return { content: [{ type: "text", text: `✓ Closed sprint "${sprint.name}" (id: ${sprint.id}).` }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );
}
