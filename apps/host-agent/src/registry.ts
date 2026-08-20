import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HostConnectionReport } from "@maxxy/contracts";
import { z } from "zod";

const runnableStatuses = [
  "ready_chatgpt",
  "ready_api_key",
  "ready_enterprise_access_token",
] as const;
const blockedRuntimeStatuses = [
  "unknown",
  "not_installed",
  "signed_out",
  "authenticating",
  "limited",
  "cooldown",
  "expired",
  "disabled",
  "policy_blocked",
  "revoked",
  "error",
] as const;

const pendingAttemptLifetimeMs = 10 * 60 * 1000;

const connectionSchema = z.object({
  codexConnectionId: z.string().min(1),
  label: z.string().optional(),
  authMode: z.enum(["chatgpt", "api_key", "enterprise_access_token"]),
  capacitySourceId: z.string().min(1).optional(),
  credentialSlotId: z.string().min(1),
  credentialDir: z.string().min(1),
  secretRef: z.string().optional(),
  maxConcurrentRuns: z.number().int().positive().default(1),
  status: z
    .enum([
      "not_installed",
      "signed_out",
      "authenticating",
      "ready_chatgpt",
      "ready_api_key",
      "ready_enterprise_access_token",
      "limited",
      "cooldown",
      "expired",
      "disabled",
      "policy_blocked",
      "revoked",
      "error",
    ])
    .default("signed_out"),
  createdAt: z.string().datetime({ offset: true }).optional(),
  removedAt: z.string().optional(),
});
const registrySchema = z.object({
  connections: z.array(connectionSchema).default([]),
});

export type CodexRegistryEntry = z.infer<typeof connectionSchema>;
export type RuntimeCodexConnection = Omit<CodexRegistryEntry, "secretRef"> & {
  status: (typeof runnableStatuses)[number];
};
export type RegisterConnectionInput = {
  codexConnectionId: string;
  label?: string;
  authMode: CodexRegistryEntry["authMode"];
  capacitySourceId?: string;
  credentialSlotId?: string;
  secretRef?: string;
  maxConcurrentRuns?: number;
  status?: CodexRegistryEntry["status"];
};

export class CodexConnectionRegistry {
  constructor(
    private readonly registryPath: string,
    private readonly codexAccountsDir: string,
  ) {}

  static at(dataDir: string, codexAccountsDir: string) {
    return new CodexConnectionRegistry(
      path.join(dataDir, "codex-registry.json"),
      codexAccountsDir,
    );
  }

  async list() {
    return (await this.read()).connections.filter((entry) => !entry.removedAt);
  }

  async get(codexConnectionId: string) {
    return (await this.list()).find(
      (entry) => entry.codexConnectionId === codexConnectionId,
    );
  }

  async register(input: RegisterConnectionInput) {
    const registry = await this.read();
    const credentialSlotId = input.credentialSlotId ?? input.codexConnectionId;
    const credentialDir = path.resolve(
      this.codexAccountsDir,
      sanitizeSegment(credentialSlotId),
    );
    this.assertCredentialDirInsideAccountsRoot(credentialDir);

    const conflict = registry.connections.find(
      (entry) =>
        !entry.removedAt &&
        entry.codexConnectionId !== input.codexConnectionId &&
        path.resolve(entry.credentialDir) === credentialDir,
    );
    if (conflict) {
      throw new Error(
        `Credential slot is already assigned to ${conflict.codexConnectionId}`,
      );
    }

    await mkdir(credentialDir, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(credentialDir, "config.toml"),
      'cli_auth_credentials_store = "file"\n',
      { mode: 0o600 },
    );

    const next: CodexRegistryEntry = {
      codexConnectionId: input.codexConnectionId,
      authMode: input.authMode,
      credentialSlotId,
      credentialDir,
      maxConcurrentRuns:
        input.maxConcurrentRuns ?? (input.authMode === "chatgpt" ? 1 : 4),
      status: input.status ?? "signed_out",
      createdAt: new Date().toISOString(),
      ...(input.label ? { label: input.label } : {}),
      ...(input.capacitySourceId
        ? { capacitySourceId: input.capacitySourceId }
        : {}),
      ...(input.secretRef ? { secretRef: input.secretRef } : {}),
    };

    const index = registry.connections.findIndex(
      (entry) => entry.codexConnectionId === input.codexConnectionId,
    );
    if (index >= 0) {
      registry.connections[index] = {
        ...registry.connections[index],
        ...next,
      };
      delete registry.connections[index].removedAt;
    } else {
      registry.connections.push(next);
    }
    await this.write(registry);
    return next;
  }

