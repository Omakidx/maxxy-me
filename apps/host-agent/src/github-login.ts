import { spawn } from "node:child_process";
import type { HostAgentConfig } from "./config";
import { collectToolInventory } from "./tools";

export async function loginGitHub(config: HostAgentConfig) {
  const exitCode = await runInteractive(config.GH_BINARY, [
    "auth",
    "login",
    "--hostname",
    "github.com",
    "--git-protocol",
    "https",
    "--web",
  ]);
  if (exitCode !== 0) {
    throw new Error(`GitHub login exited with status ${exitCode}`);
  }

  const status = (await collectToolInventory(config)).gh;
  if (!status.authenticated) {
    throw new Error("GitHub login completed without an active account");
  }
  return status;
}

export async function logoutGitHub(config: HostAgentConfig) {
  const exitCode = await runInteractive(config.GH_BINARY, [
    "auth",
    "logout",
    "--hostname",
    "github.com",
  ]);
  if (exitCode !== 0) {
    throw new Error(`GitHub logout exited with status ${exitCode}`);
  }
}

function runInteractive(binary: string, args: string[]) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(binary, args, {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
