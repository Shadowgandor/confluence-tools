import { AtlassianApiError } from "../core/index.js";

export function formatError(err: unknown): string {
  if (err instanceof AtlassianApiError) {
    return `Atlassian API error ${err.statusCode}: ${err.message}${err.data ? "\n" + JSON.stringify(err.data, null, 2) : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function baseUrl(): string {
  return (
    process.env.ATLASSIAN_URL ??
    process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ??
    ""
  );
}
