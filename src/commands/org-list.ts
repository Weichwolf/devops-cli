import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { OrgConfig } from "../config.js";

interface WiqlResponse {
  workItems: { id: number }[];
}

interface WorkItemFields {
  "System.Id": number;
  "System.Title": string;
  "System.State": string;
  "System.WorkItemType": string;
  "System.TeamProject": string;
  "Microsoft.VSTS.Common.Priority": number;
}

interface WorkItemsBatchResponse {
  count: number;
  value: { id: number; fields: WorkItemFields }[];
}

interface OrgListOptions {
  state?: string;
  type?: string;
  assignedTo?: string;
  areaPath?: string;
  iteration?: string;
  since?: string;
  top?: string;
  json?: boolean;
}

interface OrgListRow {
  id: number;
  project: string;
  type: string;
  state: string;
  priority: number;
  title: string;
}

const FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
  "System.TeamProject",
  "Microsoft.VSTS.Common.Priority",
].join(",");

const BATCH_SIZE = 200;

const DEFAULT_SINCE = 90;

function buildWiql(opts: OrgListOptions): string {
  let query = "SELECT [System.Id] FROM WorkItems WHERE [System.State] <> ''";

  if (opts.state) {
    query += " AND [System.State] = '" + opts.state + "'";
  } else {
    query += " AND [System.State] NOT IN ('Closed', 'Removed', 'Done')";
  }

  const since = opts.since ? parseInt(opts.since, 10) : (opts.assignedTo ? 0 : DEFAULT_SINCE);
  if (since > 0) {
    query += ` AND [System.ChangedDate] >= @Today - ${since}`;
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

  query += " ORDER BY [Microsoft.VSTS.Common.Priority] ASC, [System.ChangedDate] DESC";

  return query;
}

export async function orgList(
  client: DevOpsClient,
  _config: OrgConfig,
  opts: OrgListOptions
): Promise<void> {
  const wiql = buildWiql(opts);
  const result = await client.requestOrg<WiqlResponse>(
    "/wit/wiql", "POST", { query: wiql }
  );

  let ids = result.workItems.map((w) => w.id);

  if (ids.length === 0) {
    if (opts.json) {
      console.log("[]");
    } else {
      console.log("No work items found.");
    }
    return;
  }

  if (opts.top) {
    ids = ids.slice(0, parseInt(opts.top, 10));
  }

  const rows: OrgListRow[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const batch = await client.requestOrg<WorkItemsBatchResponse>(
      "/wit/workitems?ids=" + chunk.join(",") + "&fields=" + FIELDS
    );

    for (const wi of batch.value) {
      rows.push({
        id: wi.fields["System.Id"],
        project: wi.fields["System.TeamProject"],
        type: wi.fields["System.WorkItemType"],
        state: wi.fields["System.State"],
        priority: wi.fields["Microsoft.VSTS.Common.Priority"] ?? 0,
        title: wi.fields["System.Title"],
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log("No work items found.");
    return;
  }

  console.log("ID\tProject\tType\tState\tPri\tTitle");
  for (const row of rows) {
    console.log(
      row.id + "\t" + row.project + "\t" + row.type + "\t" +
      row.state + "\t" + row.priority + "\t" + row.title
    );
  }

  console.log("");
  console.log(rows.length + " item(s)");
}

export function registerOrgList(
  org: Command,
  clientFactory: () => { client: DevOpsClient; config: OrgConfig }
): void {
  org.command("list")
    .description("List work items across all projects")
    .option("--state <state>", "Filter by state")
    .option("--type <type>", "Filter by work item type")
    .option("--assigned-to <name>", 'Filter by assigned user ("me" for yourself)')
    .option("--area-path <path>", "Filter by area path (UNDER)")
    .option("--iteration <path>", "Filter by iteration path (UNDER)")
    .option("--since <days>", "Changed within N days (default: 90)")
    .option("--top <n>", "Limit output to first N items")
    .option("--json", "Output as JSON array")
    .action(async (opts: OrgListOptions) => {
      const { client, config } = clientFactory();
      await orgList(client, config, opts);
    });
}
