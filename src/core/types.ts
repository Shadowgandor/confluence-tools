// ── Shared Atlassian types ──────────────────────────────────────────

export interface AtlassianConfig {
  baseUrl: string; // e.g. https://myteam.atlassian.net (no product suffix)
  email: string;
  token: string;
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

export class AtlassianApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: unknown,
  ) {
    super(`Atlassian API ${statusCode}: ${message}`);
    this.name = "AtlassianApiError";
  }
}
