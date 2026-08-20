import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loginCodexConnection } from "./codex-login";
import { loadConfig } from "./config";
import { CodexConnectionRegistry } from "./registry";

function testConfig(root: string, codexBinary: string) {
  return {
    ...loadConfig(),
    CODEX_BINARY: codexBinary,
    dataDir: path.join(root, "state"),
    codexAccountsDir: path.join(root, "accounts"),
  };
}

async function executable(root: string, source: string) {
  const binary = path.join(root, "codex-fixture");
  await writeFile(binary, source);
  await chmod(binary, 0o700);
  return binary;
}

describe("loginCodexConnection", () => {
  test("uses an isolated CODEX_HOME and reports a ready ChatGPT lane", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-codex-login-"));
    const binary = await executable(
      root,
      [
        "#!/bin/sh",
        'test "$1" = "login" || exit 2',
        'printf "{}" > "$CODEX_HOME/auth.json"',
      ].join("\n"),
    );
    const config = testConfig(root, binary);

    const connection = await loginCodexConnection(config, {
      codexConnectionId: "codexconn_login",
      authMode: "chatgpt",
      credentialSlotId: "primary",
      capacitySourceId: "capsrc_login",
    });

    expect(connection.status).toBe("ready_chatgpt");
    expect(connection.capacitySourceId).toBe("capsrc_login");
    expect(
      await readFile(
        path.join(config.codexAccountsDir, "primary", "auth.json"),
        "utf8",
      ),
    ).toBe("{}");
  });

  test("marks the isolated lane as error when Codex login fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-codex-failure-"));
    const binary = await executable(root, "#!/bin/sh\nexit 9\n");
    const config = testConfig(root, binary);

    await expect(
      loginCodexConnection(config, {
        codexConnectionId: "codexconn_failure",
        authMode: "chatgpt",
        credentialSlotId: "failure",
      }),
    ).rejects.toThrow("status 9");

    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    expect((await registry.get("codexconn_failure"))?.status).toBe("error");
  });
});
