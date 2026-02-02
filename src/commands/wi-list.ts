import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface WiqlResponse {
  workItems: { id: number }[];
}

interface WiqlLinkResponse {
  workItemRelations: {
    source: { id: number } | null;
    target: { id: number };
  }[];
}

interface WorkItemField {
  "System.Id": number;
  "System.Title": string;
  "System.State": string;
  "System.WorkItemType": string;
  "Microsoft.VSTS.Common.Priority": number;
}

interface WorkItemsBatchResponse {
  count: number;
  value: { id: number; fields: WorkItemField }[];
}

interface WorkItemRow {
  id: number;
  type: string;
  state: string;
  priority: number;
  title: string;
}

interface ListOptions {
  state?: string;
  type?: string;
  assignedTo?: string;
  areaPath?: string;
  iteration?: string;
  parent?: string;
  json?: boolean;
  top?: string;
}

const FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "Microsoft.VSTS.Common.Priority",
].join(",");

const BATCH_SIZE = 200;

function buildWiql(opts: ListOptions): string {
  let query =
    "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project";

  if (opts.state) {
    query += " AND [System.State] = '" + opts.state + "'";
  }
  if (opts.type) {
    query += " AND [System.WorkItemType] = '" + opts.type + "'";
  }
  if (opts.assignedTo) {
    const value =
      opts.assignedTo.toLowerCase() === "me"
        ? "@me"
        : "'" + opts.assignedTo + "'";
    query += " AND [System.AssignedTo] = " + value;
  }
  if (opts.areaPath) {
    query += " AND [System.AreaPath] UNDER '" + opts.areaPath + "'";
  }
  if (opts.iteration) {
    query += " AND [System.IterationPath] UNDER '" + opts.iteration + "'";
  }

  return query;
}

function printTable(items: WorkItemRow[]): void {
  if (items.length === 0) {
    console.log("No work items found.");
    return;
  }

  console.log("ID\tType\tState\tPri\tTitle");
  for (const item of items) {
    console.log(item.id + "\t" + item.type + "\t" + item.state + "\t" + item.priority + "\t" + item.title);
  }

  console.log("");
  console.log(items.length + " item(s)");
}

export async function wiList(
  client: DevOpsClient,
  config: Config,
  opts: ListOptions
): Promise<void> {
  let ids: number[];

  if (opts.parent) {
    const parentId = parseInt(opts.parent, 10);
    const linkWiql =
      "SELECT [System.Id] FROM WorkItemLinks" +
      " WHERE ([Source].[System.Id] = " + parentId + ")" +
      " AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')" +
      " MODE (MustContain)";
    const linkResult = await client.request<WiqlLinkResponse>(
      "/wit/wiql", "POST", { query: linkWiql }
    );
    ids = linkResult.workItemRelations
      .filter((r) => r.source !== null)
      .map((r) => r.target.id);
  } else {
    const wiql = buildWiql(opts);
    const result = await client.request<WiqlResponse>(
      "/wit/wiql", "POST", { query: wiql }
    );
    ids = result.workItems.map((w) => w.id);
  }

  if (ids.length === 0) {
    if (opts.json) {
      console.log("[]");
    } else {
      console.log("No work items found.");
    }
    return;
  }

  const allRows: WorkItemRow[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const details = await client.request<WorkItemsBatchResponse>(
      "/wit/workitems?ids=" + chunk.join(",") + "&fields=" + FIELDS
    );
    for (const wi of details.value) {
      allRows.push({
        id: wi.fields["System.Id"],
        type: wi.fields["System.WorkItemType"],
        state: wi.fields["System.State"],
        priority: wi.fields["Microsoft.VSTS.Common.Priority"] ?? 0,
        title: wi.fields["System.Title"],
      });
    }
  }

  let rows = allRows;

  if (opts.parent) {
    if (opts.state) {
      rows = rows.filter((r) => r.state === opts.state);
    }
    if (opts.type) {
      rows = rows.filter((r) => r.type === opts.type);
    }
  }

  if (opts.top) {
    rows.splice(parseInt(opts.top, 10));
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    printTable(rows);
  }
}

export function registerWiList(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("list")
    .description("List work items")
    .option("--state <state>", "Filter by state (e.g. Active, Closed)")
    .option("--type <type>", "Filter by work item type (e.g. Bug, Task)")
    .option(
      "--assigned-to <name>",
      'Filter by assigned user ("me" for yourself)'
    )
    .option("--area-path <path>", "Filter by area path (UNDER)")
    .option("--iteration <path>", "Filter by iteration path (UNDER)")
    .option("--parent <id>", "List children of work item")
    .option("--top <n>", "Limit output to first N items")
    .option("--json", "Output as JSON array")
    .action(async (opts: ListOptions) => {
      const { client, config } = clientFactory();
      await wiList(client, config, opts);
    });
}
