import { spawn } from "node:child_process";
import type { HostAgentConfig } from "./config";
import { CodexConnectionRegistry } from "./registry";

const maximumLoginWindowMs = 10 * 60 * 1000;
const clockSkewAllowanceMs = 30 * 1000;

type CodexLoginInput = {
  codexConnectionId: string;
  authMode: "chatgpt" | "api_key";
  capacitySourceId?: string;
  deviceAuth?: boolean;
  expiresAt: string;
};

export function loginTimeRemaining(expiresAt: string, now = Date.now()) {
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) {
    throw new Error("--expires-at must be a valid ISO timestamp");
  }
  const remaining = deadline - now;
  if (remaining <= 0) {
    throw new Error("This Codex login command has expired");
  }
  if (remaining > maximumLoginWindowMs + clockSkewAllowanceMs) {
    throw new Error("Codex login commands cannot be valid for over 10 minutes");
  }
  return remaining;
}

export async function loginCodexConnection(
  config: HostAgentConfig,
  input: CodexLoginInput,
) {
  const remainingMs = loginTimeRemaining(input.expiresAt);
  const registry = CodexConnectionRegistry.at(
    config.dataDir,
    config.codexAccountsDir,
  );
  await registry.pruneExpiredPending();
  const entry = await registry.register({
    codexConnectionId: input.codexConnectionId,
    authMode: input.authMode,
    ...(input.capacitySourceId
      ? { capacitySourceId: input.capacitySourceId }
      : {}),
    status: "authenticating",
  });
  const args = ["login"];
  if (input.authMode === "api_key") {
    args.push("--with-api-key");
  } else if (input.deviceAuth) {
    args.push("--device-auth");
  }

  try {
    const result = await runInteractive(
      config.CODEX_BINARY,
      args,
      {
        ...process.env,
        CODEX_HOME: entry.credentialDir,
      },
      remainingMs,
    );
    if (result.timedOut) {
      throw new Error("Codex login timed out after 10 minutes");
    }
    if (result.exitCode !== 0) {
      throw new Error(`Codex login exited with status ${result.exitCode}`);
    }
    loginTimeRemaining(input.expiresAt);
    await registry.setStatus(input.codexConnectionId, "signed_out");
    const connection = (await registry.report()).find(
      (candidate) => candidate.codexConnectionId === input.codexConnectionId,
    );
    if (!connection?.status.startsWith("ready_")) {
      throw new Error("Codex login completed without a usable credential file");
    }
    return connection;
  } catch (error) {
    await registry.remove(input.codexConnectionId);
    throw error;
  }
}

function runInteractive(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) {
  return new Promise<{ exitCode: number; timedOut: boolean }>(
    (resolve, reject) => {
      let timedOut = false;
      const child = spawn(binary, args, {
        env,
        stdio: "inherit",
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        resolve({ exitCode: code ?? 1, timedOut });
      });
    },
  );
}