  async setStatus(
    codexConnectionId: string,
    status: CodexRegistryEntry["status"],
  ) {
    const registry = await this.read();
    const entry = registry.connections.find(
      (candidate) => candidate.codexConnectionId === codexConnectionId,
    );
    if (!entry || entry.removedAt) {
      throw new Error(
        `Codex connection is not registered: ${codexConnectionId}`,
      );
    }
    entry.status = status;
    await this.write(registry);
    return entry;
  }

  async resolveForRuntime(
    codexConnectionId: string,
    activeLeaseCount = 0,
  ): Promise<RuntimeCodexConnection> {
    const registry = await this.read();
    const matches = registry.connections.filter(
      (entry) =>
        !entry.removedAt && entry.codexConnectionId === codexConnectionId,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Codex connection must resolve to exactly one local credential lane: ${codexConnectionId}`,
      );
    }

    const entry = matches[0];
    if (!entry) {
      throw new Error(`Codex connection is not registered: `);
    }
    this.assertCredentialDirInsideAccountsRoot(entry.credentialDir);
    const reportedStatus = await this.reportedStatus(entry);
    if (!isRunnableStatus(reportedStatus)) {
      const reason = blockedRuntimeStatuses.includes(
        reportedStatus as (typeof blockedRuntimeStatuses)[number],
      )
        ? reportedStatus
        : "unknown";
      throw new Error(`Codex connection is not runnable: ${reason}`);
    }
    if (activeLeaseCount >= entry.maxConcurrentRuns) {
      throw new Error("Codex connection has no available active run lanes");
    }

    const activeWithSameCredentialDir = registry.connections.filter(
      (candidate) =>
        !candidate.removedAt &&
        candidate.codexConnectionId !== entry.codexConnectionId &&
        path.resolve(candidate.credentialDir) ===
          path.resolve(entry.credentialDir),
    );
    if (activeWithSameCredentialDir.length > 0) {
      throw new Error("Credential directory is shared by multiple connections");
    }

    const { secretRef: _secretRef, ...sanitized } = entry;
    return { ...sanitized, status: reportedStatus };
  }

  async remove(codexConnectionId: string, activeLeaseCount = 0) {
    if (activeLeaseCount > 0) {
      throw new Error("Cannot remove a Codex connection with active leases");
    }
    const registry = await this.read();
    const entry = registry.connections.find(
      (candidate) => candidate.codexConnectionId === codexConnectionId,
    );
    if (!entry) {
      return null;
    }
    await removeCredentialFile(entry.credentialDir);
    if (entry.removedAt) {
      return null;
    }
    entry.status = "disabled";
    entry.removedAt = new Date().toISOString();
    await this.write(registry);
    return entry;
  }

  async disconnect(codexConnectionId: string) {
    const registry = await this.read();
    const entry = registry.connections.find(
      (candidate) => candidate.codexConnectionId === codexConnectionId,
    );
    if (!entry || entry.removedAt) {
      throw new Error(
        `Codex connection is not registered: ${codexConnectionId}`,
      );
    }
    await removeCredentialFile(entry.credentialDir);
    entry.status = "disabled";
    await this.write(registry);
    return entry;
  }

  async reauthenticate(codexConnectionId: string) {
    const registry = await this.read();
    const entry = registry.connections.find(
      (candidate) => candidate.codexConnectionId === codexConnectionId,
    );
    if (!entry || entry.removedAt) {
      throw new Error(
        `Codex connection is not registered: ${codexConnectionId}`,
      );
    }
    await removeCredentialFile(entry.credentialDir);
    entry.status = "authenticating";
    entry.createdAt = new Date().toISOString();
    await this.write(registry);
    return entry;
  }

  async pruneExpiredPending(maxAgeMs = pendingAttemptLifetimeMs) {
    const registry = await this.read();
    const now = Date.now();
    const removedConnectionIds: string[] = [];

    for (const entry of registry.connections) {
      if (
        entry.removedAt ||
        !["signed_out", "authenticating", "error"].includes(entry.status)
      ) {
        continue;
      }
      if (isRunnableStatus(await this.reportedStatus(entry))) {
        continue;
      }
      const createdAt = entry.createdAt
        ? new Date(entry.createdAt).getTime()
        : Number.NEGATIVE_INFINITY;
      if (Number.isFinite(createdAt) && now - createdAt < maxAgeMs) {
        continue;
      }
      await removeCredentialFile(entry.credentialDir);
      entry.status = "expired";
      entry.removedAt = new Date(now).toISOString();
      removedConnectionIds.push(entry.codexConnectionId);
    }

    if (removedConnectionIds.length > 0) {
      await this.write(registry);
    }
    return removedConnectionIds;
  }

  async report(
    activeLeases: Record<string, number> = {},
  ): Promise<HostConnectionReport[]> {
    const entries = await this.list();
    return Promise.all(
      entries.map(async (entry) => ({
        codexConnectionId: entry.codexConnectionId,
        authMode: entry.authMode,
        status: await this.reportedStatus(entry),
        ...(entry.capacitySourceId
          ? { capacitySourceId: entry.capacitySourceId }
          : {}),
        activeLeaseCount: activeLeases[entry.codexConnectionId] ?? 0,
        maxConcurrentRuns: entry.maxConcurrentRuns,
        availability: entry.status === "cooldown" ? "cooldown" : "unknown",
        ...(entry.label ? { label: entry.label } : {}),
        health: {
          credentialSlotId: entry.credentialSlotId,
          credentialDirReady: true,
        },
      })),
    );
  }

  private async reportedStatus(
    entry: CodexRegistryEntry,
  ): Promise<CodexRegistryEntry["status"]> {
    if (entry.status !== "signed_out" && entry.status !== "authenticating") {
      return entry.status;
    }
    try {
      await stat(path.join(entry.credentialDir, "auth.json"));
      if (entry.authMode === "chatgpt") {
        return "ready_chatgpt";
      }
      if (entry.authMode === "api_key") {
        return "ready_api_key";
      }
      return "ready_enterprise_access_token";
    } catch {
      return entry.status;
    }
  }

  private assertCredentialDirInsideAccountsRoot(credentialDir: string) {
    const root = path.resolve(this.codexAccountsDir);
    const resolved = path.resolve(credentialDir);
    const relative = path.relative(root, resolved);
    if (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    ) {
      return;
    }
    throw new Error(
      "Credential directory is outside the configured Codex accounts root",
    );
  }

  private async read(): Promise<{ connections: CodexRegistryEntry[] }> {
    try {
      return registrySchema.parse(
        JSON.parse(await readFile(this.registryPath, "utf8")),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { connections: [] };
      }
      throw error;
    }
  }

  private async write(registry: { connections: CodexRegistryEntry[] }) {
    await mkdir(path.dirname(this.registryPath), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      this.registryPath,
      `${JSON.stringify(registry, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
  }
}

async function removeCredentialFile(credentialDir: string) {
  try {
    await unlink(path.join(credentialDir, "auth.json"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

function isRunnableStatus(
  status: CodexRegistryEntry["status"],
): status is (typeof runnableStatuses)[number] {
  return (runnableStatuses as readonly string[]).includes(status);
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
