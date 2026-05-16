import { Command } from "commander";
import chalk from "chalk";
import { loadConfigFromEnv } from "../core/auth.js";
import { resolveBody } from "../core/markdown.js";
import { ConfluenceClient } from "../confluence/client.js";
import { handleError, confirm } from "./helpers.js";

function createClient(): ConfluenceClient {
  return new ConfluenceClient(loadConfigFromEnv());
}

function formatPage(page: { id: string; title: string; status: string; version?: { number: number } }) {
  return `${chalk.bold(page.title)} ${chalk.dim(`(id: ${page.id}, v${page.version?.number ?? "?"}, ${page.status})`)}`;
}

function pageUrl(page: { id: string; _links?: { base?: string } }): string {
  const base = page._links?.base ?? process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
  return `${base}/wiki/pages/${page.id}`;
}

export function registerConfluenceCommands(program: Command) {
  const confluence = program
    .command("confluence")
    .description("Atlassian Confluence — create, read, update, delete pages");

  confluence
    .command("auth")
    .description("Verify your Confluence connection")
    .action(async () => {
      try {
        const client = createClient();
        const spaces = await client.verifyConnection();
        console.log(chalk.green("✓ Connected successfully."));
        console.log(`  Found ${spaces.length} space(s):`);
        for (const s of spaces) {
          console.log(`  • ${chalk.bold(s.name)} ${chalk.dim(`[${s.key}]`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("spaces")
    .description("List available spaces")
    .option("-l, --limit <n>", "Max spaces to return", "25")
    .action(async (opts) => {
      try {
        const client = createClient();
        const spaces = await client.listSpaces(Number(opts.limit));
        for (const s of spaces) {
          console.log(`${chalk.bold(s.name)} ${chalk.dim(`[${s.key}] id:${s.id}`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("read <pageId>")
    .description("Read a page by ID")
    .option("--json", "Output raw JSON")
    .action(async (pageId: string, opts) => {
      try {
        const client = createClient();
        const page = await client.getPage(pageId);
        if (opts.json) {
          console.log(JSON.stringify(page, null, 2));
        } else {
          console.log(formatPage(page));
          if (page.body?.storage?.value) {
            console.log(chalk.dim("─".repeat(60)));
            console.log(page.body.storage.value);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("search")
    .description("Search for pages in a space")
    .requiredOption("-s, --space <key>", "Space key")
    .option("-t, --title <title>", "Filter by title")
    .option("-l, --limit <n>", "Max results", "25")
    .action(async (opts) => {
      try {
        const client = createClient();
        const pages = await client.searchPages({
          spaceKey: opts.space,
          title: opts.title,
          limit: Number(opts.limit),
        });
        if (pages.length === 0) {
          console.log(chalk.yellow("No pages found."));
          return;
        }
        for (const p of pages) {
          console.log(formatPage(p));
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("create")
    .description("Create a new page")
    .requiredOption("-s, --space <key>", "Space key")
    .requiredOption("-t, --title <title>", "Page title")
    .requiredOption("-f, --file <path>", "Content file (.md, .html) or inline string")
    .option("-p, --parent <id>", "Parent page ID")
    .option("--draft", "Create as draft")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts) => {
      try {
        const client = createClient();
        const space = await client.getSpaceByKey(opts.space);
        const body = await resolveBody(opts.file);

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to create page:"));
          console.log(`  Space:  ${space.name} [${space.key}]`);
          console.log(`  Title:  ${opts.title}`);
          if (opts.parent) console.log(`  Parent: ${opts.parent}`);
          console.log(`  Status: ${opts.draft ? "draft" : "published"}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const page = await client.createPage({
          spaceId: space.id,
          title: opts.title,
          body,
          parentId: opts.parent,
          status: opts.draft ? "draft" : "current",
        });

        console.log(chalk.green(`✓ Created: ${formatPage(page)}`));
        console.log(`  ${chalk.cyan(pageUrl(page))}`);
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("update <pageId>")
    .description("Update an existing page")
    .option("-t, --title <title>", "New title")
    .option("-f, --file <path>", "New content file (.md, .html) or inline string")
    .option("-m, --message <msg>", "Version message")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (pageId: string, opts) => {
      try {
        const client = createClient();
        const current = await client.getPage(pageId);
        const body = opts.file ? await resolveBody(opts.file) : undefined;

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to update page:"));
          console.log(`  Page:    ${formatPage(current)}`);
          if (opts.title) console.log(`  Title:   ${current.title} → ${opts.title}`);
          if (body) console.log(`  Body:    will be replaced`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const updated = await client.updatePage({
          pageId,
          title: opts.title,
          body,
          versionMessage: opts.message,
        });

        console.log(chalk.green(`✓ Updated: ${formatPage(updated)}`));
        console.log(`  ${chalk.cyan(pageUrl(updated))}`);
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("labels <pageId>")
    .description("List labels on a page")
    .action(async (pageId: string) => {
      try {
        const labels = await createClient().listLabels(pageId);
        if (labels.length === 0) {
          console.log(chalk.yellow("No labels."));
          return;
        }
        console.log(labels.map((l) => chalk.bold(l.name)).join("  "));
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("add-label <pageId> [labels...]")
    .description("Add one or more labels to a page")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (pageId: string, labels: string[], opts) => {
      try {
        if (labels.length === 0) {
          console.error(chalk.red("Specify at least one label."));
          process.exit(1);
        }
        if (!opts.yes) {
          const ok = await confirm(`Add labels [${labels.join(", ")}] to page ${pageId}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        const result = await createClient().addLabels(pageId, labels);
        console.log(chalk.green(`✓ Labels: ${result.map((l) => l.name).join(", ")}`));
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("remove-label <pageId> <label>")
    .description("Remove a label from a page")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (pageId: string, label: string, opts) => {
      try {
        if (!opts.yes) {
          const ok = await confirm(`Remove label "${label}" from page ${pageId}?`);
          if (!ok) { console.log(chalk.dim("Cancelled.")); return; }
        }
        await createClient().removeLabel(pageId, label);
        console.log(chalk.green(`✓ Removed label "${label}"`));
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("children <pageId>")
    .description("List child pages of a page")
    .option("-l, --limit <n>", "Max results", "25")
    .action(async (pageId: string, opts) => {
      try {
        const client = createClient();
        const pages = await client.listChildPages(pageId, Number(opts.limit));
        if (pages.length === 0) {
          console.log(chalk.yellow("No child pages."));
          return;
        }
        for (const p of pages) {
          console.log(formatPage(p));
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("attach <pageId> <file>")
    .description("Upload a file as an attachment to a page")
    .option("-c, --comment <text>", "Attachment comment")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (pageId: string, file: string, opts) => {
      try {
        const client = createClient();
        const page = await client.getPage(pageId);

        if (!opts.yes) {
          console.log(chalk.yellow("⚠ About to attach file to page:"));
          console.log(`  Page: ${formatPage(page)}`);
          console.log(`  File: ${file}`);
          if (opts.comment) console.log(`  Comment: ${opts.comment}`);
          console.log();

          const ok = await confirm("Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        const att = await client.uploadAttachment({ pageId, filePath: file, comment: opts.comment });
        const base = page._links?.base ?? process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
        console.log(chalk.green(`✓ Uploaded: ${chalk.bold(att.title)} ${chalk.dim(`(id: ${att.id}, ${att.mediaType})`)}`));
        if (att._links?.download) {
          console.log(`  ${chalk.cyan(`${base}/wiki${att._links.download}`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("attachments <pageId>")
    .description("List attachments on a page")
    .action(async (pageId: string) => {
      try {
        const client = createClient();
        const page = await client.getPage(pageId);
        const attachments = await client.listAttachments(pageId);

        console.log(`Attachments on ${chalk.bold(page.title)} ${chalk.dim(`(id: ${pageId})`)}`);
        if (attachments.length === 0) {
          console.log(chalk.yellow("  No attachments."));
          return;
        }
        const base = page._links?.base ?? process.env.ATLASSIAN_URL ?? process.env.CONFLUENCE_URL?.replace(/\/wiki\/?$/, "") ?? "";
        for (const att of attachments) {
          console.log(`  ${chalk.bold(att.title)} ${chalk.dim(`(id: ${att.id}, ${att.mediaType}${att.fileSize ? `, ${att.fileSize} bytes` : ""})`)}`);
          if (att._links?.download) {
            console.log(`    ${chalk.cyan(`${base}/wiki${att._links.download}`)}`);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  confluence
    .command("delete <pageId>")
    .description("Delete a page")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (pageId: string, opts) => {
      try {
        const client = createClient();
        const page = await client.getPage(pageId);

        if (!opts.yes) {
          console.log(chalk.red("⚠ About to DELETE page:"));
          console.log(`  ${formatPage(page)}`);
          console.log();

          const ok = await confirm("This cannot be undone. Proceed?");
          if (!ok) {
            console.log(chalk.dim("Cancelled."));
            return;
          }
        }

        await client.deletePage(pageId);
        console.log(chalk.green(`✓ Deleted page "${page.title}" (id: ${pageId})`));
      } catch (err) {
        handleError(err);
      }
    });
}
