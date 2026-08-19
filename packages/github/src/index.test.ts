import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  buildDraftPullRequestBody,
  normalizeGitHubWebhook,
  verifyGitHubWebhookSignature,
} from "./index";

describe("github helpers", () => {
  test("verifies sha256 webhook signatures", () => {
    const payload = Buffer.from(JSON.stringify({ ok: true }));
    const secret = "webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;
    expect(
      verifyGitHubWebhookSignature({
        payload,
        secret,
        signature256: signature,
      }),
    ).toBe(true);
    expect(
      verifyGitHubWebhookSignature({
        payload,
        secret,
        signature256: "sha256=bad",
      }),
    ).toBe(false);
  });

  test("builds PR bodies with task, files, validation, risks, and host", () => {
    const body = buildDraftPullRequestBody({
      taskId: "task_1",
      taskSummary: "Update README",
      agentRole: "backend",
      changedFiles: ["README.md"],
      validationResults: [{ command: "git diff --check", status: "completed" }],
      executionHostName: "host-a",
    });
    expect(body).toContain("task_1");
    expect(body).toContain("README.md");
    expect(body).toContain("host-a");
  });

  test("normalizes pull request webhook payloads", () => {
    expect(
      normalizeGitHubWebhook("pull_request", {
        action: "opened",
        repository: { name: "repo", owner: { login: "owner" } },
        pull_request: {
          number: 7,
          title: "PR",
          html_url: "https://github.com/owner/repo/pull/7",
          node_id: "node",
          state: "open",
          draft: true,
          head: { ref: "maxxy/task/backend" },
          base: { ref: "main" },
        },
      }),
    ).toMatchObject({
      kind: "pull_request",
      owner: "owner",
      repo: "repo",
      number: 7,
      status: "draft",
    });
  });
});
