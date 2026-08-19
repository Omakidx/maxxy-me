import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type StoredHostConfig, storedHostConfigSchema } from "./config";

export function hostConfigPath(dataDir: string) {
  return path.join(dataDir, "host.json");
}

export async function loadStoredHostConfig(dataDir: string) {
  try {
    const raw = await readFile(hostConfigPath(dataDir), "utf8");
    return storedHostConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function saveStoredHostConfig(
  dataDir: string,
  config: StoredHostConfig,
) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await writeFile(
    hostConfigPath(dataDir),
    `${JSON.stringify(config, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
}
