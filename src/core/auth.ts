import { AtlassianConfig } from "./types.js";

export function loadConfigFromEnv(): AtlassianConfig {
  const baseUrl =
    process.env.ATLASSIAN_URL ??
    process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "");
  const email = process.env.ATLASSIAN_EMAIL ?? process.env.CONFLUENCE_EMAIL;
  const token = process.env.ATLASSIAN_TOKEN ?? process.env.CONFLUENCE_TOKEN;

  const missing: string[] = [];
  if (!baseUrl) missing.push("ATLASSIAN_URL");
  if (!email) missing.push("ATLASSIAN_EMAIL");
  if (!token) missing.push("ATLASSIAN_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Set them in your shell or .zshrc:\n` +
        `  export ATLASSIAN_URL="https://your-instance.atlassian.net"\n` +
        `  export ATLASSIAN_EMAIL="you@example.com"\n` +
        `  export ATLASSIAN_TOKEN="your-api-token"`,
    );
  }

  return { baseUrl: baseUrl!, email: email!, token: token! };
}
