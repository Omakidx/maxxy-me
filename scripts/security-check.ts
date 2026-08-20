import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];
const warnings: string[] = [];

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file: string, needle: string, message: string) {
  if (!read(file).includes(needle)) failures.push(message);
}

function assertMatches(file: string, pattern: RegExp, message: string) {
  if (!pattern.test(read(file))) failures.push(message);
}

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if ([".git", "node_modules", ".next", "dist", "coverage"].includes(entry))
      continue;
    const absolute = path.join(dir, entry);
    const relative = path.relative(root, absolute);
    const stat = statSync(absolute);
    if (stat.isDirectory()) walk(absolute, files);
    else files.push(relative);
  }
  return files;
}

for (const file of walk(root)) {
  if (file === "scripts/security-check.ts") continue;
  const body = read(file);
  if (body.includes("/var/run/docker.sock") || body.includes("docker.sock:")) {
    failures.push(`${file} references the Docker socket`);
  }
}

assertMatches(
  "Dockerfile",
  /^FROM\s+oven\/bun:1\.3\.14-alpine\s+AS\s+base/m,
  "Dockerfile must use the pinned Bun base image tag",
);
assertMatches(
  "compose.yaml",
  /^\s+postgres:\n(?:.|\n)*?^\s{4}image: postgres:17\.5-alpine/m,
  "PostgreSQL image must use a pinned major/minor tag",
);
assertIncludes(
  "compose.production.yaml",
  "APP_IMAGE_DIGEST:?set immutable image digest",
  "Production services must require immutable image digests",
);
assertMatches(
  "compose.production.yaml",
  /^\s{2}postgres:\n(?:.|\n)*?^\s{4}ports: \[\]/m,
  "Production PostgreSQL must not publish ports",
);
assertIncludes(
  "compose.production.yaml",
  "read_only: true",
  "Production app services must be read-only",
);
assertIncludes(
  "compose.production.yaml",
  "no-new-privileges:true",
  "Production app services must set no-new-privileges",
);

for (const [file, token] of [
  ["Caddyfile", "Content-Security-Policy"],
  ["Caddyfile", "Strict-Transport-Security"],
  ["Caddyfile", 'X-Frame-Options "DENY"'],
  ["Caddyfile", "request_body"],
  ["Caddyfile", "Authorization delete"],
  ["Caddyfile", "Cookie delete"],
  ["Caddyfile", "-Server"],
] as const)
  assertIncludes(file, token, `${file} missing ${token}`);

assertIncludes(
  "apps/host-agent/src/config.ts",
  "MAXXY_DENIED_COMMANDS",
  "Host agent must expose a command deny list",
);
assertIncludes(
  "apps/host-agent/src/command-runner.ts",
  "deniedCommands.has",
  "command.run must check the deny list",
);
assertIncludes(
  "apps/host-agent/src/command-runner.ts",
  "MAXXY_OUTPUT_MAX_BYTES",
  "command output must be capped",
);
assertIncludes(
  "apps/host-agent/src/command-runner.ts",
  "MAXXY_COMMAND_TIMEOUT_MS",
  "commands must have a maximum runtime",
);
assertIncludes(
  "apps/host-agent/src/command-runner.ts",
  "process.env.PATH",
  "command environment must be explicitly filtered",
);
assertIncludes(
  "apps/host-agent/src/paths.ts",
  "Path is outside configured roots",
  "host paths must be restricted to allowed roots",
);

assertIncludes(
  "deploy/systemd/maxxy-host.service",
  "User=maxxy-host",
  "host-agent service must run as a dedicated non-root user",
);
assertIncludes(
  "deploy/systemd/maxxy-host.service",
  "NoNewPrivileges=true",
  "host-agent service must set NoNewPrivileges",
);
assertIncludes(
  "deploy/systemd/maxxy-host.service",
  "ProtectSystem=strict",
  "host-agent service must protect the host filesystem",
);
assertIncludes(
  "deploy/systemd/maxxy-host.service",
  "ProtectHome=true",
  "host-agent service must protect home directories",
);
assertIncludes(
  "deploy/systemd/maxxy-backup.service",
  "NoNewPrivileges=true",
  "backup service must set NoNewPrivileges",
);
assertIncludes(
  "scripts/backup-postgres.sh",
  "age --encrypt",
  "database backups must be encrypted before transfer",
);
assertIncludes(
  "docs/production-vps-runbook.md",
  "ufw default deny incoming",
  "runbook must document default-deny firewall setup",
);
assertIncludes(
  "docs/production-vps-runbook.md",
  "PermitRootLogin no",
  "runbook must document disabled direct root SSH login",
);
assertIncludes(
  "docs/production-vps-runbook.md",
  "nmap",
  "runbook must document external port scan verification",
);

const envExamples = walk(root).filter(
  (file) => file.endsWith(".example") || file.endsWith(".env.example"),
);
for (const file of envExamples) {
  const body = read(file);
  if (
    /sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|postgres:\/\/[^\n]*:[^\n]*(?:prod|live|real|secret)[^\n]*@/i.test(
      body,
    )
  ) {
    failures.push(`${file} appears to contain a real credential`);
  }
}

if (
  !read("docs/security-hardening.md").includes(
    "complete loss of the single VPS",
  )
) {
  failures.push("Threat model must cover complete VPS loss");
}

if (!/Live VPS Evidence Required/i.test(read("docs/security-hardening.md"))) {
  warnings.push(
    "Phase 13 docs should explicitly separate live VPS evidence from repo checks",
  );
}

const result = {
  status: failures.length === 0 ? "passed" : "failed",
  checkedAt: new Date().toISOString(),
  failures,
  warnings,
};
console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) process.exit(1);
