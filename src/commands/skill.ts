import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";

const SKILL_MD = `---
name: devops-cli
description: Use when the user asks about devops-cli commands, usage, or Azure DevOps work item management. Provides command reference and workflow guidance.
user-invocable: true
---

# devops-cli Usage Guide

Azure DevOps Work Item CLI. Reads and writes backlog items via REST API.

## Setup

\`\`\`bash
# Set env vars (~/.bashrc)
export DEVOPS_CLI_ORG="<organisation>"
export DEVOPS_CLI_PAT="<personal-access-token>"  # Scope: Work Items R/W

# Build & link
npm install && npm run build && npm link
\`\`\`

## Basic Structure

\`\`\`
devops-cli --project <project> <command-group> <command> [options]
\`\`\`

Two levels: **Project-level** (requires \`--project\`) and **Org-level** (cross-project).

## Work Items (wi)

### Show item (no --project needed)

\`\`\`bash
devops-cli wi show <id> [--comments] [--json]
\`\`\`

Shows full details of a work item by ID. Output includes: id, project, type, state, title, priority, areaPath, iterationPath, assigned, createdBy, created, changed, comments count, tags, description, acceptanceCriteria, and relations.

\`--comments\` displays the comment history instead.

### List items (requires --project)

\`\`\`bash
devops-cli --project Sandbox wi list [options]
\`\`\`

| Option | Description |
|--------|-------------|
| \`--state <s>\` | Filter by state (New, Active, Closed, ...) |
| \`--type <t>\` | Filter by type (Task, Bug, "User Story", Feature, Epic) |
| \`--assigned-to <name>\` | Filter by assignee |
| \`--parent <id>\` | Only children of this item |
| \`--area-path <p>\` | Filter by area path |
| \`--iteration <p>\` | Filter by iteration |
| \`--top <n>\` | Max number of results |
| \`--json\` | JSON output |

### Create item

\`\`\`bash
devops-cli --project Sandbox wi create --type <t> --title "<title>" --description "<desc>" [options]
\`\`\`

| Option | Description |
|--------|-------------|
| \`--type <t>\` | **Required.** Task, Bug, "User Story", Feature, Epic |
| \`--title <t>\` | **Required.** Item title |
| \`--description <d>\` | **Required.** Description (HTML allowed) |
| \`--acceptance-criteria <ac>\` | **Required for "User Story".** Acceptance criteria |
| \`--parent <id>\` | Parent item (hierarchy) |
| \`--block <id>\` | Block this item |
| \`--area-path <p>\` | Area path |
| \`--iteration <p>\` | Iteration path |
| \`--tags <csv>\` | Comma-separated tags |
| \`--json\` | JSON output |

### Update item

\`\`\`bash
devops-cli --project Sandbox wi update <id,id,...> [options]
\`\`\`

Multiple IDs comma-separated. All fields optional:

| Option | Description |
|--------|-------------|
| \`--state <s>\` | Change state (New, Active, Closed, ...) |
| \`--title <t>\` | Change title |
| \`--assign <name>\` | Assign to person |
| \`--description <d>\` | Change description |
| \`--acceptance-criteria <ac>\` | Change acceptance criteria |
| \`--tags <csv>\` | Set tags |
| \`--area-path <p>\` | Change area path |
| \`--iteration <p>\` | Change iteration |
| \`--block <id>\` | Add blocker |
| \`--unblock <id>\` | Remove blocker |
| \`--json\` | JSON output |

### Tree view

\`\`\`bash
devops-cli --project Sandbox wi tree <id> [--depth <n>] [--json]
\`\`\`

Shows the hierarchical structure starting from an item. \`--depth\` limits traversal depth.

### WIQL query

\`\`\`bash
devops-cli --project Sandbox wi query "<wiql>" [--json]
\`\`\`

Direct WIQL query against the API.

### Add comment

\`\`\`bash
devops-cli --project Sandbox wi comment <id> "<text>" [--json]
\`\`\`

Adds a comment to a work item.

## Organisation (org) — Org-level

No \`--project\` needed. Operates across all projects in the organisation.

### Status overview

\`\`\`bash
devops-cli org status [--by area|iteration] [--state <s>] [--since <days>] [--assigned-to <name>] [--json]
\`\`\`

Aggregates (type counts, latest date) grouped by project. \`--by\` switches grouping to area or iteration.

- \`--since <days>\` — Only items changed within N days (default: 90, default: 0 when \`--assigned-to\` is set)
- \`--assigned-to\` supports \`"me"\` as shorthand for the authenticated user

### List items across projects

\`\`\`bash
devops-cli org list [--state <s>] [--type <t>] [--assigned-to <name>] [--area-path <p>] [--iteration <p>] [--since <days>] [--top <n>] [--json]
\`\`\`

Like \`wi list\`, but cross-project. Additionally shows a priority column.

- Excludes Closed/Removed/Done by default (unless \`--state\` is specified)
- Sorted by Priority ASC, then ChangedDate DESC
- \`--since <days>\` — Only items changed within N days (default: 90, default: 0 when \`--assigned-to\` is set)
- \`--assigned-to\` supports \`"me"\` as shorthand for the authenticated user

## Common Workflows

### Daily start: get orientation

\`\`\`bash
# 1. High-level overview: what's going on across all projects?
devops-cli org status --assigned-to me

# 2. Drill into the details
devops-cli org list --assigned-to me

# 3. What's active in a specific project?
devops-cli --project Sandbox wi list --assigned-to me --state Active
devops-cli --project Foobar wi list --assigned-to me --state Active

# 4. What should I pick up next? (New items, sorted by priority)
devops-cli org list --assigned-to me --state New
\`\`\`

### Drill into a project

\`\`\`bash
# Full hierarchy from an epic
devops-cli --project Sandbox wi tree 178960

# Open tasks under a specific parent
devops-cli --project Sandbox wi list --parent 178960 --state New
\`\`\`

### Work on a task (Active/Closed cycle)

\`\`\`bash
devops-cli --project Sandbox wi update 12345 --state Active
# ... do the work ...
devops-cli --project Sandbox wi update 12345 --state Closed
\`\`\`

### Create a user story with tasks

\`\`\`bash
# Create story
devops-cli --project Sandbox wi create \\
  --type "User Story" \\
  --title "Implement login page" \\
  --description "Login form with email and password" \\
  --acceptance-criteria "User can log in and is redirected to the dashboard" \\
  --parent <feature-id>

# Create task under the story
devops-cli --project Sandbox wi create \\
  --type Task \\
  --title "Login API endpoint" \\
  --description "POST /api/auth/login with JWT response" \\
  --parent <story-id>
\`\`\`

### Manage dependencies

\`\`\`bash
devops-cli --project Sandbox wi update 12345 --block 12346
devops-cli --project Sandbox wi update 12345 --unblock 12346
\`\`\`
`;

export function registerSkill(program: Command): void {
  program
    .command("skill")
    .description("Output skill definition as JSON")
    .action(() => {
      const root = join(__dirname, "..", "..");
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));

      console.log(JSON.stringify({
        skill: {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          source: `${pkg.name} skill`,
        },
        files: [{ path: "SKILL.md", content: SKILL_MD }],
      }, null, 2));
    });
}
