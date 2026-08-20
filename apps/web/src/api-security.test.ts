import { describe, expect, test } from "bun:test";
import { requiresSecureCookies, requiresSecureWebSocket } from "./api-security";

describe("WebSocket transport security", () => {
  test("allows local HTTP development and requires TLS elsewhere", () => {
    expect(requiresSecureWebSocket("development")).toBe(false);
    expect(requiresSecureWebSocket("staging")).toBe(true);
    expect(requiresSecureWebSocket("production")).toBe(true);
  });

  test("allows cookies on local HTTP and secures HTTPS or deployed environments", () => {
    expect(requiresSecureCookies("development", "http://127.0.0.1:8080")).toBe(
      false,
    );
    expect(
      requiresSecureCookies("development", "https://workspace.example.com"),
    ).toBe(true);
    expect(requiresSecureCookies("production", "http://localhost")).toBe(true);
  });
});
