import path from "node:path";

export const maxxyBranchPrefix = "maxxy";

export function slugForGitRef(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-./]+|[-./]+$/g, "")
    .slice(0, 120);
}

export function agentRoleForBranch(role: string | null | undefined) {
  return slugForGitRef(role || "backend") || "backend";
}

export function makeMaxxyBranchName(input: {
  taskId: string;
  agentRole?: string | null | undefined;
}) {
  return [
    maxxyBranchPrefix,
    slugForGitRef(input.taskId),
    agentRoleForBranch(input.agentRole),
  ].join("/");
}

export function makeMaxxyWorktreePath(input: {
  worktreeRoot: string;
  workspaceId: string;
  taskId: string;
  agentRole?: string | null | undefined;
}) {
  return path.join(
    input.worktreeRoot,
    slugForGitRef(input.workspaceId),
    `${slugForGitRef(input.taskId)}-${agentRoleForBranch(input.agentRole)}`,
  );
}

export function parseGitStatusChangedFiles(output: string) {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("##"))
    .map((line) => {
      const status = line.slice(0, 2).trim() || "?";
      const rawPath = line.slice(3).trim();
      const renamed = rawPath.includes(" -> ");
      const filePath = renamed
        ? (rawPath.split(" -> ").at(-1) ?? rawPath)
        : rawPath;
      return {
        status,
        path: filePath,
        previousPath: renamed ? rawPath.split(" -> ")[0] : undefined,
      };
    });
}

export function normalizeGitRemoteUrl(url: string) {
  return url
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function isProtectedBranchName(branchName: string) {
  return ["main", "master", "develop", "production"].includes(
    branchName.trim().toLowerCase(),
  );
}
