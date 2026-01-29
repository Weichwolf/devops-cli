import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface JsonPatchOp {
  op: "add" | "replace" | "remove" | "test";
  path: string;
  value?: unknown;
}

interface UpdateOptions {
  state?: string;
  title?: string;
  assign?: string;
  tags?: string;
  description?: string;
  acceptanceCriteria?: string;
  block?: string;
  unblock?: string;
  json?: boolean;
}

interface WorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
  relations?: { rel: string; url: string }[];
}

function buildFieldOps(opts: UpdateOptions): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];

  if (opts.state) {
    ops.push({ op: "replace", path: "/fields/System.State", value: opts.state });
  }
  if (opts.title) {
    ops.push({ op: "replace", path: "/fields/System.Title", value: opts.title });
  }
  if (opts.assign) {
    ops.push({ op: "replace", path: "/fields/System.AssignedTo", value: opts.assign });
  }
  if (opts.tags) {
    const normalized = opts.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .join("; ");
    ops.push({ op: "replace", path: "/fields/System.Tags", value: normalized });
  }
  if (opts.description) {
    ops.push({ op: "replace", path: "/fields/System.Description", value: opts.description });
  }
  if (opts.acceptanceCriteria) {
    ops.push({ op: "replace", path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria", value: opts.acceptanceCriteria });
  }

  return ops;
}

export async function wiUpdate(
  client: DevOpsClient,
  config: Config,
  idArg: string,
  opts: UpdateOptions
): Promise<void> {
  const fieldOps = buildFieldOps(opts);
  const hasRelationOps = !!(opts.block || opts.unblock);

  if (fieldOps.length === 0 && !hasRelationOps) {
    console.error("Error: No update options specified. Use --state, --title, --assign, --tags, --description, --acceptance-criteria, --block, or --unblock.");
    process.exit(1);
  }

  const ids = idArg.split(",").map((s) => s.trim()).filter(Boolean);
  const results: WorkItemResponse[] = [];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const ops: JsonPatchOp[] = [...fieldOps];

      if (opts.block) {
        const blockId = parseInt(opts.block, 10);
        if (isNaN(blockId) || blockId <= 0) {
          console.error(`Error: Invalid block ID "${opts.block}".`);
          process.exit(1);
        }
        ops.push({
          op: "add" as const,
          path: "/relations/-",
          value: {
            rel: "System.LinkTypes.Dependency-Forward",
            url: `https://dev.azure.com/${config.org}/_apis/wit/workItems/${blockId}`,
          },
        });
      }

      if (opts.unblock) {
        const unblockId = parseInt(opts.unblock, 10);
        if (isNaN(unblockId) || unblockId <= 0) {
          console.error(`Error: Invalid unblock ID "${opts.unblock}".`);
          process.exit(1);
        }
        const current = await client.request<WorkItemResponse>(
          `/wit/workitems/${id}?$expand=relations`
        );
        const relIndex = current.relations?.findIndex(
          (r) => r.rel === "System.LinkTypes.Dependency-Forward" && r.url.endsWith(`/workItems/${unblockId}`)
        );
        if (relIndex !== undefined && relIndex >= 0) {
          ops.push({ op: "remove" as const, path: `/relations/${relIndex}` });
        } else {
          console.error(`Error: No dependency link to #${unblockId} found.`);
        }
      }

      if (ops.length === 0) continue;

      const wi = await client.request<WorkItemResponse>(
        `/wit/workitems/${id}`,
        "PATCH",
        ops,
        "application/json-patch+json"
      );
      results.push(wi);

      if (!opts.json) {
        const title = wi.fields["System.Title"] as string;
        const state = wi.fields["System.State"] as string;
        console.log(`updated\t${wi.id}\t${state}\t${title}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`#${id}: ${msg}`);
      console.error(`Error updating #${id}: ${msg}`);
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ results, errors }, null, 2));
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

export function registerWiUpdate(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("update")
    .description("Update a work item")
    .argument("<id>", "Work item ID")
    .option("--state <state>", "Set state")
    .option("--title <title>", "Set title")
    .option("--assign <name>", "Set assigned to")
    .option("--tags <tags>", "Set tags (comma-separated)")
    .option("--description <desc>", "Set description")
    .option("--acceptance-criteria <criteria>", "Set acceptance criteria")
    .option("--block <id>", "Add dependency (this blocks given ID)")
    .option("--unblock <id>", "Remove dependency to given ID")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts: UpdateOptions) => {
      const { client, config } = clientFactory();
      await wiUpdate(client, config, id, opts);
    });
}
