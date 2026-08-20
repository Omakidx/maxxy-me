import { describe, expect, test } from "bun:test";
import { parseCodexLoginArgs } from "./codex-login-args";

const validArgs = [
  "--connection-id",
  "codexconn_283559b2-22d5-467c-8d9a-8321612c18cf",
  "--auth-mode",
  "chatgpt",
  "--capacity-source-id",
  "capsrc_177131a1-c0de-45fe-a4d9-fe75a8244250",
  "--expires-at",
  "2026-08-20T15:50:00.000Z",
];

describe("parseCodexLoginArgs", () => {
  test("accepts only a complete generated command", () => {
    expect(parseCodexLoginArgs([...validArgs, "--device-auth"])).toEqual({
      codexConnectionId: "codexconn_283559b2-22d5-467c-8d9a-8321612c18cf",
      authMode: "chatgpt",
      capacitySourceId: "capsrc_177131a1-c0de-45fe-a4d9-fe75a8244250",
      expiresAt: "2026-08-20T15:50:00.000Z",
      deviceAuth: true,
    });
  });

  test("rejects legacy shared slots and incomplete commands", () => {
    expect(() =>
      parseCodexLoginArgs([...validArgs, "--credential-slot", "primary"]),
    ).toThrow("no longer accepted");
    expect(() =>
      parseCodexLoginArgs(
        validArgs.filter((value) => value !== "--expires-at"),
      ),
    ).toThrow();
  });

  test("rejects duplicate and mode-incompatible arguments", () => {
    expect(() =>
      parseCodexLoginArgs([...validArgs, "--auth-mode", "chatgpt"]),
    ).toThrow("Duplicate");
    expect(() =>
      parseCodexLoginArgs(
        validArgs
          .map((value) => (value === "chatgpt" ? "api_key" : value))
          .concat("--device-auth"),
      ),
    ).toThrow("only be used with ChatGPT");
  });

  test("rejects malformed generated identifiers", () => {
    expect(() =>
      parseCodexLoginArgs(
        validArgs.map((value) =>
          value.startsWith("codexconn_")
            ? "codexconn_------------------------------------"
            : value,
        ),
      ),
    ).toThrow("generated codexconn UUID");
  });
});
