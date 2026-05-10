#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { ConfluenceClient, loadConfigFromEnv, ConfluenceApiError } from "../core/index.js";
import { resolveBody } from "../core/markdown.js";

// ── Helpers ────────────────────────────────────────────────────────

function createClient(): ConfluenceClient {
  const config = loadConfigFromEnv();
  return new ConfluenceClient(config);
}

function formatPage(page: { id: string; title: string; status: string; version?: { number: number } }) {
  return `${chalk.bold(page.title)} ${chalk.dim(`(id: ${page.id}, v${page.version?.number ?? "?"}, ${page.status})`)}`;
}

function handleError(err: unknown): never {
  if (err instanceof ConfluenceApiError) {
    console.error(chalk.red(`✗ API error ${err.statusCode}: ${err.message}`));
    if (err.data) console.error(chalk.dim(JSON.stringify(err.data, null, 2)));
  } else if (err instanceof Error) {
    console.error(chalk.red(`✗ ${err.message}`));
  }
  process.exit(1);
}

// ── Program ────────────────────────────────────────────────────────

const program = new Command()
  .name("confluence")
  .description("CLI for Atlassian Confluence — create, read, update, delete pages")
  .version("0.1.0");

// ── auth ────────────────────────────────────────────────────────────

program
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

// ── spaces ──────────────────────────────────────────────────────────

program
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

// ── read ────────────────────────────────────────────────────────────

program
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

// ── search ──────────────────────────────────────────────────────────

program
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

// ── create ──────────────────────────────────────────────────────────

program
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

      // Resolve space key → space ID
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

// ── update ──────────────────────────────────────────────────────────

program
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

// ── delete ──────────────────────────────────────────────────────────

program
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

// ── Utilities ───────────────────────────────────────────────────────

function pageUrl(page: { id: string; _links?: { base?: string } }): string {
  const base = page._links?.base ?? process.env.CONFLUENCE_URL ?? "";
  return `${base}/pages/${page.id}`;
}

async function confirm(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

// ── Run ─────────────────────────────────────────────────────────────

program.parse();
