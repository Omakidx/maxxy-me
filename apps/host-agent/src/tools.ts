import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { arch, hostname, platform } from "node:os";
import { promisify } from "node:util";
import type { HostToolInventory, HostToolStatus } from "@maxxy/contracts";
import type { HostAgentConfig } from "./config";

const execFileAsync = promisify(execFile);

async function detect(binary: string, args: string[]): Promise<HostToolStatus> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: 5000,
    });
    const version = `${stdout}${stderr}`.trim().split("\n")[0]?.trim();
    return {
      available: true,
      ...(version ? { version } : {}),
      path: binary,
    };
  } catch (error) {
    return {
      available: false,
      path: binary,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectToolInventory(
  config: HostAgentConfig,
): Promise<HostToolInventory> {
  const [bun, codex, git, gh] = await Promise.all([
    detect("bun", ["--version"]),
    detect(config.CODEX_BINARY, ["--version"]),
    detect(config.GIT_BINARY, ["--version"]),
    detect(config.GH_BINARY, ["--version"]),
  ]);

  return {
    os: platform(),
    arch: arch(),
    hostname: hostname(),
    bun,
    codex,
    git,
    gh,
    projectRoot: config.projectRoot,
    worktreeRoot: config.worktreeRoot,
    codexAccountsDir: config.codexAccountsDir,
    sandbox: {
      pathRestrictions: true,
      perConnectionCodexHome: true,
      commandTimeoutMs: config.MAXXY_COMMAND_TIMEOUT_MS,
      outputMaxBytes: config.MAXXY_OUTPUT_MAX_BYTES,
    },
  };
}

async function availableBytes(path: string) {
  try {
    const stats = await statfs(path);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return undefined;
  }
}

export async function collectDiskAvailability(config: HostAgentConfig) {
  const [projectRootAvailableBytes, worktreeRootAvailableBytes] =
    await Promise.all([
      availableBytes(config.projectRoot),
      availableBytes(config.worktreeRoot),
    ]);

  return {
    ...(projectRootAvailableBytes !== undefined
      ? { projectRootAvailableBytes }
      : {}),
    ...(worktreeRootAvailableBytes !== undefined
      ? { worktreeRootAvailableBytes }
      : {}),
  };
}
