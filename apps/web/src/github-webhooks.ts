import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseHandle } from "@maxxy/database";
import { appendWorkspaceEvent } from "@maxxy/database";
import {
  normalizeGitHubWebhook,
  verifyGitHubWebhookSignature,
} from "@maxxy/github";

export async function handleGitHubWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  database: DatabaseHandle,
) {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  if (url.pathname !== "/api/github/webhooks") {
    return false;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return true;
  }

  const payloadBuffer = await readRawBody(request);
  const deliveryId = headerValue(request, "x-github-delivery");
  const eventName = headerValue(request, "x-github-event") ?? "unknown";
  const signature = headerValue(request, "x-hub-signature-256");
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const verified = secret
    ? verifyGitHubWebhookSignature({
        payload: payloadBuffer,
        signature256: signature,
        secret,
      })
    : false;
  const payload = parsePayload(payloadBuffer);
  const action = stringValue(payload.action);
  const idempotencyDeliveryId = deliveryId || `missing_${crypto.randomUUID()}`;

  const [delivery] = await database.sql<{ id: string }[]>`
    insert into github_webhook_deliveries (
      id, delivery_id, event_name, action, signature_verified, payload
    ) values (
      ${`ghdel_${crypto.randomUUID()}`}, ${idempotencyDeliveryId}, ${eventName},
      ${action ?? null}, ${verified}, ${JSON.stringify(payload)}::jsonb
    )
    on conflict (delivery_id) do nothing
    returning id
  `;

  if (!verified) {
    sendJson(response, 401, { ok: false, error: "invalid_signature" });
    return true;
  }

  if (!delivery) {
    sendJson(response, 202, { ok: true, duplicate: true });
    return true;
  }

  const normalized = normalizeGitHubWebhook(eventName, payload);
  if (normalized.kind === "pull_request") {
    await syncPullRequest(database, normalized);
  } else if (normalized.kind === "pull_request_review") {
    await syncPullRequestReview(database, normalized);
  } else if (normalized.kind === "check") {
    await syncPullRequestCheck(database, normalized);
  }

  await database.sql`
    update github_webhook_deliveries
    set processed_at = now(), updated_at = now()
    where id = ${delivery.id}
  `;
  sendJson(response, 202, {
    ok: true,
    duplicate: false,
    kind: normalized.kind,
  });
  return true;
}

async function syncPullRequest(
  database: DatabaseHandle,
  webhook: Extract<
    ReturnType<typeof normalizeGitHubWebhook>,
    { kind: "pull_request" }
  >,
) {
  const [repository] = await database.sql<{ id: string }[]>`
    select id
    from repositories
    where lower(owner) = lower(${webhook.owner}) and lower(name) = lower(${webhook.repo})
    limit 1
  `;
  if (!repository || webhook.number < 1) {
    return;
  }
  const [existing] = await database.sql<
    { id: string; task_id: string | null }[]
  >`
    select id, task_id from pull_requests
    where repository_id = ${repository.id} and number = ${webhook.number}
    limit 1
  `;
  const taskId =
    existing?.task_id ??
    (
      await database.sql<{ id: string }[]>`
        select t.id
        from tasks t
        join workspaces w on w.id = t.workspace_id
        where w.repository_id = ${repository.id} and t.branch_name = ${webhook.headBranch}
        limit 1
      `
    )[0]?.id ??
    null;
  const [pullRequest] = await database.sql<{ id: string }[]>`
    insert into pull_requests (
      id, repository_id, task_id, github_node_id, number, title, status,
      head_branch, base_branch, url, merged_at
    ) values (
      ${existing?.id ?? `pr_${crypto.randomUUID()}`}, ${repository.id}, ${taskId},
      ${webhook.nodeId ?? null}, ${webhook.number}, ${webhook.title}, ${webhook.status},
      ${webhook.headBranch}, ${webhook.baseBranch}, ${webhook.url},
      ${webhook.mergedAt ? new Date(webhook.mergedAt) : null}
    )
    on conflict (repository_id, number) do update
    set task_id = coalesce(excluded.task_id, pull_requests.task_id),
        github_node_id = coalesce(excluded.github_node_id, pull_requests.github_node_id),
        title = excluded.title,
        status = excluded.status,
        head_branch = excluded.head_branch,
        base_branch = excluded.base_branch,
        url = excluded.url,
        merged_at = excluded.merged_at,
        updated_at = now()
    returning id
  `;

  if (taskId) {
    await updateTaskFromPullRequest(
      database,
      taskId,
      webhook.status,
      pullRequest?.id,
    );
  }
}

