import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PathGuard } from "./paths";

describe("host-agent path guard", () => {
  test("rejects project paths outside configured roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-paths-"));
    const guard = new PathGuard({
      projectRoot: path.join(root, "projects"),
      worktreeRoot: path.join(root, "worktrees"),
    });
    await guard.ensureRoots();

    expect(() =>
      guard.resolveProjectPath(path.join(root, "projects/app")),
    ).not.toThrow();
    expect(() =>
      guard.resolveProjectPath(path.join(root, "worktrees/task-1")),
    ).not.toThrow();
    expect(() =>
      guard.resolveProjectPath(path.join(root, "../escape")),
    ).toThrow();
  });

  test("resolves relative paths inside the configured roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-relative-paths-"));
    const projectRoot = path.join(root, "projects");
    const worktreeRoot = path.join(root, "worktrees");
    const guard = new PathGuard({ projectRoot, worktreeRoot });
    await guard.ensureRoots();

    expect(guard.resolveRepositoryPath("repo-a")).toBe(
      path.join(projectRoot, "repo-a"),
    );
    expect(guard.resolveWorktreePath("task-a")).toBe(
      path.join(worktreeRoot, "task-a"),
    );
    expect(() => guard.resolveRepositoryPath("../escape")).toThrow();
    expect(() => guard.resolveWorktreePath("../escape")).toThrow();
  });

  test("requires maxxy marker before removing a worktree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-worktree-"));
    const worktreeRoot = path.join(root, "worktrees");
    const guard = new PathGuard({
      projectRoot: path.join(root, "projects"),
      worktreeRoot,
    });
    await guard.ensureRoots();

    const worktree = path.join(worktreeRoot, "task-1");
    await guard.markWorktree(worktree, { taskId: "task_1" });
    await expect(guard.assertSafeWorktreeRemoval(worktree)).resolves.toBe(
      worktree,
    );

    const unmarked = path.join(worktreeRoot, "manual");
    await writeFile(unmarked, "not a directory");
    await expect(guard.assertSafeWorktreeRemoval(unmarked)).rejects.toThrow();
    await expect(
      guard.assertSafeWorktreeRemoval(worktreeRoot),
    ).rejects.toThrow();
  });
});
