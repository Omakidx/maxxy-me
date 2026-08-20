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

export function parseGitHubAccount(output: string) {
  return output.match(/account\s+([^\s(]+)/i)?.[1];
}

async function detectGitHub(binary: string): Promise<HostToolStatus> {
  const tool = await detect(binary, ["--version"]);
  if (!tool.available) {
    return tool;
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      binary,
      ["auth", "status", "--hostname", "github.com"],
      { timeout: 5000 },
    );
    const account = parseGitHubAccount(`${stdout}${stderr}`);
    return {
      ...tool,
      authenticated: true,
      ...(account ? { account } : {}),
    };
  } catch {
    return {
      ...tool,
      authenticated: false,
      error: "GitHub CLI is not authenticated for github.com",
    };
  }
}

export async function collectToolInventory(
  config: HostAgentConfig,
): Promise<HostToolInventory> {
  const [bun, detectedCodex, git, gh] = await Promise.all([
    detect("bun", ["--version"]),
    detect(config.CODEX_BINARY, ["--version"]),
    detect(config.GIT_BINARY, ["--version"]),
    detectGitHub(config.GH_BINARY),
  ]);
  const codex =
    detectedCodex.available && detectedCodex.version?.startsWith("codex-cli ")
      ? detectedCodex
      : {
          ...detectedCodex,
          available: false,
          error: detectedCodex.available
            ? "Executable is not the official Codex CLI"
            : detectedCodex.error,
        };

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
