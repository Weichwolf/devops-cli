import { Command } from "commander";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";

function collectFiles(dir: string, base: string = dir): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({
        path: relative(base, full),
        content: readFileSync(full, "utf-8"),
      });
    }
  }
  return files;
}

export function registerSkill(program: Command): void {
  program
    .command("skill")
    .description("Output skill definition as JSON")
    .action(() => {
      const root = join(__dirname, "..", "..");
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
      const skillDir = join(root, ".claude", "skills", pkg.name);

      if (!existsSync(skillDir)) {
        console.error(`No skill directory: ${skillDir}`);
        process.exit(1);
      }

      console.log(JSON.stringify({
        skill: {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          source: `${pkg.name} skill`,
        },
        files: collectFiles(skillDir),
      }, null, 2));
    });
}
