# Confluence Skill

Interact with Atlassian Confluence using the `confluence` CLI tool. Supports creating, reading, updating, and deleting pages with secure token-based authentication.

---

## Skill Description (for triggering)

Use this skill whenever the user wants to interact with Atlassian Confluence. This includes creating, reading, updating, or deleting Confluence pages, searching for pages in a space, listing spaces, or any task that involves Confluence content. Triggers include mentions of 'Confluence', 'wiki page', 'Confluence page', 'Confluence space', or requests to publish documentation to a team wiki. Also use when the user references a Confluence URL or asks to manage knowledge base content hosted on Confluence.

---

## Prerequisites

The `confluence` CLI must be installed and the following environment variables must be set:

```
CONFLUENCE_URL    — e.g. https://myteam.atlassian.net/wiki
CONFLUENCE_EMAIL  — Atlassian account email
CONFLUENCE_TOKEN  — Atlassian API token
```

**Never** write these values to any file. **Never** echo or log the token.

If the variables are not set, ask the user to provide them and export them in the current shell session.

To verify the connection:

```bash
confluence auth
```

---

## Confirmation Protocol

**ALWAYS ask the user for explicit confirmation before any create, update, or delete operation.**

Describe what will happen (space, title, changes) and wait for an affirmative reply before running the command. Use the `-y` flag only if the user has already confirmed.

Read and search operations are safe and can be executed immediately.

---

## Commands

### Verify connection

```bash
confluence auth
```

### List spaces

```bash
confluence spaces
confluence spaces --limit 50
```

### Read a page

```bash
confluence read <pageId>
confluence read <pageId> --json
```

### Search pages

```bash
confluence search -s <SPACE_KEY>
confluence search -s <SPACE_KEY> -t "Page Title"
confluence search -s <SPACE_KEY> --limit 10
```

### Create a page (requires confirmation)

```bash
confluence create -s <SPACE_KEY> -t "Page Title" -f content.md
confluence create -s <SPACE_KEY> -t "Page Title" -f content.html --parent <parentId>
confluence create -s <SPACE_KEY> -t "Page Title" -f content.md --draft
```

The `-f` flag accepts `.md` files (auto-converted to Confluence format), `.html` files (passed as-is), or inline content.

### Update a page (requires confirmation)

```bash
confluence update <pageId> -f updated-content.md
confluence update <pageId> -t "New Title"
confluence update <pageId> -f content.md -m "Fixed typos"
```

### Delete a page (requires confirmation)

```bash
confluence delete <pageId>
```

---

## Error Handling

The CLI exits with a non-zero code and a clear error message on failure:

- **401**: Invalid or expired token — ask the user to check their API token.
- **403**: Insufficient permissions — report the space/page and ask the user to check access.
- **404**: Page or space not found — confirm the ID or key with the user.
- **409**: Version conflict on update — retry the command (it re-fetches the version automatically).

---

## Tips

- The CLI auto-converts Markdown files to Confluence storage format.
- Use `--json` on `read` to get raw API output for programmatic use.
- Use `-y` to skip interactive confirmation (only when the user has already confirmed).
- Page URLs are printed after create/update operations.
