import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface WiqlFlatResponse {
  workItems: { id: number }[];
}

interface WiqlLinkResponse {
  workItemRelations: {
    source: { id: number } | null;
    target: { id: number };
    rel: string | null;
  }[];
}

type WiqlResponse = WiqlFlatResponse | WiqlLinkResponse;

interface WorkItemField {
  "System.Id": number;
  "System.Title": string;
  "System.State": string;
  "System.WorkItemType": string;
}

interface WorkItemsBatchResponse {
  count: number;
  value: { id: number; fields: WorkItemField }[];
}

interface WorkItemRow {
  id: number;
  type: string;
  state: string;
  title: string;
}

interface QueryOptions {
  json?: boolean;
}

const FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.WorkItemType",
].join(",");

const CHUNK_SIZE = 200;

export async function wiQuery(
  client: DevOpsClient,
  _config: Config,
  wiql: string,
  opts: QueryOptions
): Promise<void> {
  const result = await client.request<WiqlResponse>(
    "/wit/wiql",
    "POST",
    { query: wiql }
  );

  const allIds = "workItems" in result
    ? result.workItems.map((w) => w.id)
    : [...new Set(
        result.workItemRelations
          .filter((r) => r.source === null)
          .map((r) => r.target.id)
      )];

  if (allIds.length === 0) {
    if (opts.json) {
      console.log("[]");
    } else {
      console.log("No work items found.");
    }
    return;
  }

  const rows: WorkItemRow[] = [];

  for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
    const chunk = allIds.slice(i, i + CHUNK_SIZE);
    const details = await client.request<WorkItemsBatchResponse>(
      "/wit/workitems?ids=" + chunk.join(",") + "&fields=" + FIELDS
    );
    for (const wi of details.value) {
      rows.push({
        id: wi.fields["System.Id"],
        type: wi.fields["System.WorkItemType"],
        state: wi.fields["System.State"],
        title: wi.fields["System.Title"],
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log("ID\tType\tState\tTitle");
    for (const row of rows) {
      console.log(row.id + "\t" + row.type + "\t" + row.state + "\t" + row.title);
    }
    console.log("");
    console.log(rows.length + " item(s)");
  }
}

export function registerWiQuery(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("query")
    .description("Execute a raw WIQL query")
    .argument("<wiql>", "Full WIQL query string")
    .option("--json", "Output as JSON array")
    .action(async (wiql: string, opts: QueryOptions) => {
      const { client, config } = clientFactory();
      await wiQuery(client, config, wiql, opts);
    });
}
