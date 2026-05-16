#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "module";
import { registerConfluenceTools } from "./confluence.js";
import { registerJiraTools } from "./jira.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const server = new McpServer({ name: "atlassian", version });

registerConfluenceTools(server);
registerJiraTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Atlassian MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
