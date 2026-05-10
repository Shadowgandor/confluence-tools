# confluence-tools

CLI and MCP server for Atlassian Confluence. Read, create, update, and delete pages from your terminal or AI agent.

## Features

- **CLI** — `confluence` command with full CRUD operations, interactive confirmation prompts, coloured output
- **MCP server** — Expose the same operations as tools for AI agents (Claude Code, etc.)
- **Shared core** — Both interfaces use the same TypeScript client; bug fixes and features land in one place
- **Markdown support** — Automatically converts `.md` files to Confluence storage format
- **Secure by design** — Credentials are read from environment variables only, never written to disk

## Setup

```bash
# Clone and install
git clone https://github.com/Shadowgandor/confluence-tools.git
cd confluence-tools
npm install
npm run build

# Make the CLI available globally
npm link
```

### Environment variables

```bash
export CONFLUENCE_URL="https://your-instance.atlassian.net/wiki"
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_TOKEN="your-api-token"
```

Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens

## CLI usage

```bash
# Verify connection
confluence auth

# List spaces
confluence spaces

# Read a page
confluence read 12345678
confluence read 12345678 --json

# Search pages in a space
confluence search -s DEV -t "Architecture"

# Create a page (prompts for confirmation)
confluence create -s DEV -t "New RFC" -f proposal.md

# Update a page
confluence update 12345678 -f updated.md -m "Revised section 3"

# Delete a page
confluence delete 12345678
```

All write/delete commands prompt for confirmation. Pass `-y` to skip (useful in scripts).

## MCP server usage

Add to your Claude Code config (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": ["-y", "confluence-tools", "--mcp"],
      "env": {
        "CONFLUENCE_URL": "https://your-instance.atlassian.net/wiki",
        "CONFLUENCE_EMAIL": "you@example.com",
        "CONFLUENCE_TOKEN": "your-api-token"
      }
    }
  }
}
```

Or run directly:

```bash
npm run dev:mcp
```

### Available tools

| Tool                       | Description                          | Confirmation needed |
|----------------------------|--------------------------------------|---------------------|
| `confluence_auth`          | Verify connection                    | No                  |
| `confluence_list_spaces`   | List spaces                          | No                  |
| `confluence_read_page`     | Read page content by ID              | No                  |
| `confluence_search_pages`  | Search by space key and title        | No                  |
| `confluence_create_page`   | Create a new page                    | **Yes**             |
| `confluence_update_page`   | Update an existing page              | **Yes**             |
| `confluence_delete_page`   | Delete a page                        | **Yes**             |

## Project structure

```
src/
├── core/           # Shared library
│   ├── client.ts   # Confluence REST API client
│   ├── auth.ts     # Environment-based config loader
│   ├── markdown.ts # Markdown → storage format converter
│   ├── types.ts    # TypeScript interfaces
│   └── index.ts    # Barrel export
├── cli/
│   └── index.ts    # Commander.js CLI
└── mcp/
    └── index.ts    # MCP server (stdio transport)
```

## Development

```bash
# Run CLI in dev mode (no build step)
npm run dev:cli -- auth
npm run dev:cli -- search -s DEV -t "RFC"

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
