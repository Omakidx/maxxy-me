import { createHmac, timingSafeEqual } from "node:crypto";

export type PullRequestState =
  | "not_created"
  | "draft"
  | "open"
  | "merged"
  | "closed";

export type NormalizedPullRequestWebhook = {
  kind: "pull_request";
  action?: string | undefined;
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  nodeId?: string | undefined;
  status: string;
  headBranch: string;
  baseBranch: string;
  mergedAt?: string | undefined;
};

export type NormalizedReviewWebhook = {
  kind: "pull_request_review";
  action?: string | undefined;
  owner: string;
  repo: string;
  number: number;
  status: "approved" | "changes_requested" | "open";
};

export type NormalizedCheckWebhook = {
  kind: "check";
  owner: string;
  repo: string;
  pullRequestNumber?: number | undefined;
  name: string;
  status: string;
  conclusion?: string | undefined;
  detailsUrl?: string | undefined;
};

export type NormalizedGitHubWebhook =
  | NormalizedPullRequestWebhook
  | NormalizedReviewWebhook
  | NormalizedCheckWebhook
  | { kind: "ignored" };

export function verifyGitHubWebhookSignature(input: {
  payload: Buffer | string;
  signature256: string | undefined;
  secret: string;
}) {
  const signature = input.signature256?.trim() ?? "";
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", input.secret)
    .update(input.payload)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function buildDraftPullRequestBody(input: {
  taskId: string;
  taskSummary: string;
  agentRole: string;
  changedFiles: string[];
  validationResults: { command: string; status: string; output?: string }[];
  knownRisks?: string[] | undefined;
  dependencyPrs?: string[] | undefined;
  executionHostName?: string | undefined;
}) {
  const changedFiles = input.changedFiles.length
    ? input.changedFiles.map((file) => `- ${file}`).join("\n")
    : "- No changed files reported";
  const validation = input.validationResults.length
    ? input.validationResults
        .map((result) => {
          const output = result.output?.trim();
          return `- ${result.command}: ${result.status}${output ? `\n  ${output.slice(0, 1000)}` : ""}`;
        })
        .join("\n")
    : "- No validation commands were run";
  const risks = input.knownRisks?.length
    ? input.knownRisks.map((risk) => `- ${risk}`).join("\n")
    : "- None reported";
  const dependencies = input.dependencyPrs?.length
    ? input.dependencyPrs.map((pr) => `- ${pr}`).join("\n")
    : "- None";

  return [
    "## Task",
    input.taskSummary,
    "",
    "## Agent Role",
    input.agentRole,
    "",
    "## Changed Files",
    changedFiles,
    "",
    "## Validation",
    validation,
    "",
    "## Known Risks",
    risks,
    "",
    "## Dependency PRs",
    dependencies,
    "",
    "## maxxy Task ID",
    input.taskId,
    "",
    "## Execution Host",
    input.executionHostName ?? "unknown",
  ].join("\n");
}

export function normalizeGitHubWebhook(
  eventName: string,
  payload: Record<string, unknown>,
): NormalizedGitHubWebhook {
  if (eventName === "pull_request" && isRecord(payload.pull_request)) {
    const pr = payload.pull_request;
    const repository = repositoryInfo(payload);
    return {
      kind: "pull_request",
      action: stringValue(payload.action),
      owner: repository.owner,
      repo: repository.repo,
      number: numberValue(pr.number) ?? 0,
      title: stringValue(pr.title) ?? "Pull request",
      url: stringValue(pr.html_url) ?? stringValue(pr.url) ?? "",
      nodeId: stringValue(pr.node_id),
      status: pullRequestStatus(pr),
      headBranch: branchRef(pr.head),
      baseBranch: branchRef(pr.base),
      mergedAt: stringValue(pr.merged_at),
    };
  }

  if (eventName === "pull_request_review" && isRecord(payload.review)) {
    const repository = repositoryInfo(payload);
    const pr = isRecord(payload.pull_request) ? payload.pull_request : {};
    return {
      kind: "pull_request_review",
      action: stringValue(payload.action),
      owner: repository.owner,
      repo: repository.repo,
      number: numberValue(pr.number) ?? 0,
      status: reviewStatus(stringValue(payload.review.state)),
    };
  }

  if (eventName === "check_run" && isRecord(payload.check_run)) {
    const repository = repositoryInfo(payload);
    const check = payload.check_run;
    const pullRequests = Array.isArray(check.pull_requests)
      ? check.pull_requests
      : [];
    const pr = pullRequests.find(isRecord);
    return {
      kind: "check",
      owner: repository.owner,
      repo: repository.repo,
      pullRequestNumber: isRecord(pr) ? numberValue(pr.number) : undefined,
      name: stringValue(check.name) ?? "check_run",
      status: stringValue(check.status) ?? "unknown",
      conclusion: stringValue(check.conclusion),
      detailsUrl: stringValue(check.details_url) ?? stringValue(check.html_url),
    };
  }

  if (eventName === "check_suite" && isRecord(payload.check_suite)) {
    const repository = repositoryInfo(payload);
    const suite = payload.check_suite;
    const pullRequests = Array.isArray(suite.pull_requests)
      ? suite.pull_requests
      : [];
    const pr = pullRequests.find(isRecord);
    const app = isRecord(suite.app) ? suite.app : {};
    return {
      kind: "check",
      owner: repository.owner,
      repo: repository.repo,
      pullRequestNumber: isRecord(pr) ? numberValue(pr.number) : undefined,
      name: stringValue(app.name) ?? "check_suite",
      status: stringValue(suite.status) ?? "unknown",
      conclusion: stringValue(suite.conclusion),
      detailsUrl: stringValue(suite.url),
    };
  }

  return { kind: "ignored" };
}

function pullRequestStatus(pr: Record<string, unknown>) {
  if (pr.merged === true) {
    return "merged";
  }
  if (stringValue(pr.state) === "closed") {
    return "closed";
  }
  if (pr.draft === true) {
    return "draft";
  }
  return "open";
}

function reviewStatus(state: string | undefined) {
  if (state === "approved") {
    return "approved";
  }
  if (state === "changes_requested") {
    return "changes_requested";
  }
  return "open";
}

function repositoryInfo(payload: Record<string, unknown>) {
  const repo = isRecord(payload.repository) ? payload.repository : {};
  const owner = isRecord(repo.owner) ? repo.owner : {};
  return {
    owner: stringValue(owner.login) ?? "",
    repo: stringValue(repo.name) ?? "",
  };
}

function branchRef(value: unknown) {
  return isRecord(value) ? (stringValue(value.ref) ?? "") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
