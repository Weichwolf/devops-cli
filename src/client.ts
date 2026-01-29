import https from "node:https";
import { Config } from "./config.js";

const API_VERSION = "7.1";

export class DevOpsClient {
  private readonly auth: string;
  private readonly baseUrl: string;

  constructor(private readonly config: Config) {
    this.auth =
      "Basic " + Buffer.from(`:${config.pat}`).toString("base64");
    this.baseUrl = config.baseUrl;
  }

  request<T = unknown>(
    path: string,
    method: string = "GET",
    body?: unknown,
    contentType: string = "application/json"
  ): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${this.baseUrl}${path}${separator}api-version=${API_VERSION}`;

    return new Promise<T>((resolve, reject) => {
      const req = https.request(url, {
        method,
        headers: {
          Authorization: this.auth,
          "Content-Type": contentType,
          Accept: "application/json",
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const status = res.statusCode ?? 0;

          if (status === 401) {
            console.error(`Error: 401 Unauthorized. Check DEVOPS_CLI_PAT.`);
            process.exit(1);
          }
          if (status === 403) {
            console.error(`Error: 403 Forbidden. PAT lacks required permissions.`);
            process.exit(1);
          }
          if (status === 404) {
            console.error(`Error: 404 Not Found. Check org/project/path.`);
            process.exit(1);
          }
          if (status < 200 || status >= 300) {
            console.error(`Error: API returned ${status}: ${raw}`);
            process.exit(1);
          }

          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`Failed to parse JSON response: ${raw}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
}
