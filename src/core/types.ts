// ── Confluence API types ──────────────────────────────────────────────

export interface ConfluenceConfig {
  baseUrl: string; // e.g. https://myteam.atlassian.net/wiki
  email: string;
  token: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  version: { number: number; message?: string; createdAt?: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
}

export interface PageCreateInput {
  spaceId: string;
  title: string;
  body: string; // storage format (XHTML)
  parentId?: string;
  status?: "current" | "draft";
}

export interface PageUpdateInput {
  pageId: string;
  title?: string;
  body?: string; // storage format (XHTML)
  versionMessage?: string;
}

export interface PageSearchOptions {
  spaceKey: string;
  title?: string;
  limit?: number;
}

// ── API response wrappers ────────────────────────────────────────────

export interface PaginatedResponse<T> {
  results: T[];
  _links?: { next?: string };
}

export interface ApiError {
  statusCode: number;
  message: string;
  data?: unknown;
}

export class ConfluenceApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: unknown,
  ) {
    super(`Confluence API ${statusCode}: ${message}`);
    this.name = "ConfluenceApiError";
  }
}
