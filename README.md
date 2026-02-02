# devops-cli

CLI for Azure DevOps Work Items. Read and write your backlog via REST API.

Built as a tool for AI coding agents (Claude Code, etc.) to autonomously manage work items — but works fine for humans too.

## Install

```bash
npm install
npm run build
npm link        # makes 'devops-cli' available globally
```

Requires Node.js 18+.

## Setup

```bash
export DEVOPS_CLI_ORG="your-organization"
export DEVOPS_CLI_PAT="your-personal-access-token"   # Scope: Work Items R/W
```

## Commands

All output is TSV by default. Add `--json` to any command for JSON output.

### Project-level (requires `--project`)

```bash
devops-cli --project MyProject wi <command>
```

#### List work items

```bash
wi list [--state <s>] [--type <t>] [--assigned-to <name>] [--parent <id>] \
        [--area-path <p>] [--iteration <p>] [--top <n>] [--json]
```

#### Show a work item

```bash
wi show <id> [--comments] [--json]
```

`--comments` fetches the comment thread instead of work item details.

#### Comment on a work item

```bash
wi comment <id> <text> [--json]
```

#### Create a work item

```bash
wi create --type <t> --title <title> --description <desc> \
          [--acceptance-criteria <ac>] [--parent <id>] [--block <id>] \
          [--area-path <p>] [--iteration <p>] [--tags <csv>] [--json]
```

`--description` is required for all types. `--acceptance-criteria` is required for User Stories.

#### Update work items

```bash
wi update <id[,id,...]> [--state <s>] [--title <t>] [--assign <name>] \
          [--tags <csv>] [--description <d>] [--acceptance-criteria <ac>] \
          [--area-path <p>] [--iteration <p>] \
          [--block <id>] [--unblock <id>] [--json]
```

Accepts comma-separated IDs for batch updates.

#### Tree view

```bash
wi tree <id> [--depth <n>] [--json]
```

#### WIQL query

```bash
wi query "<wiql>" [--json]
```

### Org-level (no `--project` needed)

Cross-project commands that query the entire organization.

#### Status overview

```bash
org status [--by area|iteration] [--state <s>] [--assigned-to <name>] \
           [--since <days>] [--json]
```

Aggregated view: work item type counts per project (or area/iteration), newest change date per group. Default: open items changed within 90 days. The `--since` default is skipped when `--assigned-to` is set.

#### List across projects

```bash
org list [--state <s>] [--type <t>] [--assigned-to <name>] \
         [--area-path <p>] [--iteration <p>] [--since <days>] \
         [--top <n>] [--json]
```

Like `wi list` but across all projects. Includes project and priority columns. Same `--since` behavior as `org status`.

## API

Azure DevOps REST API v7.1. Comments use v7.1-preview.4. Auth via Basic Auth (`:PAT`).

## Stack

TypeScript, Node.js, [Commander](https://github.com/tj/commander.js). No other runtime dependencies.

## License

MIT
