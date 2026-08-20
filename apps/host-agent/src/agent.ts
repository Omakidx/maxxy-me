import { loginCodexConnection } from "./codex-login";
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

function requiredArg(args: string[], name: string) {
  const value = argValue(args, name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
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
    const authMode = requiredArg(args, "--auth-mode");
    if (authMode !== "chatgpt" && authMode !== "api_key") {
      throw new Error("--auth-mode must be chatgpt or api_key");
    }
    const capacitySourceId = argValue(args, "--capacity-source-id");
    const connection = await loginCodexConnection(config, {
      codexConnectionId: requiredArg(args, "--connection-id"),
      authMode,
      credentialSlotId: requiredArg(args, "--credential-slot"),
      ...(capacitySourceId ? { capacitySourceId } : {}),
      deviceAuth: args.includes("--device-auth"),
    });
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
