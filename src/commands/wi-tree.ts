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
  value: WorkItemResponse[];
}

interface TreeNode {
  id: number;
  type: string;
  state: string;
  title: string;
  children: TreeNode[];
}

interface TreeOptions {
  json?: boolean;
  depth?: string;
}

function extractChildIds(relations: WorkItemRelation[] | undefined): number[] {
  if (!relations) return [];
  return relations
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => {
      const match = r.url.match(/workItems\/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((id) => id > 0);
}

async function fetchBatch(
  client: DevOpsClient,
  ids: number[]
): Promise<Map<number, WorkItemResponse>> {
  const map = new Map<number, WorkItemResponse>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const res = await client.request<WorkItemsBatchResponse>(
      `/wit/workitems?ids=${chunk.join(",")}&$expand=relations`
    );
    for (const wi of res.value) {
      map.set(wi.id, wi);
    }
  }
  return map;
}

async function buildTree(
  client: DevOpsClient,
  wi: WorkItemResponse,
  visited: Set<number>,
  maxDepth?: number,
  currentDepth: number = 0
): Promise<TreeNode> {
  visited.add(wi.id);
  const type = wi.fields["System.WorkItemType"] as string;
  const state = wi.fields["System.State"] as string;
  const title = wi.fields["System.Title"] as string;

  const node: TreeNode = { id: wi.id, type, state, title, children: [] };

  if (maxDepth !== undefined && currentDepth >= maxDepth) return node;

  const childIds = extractChildIds(wi.relations);
  if (childIds.length === 0) return node;

  const batch = await fetchBatch(client, childIds);
  for (const cid of childIds) {
    if (visited.has(cid)) continue;
    const childWi = batch.get(cid);
    if (childWi) {
      node.children.push(
        await buildTree(client, childWi, visited, maxDepth, currentDepth + 1)
      );
    }
  }

  return node;
}

function printNode(node: TreeNode, depth: number): void {
  const indent = "  ".repeat(depth);
  console.log(`${indent}${node.id}\t${node.type}\t${node.state}\t${node.title}`);
  for (const child of node.children) {
    printNode(child, depth + 1);
  }
}

export async function wiTree(
  client: DevOpsClient,
  _config: Config,
  id: string,
  opts: TreeOptions
): Promise<void> {
  const root = await client.request<WorkItemResponse>(
    `/wit/workitems/${id}?$expand=relations`
  );

  const maxDepth = opts.depth !== undefined ? parseInt(opts.depth, 10) : undefined;
  const tree = await buildTree(client, root, new Set<number>(), maxDepth);

  if (opts.json) {
    console.log(JSON.stringify(tree, null, 2));
  } else {
    printNode(tree, 0);
  }
}

export function registerWiTree(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("tree")
    .description("Show work item hierarchy")
    .argument("<id>", "Work item ID")
    .option("--json", "Output as JSON tree")
    .option("--depth <n>", "Limit tree depth")
    .action(async (id: string, opts: TreeOptions) => {
      const { client, config } = clientFactory();
      await wiTree(client, config, id, opts);
    });
}
