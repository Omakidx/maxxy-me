import { describe, expect, test } from "bun:test";
import { requiresSecureWebSocket } from "./api-security";

describe("WebSocket transport security", () => {
  test("allows local HTTP development and requires TLS elsewhere", () => {
    expect(requiresSecureWebSocket("development")).toBe(false);
    expect(requiresSecureWebSocket("staging")).toBe(true);
    expect(requiresSecureWebSocket("production")).toBe(true);
  });
});
