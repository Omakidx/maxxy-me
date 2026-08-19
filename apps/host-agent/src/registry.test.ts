import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
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
    await registry.register({
      codexConnectionId: "codexconn_a",
      authMode: "chatgpt",
    });
    await registry.register({
      codexConnectionId: "codexconn_b",
      authMode: "chatgpt",
    });

    await expect(registry.remove("codexconn_a", 1)).rejects.toThrow();
    await registry.remove("codexconn_a", 0);

    const remaining = await registry.list();
    expect(remaining.map((entry) => entry.codexConnectionId)).toEqual([
      "codexconn_b",
    ]);
  });
});
