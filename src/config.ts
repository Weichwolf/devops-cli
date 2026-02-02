export interface OrgConfig {
  pat: string;
  org: string;
}

export interface Config extends OrgConfig {
  project: string;
  baseUrl: string;
}

export function getConfig(options?: { project?: string }): Config {
  const pat = process.env.DEVOPS_CLI_PAT;
  if (!pat) {
    console.error("Error: DEVOPS_CLI_PAT environment variable is not set.");
    console.error("Set it to your Azure DevOps Personal Access Token.");
    process.exit(1);
  }

  const org = process.env.DEVOPS_CLI_ORG;
  if (!org) {
    console.error("Error: DEVOPS_CLI_ORG environment variable is not set.");
    console.error("Set it to your Azure DevOps organization name.");
    process.exit(1);
  }

  const project = options?.project ?? process.env.DEVOPS_CLI_PROJECT;
  if (!project) {
    console.error(
      "Error: No project specified. Use --project flag."
    );
    process.exit(1);
  }

  const encodedProject = encodeURIComponent(project);
  const baseUrl = `https://dev.azure.com/${org}/${encodedProject}/_apis`;

  return { pat, org, project, baseUrl };
}

export function getOrgConfig(): OrgConfig {
  const pat = process.env.DEVOPS_CLI_PAT;
  if (!pat) {
    console.error("Error: DEVOPS_CLI_PAT environment variable is not set.");
    console.error("Set it to your Azure DevOps Personal Access Token.");
    process.exit(1);
  }

  const org = process.env.DEVOPS_CLI_ORG;
  if (!org) {
    console.error("Error: DEVOPS_CLI_ORG environment variable is not set.");
    console.error("Set it to your Azure DevOps organization name.");
    process.exit(1);
  }

  return { pat, org };
}
