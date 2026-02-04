#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import { getConfig, getOrgConfig, Config, OrgConfig } from "./config.js";
import { DevOpsClient } from "./client.js";
import { registerWiList } from "./commands/wi-list.js";
import { registerWiShow } from "./commands/wi-show.js";
import { registerWiCreate } from "./commands/wi-create.js";
import { registerWiUpdate } from "./commands/wi-update.js";
import { registerWiTree } from "./commands/wi-tree.js";
import { registerWiQuery } from "./commands/wi-query.js";
import { registerWiComment } from "./commands/wi-comment.js";
import { registerOrgStatus } from "./commands/org-status.js";
import { registerOrgList } from "./commands/org-list.js";
import { registerSkill } from "./commands/skill.js";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

const HELP = `Azure DevOps Work Items CLI (AI agent optimized)

ENV: DEVOPS_CLI_ORG, DEVOPS_CLI_PAT
Flag: --project <project> (required, set per repo in CLAUDE.md)
Output: TSV default, --json for JSON

COMMANDS (project-level, requires --project):
  wi list [--state <s>] [--type <t>] [--assigned-to <name>] [--parent <id>] [--area-path <p>] [--iteration <p>] [--top <n>] [--json]
  wi show <id> [--comments] [--json]
  wi comment <id> <text> [--json]
  wi create --type <t> --title <title> --description <desc> [--acceptance-criteria <ac>] [--parent <id>] [--block <id>] [--area-path <p>] [--iteration <p>] [--tags <csv>] [--json]
  wi update <id[,id,...]> [--state <s>] [--title <t>] [--assign <name>] [--tags <csv>] [--description <d>] [--acceptance-criteria <ac>] [--area-path <p>] [--iteration <p>] [--block <id>] [--unblock <id>] [--json]
  wi tree <id> [--depth <n>] [--json]
  wi query "<wiql>" [--json]

COMMANDS (org-level, no --project needed):
  org status [--by area|iteration] [--state <s>] [--assigned-to <name>] [--since <days>] [--json]
  org list [--state <s>] [--type <t>] [--assigned-to <name>] [--area-path <p>] [--iteration <p>] [--top <n>] [--json]

RULES:
  --description is required for wi create (all types)
  --acceptance-criteria is required for wi create --type "User Story"
  wi update accepts comma-separated IDs for batch updates

WORKFLOW:
  1. Create DevOps task BEFORE writing code
  2. Use sub-agents for: implementation, review, test
  3. No code changes without a corresponding task`;

const program = new Command();

program
  .name("devops-cli")
  .version(pkg.version)
  .description(HELP)
  .option("--project <project>", "Azure DevOps project");

function createClient(): { client: DevOpsClient; config: Config } {
  const opts = program.opts<{ project?: string }>();
  const config = getConfig({ project: opts.project });
  return { client: new DevOpsClient(config), config };
}

const wi = program.command("wi").description("Work item commands");

registerWiList(wi, createClient);
registerWiShow(wi, createClient);
registerWiCreate(wi, createClient);
registerWiUpdate(wi, createClient);
registerWiTree(wi, createClient);
registerWiQuery(wi, createClient);
registerWiComment(wi, createClient);

function createOrgClient(): { client: DevOpsClient; config: OrgConfig } {
  const config = getOrgConfig();
  return { client: new DevOpsClient(config), config };
}

const org = program.command("org").description("Organization-wide commands");

registerOrgStatus(org, createOrgClient);
registerOrgList(org, createOrgClient);
registerSkill(program);

program.parse();
