import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HostConnectionReport } from "@maxxy/contracts";
import { z } from "zod";

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
  removedAt: z.string().optional(),
});
const registrySchema = z.object({
  connections: z.array(connectionSchema).default([]),
});

export type CodexRegistryEntry = z.infer<typeof connectionSchema>;
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
    const credentialDir = path.join(
      this.codexAccountsDir,
      sanitizeSegment(credentialSlotId),
    );
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
        removedAt: undefined,
      };
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

  async remove(codexConnectionId: string, activeLeaseCount = 0) {
    if (activeLeaseCount > 0) {
      throw new Error("Cannot remove a Codex connection with active leases");
    }
    const registry = await this.read();
    const entry = registry.connections.find(
      (candidate) => candidate.codexConnectionId === codexConnectionId,
    );
    if (!entry || entry.removedAt) {
      return null;
    }
    entry.status = "disabled";
    entry.removedAt = new Date().toISOString();
    await this.write(registry);
    return entry;
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
    if (entry.status !== "signed_out") {
      return entry.status;
    }
    try {
      await stat(path.join(entry.credentialDir, "auth.json"));
      return entry.authMode === "chatgpt" ? "ready_chatgpt" : entry.status;
    } catch {
      return entry.status;
    }
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

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
