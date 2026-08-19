import { loadConfig } from "./config";
import { exchangeEnrollment } from "./enroll";
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
