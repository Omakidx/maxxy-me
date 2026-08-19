import { describe, expect, test } from "bun:test";
import {
  createSecretToken,
  createSignedToken,
  FixedWindowRateLimiter,
  hashPassword,
  hashSecret,
  verifyPassword,
  verifySignedToken,
} from "./index";

describe("security primitives", () => {
  test("hashes and verifies passwords", () => {
    const hash = hashPassword("correct horse battery staple");

    expect(hash).toStartWith("pbkdf2_sha256$");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  test("hashes opaque tokens without preserving the raw token", () => {
    const token = createSecretToken("mxp");
    const hash = hashSecret(token);

    expect(token).toStartWith("mxp_");
    expect(hash).toStartWith("sha256:");
    expect(hash).not.toContain(token);
    expect(hashSecret(token)).toBe(hash);
  });

  test("signs and verifies csrf-style tokens", () => {
    const token = createSignedToken("secret", "csrf");

    expect(verifySignedToken("secret", token)).toBe(true);
    expect(verifySignedToken("different", token)).toBe(false);
    expect(verifySignedToken("secret", `${token}x`)).toBe(false);
  });

  test("limits requests per fixed window", () => {
    const limiter = new FixedWindowRateLimiter();

    expect(limiter.check("key", 2, 1000, 0).allowed).toBe(true);
    expect(limiter.check("key", 2, 1000, 100).allowed).toBe(true);
    expect(limiter.check("key", 2, 1000, 200).allowed).toBe(false);
    expect(limiter.check("key", 2, 1000, 1200).allowed).toBe(true);
  });
});
