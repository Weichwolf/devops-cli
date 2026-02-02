import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { OrgConfig } from "../config.js";

interface WiqlResponse {
  workItems: { id: number }[];
}

interface WorkItemFields {
  "System.WorkItemType": string;
  "System.TeamProject": string;
  "System.AreaPath": string;
  "System.IterationPath": string;
  "System.ChangedDate": string;
}

interface WorkItemsBatchResponse {
  count: number;
  value: { id: number; fields: WorkItemFields }[];
}

interface StatusOptions {
  by?: string;
  state?: string;
  assignedTo?: string;
  since?: string;
  top?: string;
  json?: boolean;
}

interface GroupRow {
  group: string;
  counts: Record<string, number>;
  total: number;
  newest: string;
}

const FIELDS = [
  "System.WorkItemType",
  "System.TeamProject",
  "System.AreaPath",
  "System.IterationPath",
  "System.ChangedDate",
].join(",");

const BATCH_SIZE = 200;

const DEFAULT_SINCE = 90;

function buildWiql(opts: StatusOptions): string {
  const since = opts.since ? parseInt(opts.since, 10) : DEFAULT_SINCE;
  let query = "SELECT [System.Id] FROM WorkItems WHERE [System.State] <> ''";

  if (opts.state) {
    query += " AND [System.State] = '" + opts.state + "'";
  } else {
    query += " AND [System.State] NOT IN ('Closed', 'Removed', 'Done')";
  }

  if (opts.assignedTo) {
    const value =
      opts.assignedTo.toLowerCase() === "me"
        ? "@me"
        : "'" + opts.assignedTo + "'";
    query += " AND [System.AssignedTo] = " + value;
  }

  query += ` AND [System.ChangedDate] >= @Today - ${since}`;

  return query;
}

function groupKey(fields: WorkItemFields, by?: string): string {
  if (by === "area") return fields["System.AreaPath"];
  if (by === "iteration") return fields["System.IterationPath"];
  return fields["System.TeamProject"];
}

export async function orgStatus(
  client: DevOpsClient,
  _config: OrgConfig,
  opts: StatusOptions
): Promise<void> {
  const wiql = buildWiql(opts);
  const result = await client.requestOrg<WiqlResponse>(
    "/wit/wiql", "POST", { query: wiql }
  );

  const ids = result.workItems.map((w) => w.id);

  if (ids.length === 0) {
    if (opts.json) {
      console.log("[]");
    } else {
      console.log("No work items found.");
    }
    return;
  }

  const groups = new Map<string, GroupRow>();
  const allTypes = new Set<string>();

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const batch = await client.requestOrg<WorkItemsBatchResponse>(
      "/wit/workitems?ids=" + chunk.join(",") + "&fields=" + FIELDS
    );

    for (const wi of batch.value) {
      const key = groupKey(wi.fields, opts.by);
      const type = wi.fields["System.WorkItemType"];
      const changed = wi.fields["System.ChangedDate"]?.slice(0, 10) ?? "";

      allTypes.add(type);

      let row = groups.get(key);
      if (!row) {
        row = { group: key, counts: {}, total: 0, newest: "" };
        groups.set(key, row);
      }

      row.counts[type] = (row.counts[type] ?? 0) + 1;
      row.total++;
      if (changed > row.newest) row.newest = changed;
    }
  }

  const rows = [...groups.values()].sort((a, b) => a.group.localeCompare(b.group));
  const types = [...allTypes].sort();

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const header = ["group", ...types, "total", "newest"].join("\t");
  console.log(header);
  for (const row of rows) {
    const typeCounts = types.map((t) => String(row.counts[t] ?? 0));
    console.log([row.group, ...typeCounts, String(row.total), row.newest].join("\t"));
  }

  console.log("");
  const since = opts.since ? parseInt(opts.since, 10) : DEFAULT_SINCE;
  console.log(ids.length + " item(s) in " + rows.length + " group(s) (changed within " + since + " days)");
}

export function registerOrgStatus(
  org: Command,
  clientFactory: () => { client: DevOpsClient; config: OrgConfig }
): void {
  org.command("status")
    .description("Org-wide work item status overview")
    .option("--by <grouping>", "Group by: area, iteration (default: project)")
    .option("--state <state>", "Filter by state")
    .option("--assigned-to <name>", 'Filter by assigned user ("me" for yourself)')
    .option("--since <days>", "Changed within N days (default: 90)")
    .option("--json", "Output as JSON")
    .action(async (opts: StatusOptions) => {
      const { client, config } = clientFactory();
      await orgStatus(client, config, opts);
    });
}
