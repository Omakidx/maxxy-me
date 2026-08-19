import { describe, expect, test } from "bun:test";
import {
  makeMaxxyBranchName,
  makeMaxxyWorktreePath,
  normalizeGitRemoteUrl,
  parseGitStatusChangedFiles,
} from "./index";

describe("git helpers", () => {
  test("builds stable maxxy branch and worktree names", () => {
    expect(
      makeMaxxyBranchName({ taskId: "task_123", agentRole: "backend" }),
    ).toBe("maxxy/task_123/backend");
    expect(
      makeMaxxyWorktreePath({
        worktreeRoot: "/tmp/worktrees",
        workspaceId: "ws_123",
        taskId: "task_123",
        agentRole: "backend",
      }),
    ).toBe("/tmp/worktrees/ws_123/task_123-backend");
  });

  test("parses changed files from porcelain status", () => {
    expect(
      parseGitStatusChangedFiles(
        "## main...origin/main\n M README.md\nR  old.ts -> src/new.ts\n?? notes.md\n",
      ),
    ).toEqual([
      { status: "M", path: "README.md", previousPath: undefined },
      { status: "R", path: "src/new.ts", previousPath: "old.ts" },
      { status: "??", path: "notes.md", previousPath: undefined },
    ]);
  });

  test("normalizes common GitHub remote URL forms", () => {
    expect(normalizeGitRemoteUrl("git@github.com:Owner/Repo.git")).toBe(
      "https://github.com/owner/repo",
    );
    expect(normalizeGitRemoteUrl("https://github.com/Owner/Repo/")).toBe(
      "https://github.com/owner/repo",
    );
  });
});
