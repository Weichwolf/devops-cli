# devops-cli

CLI for Azure DevOps Work Items. Read and write your backlog via REST API.

Built as a tool for AI coding agents (Claude Code, etc.) to autonomously manage work items — but works fine for humans too.

## Install

```bash
npm install
npm run build
npm link
```

Requires Node.js 18+.

## Setup

Set environment variables:

```bash
export DEVOPS_CLI_ORG="your-organization"
export DEVOPS_CLI_PAT="your-personal-access-token"
```

The PAT needs **Work Items Read/Write** scope.

## Usage

All commands live under `devops-cli wi` and require `--project`:

```bash
devops-cli --project MyProject wi <command>
```

### List work items

```bash
wi list [--state <s>] [--type <t>] [--assigned-to <name>] [--parent <id>] [--area-path <p>] [--iteration <p>] [--top <n>]
```

### Show a work item

```bash
wi show <id>
```

### Create a work item

```bash
wi create --type <t> --title <title> --description <desc> [--acceptance-criteria <ac>] [--parent <id>] [--block <id>] [--tags <csv>]
```

`--description` is required for all types. `--acceptance-criteria` is required for User Stories.

### Update work items

```bash
wi update <id,id,...> [--state <s>] [--title <t>] [--assign <name>] [--tags <csv>] [--description <d>] [--acceptance-criteria <ac>] [--block <id>] [--unblock <id>]
```

Accepts comma-separated IDs for batch updates.

### Tree view

```bash
wi tree <id> [--depth <n>]
```

### WIQL query

```bash
wi query "<wiql>"
```

### Output format

All commands output TSV by default. Add `--json` for JSON.

## Stack

TypeScript, Node.js, [Commander](https://github.com/tj/commander.js). No other runtime dependencies.

## License

MIT
