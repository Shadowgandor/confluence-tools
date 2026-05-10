import { ConfluenceConfig } from "./types.js";

/**
 * Resolve Confluence config from environment variables.
 * Throws a clear error if any are missing.
 */
export function loadConfigFromEnv(): ConfluenceConfig {
  const baseUrl = process.env.CONFLUENCE_URL;
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_TOKEN;

  const missing: string[] = [];
  if (!baseUrl) missing.push("CONFLUENCE_URL");
  if (!email) missing.push("CONFLUENCE_EMAIL");
  if (!token) missing.push("CONFLUENCE_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Set them in your shell or .zshrc:\n` +
        `  export CONFLUENCE_URL="https://your-instance.atlassian.net/wiki"\n` +
        `  export CONFLUENCE_EMAIL="you@example.com"\n` +
        `  export CONFLUENCE_TOKEN="your-api-token"`,
    );
  }

  return { baseUrl: baseUrl!, email: email!, token: token! };
}
