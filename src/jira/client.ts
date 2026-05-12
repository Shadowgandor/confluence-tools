import { AtlassianClient } from "../core/client.js";
import { AtlassianConfig } from "../core/types.js";
import {
  JiraProject,
  JiraIssue,
  JiraTransition,
  IssueCreateInput,
  IssueUpdateInput,
  IssueSearchOptions,
} from "./types.js";

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
}

interface JiraProjectSearchResponse {
  values: JiraProject[];
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

function textToAdf(text: string): unknown {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!doc.content) return "";
  return doc.content
    .map((block) =>
      (block.content ?? []).map((inline) => inline.text ?? "").join(""),
    )
    .join("\n\n");
}

export class JiraClient {
  private readonly http: AtlassianClient;

  constructor(config: AtlassianConfig) {
    this.http = new AtlassianClient(config);
  }

  // ── Authentication check ─────────────────────────────────────────

  async verifyConnection(): Promise<JiraProject[]> {
    const result = await this.http.request<JiraProjectSearchResponse>(
      "/rest/api/3/project/search?maxResults=5",
    );
    return result.values;
  }

  // ── Projects ─────────────────────────────────────────────────────

  async listProjects(limit = 25): Promise<JiraProject[]> {
    const result = await this.http.request<JiraProjectSearchResponse>(
      `/rest/api/3/project/search?maxResults=${limit}`,
    );
    return result.values;
  }

  // ── Issues ───────────────────────────────────────────────────────

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.http.request<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    );
  }

  async searchIssues(options: IssueSearchOptions): Promise<JiraIssue[]> {
    const clauses: string[] = [];
    if (options.project) clauses.push(`project = "${options.project}"`);
    if (options.status) clauses.push(`status = "${options.status}"`);
    if (options.assignee) clauses.push(`assignee = "${options.assignee}"`);
    if (options.type) clauses.push(`issuetype = "${options.type}"`);

    const jql = options.jql ?? clauses.join(" AND ");
    const params = new URLSearchParams({
      jql,
      maxResults: String(options.limit ?? 25),
      fields: "summary,status,issuetype,priority,assignee,reporter,created,updated,labels",
    });

    const result = await this.http.request<JiraSearchResponse>(
      `/rest/api/3/search?${params.toString()}`,
    );
    return result.issues;
  }

  // ── Create ───────────────────────────────────────────────────────

  async createIssue(input: IssueCreateInput): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueType },
      summary: input.summary,
    };
    if (input.description) fields.description = textToAdf(input.description);
    if (input.priority) fields.priority = { name: input.priority };
    if (input.labels) fields.labels = input.labels;
    if (input.assigneeId) fields.assignee = { accountId: input.assigneeId };

    const created = await this.http.request<{ id: string; key: string; self: string }>(
      "/rest/api/3/issue",
      { method: "POST", body: JSON.stringify({ fields }) },
    );

    return this.getIssue(created.key);
  }

  // ── Update ───────────────────────────────────────────────────────

  async updateIssue(input: IssueUpdateInput): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {};
    if (input.summary) fields.summary = input.summary;
    if (input.description) fields.description = textToAdf(input.description);
    if (input.priority) fields.priority = { name: input.priority };
    if (input.labels) fields.labels = input.labels;
    if (input.assigneeId) fields.assignee = { accountId: input.assigneeId };

    await this.http.request<void>(
      `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}`,
      { method: "PUT", body: JSON.stringify({ fields }) },
    );

    return this.getIssue(input.issueKey);
  }

  // ── Transitions ──────────────────────────────────────────────────

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const result = await this.http.request<JiraTransitionsResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    );
    return result.transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.http.request<void>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      { method: "POST", body: JSON.stringify({ transition: { id: transitionId } }) },
    );
  }

  // ── Delete ───────────────────────────────────────────────────────

  async deleteIssue(issueKey: string): Promise<void> {
    await this.http.request<void>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      { method: "DELETE" },
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────

  descriptionToText(issue: JiraIssue): string {
    return adfToText(issue.fields.description);
  }

  issueUrl(issueKey: string, baseUrl: string): string {
    return `${baseUrl}/browse/${issueKey}`;
  }
}
