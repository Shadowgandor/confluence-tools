# atlassian-tools

CLI and MCP server for Atlassian Cloud. Manage Confluence pages and Jira issues from your terminal or AI agent — with a single set of credentials.

## Features

- **Confluence** — Full CRUD for pages: search, read, create, update, delete
- **Jira** — Issues: search (JQL), view, create, update, transition, delete
- **Shared auth** — One set of credentials (`ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_TOKEN`) for all products
- **CLI** — `atlassian` command with product subcommands, interactive confirmations, coloured output
- **MCP server** — Expose all operations as tools for AI agents (Claude Code, etc.)
- **Markdown support** — Automatically converts `.md` files to Confluence storage format
- **Secure by design** — Credentials are read from environment variables only, never written to disk

## Installation

```bash
npm install -g atlassian-tools
```

Or run without installing:

```bash
npx atlassian-tools atlassian confluence auth
```

### Environment variables

```bash
export ATLASSIAN_URL="https://your-instance.atlassian.net"
export ATLASSIAN_EMAIL="you@example.com"
export ATLASSIAN_TOKEN="your-api-token"
```

Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens

> **Migration note:** The legacy `CONFLUENCE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_TOKEN` variables are still supported. `CONFLUENCE_URL` is expected to include `/wiki` — the tool strips it automatically.

## CLI usage

### Confluence

```bash
# Verify connection
atlassian confluence auth

# List spaces
atlassian confluence spaces

# Read a page
atlassian confluence read 12345678
atlassian confluence read 12345678 --json

# Search pages in a space
atlassian confluence search -s DEV -t "Architecture"

# Create a page (prompts for confirmation)
atlassian confluence create -s DEV -t "New RFC" -f proposal.md

# Update a page
atlassian confluence update 12345678 -f updated.md -m "Revised section 3"

# Delete a page
atlassian confluence delete 12345678
```

### Jira

```bash
# Verify connection
atlassian jira auth

# List projects
atlassian jira projects

# Search issues
atlassian jira list --project CARD --status "In Progress"
atlassian jira list --jql 'assignee = currentUser() AND status != Done'

# View an issue
atlassian jira view CARD-42
atlassian jira view CARD-42 --json

# Create an issue (prompts for confirmation)
atlassian jira create --project CARD --type Bug --summary "Fix login"

# Update an issue
atlassian jira update CARD-42 --priority High --summary "Fix login regression"

# Transition an issue
atlassian jira transition CARD-42 --to "In Progress"
atlassian jira transition CARD-42 --list   # show available transitions

# Delete an issue
atlassian jira delete CARD-42
```

All write/delete commands prompt for confirmation. Pass `-y` to skip (useful in scripts).

## MCP server usage

Add to your Claude Code config (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "atlassian-mcp",
      "env": {
        "ATLASSIAN_URL": "https://your-instance.atlassian.net",
        "ATLASSIAN_EMAIL": "you@example.com",
        "ATLASSIAN_TOKEN": "your-api-token"
      }
    }
  }
}
```

Or without a global install:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["--package=atlassian-tools", "-y", "atlassian-mcp"],
      "env": {
        "ATLASSIAN_URL": "https://your-instance.atlassian.net",
        "ATLASSIAN_EMAIL": "you@example.com",
        "ATLASSIAN_TOKEN": "your-api-token"
      }
    }
  }
}
```

### Available tools

#### Confluence

| Tool                       | Description                          | Confirmation needed |
|----------------------------|--------------------------------------|---------------------|
| `confluence_auth`          | Verify connection                    | No                  |
| `confluence_list_spaces`   | List spaces                          | No                  |
| `confluence_read_page`     | Read page content by ID              | No                  |
| `confluence_search_pages`  | Search by space key and title        | No                  |
| `confluence_create_page`   | Create a new page                    | **Yes**             |
| `confluence_update_page`   | Update an existing page              | **Yes**             |
| `confluence_delete_page`   | Delete a page                        | **Yes**             |

#### Jira

| Tool                       | Description                          | Confirmation needed |
|----------------------------|--------------------------------------|---------------------|
| `jira_auth`                | Verify connection                    | No                  |
| `jira_list_projects`       | List projects                        | No                  |
| `jira_get_issue`           | Get issue details by key             | No                  |
| `jira_search_issues`       | Search with JQL or filters           | No                  |
| `jira_create_issue`        | Create a new issue                   | **Yes**             |
| `jira_update_issue`        | Update an existing issue             | **Yes**             |
| `jira_transition_issue`    | Transition issue status              | **Yes**             |
| `jira_delete_issue`        | Delete an issue                      | **Yes**             |

## Project structure

```
src/
├── core/           # Shared: auth, HTTP client, types, markdown converter
│   ├── client.ts   # Generic Atlassian HTTP client (auth, fetch, errors)
│   ├── auth.ts     # Environment-based config loader
│   ├── markdown.ts # Markdown → Confluence storage format converter
│   ├── types.ts    # Shared TypeScript interfaces
│   └── index.ts    # Barrel export
├── confluence/     # Confluence-specific client + types
│   ├── client.ts   # Confluence REST API client
│   ├── types.ts    # Confluence interfaces
│   └── index.ts    # Barrel export
├── jira/           # Jira-specific client + types
│   ├── client.ts   # Jira REST API v3 client
│   ├── types.ts    # Jira interfaces
│   └── index.ts    # Barrel export
├── cli/            # Commander.js with product subcommands
│   ├── index.ts    # Main entry point
│   ├── helpers.ts  # Shared CLI utilities
│   ├── confluence.ts
│   └── jira.ts
└── mcp/            # MCP server exposing all tools
    └── index.ts
```

## Programmatic usage

```typescript
import { ConfluenceClient } from "atlassian-tools/confluence";
import { JiraClient } from "atlassian-tools/jira";
import { loadConfigFromEnv } from "atlassian-tools";

const config = loadConfigFromEnv();
const confluence = new ConfluenceClient(config);
const jira = new JiraClient(config);

const pages = await confluence.searchPages({ spaceKey: "DEV", title: "RFC" });
const issues = await jira.searchIssues({ project: "CARD", status: "In Progress" });
```

## Development

```bash
# Run CLI in dev mode (no build step)
npm run dev:cli -- confluence auth
npm run dev:cli -- jira list --project CARD

# Run MCP server in dev mode
npm run dev:mcp

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

## License

MIT — GeeveeH Software
