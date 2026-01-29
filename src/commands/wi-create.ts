import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface JsonPatchOp {
  op: "add";
  path: string;
  value: unknown;
}

interface CreateOptions {
  type: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  parent?: string;
  block?: string;
  tags?: string;
  json?: boolean;
}

interface WorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
}

function buildPatchBody(config: Config, opts: CreateOptions): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [
    { op: "add", path: "/fields/System.Title", value: opts.title },
  ];

  ops.push({
    op: "add",
    path: "/fields/System.Description",
    value: opts.description,
  });

  if (opts.acceptanceCriteria) {
    ops.push({
      op: "add",
      path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
      value: opts.acceptanceCriteria,
    });
  }

  if (opts.tags) {
    const normalized = opts.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .join("; ");
    ops.push({ op: "add", path: "/fields/System.Tags", value: normalized });
  }

  if (opts.parent) {
    const parentId = parseInt(opts.parent, 10);
    if (isNaN(parentId) || parentId <= 0) {
      console.error(`Error: Invalid parent ID "${opts.parent}".`);
      process.exit(1);
    }
    ops.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `https://dev.azure.com/${config.org}/_apis/wit/workItems/${parentId}`,
      },
    });
  }

  if (opts.block) {
    const blockId = parseInt(opts.block, 10);
    if (isNaN(blockId) || blockId <= 0) {
      console.error(`Error: Invalid block ID "${opts.block}".`);
      process.exit(1);
    }
    ops.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Dependency-Forward",
        url: `https://dev.azure.com/${config.org}/_apis/wit/workItems/${blockId}`,
      },
    });
  }

  return ops;
}

export async function wiCreate(
  client: DevOpsClient,
  config: Config,
  opts: CreateOptions
): Promise<void> {
  if (opts.type === "User Story" && !opts.acceptanceCriteria) {
    console.error("Error: --acceptance-criteria is required for User Story.");
    process.exit(1);
  }

  const encodedType = encodeURIComponent(opts.type);
  const path = `/wit/workitems/$${encodedType}`;
  const body = buildPatchBody(config, opts);

  const wi = await client.request<WorkItemResponse>(
    path,
    "POST",
    body,
    "application/json-patch+json"
  );

  if (opts.json) {
    console.log(JSON.stringify(wi, null, 2));
  } else {
    const title = wi.fields["System.Title"] as string;
    console.log(`Created #${wi.id}: ${title}`);
  }
}

export function registerWiCreate(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("create")
    .description("Create a work item")
    .requiredOption("--type <type>", "Work item type (Bug, User Story, Task, Feature, Epic)")
    .requiredOption("--title <title>", "Work item title")
    .requiredOption("--description <desc>", "Work item description")
    .option("--acceptance-criteria <criteria>", "Acceptance criteria (required for User Story)")
    .option("--parent <id>", "Parent work item ID")
    .option("--block <id>", "Block another work item (set dependency)")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output raw JSON")
    .action(async (opts: CreateOptions) => {
      const { client, config } = clientFactory();
      await wiCreate(client, config, opts);
    });
}
