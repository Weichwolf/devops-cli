import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface WorkItemRelation {
  rel: string;
  url: string;
  attributes: { name: string };
}

interface WorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
  relations?: WorkItemRelation[];
}

interface WorkItemsBatchResponse {
  count: number;
  value: { id: number; fields: { "System.Title": string } }[];
}

interface ShowOptions {
  json?: boolean;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  "System.LinkTypes.Hierarchy-Forward": "Child",
  "System.LinkTypes.Hierarchy-Reverse": "Parent",
  "System.LinkTypes.Related": "Related",
  "System.LinkTypes.Dependency-Forward": "Successor",
  "System.LinkTypes.Dependency-Reverse": "Predecessor",
};

function extractIdFromUrl(url: string): number {
  const match = url.match(/workItems\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatDate(iso: unknown): string {
  if (typeof iso !== "string") return "";
  return iso.slice(0, 10);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function displayName(identity: unknown): string {
  if (typeof identity === "string") return identity;
  if (identity && typeof identity === "object" && "displayName" in identity) {
    return (identity as { displayName: string }).displayName;
  }
  return "";
}

export async function wiShow(
  client: DevOpsClient,
  _config: Config,
  id: string,
  opts: ShowOptions
): Promise<void> {
  const wi = await client.request<WorkItemResponse>(
    `/wit/workitems/${id}?$expand=relations`
  );

  if (opts.json) {
    console.log(JSON.stringify(wi, null, 2));
    return;
  }

  const f = wi.fields;
  const type = f["System.WorkItemType"] as string;
  const state = f["System.State"] as string;
  const title = f["System.Title"] as string;
  const assigned = displayName(f["System.AssignedTo"]);
  const created = formatDate(f["System.CreatedDate"]);
  const changed = formatDate(f["System.ChangedDate"]);
  const priority = f["Microsoft.VSTS.Common.Priority"] as number | undefined;
  const areaPath = f["System.AreaPath"] as string | undefined;
  const iterationPath = f["System.IterationPath"] as string | undefined;
  const tags = f["System.Tags"] as string | undefined;
  const description = f["System.Description"] as string | undefined;
  const acceptanceCriteria = f["Microsoft.VSTS.Common.AcceptanceCriteria"] as string | undefined;

  const tsv = (key: string, value: string) => console.log(`${key}\t${value}`);
  const collapseNewlines = (s: string) => stripHtml(s).replace(/\n/g, "\\n");

  tsv("id", String(wi.id));
  tsv("type", type);
  tsv("state", state);
  tsv("title", title);
  if (priority) tsv("priority", String(priority));
  if (areaPath) tsv("areaPath", areaPath);
  if (iterationPath) tsv("iterationPath", iterationPath);
  if (assigned) tsv("assigned", assigned);
  if (created) tsv("created", created);
  if (changed) tsv("changed", changed);
  if (tags) tsv("tags", tags);
  if (description) tsv("description", collapseNewlines(description));
  if (acceptanceCriteria) tsv("acceptanceCriteria", collapseNewlines(acceptanceCriteria));

  // Relations
  const relations = wi.relations?.filter((r) => r.rel in LINK_TYPE_LABELS);
  if (relations && relations.length > 0) {
    const relIds = relations.map((r) => extractIdFromUrl(r.url)).filter((id) => id > 0);

    const titleMap = new Map<number, string>();
    if (relIds.length > 0) {
      const batch = await client.request<WorkItemsBatchResponse>(
        "/wit/workitems?ids=" + relIds.join(",") + "&fields=System.Title"
      );
      for (const item of batch.value) {
        titleMap.set(item.id, item.fields["System.Title"]);
      }
    }

    for (const rel of relations) {
      const label = LINK_TYPE_LABELS[rel.rel] ?? rel.rel;
      const relId = extractIdFromUrl(rel.url);
      const relTitle = titleMap.get(relId) ?? "";
      console.log(`relation\t${label}\t${relId}\t${relTitle}`);
    }
  }
}

export function registerWiShow(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("show")
    .description("Show a work item")
    .argument("<id>", "Work item ID")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts: ShowOptions) => {
      const { client, config } = clientFactory();
      await wiShow(client, config, id, opts);
    });
}
