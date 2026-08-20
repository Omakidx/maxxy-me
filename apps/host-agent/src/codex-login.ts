import { spawn } from "node:child_process";
import type { HostAgentConfig } from "./config";
import { CodexConnectionRegistry } from "./registry";

type CodexLoginInput = {
  codexConnectionId: string;
  authMode: "chatgpt" | "api_key";
  credentialSlotId: string;
  capacitySourceId?: string;
  deviceAuth?: boolean;
};

export async function loginCodexConnection(
  config: HostAgentConfig,
  input: CodexLoginInput,
) {
  const registry = CodexConnectionRegistry.at(
    config.dataDir,
    config.codexAccountsDir,
  );
  const entry = await registry.register({
    codexConnectionId: input.codexConnectionId,
    authMode: input.authMode,
    credentialSlotId: input.credentialSlotId,
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
    const exitCode = await runInteractive(config.CODEX_BINARY, args, {
      ...process.env,
      CODEX_HOME: entry.credentialDir,
    });
    if (exitCode !== 0) {
      throw new Error(`Codex login exited with status ${exitCode}`);
    }
    await registry.setStatus(input.codexConnectionId, "signed_out");
    const connection = (await registry.report()).find(
      (candidate) => candidate.codexConnectionId === input.codexConnectionId,
    );
    if (!connection?.status.startsWith("ready_")) {
      throw new Error("Codex login completed without a usable credential file");
    }
    return connection;
  } catch (error) {
    await registry.setStatus(input.codexConnectionId, "error");
    throw error;
  }
}

function runInteractive(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
