import { Command } from "commander";
import chalk from "chalk";
import { loadConfigFromEnv } from "../core/auth.js";
import { JiraClient } from "../jira/client.js";
import { JiraIssue, JiraSprint } from "../jira/types.js";
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
    .command("epic <epicKey>")
    .description("List all issues belonging to an epic")
    .option("-l, --limit <n>", "Max results", "50")
    .action(async (epicKey: string, opts) => {
      try {
        const issues = await createClient().listEpicIssues(epicKey, Number(opts.limit));
        if (issues.length === 0) {
          console.log(chalk.yellow("No issues found in this epic."));
          return;
        }
        for (const i of issues) {
          console.log(formatIssue(i));
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("boards")
    .description("List Jira boards")
    .option("-l, --limit <n>", "Max results", "25")
    .action(async (opts) => {
      try {
        const boards = await createClient().listBoards(Number(opts.limit));
        if (boards.length === 0) {
          console.log(chalk.yellow("No boards found."));
          return;
        }
        for (const b of boards) {
          const proj = b.location ? chalk.dim(` — ${b.location.projectName} [${b.location.projectKey}]`) : "";
          console.log(`${chalk.bold(b.name)}${proj} ${chalk.dim(`(id: ${b.id}, ${b.type})`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("sprints <boardId>")
    .description("List sprints on a board")
    .option("--state <state>", "Filter by state: active, future, closed")
    .action(async (boardId: string, opts) => {
      try {
        const state = opts.state as "active" | "future" | "closed" | undefined;
        const sprints = await createClient().listSprints(Number(boardId), state);
        if (sprints.length === 0) {
          console.log(chalk.yellow("No sprints found."));
          return;
        }
        for (const s of sprints) {
          const dates = s.startDate && s.endDate
            ? chalk.dim(` (${new Date(s.startDate).toLocaleDateString()} – ${new Date(s.endDate).toLocaleDateString()})`)
            : "";
          const stateColour = s.state === "active" ? chalk.green(s.state) : chalk.dim(s.state);
          console.log(`${chalk.bold(s.name)} — ${stateColour}${dates} ${chalk.dim(`(id: ${s.id})`)}`);
          if (s.goal) console.log(`  ${chalk.dim(s.goal)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("move-to-sprint <sprintId> [issueKeys...]")
    .description("Move one or more issues to a sprint")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (sprintId: string, issueKeys: string[], opts) => {
      try {
        if (issueKeys.length === 0) {
          console.error(chalk.red("Specify at least one issue key."));
          process.exit(1);
        }
        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would move issues to sprint:"));
          console.log(`  Issues: ${issueKeys.join(", ")}`);
          console.log(`  Sprint: ${sprintId}`);
          return;
        }
        if (!opts.yes) {
          const ok = await confirm(`Move ${issueKeys.join(", ")} to sprint ${sprintId}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        await createClient().moveToSprint(Number(sprintId), issueKeys);
        console.log(chalk.green(`✓ Moved ${issueKeys.join(", ")} to sprint ${sprintId}.`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("subtasks <issueKey>")
    .description("List subtasks of an issue")
    .option("-l, --limit <n>", "Max results", "50")
    .action(async (issueKey: string, opts) => {
      try {
        const subtasks = await createClient().listSubtasks(issueKey, Number(opts.limit));
        if (subtasks.length === 0) {
          console.log(chalk.yellow("No subtasks found."));
          return;
        }
        for (const i of subtasks) {
          console.log(formatIssue(i));
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("create-sprint")
    .description("Create a new sprint on a board")
    .requiredOption("--board <id>", "Board ID")
    .requiredOption("--name <name>", "Sprint name")
    .option("--goal <text>", "Sprint goal")
    .option("--start <date>", "Start date (ISO 8601)")
    .option("--end <date>", "End date (ISO 8601)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would create sprint:"));
          console.log(`  Board:  ${opts.board}`);
          console.log(`  Name:   ${opts.name}`);
          if (opts.goal) console.log(`  Goal:   ${opts.goal}`);
          return;
        }
        if (!opts.yes) {
          const ok = await confirm(`Create sprint "${opts.name}" on board ${opts.board}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        const sprint = await createClient().createSprint({
          boardId: Number(opts.board),
          name: opts.name,
          goal: opts.goal,
          startDate: opts.start,
          endDate: opts.end,
        });
        console.log(chalk.green(`✓ Created sprint: ${chalk.bold(sprint.name)} ${chalk.dim(`(id: ${sprint.id})`)}`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("update-sprint <sprintId>")
    .description("Update a sprint's name, goal, or dates")
    .option("--name <name>", "New sprint name")
    .option("--goal <text>", "New sprint goal")
    .option("--start <date>", "New start date (ISO 8601)")
    .option("--end <date>", "New end date (ISO 8601)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (sprintId: string, opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would update sprint:"));
          console.log(`  Sprint: ${sprintId}`);
          if (opts.name) console.log(`  Name:   ${opts.name}`);
          if (opts.goal) console.log(`  Goal:   ${opts.goal}`);
          return;
        }
        if (!opts.yes) {
          const ok = await confirm(`Update sprint ${sprintId}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        const sprint = await createClient().updateSprint(Number(sprintId), {
          name: opts.name,
          goal: opts.goal,
          startDate: opts.start,
          endDate: opts.end,
        });
        console.log(chalk.green(`✓ Updated sprint: ${chalk.bold(sprint.name)} ${chalk.dim(`(id: ${sprint.id})`)}`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("close-sprint <sprintId>")
    .description("Close a sprint (moves remaining issues to backlog)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (sprintId: string, opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan(`[dry run] Would close sprint ${sprintId}`));
          return;
        }
        if (!opts.yes) {
          const ok = await confirm(`Close sprint ${sprintId}? This cannot be undone.`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        const sprint = await createClient().closeSprint(Number(sprintId));
        console.log(chalk.green(`✓ Closed sprint: ${chalk.bold(sprint.name)} ${chalk.dim(`(id: ${sprint.id})`)}`));
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("users <query>")
    .description("Search for users by name or email (to find accountIds for assignee)")
    .option("-l, --limit <n>", "Max results", "10")
    .action(async (query: string, opts) => {
      try {
        const users = await createClient().searchUsers(query, Number(opts.limit));
        if (users.length === 0) {
          console.log(chalk.yellow("No users found."));
          return;
        }
        for (const u of users) {
          const email = u.emailAddress ? chalk.dim(` <${u.emailAddress}>`) : "";
          const inactive = u.active ? "" : chalk.red(" (inactive)");
          console.log(`${chalk.bold(u.displayName)}${email}${inactive}`);
          console.log(`  ${chalk.dim(`accountId: ${u.accountId}`)}`);
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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (opts) => {
      try {
        const client = createClient();

        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would create issue:"));
          console.log(`  Project: ${opts.project}`);
          console.log(`  Type:    ${opts.type}`);
          console.log(`  Summary: ${opts.summary}`);
          if (opts.priority) console.log(`  Priority: ${opts.priority}`);
          if (opts.parent) console.log(`  Parent:  ${opts.parent}`);
          return;
        }

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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const current = await client.getIssue(issueKey);

        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would update issue:"));
          console.log(`  ${formatIssue(current)}`);
          if (opts.summary) console.log(`  Summary: ${current.fields.summary} → ${opts.summary}`);
          if (opts.priority) console.log(`  Priority: → ${opts.priority}`);
          return;
        }

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
    .option("--dry-run", "Print what would happen without making changes")
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

        if (opts.dryRun) {
          const issue = await client.getIssue(issueKey);
          console.log(chalk.cyan(`[dry run] Would transition ${chalk.bold(issueKey)}:`));
          console.log(`  ${issue.fields.status.name} → ${match.to.name}`);
          return;
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
    .command("worklogs <issueKey>")
    .description("List work log entries on an issue")
    .action(async (issueKey: string) => {
      try {
        const worklogs = await createClient().listWorklogs(issueKey);
        if (worklogs.length === 0) {
          console.log(chalk.yellow("No work logged."));
          return;
        }
        for (const w of worklogs) {
          const author = w.author?.displayName ?? "Unknown";
          const date = new Date(w.started).toLocaleDateString();
          console.log(`  ${chalk.bold(w.timeSpent)} ${chalk.dim(`· ${author} · ${date}`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  jira
    .command("log <issueKey>")
    .description("Log time worked on an issue")
    .requiredOption("--time <duration>", "Time spent, e.g. '2h', '30m', '1d 2h'")
    .option("--comment <text>", "Work description")
    .option("--started <datetime>", "When work started (ISO datetime, defaults to now)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan(`[dry run] Would log time on ${issueKey}:`));
          console.log(`  Time: ${opts.time}`);
          if (opts.comment) console.log(`  Comment: ${opts.comment}`);
          if (opts.started) console.log(`  Started: ${opts.started}`);
          return;
        }
        if (!opts.yes) {
          const ok = await confirm(`Log ${opts.time} on ${issueKey}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        const log = await createClient().addWorklog({
          issueKey,
          timeSpent: opts.time,
          started: opts.started,
          comment: opts.comment,
        });
        console.log(chalk.green(`✓ Logged ${log.timeSpent} on ${issueKey}.`));
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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan(`[dry run] Would link issue:`));
          console.log(`  ${issueKey} "${opts.type}" ${opts.target}`);
          return;
        }
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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, opts) => {
      try {
        if (opts.dryRun) {
          console.log(chalk.cyan(`[dry run] Would add comment to ${issueKey}:`));
          console.log(`  Text: ${opts.text}`);
          return;
        }
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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, file: string, opts) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);

        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would attach file to issue:"));
          console.log(`  Issue: ${chalk.bold(issue.key)} ${issue.fields.summary}`);
          console.log(`  File:  ${file}`);
          return;
        }

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
    .option("--dry-run", "Print what would happen without making changes")
    .action(async (issueKey: string, opts) => {
      try {
        const client = createClient();
        const issue = await client.getIssue(issueKey);

        if (opts.dryRun) {
          console.log(chalk.cyan("[dry run] Would DELETE issue:"));
          console.log(`  ${formatIssue(issue)}`);
          return;
        }

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
