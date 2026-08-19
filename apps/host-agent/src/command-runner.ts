import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  type ControlApprovalDecisionMessage,
  type HostCommandEnvelope,
  hostCommandEnvelopeSchema,
} from "@maxxy/contracts";
import { isProtectedBranchName, normalizeGitRemoteUrl } from "@maxxy/git";
import { z } from "zod";
import type { HostRuntimeEventSink } from "./codex-runtime";
import { HostCodexRuntimeManager } from "./codex-runtime";
import type { HostAgentConfig } from "./config";
import { PathGuard } from "./paths";
import { CodexConnectionRegistry } from "./registry";
import { collectToolInventory } from "./tools";

const runCommandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  profile: z.string().min(1).default("default"),
});
const repositoryPrepareSchema = z.object({
  repositoryUrl: z.string().min(1),
  directory: z.string().min(1),
  defaultBranch: z.string().min(1).optional(),
  remote: z.string().min(1).default("origin"),
});
const repositoryCloneSchema = z.object({
  repositoryUrl: z.string().min(1),
  directory: z.string().min(1),
  defaultBranch: z.string().min(1).optional(),
});
const repositoryPathSchema = z.object({
  repositoryPath: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const worktreeCreateSchema = z.object({
  repositoryPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branchName: z.string().min(1),
  baseRef: z.string().min(1).default("HEAD"),
  taskId: z.string().min(1).optional(),
});
const worktreeRemoveSchema = z.object({
  worktreePath: z.string().min(1),
  force: z.boolean().default(false),
});
const cwdSchema = z.object({ cwd: z.string().min(1) });
const gitWorktreeSchema = z.object({ worktreePath: z.string().min(1) });
const gitCommitSchema = gitWorktreeSchema.extend({
  message: z.string().min(1),
  allowEmpty: z.boolean().default(false),
});
const gitPushSchema = gitWorktreeSchema.extend({
  remote: z.string().min(1).default("origin"),
  branchName: z.string().min(1),
  force: z.boolean().default(false),
});
const githubPullRequestCreateSchema = z.object({
  repositoryOwner: z.string().min(1),
  repositoryName: z.string().min(1),
  headBranch: z.string().min(1),
  baseBranch: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(""),
  draft: z.boolean().default(true),
});
const connectionSchema = z.object({
  codexConnectionId: z.string().min(1),
  label: z.string().optional(),
  authMode: z
    .enum(["chatgpt", "api_key", "enterprise_access_token"])
    .default("chatgpt"),
  capacitySourceId: z.string().min(1).optional(),
  credentialSlotId: z.string().min(1).optional(),
  secretRef: z.string().min(1).optional(),
  maxConcurrentRuns: z.number().int().positive().optional(),
  activeLeaseCount: z.number().int().min(0).default(0),
});

export type CommandResult = {
  status: "completed" | "failed" | "rejected" | "unsupported";
  exitCode?: number | null;
  output?: string;
  outputTruncated?: boolean;
  error?: string;
};

export class HostCommandRunner {
  private readonly codexRuntime: HostCodexRuntimeManager;

  constructor(
    private readonly config: HostAgentConfig,
    runtimeEvents: HostRuntimeEventSink = () => undefined,
    private readonly paths = new PathGuard({
      projectRoot: config.projectRoot,
      worktreeRoot: config.worktreeRoot,
    }),
    private readonly registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    ),
  ) {
    this.codexRuntime = new HostCodexRuntimeManager(
      config,
      runtimeEvents,
      this.paths,
      this.registry,
    );
  }

  activeRunIds() {
    return this.codexRuntime.activeRunIds();
  }

  async handleApprovalDecision(message: ControlApprovalDecisionMessage) {
    return this.codexRuntime.resolveApproval(message);
  }

  async handle(rawEnvelope: unknown): Promise<CommandResult> {
    const envelope = hostCommandEnvelopeSchema.parse(rawEnvelope);
    try {
      return await this.execute(envelope);
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async execute(envelope: HostCommandEnvelope): Promise<CommandResult> {
    await this.paths.ensureRoots();
    await mkdir(this.config.codexAccountsDir, { recursive: true, mode: 0o700 });

    switch (envelope.command) {
      case "host.health_check":
        return this.json({
          inventory: await collectToolInventory(this.config),
        });
      case "repository.prepare":
        return this.repositoryPrepare(envelope.payload);
      case "repository.clone":
        return this.repositoryClone(envelope.payload);
      case "repository.fetch":
        return this.repositoryFetch(envelope.payload);
      case "worktree.create":
        return this.worktreeCreate(envelope.payload);
      case "worktree.remove":
        return this.worktreeRemove(envelope.payload);
      case "command.run":
        return this.commandRun(envelope.payload);
      case "git.status":
        return this.gitStatus(envelope.payload);
      case "git.diff":
        return this.gitDiff(envelope.payload);
      case "git.validate":
        return this.gitValidate(envelope.payload);
      case "git.commit":
        return this.gitCommit(envelope.payload);
      case "git.push":
        return this.gitPush(envelope.payload);
      case "github.pull_request.create":
        return this.githubPullRequestCreate(envelope.payload);
      case "github.pull_request.update":
        return {
          status: "unsupported",
          error:
            "Pull request updates are synchronized through webhooks in Phase 7.",
        };
      case "codex.connection.allocate":
      case "codex.connection.login":
      case "codex.connection.status":
      case "codex.connection.reauthenticate":
      case "codex.connection.disable":
      case "codex.connection.remove":
        return this.codexConnectionCommand(envelope.command, envelope.payload);
      case "codex.runtime.start":
        return this.json(
          await this.codexRuntime.startRuntime(envelope.payload),
        );
      case "codex.turn.start":
        return this.json(await this.codexRuntime.startTurn(envelope.payload));
      case "codex.turn.steer":
        return this.json(await this.codexRuntime.steerTurn(envelope.payload));
      case "codex.turn.interrupt":
        return this.json(
          await this.codexRuntime.interruptTurn(envelope.payload),
        );
      default:
        return { status: "unsupported", error: "Unsupported command" };
    }
  }

  private async repositoryPrepare(payload: Record<string, unknown>) {
    const input = repositoryPrepareSchema.parse(payload);
    const directory = this.paths.resolveRepositoryPath(input.directory);
    await mkdir(path.dirname(directory), { recursive: true });

    if (!(await this.isGitWorkTree(directory))) {
      if (
        (await this.pathExists(directory)) &&
        !(await this.isDirectoryEmpty(directory))
      ) {
        throw new Error(
          "Repository directory exists but is not a Git work tree",
        );
      }
      const args = ["clone"];
      if (input.defaultBranch) {
        args.push("--branch", input.defaultBranch);
      }
      args.push(input.repositoryUrl, directory);
      await this.spawnOrThrow(
        this.config.GIT_BINARY,
        args,
        this.config.projectRoot,
      );
    }

    const remoteUrl = (
      await this.gitOutput(directory, [
        "config",
        "--get",
        `remote.${input.remote}.url`,
      ])
    ).trim();
    if (
      input.repositoryUrl &&
      normalizeGitRemoteUrl(remoteUrl) !==
        normalizeGitRemoteUrl(input.repositoryUrl)
    ) {
      throw new Error("Repository remote does not match registered remote URL");
    }

    await this.spawnOrThrow(
      this.config.GIT_BINARY,
      ["-C", directory, "fetch", input.remote, "--prune"],
      directory,
    );
    const defaultBranch =
      input.defaultBranch ??
      (await this.detectDefaultBranch(directory, input.remote)) ??
      "main";
    const baseRef = `${input.remote}/${defaultBranch}`;
    const baseSha = (
      await this.gitOutput(directory, ["rev-parse", baseRef])
    ).trim();
    const clean =
      (await this.gitOutput(directory, ["status", "--porcelain"])).trim() ===
      "";

    return this.json({
      repositoryPath: directory,
      remote: input.remote,
      remoteUrl,
      defaultBranch,
      baseRef,
      baseSha,
      clean,
    });
  }

  private async repositoryClone(payload: Record<string, unknown>) {
    const input = repositoryCloneSchema.parse(payload);
    const directory = this.paths.resolveRepositoryPath(input.directory);
    const args = ["clone", input.repositoryUrl, directory];
    if (input.defaultBranch) {
      args.splice(1, 0, "--branch", input.defaultBranch);
    }
    return this.spawn(this.config.GIT_BINARY, args, this.config.projectRoot);
  }

  private async repositoryFetch(payload: Record<string, unknown>) {
    const input = repositoryPathSchema.parse(payload);
    const repositoryPath = this.paths.resolveRepositoryPath(
      input.repositoryPath,
    );
    return this.spawn(
      this.config.GIT_BINARY,
      ["-C", repositoryPath, "fetch", input.remote, "--prune"],
      repositoryPath,
    );
  }

  private async worktreeCreate(payload: Record<string, unknown>) {
    const input = worktreeCreateSchema.parse(payload);
    if (isProtectedBranchName(input.branchName)) {
      throw new Error(
        "Refusing to create a maxxy worktree for a protected branch",
      );
    }
    const repositoryPath = this.paths.resolveRepositoryPath(
      input.repositoryPath,
    );
    const worktreePath = this.paths.resolveWorktreePath(input.worktreePath);
    if (await this.pathExists(worktreePath)) {
      throw new Error("Worktree path already exists");
    }
    await mkdir(path.dirname(worktreePath), { recursive: true });
    const baseSha = (
      await this.gitOutput(repositoryPath, ["rev-parse", input.baseRef])
    ).trim();
    await this.spawnOrThrow(
      this.config.GIT_BINARY,
      [
        "-C",
        repositoryPath,
        "worktree",
        "add",
        "-b",
        input.branchName,
        worktreePath,
        input.baseRef,
      ],
      repositoryPath,
    );
    await this.paths.markWorktree(worktreePath, {
      branchName: input.branchName,
      repositoryPath,
      baseSha,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      createdAt: new Date().toISOString(),
    });
    return this.json({ worktreePath, branchName: input.branchName, baseSha });
  }

  private async worktreeRemove(payload: Record<string, unknown>) {
    const input = worktreeRemoveSchema.parse(payload);
    const worktreePath = await this.paths.assertSafeWorktreeRemoval(
      input.worktreePath,
    );
    const args = ["worktree", "remove"];
    if (input.force) {
      args.push("--force");
    }
    args.push(worktreePath);
    const result = await this.spawn(
      this.config.GIT_BINARY,
      args,
      this.config.projectRoot,
    );
    if (result.status === "completed") {
      await this.paths
        .removeMarkedWorktree(worktreePath)
        .catch(() => undefined);
    }
    return result;
  }

  private async commandRun(payload: Record<string, unknown>) {
    const input = runCommandSchema.parse(payload);
    if (!this.config.allowedCommandProfiles.has(input.profile)) {
      return {
        status: "rejected" as const,
        error: `Command profile is not allowed: ${input.profile}`,
      };
    }
    if (!this.config.allowedCommands.has(input.command)) {
      return {
        status: "rejected" as const,
        error: `Command is not in MAXXY_ALLOWED_COMMANDS: ${input.command}`,
      };
    }
    if (input.args.some((argument) => argument.includes("\0"))) {
      return {
        status: "rejected" as const,
        error: "Command arguments contain a null byte",
      };
    }
    const cwd = this.paths.resolveProjectPath(
      input.cwd ?? this.config.projectRoot,
    );
    return this.spawn(input.command, input.args, cwd, input.timeoutMs);
  }

  private async gitStatus(payload: Record<string, unknown>) {
    const input = cwdSchema.parse(payload);
    const cwd = this.paths.resolveProjectPath(input.cwd);
    return this.spawn(
      this.config.GIT_BINARY,
      ["status", "--short", "--branch"],
      cwd,
    );
  }

  private async gitDiff(payload: Record<string, unknown>) {
    const input = cwdSchema.parse(payload);
    const cwd = this.paths.resolveProjectPath(input.cwd);
    return this.spawn(this.config.GIT_BINARY, ["diff", "--stat"], cwd);
  }

  private async gitValidate(payload: Record<string, unknown>) {
    const input = gitWorktreeSchema.parse(payload);
    const worktreePath = this.paths.resolveWorktreePath(input.worktreePath);
    return this.spawn(
      this.config.GIT_BINARY,
      ["diff", "--check"],
      worktreePath,
    );
  }

  private async gitCommit(payload: Record<string, unknown>) {
    const input = gitCommitSchema.parse(payload);
    const worktreePath = this.paths.resolveWorktreePath(input.worktreePath);
    const status = (
      await this.gitOutput(worktreePath, ["status", "--porcelain"])
    ).trim();
    if (!status && !input.allowEmpty) {
      throw new Error("No changes to commit");
    }
    await this.spawnOrThrow(
      this.config.GIT_BINARY,
      ["add", "--all"],
      worktreePath,
    );
    const commitArgs = ["commit", "-m", input.message];
    if (input.allowEmpty) {
      commitArgs.push("--allow-empty");
    }
    await this.spawnOrThrow(this.config.GIT_BINARY, commitArgs, worktreePath);
    const commitSha = (
      await this.gitOutput(worktreePath, ["rev-parse", "HEAD"])
    ).trim();
    return this.json({
      commitSha,
      changedFiles: status.split("\n").filter(Boolean),
    });
  }

  private async gitPush(payload: Record<string, unknown>) {
    const input = gitPushSchema.parse(payload);
    if (input.force) {
      throw new Error("Force push is not allowed in Phase 7");
    }
    if (isProtectedBranchName(input.branchName)) {
      throw new Error("Refusing to push protected branch");
    }
    const worktreePath = this.paths.resolveWorktreePath(input.worktreePath);
    await this.spawnOrThrow(
      this.config.GIT_BINARY,
      ["push", input.remote, `HEAD:refs/heads/${input.branchName}`],
      worktreePath,
    );
    return this.json({ remote: input.remote, branchName: input.branchName });
  }

  private async githubPullRequestCreate(payload: Record<string, unknown>) {
    const input = githubPullRequestCreateSchema.parse(payload);
    const result = await this.spawnOrThrow(
      this.config.GH_BINARY,
      [
        "api",
        `repos/${input.repositoryOwner}/${input.repositoryName}/pulls`,
        "--method",
        "POST",
        "-f",
        `title=${input.title}`,
        "-f",
        `head=${input.headBranch}`,
        "-f",
        `base=${input.baseBranch}`,
        "-f",
        `body=${input.body}`,
        "-F",
        `draft=${input.draft ? "true" : "false"}`,
      ],
      this.config.projectRoot,
    );
    const parsed = parseJsonObject(result.output ?? "{}");
    return this.json({
      number: numberValue(parsed.number) ?? 0,
      url: stringValue(parsed.html_url) ?? stringValue(parsed.url) ?? "",
      nodeId: stringValue(parsed.node_id),
      title: stringValue(parsed.title) ?? input.title,
      status: parsed.draft === true ? "draft" : "open",
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
    });
  }

  private async codexConnectionCommand(
    command: HostCommandEnvelope["command"],
    payload: Record<string, unknown>,
  ) {
    const input = connectionSchema.parse(payload);
    if (command === "codex.connection.remove") {
      const removed = await this.registry.remove(
        input.codexConnectionId,
        input.activeLeaseCount,
      );
      return this.json({ removed: Boolean(removed) });
    }
    if (command === "codex.connection.disable") {
      await this.registry.setStatus(input.codexConnectionId, "disabled");
      return this.reportConnection(input.codexConnectionId);
    }
    if (command === "codex.connection.reauthenticate") {
      await this.registry.setStatus(input.codexConnectionId, "authenticating");
      return this.reportConnection(input.codexConnectionId);
    }
    if (command === "codex.connection.status") {
      return this.reportConnection(input.codexConnectionId);
    }
    await this.registry.register({
      codexConnectionId: input.codexConnectionId,
      authMode: input.authMode,
      ...(input.label ? { label: input.label } : {}),
      ...(input.capacitySourceId
        ? { capacitySourceId: input.capacitySourceId }
        : {}),
      ...(input.credentialSlotId
        ? { credentialSlotId: input.credentialSlotId }
        : {}),
      ...(input.secretRef ? { secretRef: input.secretRef } : {}),
      ...(input.maxConcurrentRuns
        ? { maxConcurrentRuns: input.maxConcurrentRuns }
        : {}),
      status:
        command === "codex.connection.login" ? "authenticating" : "signed_out",
    });
    return this.reportConnection(input.codexConnectionId);
  }

  private async reportConnection(codexConnectionId: string) {
    const connections = await this.registry.report();
    return this.json({
      connection:
        connections.find(
          (connection) => connection.codexConnectionId === codexConnectionId,
        ) ?? null,
    });
  }

  private async isGitWorkTree(directory: string) {
    const result = await this.spawn(
      this.config.GIT_BINARY,
      ["-C", directory, "rev-parse", "--is-inside-work-tree"],
      this.config.projectRoot,
      5000,
    );
    return result.status === "completed" && result.output?.trim() === "true";
  }

  private async detectDefaultBranch(repositoryPath: string, remote: string) {
    const symbolic = await this.spawn(
      this.config.GIT_BINARY,
      ["symbolic-ref", `refs/remotes/${remote}/HEAD`],
      repositoryPath,
      5000,
    );
    if (symbolic.status === "completed" && symbolic.output?.trim()) {
      return symbolic.output.trim().split("/").at(-1);
    }
    const remoteShow = await this.spawn(
      this.config.GIT_BINARY,
      ["remote", "show", remote],
      repositoryPath,
      5000,
    );
    const match = remoteShow.output?.match(/HEAD branch:\s*(\S+)/);
    return match?.[1];
  }

  private gitOutput(cwd: string, args: string[]) {
    return this.spawnOrThrow(this.config.GIT_BINARY, args, cwd).then(
      (result) => result.output ?? "",
    );
  }

  private async spawnOrThrow(command: string, args: string[], cwd: string) {
    const result = await this.spawn(command, args, cwd);
    if (result.status !== "completed") {
      throw new Error(result.error ?? result.output ?? `${command} failed`);
    }
    return result;
  }

  private async pathExists(candidate: string) {
    try {
      await stat(candidate);
      return true;
    } catch {
      return false;
    }
  }

  private async isDirectoryEmpty(candidate: string) {
    try {
      return (await readdir(candidate)).length === 0;
    } catch {
      return true;
    }
  }

  private json(payload: unknown): CommandResult {
    return { status: "completed", output: JSON.stringify(payload) };
  }

  private spawn(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs = this.config.MAXXY_COMMAND_TIMEOUT_MS,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...(this.config.GIT_AUTHOR_NAME
            ? { GIT_AUTHOR_NAME: this.config.GIT_AUTHOR_NAME }
            : {}),
          ...(this.config.GIT_AUTHOR_EMAIL
            ? { GIT_AUTHOR_EMAIL: this.config.GIT_AUTHOR_EMAIL }
            : {}),
          ...(this.config.GIT_COMMITTER_NAME
            ? { GIT_COMMITTER_NAME: this.config.GIT_COMMITTER_NAME }
            : {}),
          ...(this.config.GIT_COMMITTER_EMAIL
            ? { GIT_COMMITTER_EMAIL: this.config.GIT_COMMITTER_EMAIL }
            : {}),
        },
        shell: false,
      });
      const chunks: Buffer[] = [];
      let outputBytes = 0;
      let outputTruncated = false;
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
      }, timeoutMs);

      const collect = (chunk: Buffer) => {
        if (outputBytes >= this.config.MAXXY_OUTPUT_MAX_BYTES) {
          outputTruncated = true;
          return;
        }
        const available = this.config.MAXXY_OUTPUT_MAX_BYTES - outputBytes;
        chunks.push(chunk.subarray(0, available));
        outputBytes += Math.min(chunk.byteLength, available);
        if (chunk.byteLength > available) {
          outputTruncated = true;
        }
      };

      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve({ status: "failed", error: error.message });
      });
      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        const output = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: code === 0 ? "completed" : "failed",
          exitCode: code,
          output,
          outputTruncated,
          ...(signal ? { error: `Process exited by signal ${signal}` } : {}),
        });
      });
    });
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
