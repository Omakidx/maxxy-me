import { describe, expect, test } from "bun:test";
import { parseGitHubAccount } from "./tools";

describe("GitHub tool status", () => {
  test("extracts the active account without retaining auth output", () => {
    expect(
      parseGitHubAccount(
        "Logged in to github.com account octocat (keyring)\n- Active account: true",
      ),
    ).toBe("octocat");
  });

  test("returns undefined when no account is authenticated", () => {
    expect(
      parseGitHubAccount("You are not logged into any GitHub hosts."),
    ).toBeUndefined();
  });
});
