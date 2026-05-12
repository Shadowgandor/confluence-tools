export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  style: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: unknown;
    status: { name: string };
    issuetype: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; accountId: string };
    reporter?: { displayName: string };
    created: string;
    updated: string;
    labels?: string[];
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export interface IssueCreateInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  priority?: string;
  labels?: string[];
  assigneeId?: string;
}

export interface IssueUpdateInput {
  issueKey: string;
  summary?: string;
  description?: string;
  priority?: string;
  labels?: string[];
  assigneeId?: string;
}

export interface IssueSearchOptions {
  jql?: string;
  project?: string;
  status?: string;
  assignee?: string;
  type?: string;
  limit?: number;
}
