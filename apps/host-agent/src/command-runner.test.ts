import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HostCommandRunner } from "./command-runner";
import { loadConfig } from "./config";
import { CodexConnectionRegistry } from "./registry";

function configureTempHost(root: string) {
  process.env.GIT_AUTHOR_NAME = "Maxxy Test";
  process.env.GIT_AUTHOR_EMAIL = "maxxy-test@example.com";
  process.env.GIT_COMMITTER_NAME = "Maxxy Test";
  process.env.GIT_COMMITTER_EMAIL = "maxxy-test@example.com";
  process.env.MAXXY_HOST_DATA_DIR = path.join(root, "state");
  process.env.MAXXY_PROJECT_ROOT = path.join(root, "projects");
  process.env.MAXXY_WORKTREE_ROOT = path.join(root, "worktrees");
  process.env.MAXXY_CODEX_ACCOUNTS_DIR = path.join(root, "codex");
  process.env.MAXXY_CODEX_TURN_TIMEOUT_MS = "1000";
  return loadConfig();
}

async function runGit(args: string[], cwd: string) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Maxxy Test",
      GIT_AUTHOR_EMAIL: "maxxy-test@example.com",
      GIT_COMMITTER_NAME: "Maxxy Test",
      GIT_COMMITTER_EMAIL: "maxxy-test@example.com",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stdout}${stderr}`);
  }
  return stdout;
}

function parseCommandJson(result: { output?: string }) {
  return JSON.parse(result.output ?? "{}");
}

describe("HostCommandRunner", () => {
  test("rejects generic commands unless explicitly allowlisted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-"));
    process.env.MAXXY_ALLOWED_COMMANDS = "";
    const config = configureTempHost(root);
    const runner = new HostCommandRunner(config);

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_1",
      command: "command.run",
      payload: { command: "node", args: ["--version"] },
    });

    expect(result.status).toBe("rejected");
  });

  test("rejects denied commands even when explicitly allowlisted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-deny-"));
    process.env.MAXXY_ALLOWED_COMMANDS = "rm";
    process.env.MAXXY_DENIED_COMMANDS = "rm";
    const config = configureTempHost(root);
    const runner = new HostCommandRunner(config);

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_deny",
      command: "command.run",
      payload: { command: "rm", args: ["-rf", "not-run"] },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("denied");
  });

  test("handles Codex connection protocol commands through the local registry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-registry-"));
    const runner = new HostCommandRunner(configureTempHost(root));

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_2",
      command: "codex.connection.allocate",
      payload: {
        codexConnectionId: "codexconn_test",
        authMode: "chatgpt",
        capacitySourceId: "capsrc_test",
      },
    });

    expect(result.status).toBe("completed");
    expect(result.output).toContain("codexconn_test");
  });

  test("runs a fixture Codex turn through runtime commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-runtime-"));
    const config = configureTempHost(root);
    await mkdir(config.projectRoot, { recursive: true });
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    await registry.register({
      codexConnectionId: "codexconn_runtime",
      authMode: "chatgpt",
      capacitySourceId: "capsrc_runtime",
      status: "ready_chatgpt",
    });
    const events: string[] = [];
    const runner = new HostCommandRunner(config, (message) => {
      events.push(message.event.type);
    });

    const start = await runner.handle({
      type: "control.command",
      commandId: "cmd_runtime_start",
      command: "codex.runtime.start",
      payload: {
        runId: "run_fixture",
        taskId: "task_fixture",
        attemptId: "attempt_fixture",
        codexConnectionId: "codexconn_runtime",
        cwd: config.projectRoot,
        fixtureScenario: "normal",
      },
    });
    expect(start.status).toBe("completed");
    expect(runner.activeRunIds()).toContain("run_fixture");

    const turn = await runner.handle({
      type: "control.command",
      commandId: "cmd_turn_start",
      command: "codex.turn.start",
      payload: {
        runId: "run_fixture",
        prompt: "edit README",
        threadId: "thread_fixture",
        turnId: "turn_fixture",
        waitForCompletion: true,
      },
    });

    expect(turn.status).toBe("completed");
    expect(turn.output).toContain("turn.completed");
    expect(events).toContain("agent.message_completed");
    expect(events).toContain("turn.completed");
    await expect(
      readFile(path.join(config.projectRoot, "README.md"), "utf8"),
    ).resolves.toBe("hello from codex fixture\n");
  });

  test("drives repository, worktree, commit, push, and draft PR commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-git-"));
    const remote = path.join(root, "remote.git");
    const seed = path.join(root, "seed");
    const fakeGh = path.join(root, "bin", "gh");
    await mkdir(path.dirname(fakeGh), { recursive: true });
    await writeFile(
      fakeGh,
      `#!/usr/bin/env sh\nprintf '%s\n' '{"number":7,"html_url":"https://github.com/example/repo/pull/7","node_id":"PR_kwTEST","title":"Phase 7 task","draft":true}'\n`,
    );
    await chmod(fakeGh, 0o755);
    process.env.GH_BINARY = fakeGh;

    await runGit(["init", "--bare", "--initial-branch=main", remote], root);
    await mkdir(seed, { recursive: true });
    await runGit(["init", "--initial-branch=main"], seed);
    await writeFile(path.join(seed, "README.md"), "base\n");
    await runGit(["add", "README.md"], seed);
    await runGit(["commit", "-m", "initial"], seed);
    await runGit(["remote", "add", "origin", pathToFileURL(remote).href], seed);
    await runGit(["push", "-u", "origin", "main"], seed);

    const config = configureTempHost(root);
    const runner = new HostCommandRunner(config);
    const repositoryDirectory = path.join(config.projectRoot, "example-repo");
    const worktreePath = path.join(
      config.worktreeRoot,
      "workspace-test",
      "task-test-backend",
    );
    const branchName = "maxxy/task-test/backend";

    const prepare = await runner.handle({
      type: "control.command",
      commandId: "cmd_prepare",
      command: "repository.prepare",
      payload: {
        repositoryUrl: pathToFileURL(remote).href,
        directory: repositoryDirectory,
        defaultBranch: "main",
      },
    });
    expect(prepare.status).toBe("completed");
    expect(parseCommandJson(prepare).baseRef).toBe("origin/main");

    const worktree = await runner.handle({
      type: "control.command",
      commandId: "cmd_worktree",
      command: "worktree.create",
      payload: {
        repositoryPath: repositoryDirectory,
        worktreePath,
        branchName,
        baseRef: "origin/main",
        taskId: "task_test",
      },
    });
    expect(worktree.status).toBe("completed");
    expect(parseCommandJson(worktree).branchName).toBe(branchName);

    await writeFile(path.join(worktreePath, "README.md"), "phase 7\n");

    const validate = await runner.handle({
      type: "control.command",
      commandId: "cmd_validate",
      command: "git.validate",
      payload: { worktreePath },
    });
    expect(validate.status).toBe("completed");

    const status = await runner.handle({
      type: "control.command",
      commandId: "cmd_status",
      command: "git.status",
      payload: { cwd: worktreePath },
    });
    expect(status.status).toBe("completed");
    expect(status.output).toContain("README.md");

    const commit = await runner.handle({
      type: "control.command",
      commandId: "cmd_commit",
      command: "git.commit",
      payload: {
        worktreePath,
        message: "maxxy: phase 7 test",
      },
    });
    expect(commit.status).toBe("completed");
    expect(parseCommandJson(commit).commitSha).toBeString();

    const push = await runner.handle({
      type: "control.command",
      commandId: "cmd_push",
      command: "git.push",
      payload: { worktreePath, branchName },
    });
    expect(push.status).toBe("completed");
    const remoteBranchSha = await runGit(
      ["--git-dir", remote, "rev-parse", `refs/heads/${branchName}`],
      root,
    );
    expect(remoteBranchSha.trim()).toBe(parseCommandJson(commit).commitSha);

    const pr = await runner.handle({
      type: "control.command",
      commandId: "cmd_pr",
      command: "github.pull_request.create",
      payload: {
        repositoryOwner: "example",
        repositoryName: "repo",
        headBranch: branchName,
        baseBranch: "main",
        title: "Phase 7 task",
        body: "Test body",
        draft: true,
      },
    });
    expect(pr.status).toBe("completed");
    expect(parseCommandJson(pr)).toMatchObject({
      number: 7,
      url: "https://github.com/example/repo/pull/7",
      status: "draft",
    });
  });

  test("rejects runtime payloads containing raw secrets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-secret-"));
    const config = configureTempHost(root);
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    await registry.register({
      codexConnectionId: "codexconn_secret",
      authMode: "chatgpt",
      status: "ready_chatgpt",
    });
    const runner = new HostCommandRunner(config);

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_runtime_secret",
      command: "codex.runtime.start",
      payload: {
        runId: "run_secret",
        codexConnectionId: "codexconn_secret",
        cwd: config.projectRoot,
        apiKey: "should-not-be-here",
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("raw secret field");
  });
});
