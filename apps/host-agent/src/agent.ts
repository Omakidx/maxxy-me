import { loginCodexConnection } from "./codex-login";
import { parseCodexLoginArgs } from "./codex-login-args";
import { loadConfig } from "./config";
import { exchangeEnrollment } from "./enroll";
import { loginGitHub, logoutGitHub } from "./github-login";
import { log } from "./logger";
import { CodexConnectionRegistry } from "./registry";
import { HostAgentRuntime } from "./runtime";
import { loadStoredHostConfig, saveStoredHostConfig } from "./state";
import { collectToolInventory } from "./tools";

function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const [command = "start", ...args] = process.argv.slice(2);
  const preConfig = loadConfig();
  const stored = await loadStoredHostConfig(preConfig.dataDir);
  const config = loadConfig(stored);

  if (command === "enroll") {
    const server = argValue(args, "--server") ?? config.controlPlaneUrl;
    const token = argValue(args, "--token");
    if (!server || !token) {
      throw new Error(
        "Usage: maxxy-host enroll --server <url> --token <one-time-token>",
      );
    }
    const enrolled = await exchangeEnrollment({
      serverUrl: server,
      enrollmentToken: token,
      config,
    });
    await saveStoredHostConfig(config.dataDir, enrolled);
    log("info", "host enrolled", {
      hostId: enrolled.hostId,
      hostName: enrolled.hostName,
    });
    return;
  }

  if (command === "doctor") {
    const inventory = await collectToolInventory(config);
    console.log(JSON.stringify({ inventory }, null, 2));
    return;
  }

  if (command === "codex-login") {
    const login = parseCodexLoginArgs(args);
    const connection = await loginCodexConnection(config, login);
    log("info", "Codex connection authenticated", {
      codexConnectionId: connection.codexConnectionId,
      status: connection.status,
    });
    return;
  }

  if (command === "github-login") {
    const status = await loginGitHub(config);
    log("info", "GitHub account authenticated", {
      account: status.account ?? "github.com",
    });
    return;
  }

  if (command === "github-logout") {
    await logoutGitHub(config);
    log("info", "GitHub account disconnected");
    return;
  }

  if (command === "registry-prune") {
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    let removedConnectionIds: string[];
    if (args.length === 0) {
      removedConnectionIds = await registry.pruneExpiredPending(0);
    } else if (
      args.length === 2 &&
      args[0] === "--all" &&
      args[1] === "--confirm"
    ) {
      removedConnectionIds = [];
      for (const connection of await registry.list()) {
        await registry.remove(connection.codexConnectionId);
        removedConnectionIds.push(connection.codexConnectionId);
      }
    } else {
      throw new Error("Usage: maxxy-host registry-prune [--all --confirm]");
    }
    console.log(JSON.stringify({ removedConnectionIds }, null, 2));
    return;
  }

  if (command === "registry") {
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    console.log(
      JSON.stringify({ connections: await registry.list() }, null, 2),
    );
    return;
  }

  if (command !== "start") {
    throw new Error(`Unknown host-agent command: ${command}`);
  }

  await new HostAgentRuntime(config).start();
}

main().catch((error: unknown) => {
  log("error", "host-agent failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
