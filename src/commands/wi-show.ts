import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { OrgConfig } from "../config.js";

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
  comments?: boolean;
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
  _config: OrgConfig,
  id: string,
  opts: ShowOptions
): Promise<void> {
  const wi = await client.requestOrg<WorkItemResponse>(
    `/wit/workitems/${id}?$expand=relations`
  );

  if (opts.json) {
    console.log(JSON.stringify(wi, null, 2));
    return;
  }

  const f = wi.fields;
  const project = f["System.TeamProject"] as string;
  const type = f["System.WorkItemType"] as string;
  const state = f["System.State"] as string;
  const title = f["System.Title"] as string;
  const assigned = displayName(f["System.AssignedTo"]);
  const createdBy = displayName(f["System.CreatedBy"]);
  const created = formatDate(f["System.CreatedDate"]);
  const changed = formatDate(f["System.ChangedDate"]);
  const commentCount = f["System.CommentCount"] as number | undefined;
  const priority = f["Microsoft.VSTS.Common.Priority"] as number | undefined;
  const areaPath = f["System.AreaPath"] as string | undefined;
  const iterationPath = f["System.IterationPath"] as string | undefined;
  const tags = f["System.Tags"] as string | undefined;
  const description = f["System.Description"] as string | undefined;
  const acceptanceCriteria = f["Microsoft.VSTS.Common.AcceptanceCriteria"] as string | undefined;

  const tsv = (key: string, value: string) => console.log(`${key}\t${value}`);
  const collapseNewlines = (s: string) => stripHtml(s).replace(/\n/g, "\\n");

  tsv("id", String(wi.id));
  tsv("project", project);
  tsv("type", type);
  tsv("state", state);
  tsv("title", title);
  if (priority) tsv("priority", String(priority));
  if (areaPath) tsv("areaPath", areaPath);
  if (iterationPath) tsv("iterationPath", iterationPath);
  if (assigned) tsv("assigned", assigned);
  if (createdBy) tsv("createdBy", createdBy);
  if (created) tsv("created", created);
  if (changed) tsv("changed", changed);
  if (commentCount) tsv("comments", String(commentCount));
  if (tags) tsv("tags", tags);
  if (description) tsv("description", collapseNewlines(description));
  if (acceptanceCriteria) tsv("acceptanceCriteria", collapseNewlines(acceptanceCriteria));

  // Relations
  const relations = wi.relations?.filter((r) => r.rel in LINK_TYPE_LABELS);
  if (relations && relations.length > 0) {
    const relIds = relations.map((r) => extractIdFromUrl(r.url)).filter((id) => id > 0);

    const titleMap = new Map<number, string>();
    if (relIds.length > 0) {
      const batch = await client.requestOrg<WorkItemsBatchResponse>(
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

interface CommentsResponse {
  totalCount: number;
  count: number;
  comments: {
    id: number;
    text: string;
    createdBy: { displayName: string };
    createdDate: string;
  }[];
}

async function wiShowComments(
  client: DevOpsClient,
  id: string,
  opts: ShowOptions
): Promise<void> {
  const result = await client.requestOrg<CommentsResponse>(
    `/wit/workitems/${id}/comments?order=asc`,
    "GET",
    undefined,
    "application/json",
    "7.1-preview.4"
  );

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.comments.length === 0) {
    console.log("No comments.");
    return;
  }

  const collapseNewlines = (s: string) => stripHtml(s).replace(/\n/g, "\\n");

  for (const c of result.comments) {
    const date = c.createdDate?.slice(0, 10) ?? "";
    const author = c.createdBy?.displayName ?? "";
    const text = collapseNewlines(c.text);
    console.log(`${date}\t${author}\t${text}`);
  }
}

export function registerWiShow(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: OrgConfig }
): void {
  wi.command("show")
    .description("Show a work item")
    .argument("<id>", "Work item ID")
    .option("--comments", "Show comments instead of work item details")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts: ShowOptions) => {
      const { client, config } = clientFactory();
      if (opts.comments) {
        await wiShowComments(client, id, opts);
      } else {
        await wiShow(client, config, id, opts);
      }
    });
}
