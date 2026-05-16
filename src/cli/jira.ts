import { Command } from "commander";
import chalk from "chalk";
import { loadConfigFromEnv } from "../core/auth.js";
import { JiraClient } from "../jira/client.js";
import { JiraIssue } from "../jira/types.js";
import { handleError, confirm } from "./helpers.js";

function createClient(): JiraClient {
  return new JiraClient(loadConfigFromEnv());
}

function formatIssue(issue: JiraIssue): string {
  const priority = issue.fields.priority?.name ?? "—";
  const assignee = issue.fields.assignee?.displayName ?? "Unassigned";
  return (
    `${chalk.bold(issue.key)} ${issue.fields.summary}\n` +
    `  ${chalk.dim(`${issue.fields.issuetype.name} · ${issue.fields.status.name} · ${priority} · ${assignee}`)}`
  );
}

function issueUrl(issueKey: string): string {
  const base = process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
  return `${base}/browse/${issueKey}`;
}

export function registerJiraCommands(program: Command) {
  const jira = program
    .command("jira")
    .description("Atlassian Jira — list, create, update, transition issues");

  jira
    .command("auth")
    .description("Verify your Jira connection")
    .action(async () => {
      try {
        const client = createClient();
        const projects = await client.verifyConnection();
        console.log(chalk.green("✓ Connected successfully."));
        console.log(`  Found ${projects.length} project(s):`);
        for (const p of projects) {
          console.log(`  • ${chalk.bold(p.name)} ${chalk.dim(`[${p.key}]`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("projects")
    .description("List available projects")
    .option("-l, --limit <n>", "Max projects to return", "25")
    .action(async (opts) => {
      try {
        const client = createClient();
        const projects = await client.listProjects(Number(opts.limit));
        for (const p of projects) {
          console.log(`${chalk.bold(p.name)} ${chalk.dim(`[${p.key}] id:${p.id}`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("list")
    .description("Search for issues")
    .option("--project <key>", "Filter by project key")
    .option("--status <status>", "Filter by status")
    .option("--assignee <name>", "Filter by assignee")
    .option("--type <type>", "Filter by issue type")
    .option("--jql <query>", "Raw JQL query (overrides other filters)")
    .option("-l, --limit <n>", "Max results", "25")
    .action(async (opts) => {
      try {
        const client = createClient();
        const issues = await client.searchIssues({
          jql: opts.jql,
          project: opts.project,
          status: opts.status,
          assignee: opts.assignee,
          type: opts.type,
          limit: Number(opts.limit),
        });
        if (issues.length === 0) {
          console.log(chalk.yellow("No issues found."));
          return;
        }
        for (const issue of issues) {
          console.log(formatIssue(issue));
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("view <issueKey>")
    .description("View an issue by key")
    .option("--json", "Output raw JSON")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);
        if (opts.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(formatIssue(issue));
          const desc = client.descriptionToText(issue);
          if (desc) {
            console.log(chalk.dim("─".repeat(60)));
            console.log(desc);
          }
          console.log();
          console.log(chalk.cyan(issueUrl(issue.key)));
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("create")
    .description("Create a new issue")
    .requiredOption("--project <key>", "Project key")
    .requiredOption("--type <type>", "Issue type (Bug, Task, Story, etc.)")
    .requiredOption("--summary <text>", "Issue summary")
    .option("--description <text>", "Issue description")
    .option("--priority <name>", "Priority (Highest, High, Medium, Low, Lowest)")
    .option("--labels <labels>", "Comma-separated labels")
    .option("--parent <key>", "Parent issue key (creates a subtask)")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts) => {
      try {
        const client = createClient();

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to create issue:"));
          console.log(`  Project: ${opts.project}`);
          console.log(`  Type:    ${opts.type}`);
          console.log(`  Summary: ${opts.summary}`);
          if (opts.priority) console.log(`  Priority: ${opts.priority}`);
          if (opts.parent) console.log(`  Parent:  ${opts.parent}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const issue = await client.createIssue({
          projectKey: opts.project,
          issueType: opts.type,
          summary: opts.summary,
          description: opts.description,
          priority: opts.priority,
          labels: opts.labels?.split(",").map((l: string) => l.trim()),
          parentKey: opts.parent,
        });

        console.log(chalk.green(`✓ Created: ${formatIssue(issue)}`));
        console.log(`  ${chalk.cyan(issueUrl(issue.key))}`);
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("update <issueKey>")
    .description("Update an existing issue")
    .option("--summary <text>", "New summary")
    .option("--description <text>", "New description")
    .option("--priority <name>", "New priority")
    .option("--labels <labels>", "Comma-separated labels")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const current = await client.getIssue(issueKey);

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to update issue:"));
          console.log(`  ${formatIssue(current)}`);
          if (opts.summary) console.log(`  Summary: ${current.fields.summary} → ${opts.summary}`);
          if (opts.priority) console.log(`  Priority: → ${opts.priority}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const updated = await client.updateIssue({
          issueKey,
          summary: opts.summary,
          description: opts.description,
          priority: opts.priority,
          labels: opts.labels?.split(",").map((l: string) => l.trim()),
        });

        console.log(chalk.green(`✓ Updated: ${formatIssue(updated)}`));
        console.log(`  ${chalk.cyan(issueUrl(updated.key))}`);
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("transition <issueKey>")
    .description("Transition an issue to a new status")
    .option("--to <status>", "Target status name")
    .option("--list", "List available transitions")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const transitions = await client.getTransitions(issueKey);

        if (opts.list || !opts.to) {
          console.log(`Available transitions for ${chalk.bold(issueKey)}:`);
          for (const t of transitions) {
            console.log(`  • ${chalk.bold(t.name)} ${chalk.dim(`→ ${t.to.name} (id: ${t.id})`)}`);
          }
          return;
        }

        const match = transitions.find(
          (t) => t.name.toLowerCase() === opts.to.toLowerCase(),
        );
        if (!match) {
          console.error(chalk.red(`✗ No transition named "${opts.to}". Available:`));
          for (const t of transitions) {
            console.error(`  • ${t.name} → ${t.to.name}`);
          }
          process.exit(1);
        }

        if (!opts.yes) {
          const issue = await client.getIssue(issueKey);
          console.log(chalk.yellow(`⚠ About to transition ${chalk.bold(issueKey)}:`));
          console.log(`  ${issue.fields.status.name} → ${match.to.name}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        await client.transitionIssue(issueKey, match.id);
        console.log(chalk.green(`✓ Transitioned ${issueKey} → ${match.to.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("links <issueKey>")
    .description("List links on an issue")
    .action(async (issueKey: string) => {
      try {
        const links = await createClient().listIssueLinks(issueKey);
        if (links.length === 0) {
          console.log(chalk.yellow("No issue links."));
          return;
        }
        for (const l of links) {
          if (l.outwardIssue) {
            console.log(`  ${chalk.dim(l.type.outward)} ${chalk.bold(l.outwardIssue.key)} ${l.outwardIssue.fields.summary} ${chalk.dim(`[${l.outwardIssue.fields.status.name}]`)}`);
          } else if (l.inwardIssue) {
            console.log(`  ${chalk.dim(l.type.inward)} ${chalk.bold(l.inwardIssue.key)} ${l.inwardIssue.fields.summary} ${chalk.dim(`[${l.inwardIssue.fields.status.name}]`)}`);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("link <issueKey>")
    .description("Link an issue to another")
    .requiredOption("--type <name>", "Link type (e.g. 'Blocks', 'Relates to')")
    .requiredOption("--target <key>", "Target issue key")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, opts) => {
      try {
        if (!opts.yes) {
          const ok = await confirm(`Link ${issueKey} "${opts.type}" ${opts.target}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        await createClient().linkIssues(issueKey, opts.type, opts.target);
        console.log(chalk.green(`✓ Linked: ${issueKey} "${opts.type}" ${opts.target}`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("link-types")
    .description("List available issue link types")
    .action(async () => {
      try {
        const types = await createClient().listIssueLinkTypes();
        for (const t of types) {
          console.log(`${chalk.bold(t.name)} ${chalk.dim(`— outward: "${t.outward}", inward: "${t.inward}"`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("comments <issueKey>")
    .description("List comments on an issue")
    .action(async (issueKey: string) => {
      try {
        const client = createClient();
        const comments = await client.listComments(issueKey);
        if (comments.length === 0) {
          console.log(chalk.yellow("No comments."));
          return;
        }
        for (const c of comments) {
          const author = c.author?.displayName ?? "Unknown";
          const date = new Date(c.created).toLocaleDateString();
          console.log(chalk.dim("─".repeat(60)));
          console.log(`${chalk.bold(author)} ${chalk.dim(`· ${date}`)}`);
          console.log(client.descriptionToText({ fields: { description: c.body } } as never));
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("comment <issueKey>")
    .description("Add a comment to an issue")
    .requiredOption("-t, --text <text>", "Comment text")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, opts) => {
      try {
        if (!opts.yes) {
          const ok = await confirm(`Add comment to ${issueKey}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        await createClient().addComment(issueKey, opts.text);
        console.log(chalk.green(`✓ Comment added to ${issueKey}.`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("attach <issueKey> <file>")
    .description("Upload a file as an attachment to an issue")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, file: string, opts) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to attach file to issue:"));
          console.log(`  Issue: ${chalk.bold(issue.key)} ${issue.fields.summary}`);
          console.log(`  File:  ${file}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const att = await client.uploadAttachment({ issueKey, filePath: file });
        console.log(chalk.green(`✓ Uploaded: ${chalk.bold(att.filename)} ${chalk.dim(`(id: ${att.id}, ${att.mimeType}, ${att.size} bytes)`)}`));
        if (att.content) {
          console.log(`  ${chalk.cyan(att.content)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("attachments <issueKey>")
    .description("List attachments on an issue")
    .action(async (issueKey: string) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);
        const attachments = await client.listAttachments(issueKey);

        console.log(`Attachments on ${chalk.bold(issue.key)} ${issue.fields.summary}`);
        if (attachments.length === 0) {
          console.log(chalk.yellow("  No attachments."));
          return;
        }
        for (const att of attachments) {
          console.log(`  ${chalk.bold(att.filename)} ${chalk.dim(`(id: ${att.id}, ${att.mimeType}, ${att.size} bytes)`)}`);
          if (att.content) {
            console.log(`    ${chalk.cyan(att.content)}`);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("delete <issueKey>")
    .description("Delete an issue")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);

        if (!opts.yes) {
          console.log(chalk.red("⚠ About to DELETE issue:"));
          console.log(`  ${formatIssue(issue)}`);
          console.log();

          const ok = await confirm("This cannot be undone. Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        await client.deleteIssue(issueKey);
        console.log(chalk.green(`✓ Deleted issue ${issueKey} "${issue.fields.summary}"`));
      } catch (err) {
        handleError(err);
      }
    });
}