async function syncPullRequestReview(
  database: DatabaseHandle,
  webhook: Extract<
    ReturnType<typeof normalizeGitHubWebhook>,
    { kind: "pull_request_review" }
  >,
) {
  const [row] = await database.sql<{ id: string; task_id: string | null }[]>`
    select pr.id, pr.task_id
    from pull_requests pr
    join repositories r on r.id = pr.repository_id
    where lower(r.owner) = lower(${webhook.owner})
      and lower(r.name) = lower(${webhook.repo})
      and pr.number = ${webhook.number}
    limit 1
  `;
  if (!row) {
    return;
  }
  await database.sql`
    update pull_requests
    set status = ${webhook.status}, updated_at = now()
    where id = ${row.id}
  `;
  if (row.task_id && webhook.status === "changes_requested") {
    await database.sql`
      update tasks
      set status = 'changes_requested', updated_at = now()
      where id = ${row.task_id} and status = 'awaiting_review'
    `;
  }
  await appendWorkspaceEvent(database, {
    taskId: row.task_id ?? undefined,
    type: "pull_request.review_synced",
    payload: { pullRequestId: row.id, status: webhook.status },
  });
}

async function syncPullRequestCheck(
  database: DatabaseHandle,
  webhook: Extract<
    ReturnType<typeof normalizeGitHubWebhook>,
    { kind: "check" }
  >,
) {
  if (!webhook.pullRequestNumber) {
    return;
  }
  const [row] = await database.sql<{ id: string; task_id: string | null }[]>`
    select pr.id, pr.task_id
    from pull_requests pr
    join repositories r on r.id = pr.repository_id
    where lower(r.owner) = lower(${webhook.owner})
      and lower(r.name) = lower(${webhook.repo})
      and pr.number = ${webhook.pullRequestNumber}
    limit 1
  `;
  if (!row) {
    return;
  }
  await database.sql`
    insert into pull_request_checks (id, pull_request_id, name, status, conclusion, details_url)
    values (
      ${`prcheck_${crypto.randomUUID()}`}, ${row.id}, ${webhook.name},
      ${webhook.status}, ${webhook.conclusion ?? null}, ${webhook.detailsUrl ?? null}
    )
    on conflict (pull_request_id, name) do update
    set status = excluded.status,
        conclusion = excluded.conclusion,
        details_url = excluded.details_url,
        updated_at = now()
  `;
  if (
    webhook.conclusion &&
    !["success", "neutral", "skipped"].includes(webhook.conclusion)
  ) {
    await database.sql`
      update pull_requests set status = 'checks_failed', updated_at = now()
      where id = ${row.id} and status not in ('merged','closed')
    `;
  }
  await appendWorkspaceEvent(database, {
    taskId: row.task_id ?? undefined,
    type: "pull_request.check_synced",
    payload: {
      pullRequestId: row.id,
      name: webhook.name,
      status: webhook.status,
      conclusion: webhook.conclusion,
    },
  });
}

async function updateTaskFromPullRequest(
  database: DatabaseHandle,
  taskId: string,
  status: string,
  pullRequestId: string | undefined,
) {
  const taskStatus =
    status === "merged"
      ? "merged"
      : status === "closed"
        ? "failed"
        : status === "draft" || status === "open"
          ? "awaiting_review"
          : undefined;
  await database.sql`
    update tasks
    set pull_request_id = coalesce(${pullRequestId ?? null}, pull_request_id),
        status = coalesce(${taskStatus ?? null}, status),
        updated_at = now()
    where id = ${taskId}
  `;
  await appendWorkspaceEvent(database, {
    taskId,
    type: "pull_request.synced",
    payload: { status, pullRequestId },
  });
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1024 * 1024) {
      throw new Error("GitHub webhook payload is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parsePayload(payload: Buffer): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload.toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function headerValue(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
