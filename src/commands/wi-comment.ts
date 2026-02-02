import { Command } from "commander";
import { DevOpsClient } from "../client.js";
import { Config } from "../config.js";

interface CommentResponse {
  id: number;
  text: string;
  createdBy: { displayName: string };
  createdDate: string;
}

interface CommentOptions {
  json?: boolean;
}

export async function wiComment(
  client: DevOpsClient,
  _config: Config,
  id: string,
  text: string,
  opts: CommentOptions
): Promise<void> {
  const result = await client.request<CommentResponse>(
    `/wit/workitems/${id}/comments`,
    "POST",
    { text },
    "application/json",
    "7.1-preview.4"
  );

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`comment\t${result.id}\t${id}\t${result.createdBy?.displayName ?? ""}`);
  }
}

export function registerWiComment(
  wi: Command,
  clientFactory: () => { client: DevOpsClient; config: Config }
): void {
  wi.command("comment")
    .description("Add a comment to a work item")
    .argument("<id>", "Work item ID")
    .argument("<text>", "Comment text")
    .option("--json", "Output raw JSON")
    .action(async (id: string, text: string, opts: CommentOptions) => {
      const { client, config } = clientFactory();
      await wiComment(client, config, id, text, opts);
    });
}
