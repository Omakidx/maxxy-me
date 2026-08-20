import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexConnectionRegistry } from "./registry";

describe("CodexConnectionRegistry", () => {
  test("creates isolated file-backed Codex homes per connection", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-registry-"));
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));

    const first = await registry.register({
      codexConnectionId: "codexconn_a",
      label: "Duplicate label",
      authMode: "chatgpt",
      capacitySourceId: "capsrc_shared",
    });
    const second = await registry.register({
      codexConnectionId: "codexconn_b",
      label: "Duplicate label",
      authMode: "chatgpt",
      capacitySourceId: "capsrc_shared",
    });

    expect(first.credentialDir).not.toBe(second.credentialDir);
    expect(
      await readFile(path.join(first.credentialDir, "config.toml"), "utf8"),
    ).toContain('cli_auth_credentials_store = "file"');
    expect(
      (await stat(path.join(first.credentialDir, "config.toml"))).mode & 0o077,
    ).toBe(0);
    expect(await registry.report()).toHaveLength(2);
  });

  test("does not remove another connection and blocks active removal", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-registry-remove-"));
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));
    const first = await registry.register({
      codexConnectionId: "codexconn_a",
      authMode: "chatgpt",
    });
    await registry.register({
      codexConnectionId: "codexconn_b",
      authMode: "chatgpt",
    });
    const authFile = path.join(first.credentialDir, "auth.json");
    await writeFile(authFile, "{}");

    await expect(registry.remove("codexconn_a", 1)).rejects.toThrow();
    await registry.remove("codexconn_a", 0);
    await expect(stat(authFile)).rejects.toThrow();

    const remaining = await registry.list();
    expect(remaining.map((entry) => entry.codexConnectionId)).toEqual([
      "codexconn_b",
    ]);
  });

  test("disconnects one lane without removing its registry entry", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "maxxy-registry-disconnect-"),
    );
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));
    const connection = await registry.register({
      codexConnectionId: "codexconn_disconnect",
      authMode: "chatgpt",
      status: "ready_chatgpt",
    });
    const authFile = path.join(connection.credentialDir, "auth.json");
    await writeFile(authFile, "{}");

    await registry.disconnect(connection.codexConnectionId);

    expect((await registry.get(connection.codexConnectionId))?.status).toBe(
      "disabled",
    );
    await expect(stat(authFile)).rejects.toThrow();
  });
  test("clears stale credentials before reauthentication", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "maxxy-registry-reauthenticate-"),
    );
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));
    const connection = await registry.register({
      codexConnectionId: "codexconn_reauthenticate",
      authMode: "chatgpt",
      status: "error",
    });
    const authFile = path.join(connection.credentialDir, "auth.json");
    await writeFile(authFile, "{}");

    await registry.reauthenticate(connection.codexConnectionId);

    expect((await registry.get(connection.codexConnectionId))?.status).toBe(
      "authenticating",
    );
    await expect(stat(authFile)).rejects.toThrow();
  });

  test("rejects shared credential slots for active runtime connections", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "maxxy-registry-shared-slot-"),
    );
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));
    await registry.register({
      codexConnectionId: "codexconn_a",
      credentialSlotId: "shared-slot",
      authMode: "chatgpt",
      status: "ready_chatgpt",
    });

    await expect(
      registry.register({
        codexConnectionId: "codexconn_b",
        credentialSlotId: "shared-slot",
        authMode: "chatgpt",
        status: "ready_chatgpt",
      }),
    ).rejects.toThrow("Credential slot is already assigned");
  });

  test("runtime resolution rejects disabled connections", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "maxxy-registry-runtime-status-"),
    );
    const registry = CodexConnectionRegistry.at(root, path.join(root, "codex"));
    await registry.register({
      codexConnectionId: "codexconn_disabled",
      authMode: "chatgpt",
      status: "disabled",
    });

    await expect(
      registry.resolveForRuntime("codexconn_disabled"),
    ).rejects.toThrow("not runnable");
  });
});
