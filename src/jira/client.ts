import { readFile } from "fs/promises";
import { basename } from "path";
import { AtlassianClient } from "../core/client.js";
import { AtlassianConfig } from "../core/types.js";
import { attachmentMimeType } from "../core/mime.js";
import {
  JiraProject,
  JiraIssue,
  JiraUser,
  JiraBoard,
  JiraSprint,
  JiraAttachment,
  JiraAttachmentUploadInput,
  JiraComment,
  JiraLinkType,
  JiraIssueLink,
  JiraWorklog,
  WorklogInput,
  JiraTransition,
  IssueCreateInput,
  IssueUpdateInput,
  IssueSearchOptions,
} from "./types.js";
import { textToAdf, adfToText, buildJql } from "./helpers.js";

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

  // ── Epics ────────────────────────────────────────────────────────

  async listEpicIssues(epicKey: string, limit = 50): Promise<JiraIssue[]> {
    const result = await this.http.request<JiraSearchResponse>(
      `/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue?maxResults=${limit}`,
    );
    return result.issues;
  }

  // ── Boards & sprints ─────────────────────────────────────────────

  async listBoards(limit = 25): Promise<JiraBoard[]> {
    const result = await this.http.request<{ values: JiraBoard[] }>(
      `/rest/agile/1.0/board?maxResults=${limit}`,
    );
    return result.values;
  }

  async listSprints(boardId: number, state?: "active" | "future" | "closed"): Promise<JiraSprint[]> {
    const params = new URLSearchParams({ maxResults: "50" });
    if (state) params.set("state", state);
    const result = await this.http.request<{ values: JiraSprint[] }>(
      `/rest/agile/1.0/board/${boardId}/sprint?${params.toString()}`,
    );
    return result.values;
  }

  async moveToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
    await this.http.request<void>(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: "POST",
      body: JSON.stringify({ issues: issueKeys }),
    });
  }

  // ── Users ────────────────────────────────────────────────────────

  async searchUsers(query: string, limit = 10): Promise<JiraUser[]> {
    const params = new URLSearchParams({ query, maxResults: String(limit) });
    return this.http.request<JiraUser[]>(`/rest/api/3/user/search?${params.toString()}`);
  }

  // ── Issues ───────────────────────────────────────────────────────

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.http.request<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    );
  }

  async searchIssues(options: IssueSearchOptions): Promise<JiraIssue[]> {
    const jql = buildJql(options);
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
    if (input.parentKey) fields.parent = { key: input.parentKey };

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

  // ── Worklogs ─────────────────────────────────────────────────────

  async listWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const result = await this.http.request<{ worklogs: JiraWorklog[] }>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    );
    return result.worklogs;
  }

  async addWorklog(input: WorklogInput): Promise<JiraWorklog> {
    const payload: Record<string, unknown> = {
      timeSpent: input.timeSpent,
      started: input.started ?? new Date().toISOString().replace("Z", "+0000"),
    };
    if (input.comment) payload.comment = textToAdf(input.comment);

    return this.http.request<JiraWorklog>(
      `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  // ── Issue links ──────────────────────────────────────────────────

  async listIssueLinkTypes(): Promise<JiraLinkType[]> {
    const result = await this.http.request<{ issueLinkTypes: JiraLinkType[] }>(
      "/rest/api/3/issueLinkType",
    );
    return result.issueLinkTypes;
  }

  async listIssueLinks(issueKey: string): Promise<JiraIssueLink[]> {
    const result = await this.http.request<{ fields: { issuelinks: JiraIssueLink[] } }>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks`,
    );
    return result.fields.issuelinks ?? [];
  }

  async linkIssues(outwardIssueKey: string, linkTypeName: string, inwardIssueKey: string): Promise<void> {
    await this.http.request<void>("/rest/api/3/issueLink", {
      method: "POST",
      body: JSON.stringify({
        type: { name: linkTypeName },
        outwardIssue: { key: outwardIssueKey },
        inwardIssue: { key: inwardIssueKey },
      }),
    });
  }

  async removeIssueLink(linkId: string): Promise<void> {
    await this.http.request<void>(`/rest/api/3/issueLink/${encodeURIComponent(linkId)}`, {
      method: "DELETE",
    });
  }

  // ── Comments ─────────────────────────────────────────────────────

  async listComments(issueKey: string): Promise<JiraComment[]> {
    const result = await this.http.request<{ comments: JiraComment[] }>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    );
    return result.comments;
  }

  async addComment(issueKey: string, text: string): Promise<JiraComment> {
    return this.http.request<JiraComment>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      { method: "POST", body: JSON.stringify({ body: textToAdf(text) }) },
    );
  }

  // ── Attachments ──────────────────────────────────────────────────

  async uploadAttachment(input: JiraAttachmentUploadInput): Promise<JiraAttachment> {
    const { issueKey, filePath } = input;
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);
    const blob = new Blob([fileBuffer], { type: attachmentMimeType(filePath) });

    const formData = new FormData();
    formData.append("file", blob, fileName);

    const results = await this.http.request<JiraAttachment[]>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
      {
        method: "POST",
        body: formData,
        headers: { "X-Atlassian-Token": "no-check" },
      },
    );

    return results[0];
  }

  async listAttachments(issueKey: string): Promise<JiraAttachment[]> {
    const result = await this.http.request<{ fields: { attachment: JiraAttachment[] } }>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`,
    );
    return result.fields.attachment ?? [];
  }

  // ── Helpers ──────────────────────────────────────────────────────

  descriptionToText(issue: JiraIssue): string {
    return adfToText(issue.fields.description);
  }

  issueUrl(issueKey: string, baseUrl: string): string {
    return `${baseUrl}/browse/${issueKey}`;
  }
}
