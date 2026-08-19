import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const markerFile = ".maxxy-worktree.json";

export class PathGuard {
  readonly projectRoot: string;
  readonly worktreeRoot: string;

  constructor(input: { projectRoot: string; worktreeRoot: string }) {
    this.projectRoot = path.resolve(input.projectRoot);
    this.worktreeRoot = path.resolve(input.worktreeRoot);
  }

  async ensureRoots() {
    await mkdir(this.projectRoot, { recursive: true, mode: 0o755 });
    await mkdir(this.worktreeRoot, { recursive: true, mode: 0o700 });
  }

  resolveProjectPath(candidate: string) {
    return this.resolveWithin(candidate, this.projectRoot, [
      this.projectRoot,
      this.worktreeRoot,
    ]);
  }

  resolveRepositoryPath(candidate: string) {
    return this.resolveWithin(candidate, this.projectRoot, [this.projectRoot]);
  }

  resolveWorktreePath(candidate: string) {
    return this.resolveWithin(candidate, this.worktreeRoot, [
      this.worktreeRoot,
    ]);
  }

  async markWorktree(worktreePath: string, payload: Record<string, unknown>) {
    const resolved = this.resolveWorktreePath(worktreePath);
    await mkdir(resolved, { recursive: true, mode: 0o755 });
    await writeFile(
      path.join(resolved, markerFile),
      `${JSON.stringify(payload, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
  }

  async assertSafeWorktreeRemoval(worktreePath: string) {
    const resolved = this.resolveWorktreePath(worktreePath);
    if (resolved === this.worktreeRoot) {
      throw new Error("Refusing to remove the worktree root");
    }
    if (path.dirname(resolved) !== this.worktreeRoot) {
      throw new Error(
        "Worktree removals must target a direct maxxy-owned worktree",
      );
    }
    await readFile(path.join(resolved, markerFile), "utf8");
    return resolved;
  }

  async removeMarkedWorktree(worktreePath: string) {
    const resolved = await this.assertSafeWorktreeRemoval(worktreePath);
    await rm(resolved, { recursive: true, force: false, maxRetries: 1 });
    return resolved;
  }

  private resolveWithin(
    candidate: string,
    defaultRoot: string,
    roots: string[],
  ) {
    if (candidate.includes("\0")) {
      throw new Error("Path contains a null byte");
    }
    const resolved = path.isAbsolute(candidate)
      ? path.resolve(candidate)
      : path.resolve(defaultRoot, candidate);
    for (const root of roots) {
      const relative = path.relative(root, resolved);
      if (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      ) {
        return resolved;
      }
    }
    throw new Error(`Path is outside configured roots: ${candidate}`);
  }
}
