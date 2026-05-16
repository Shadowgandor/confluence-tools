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
  parentKey?: string;
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

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
  created?: string;
  author?: { displayName: string };
}

export interface JiraAttachmentUploadInput {
  issueKey: string;
  filePath: string;
}

export interface JiraComment {
  id: string;
  author?: { displayName: string; accountId: string };
  body?: unknown;
  created: string;
  updated?: string;
}

export interface JiraLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export interface JiraIssueLink {
  id: string;
  type: { id: string; name: string; inward: string; outward: string };
  inwardIssue?: { id: string; key: string; fields: { summary: string; status: { name: string } } };
  outwardIssue?: { id: string; key: string; fields: { summary: string; status: { name: string } } };
}
