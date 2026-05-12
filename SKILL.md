# Atlassian Skill

Interact with Atlassian Cloud products using the `atlassian` CLI tool. Supports Confluence (pages) and Jira (issues) with secure token-based authentication.

---

## Skill Description (for triggering)

Use this skill whenever the user wants to interact with Atlassian Confluence or Jira. This includes creating, reading, updating, or deleting Confluence pages, searching for or managing Jira issues, listing spaces or projects, or any task that involves Atlassian content. Triggers include mentions of 'Confluence', 'Jira', 'wiki page', 'Confluence page', 'Confluence space', 'Jira issue', 'Jira ticket', 'sprint', or requests to publish documentation or manage project work. Also use when the user references an Atlassian URL or asks to manage knowledge base content or project issues.

---

## Prerequisites

The `atlassian` CLI must be installed and the following environment variables must be set:

```
ATLASSIAN_URL    — e.g. https://myteam.atlassian.net
ATLASSIAN_EMAIL  — Atlassian account email
ATLASSIAN_TOKEN  — Atlassian API token
```

Legacy `CONFLUENCE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_TOKEN` are also accepted.

**Never** write these values to any file. **Never** echo or log the token.

If the variables are not set, ask the user to provide them and export them in the current shell session.

To verify the connection:

```bash
atlassian confluence auth
atlassian jira auth
```

---

## Confirmation Protocol

**ALWAYS ask the user for explicit confirmation before any create, update, delete, or transition operation.**

Describe what will happen (space, title, changes, issue key) and wait for an affirmative reply before running the command. Use the `-y` flag only if the user has already confirmed.

Read, search, list, and view operations are safe and can be executed immediately.

---

## Confluence Commands

### Verify connection

```bash
atlassian confluence auth
```

### List spaces

```bash
atlassian confluence spaces
atlassian confluence spaces --limit 50
```

### Read a page

```bash
atlassian confluence read <pageId>
atlassian confluence read <pageId> --json
```

### Search pages

```bash
atlassian confluence search -s <SPACE_KEY>
atlassian confluence search -s <SPACE_KEY> -t "Page Title"
atlassian confluence search -s <SPACE_KEY> --limit 10
```

### Create a page (requires confirmation)

```bash
atlassian confluence create -s <SPACE_KEY> -t "Page Title" -f content.md
atlassian confluence create -s <SPACE_KEY> -t "Page Title" -f content.html --parent <parentId>
atlassian confluence create -s <SPACE_KEY> -t "Page Title" -f content.md --draft
```

The `-f` flag accepts `.md` files (auto-converted to Confluence format), `.html` files (passed as-is), or inline content.

### Update a page (requires confirmation)

```bash
atlassian confluence update <pageId> -f updated-content.md
atlassian confluence update <pageId> -t "New Title"
atlassian confluence update <pageId> -f content.md -m "Fixed typos"
```

### Delete a page (requires confirmation)

```bash
atlassian confluence delete <pageId>
```

---

## Jira Commands

### Verify connection

```bash
atlassian jira auth
```

### List projects

```bash
atlassian jira projects
atlassian jira projects --limit 50
```

### Search issues

```bash
atlassian jira list --project CARD
atlassian jira list --project CARD --status "In Progress"
atlassian jira list --jql 'assignee = currentUser() AND status != Done'
atlassian jira list --type Bug --limit 10
```

### View an issue

```bash
atlassian jira view CARD-42
atlassian jira view CARD-42 --json
```

### Create an issue (requires confirmation)

```bash
atlassian jira create --project CARD --type Bug --summary "Fix login"
atlassian jira create --project CARD --type Task --summary "Set up CI" --description "Configure GitHub Actions" --priority High
```

### Update an issue (requires confirmation)

```bash
atlassian jira update CARD-42 --summary "Fix login regression"
atlassian jira update CARD-42 --priority High --labels "critical,frontend"
```

### Transition an issue (requires confirmation)

```bash
atlassian jira transition CARD-42 --list          # list available transitions
atlassian jira transition CARD-42 --to "In Progress"
atlassian jira transition CARD-42 --to "Done"
```

### Delete an issue (requires confirmation)

```bash
atlassian jira delete CARD-42
```

---

## Error Handling

The CLI exits with a non-zero code and a clear error message on failure:

- **401**: Invalid or expired token — ask the user to check their API token.
- **403**: Insufficient permissions — report the space/project and ask the user to check access.
- **404**: Page, issue, or space not found — confirm the ID or key with the user.
- **409**: Version conflict on update — retry the command (it re-fetches the version automatically).

---

## Tips

- The CLI auto-converts Markdown files to Confluence storage format.
- Use `--json` on `read`/`view` to get raw API output for programmatic use.
- Use `-y` to skip interactive confirmation (only when the user has already confirmed).
- Page/issue URLs are printed after create/update operations.
- Use `--jql` for full JQL query power, or the simpler `--project`/`--status`/`--type` filters.
- `transition --list` shows available workflow transitions before committing to one.
