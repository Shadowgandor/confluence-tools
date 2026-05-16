import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { AtlassianConfig } from "./types.js";

const CONFIG_PATH = join(homedir(), ".config", "atlassian", "config.json");

interface ConfigFile {
  url?: string;
  email?: string;
  token?: string;
}

function readConfigFile(): ConfigFile {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

function detectProfilePath(): string {
  const shell = process.env.SHELL ?? "";
  const home = homedir();

  if (shell.endsWith("zsh")) return join(home, ".zshrc");
  if (shell.endsWith("fish")) return join(home, ".config/fish/config.fish");
  if (shell.endsWith("bash")) {
    const bashProfile = join(home, ".bash_profile");
    return existsSync(bashProfile) ? bashProfile : join(home, ".bashrc");
  }
  return join(home, ".profile");
}

export function loadConfigFromEnv(): AtlassianConfig {
  const file = readConfigFile();

  // Env vars take priority; config file fills in missing values
  const baseUrl =
    process.env.ATLASSIAN_URL ??
    process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ??
    file.url;
  const email = process.env.ATLASSIAN_EMAIL ?? process.env.CONFLUENCE_EMAIL ?? file.email;
  const token = process.env.ATLASSIAN_TOKEN ?? process.env.CONFLUENCE_TOKEN ?? file.token;

  const missing: string[] = [];
  if (!baseUrl) missing.push("ATLASSIAN_URL");
  if (!email) missing.push("ATLASSIAN_EMAIL");
  if (!token) missing.push("ATLASSIAN_TOKEN");

  if (missing.length === 0) {
    return { baseUrl: baseUrl!, email: email!, token: token! };
  }

  const label = missing.length === 1 ? "variable" : "variables";

  const status = [
    `  ATLASSIAN_URL   = ${baseUrl ?? "(not set)"}`,
    `  ATLASSIAN_EMAIL = ${email ?? "(not set)"}`,
    `  ATLASSIAN_TOKEN = ${token ? "(set)" : "(not set)"}`,
  ].join("\n");

  const exports = [
    ...(!baseUrl ? [`  export ATLASSIAN_URL="https://your-instance.atlassian.net"`] : []),
    ...(!email   ? [`  export ATLASSIAN_EMAIL="you@example.com"`] : []),
    ...(!token   ? [`  export ATLASSIAN_TOKEN="your-api-token"`] : []),
  ].join("\n");

  throw new Error(
    `Missing required environment ${label}: ${missing.join(", ")}\n\n` +
    `${status}\n\n` +
    `Option 1 — add to ${detectProfilePath()}:\n\n` +
    `${exports}\n\n` +
    `Option 2 — create ${CONFIG_PATH}:\n\n` +
    `  {\n    "url": "https://your-instance.atlassian.net",\n    "email": "you@example.com",\n    "token": "your-api-token"\n  }\n\n` +
    `Generate a token at: https://id.atlassian.com/manage-profile/security/api-tokens`,
  );
}
