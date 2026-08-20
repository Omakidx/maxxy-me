import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const maintainedDocs = [
  "README.md",
  "ARCHITECTURE.md",
  "user-flow.md",
  "execution-phase.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/host-installation.md",
  "docs/vps-deployment.md",
  "docs/vps-backup-and-restore.md",
  "docs/github-app.md",
  "docs/recovery.md",
  "docs/troubleshooting.md",
  "docs/launch-readiness.md",
];

const failures: string[] = [];

for (const file of maintainedDocs) {
  if (!existsSync(file)) {
    failures.push(`Missing required document: ${file}`);
    continue;
  }

  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1]?.trim() ?? "";
    const target = rawTarget.replace(/^<|>$/g, "").split("#", 1)[0] ?? "";
    if (
      !target ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    const localPath = resolve(dirname(file), decodeURIComponent(target));
    if (!existsSync(localPath)) {
      failures.push(`${file}: broken local link ${rawTarget}`);
    }
  }
}

const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
for (const staleClaim of [
  "currently in the Phase 1 foundation",
  "active Phase 0 deployment spike",
]) {
  if (readme.includes(staleClaim)) {
    failures.push(`README.md contains stale claim: ${staleClaim}`);
  }
}

if (failures.length > 0) {
  console.error("Documentation check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Documentation check passed for ${maintainedDocs.length} maintained files.`,
);
