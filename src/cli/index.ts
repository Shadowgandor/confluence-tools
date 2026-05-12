#!/usr/bin/env node

import { Command } from "commander";
import { registerConfluenceCommands } from "./confluence.js";
import { registerJiraCommands } from "./jira.js";

const program = new Command()
  .name("atlassian")
  .description("CLI for Atlassian Cloud — Confluence, Jira, and more")
  .version("0.2.0");

registerConfluenceCommands(program);
registerJiraCommands(program);

program.parse();
