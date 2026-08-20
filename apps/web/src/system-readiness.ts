import type { DatabaseHandle } from "@maxxy/database";

const DEFAULT_WORKER_STALE_AFTER_MS = 15_000;
const DEFAULT_HOST_STALE_AFTER_MS = 45_000;

type ReadinessSnapshot = {
  workerLastHeartbeatAt: Date | string | null;
  enrolledHostCount: number;
  onlineHostCount: number;
  requiredHostCount: number;
  requiredOnlineHostCount: number;
  readyConnectionCount: number;
};

export type SystemReadiness = {
  ready: boolean;
  checks: {
    web: "ok";
    database: "ok";
    worker: "ok" | "error";
    hosts: "ok" | "error";
    codex: "ok" | "error";
  };
  reasons: string[];
  counts: {
    enrolledHosts: number;
    onlineHosts: number;
    requiredHosts: number;
    requiredOnlineHosts: number;
    readyConnections: number;
  };
  lastWorkerHeartbeatAt: string | null;
  checkedAt: string;
};

type ReadinessOptions = {
  now?: Date;
  workerStaleAfterMs?: number;
};

export function evaluateSystemReadiness(
  snapshot: ReadinessSnapshot,
  options: ReadinessOptions = {},
): SystemReadiness {
  const now = options.now ?? new Date();
  const workerStaleAfterMs =
    options.workerStaleAfterMs ?? DEFAULT_WORKER_STALE_AFTER_MS;
  const workerHeartbeat = snapshot.workerLastHeartbeatAt
    ? new Date(snapshot.workerLastHeartbeatAt)
    : null;
  const workerReady = Boolean(
    workerHeartbeat &&
      Number.isFinite(workerHeartbeat.valueOf()) &&
      now.valueOf() - workerHeartbeat.valueOf() <= workerStaleAfterMs,
  );
  const hostsReady =
    snapshot.requiredHostCount > 0
      ? snapshot.requiredOnlineHostCount === snapshot.requiredHostCount
      : snapshot.onlineHostCount > 0;
  const codexReady = snapshot.readyConnectionCount > 0;
  const reasons: string[] = [];

  if (!workerReady) {
    reasons.push("The scheduler worker heartbeat is missing or stale.");
  }
  if (!hostsReady) {
    reasons.push(
      snapshot.requiredHostCount > 0
        ? "One or more required execution hosts are offline or stale."
        : "No fresh execution host is online.",
    );
  }
  if (!codexReady) {
    reasons.push("No ready Codex connection is available on an online host.");
  }

  return {
    ready: workerReady && hostsReady && codexReady,
    checks: {
      web: "ok",
      database: "ok",
      worker: workerReady ? "ok" : "error",
      hosts: hostsReady ? "ok" : "error",
      codex: codexReady ? "ok" : "error",
    },
    reasons,
    counts: {
      enrolledHosts: snapshot.enrolledHostCount,
      onlineHosts: snapshot.onlineHostCount,
      requiredHosts: snapshot.requiredHostCount,
      requiredOnlineHosts: snapshot.requiredOnlineHostCount,
      readyConnections: snapshot.readyConnectionCount,
    },
    lastWorkerHeartbeatAt: workerHeartbeat?.toISOString() ?? null,
    checkedAt: now.toISOString(),
  };
}

export async function readSystemReadiness(
  database: DatabaseHandle,
): Promise<SystemReadiness> {
  const workerStaleAfterMs = positiveInteger(
    process.env.SYSTEM_WORKER_STALE_AFTER_MS,
    DEFAULT_WORKER_STALE_AFTER_MS,
  );
  const hostStaleAfterMs = positiveInteger(
    process.env.SYSTEM_HOST_STALE_AFTER_MS,
    DEFAULT_HOST_STALE_AFTER_MS,
  );
  const [snapshot] = await database.sql<
    {
      worker_last_heartbeat_at: Date | string | null;
      enrolled_host_count: number;
      online_host_count: number;
      required_host_count: number;
      required_online_host_count: number;
      ready_connection_count: number;
    }[]
  >`
    with required_hosts as (
      select default_host_id as id
      from workspaces
      where default_host_id is not null
      union
      select assigned_host_id as id
      from tasks
      where assigned_host_id is not null
        and status in ('assigned','claimed','starting','running','awaiting_approval','validating','pushing','opening_pull_request')
    )
    select
      (select max(heartbeat_at) from phase0_worker_heartbeats where service_name = 'maxxy-worker') as worker_last_heartbeat_at,
      (select count(*)::int from hosts where revoked_at is null) as enrolled_host_count,
      (select count(*)::int from hosts
        where status = 'online' and revoked_at is null
          and last_heartbeat_at >= now() - (${hostStaleAfterMs} || ' milliseconds')::interval
      ) as online_host_count,
      (select count(*)::int from required_hosts) as required_host_count,
      (select count(*)::int from required_hosts required
        join hosts host on host.id = required.id
        where host.status = 'online' and host.revoked_at is null
          and host.last_heartbeat_at >= now() - (${hostStaleAfterMs} || ' milliseconds')::interval
      ) as required_online_host_count,
      (select count(*)::int from codex_connections connection
        join hosts host on host.id = connection.host_id
        where connection.disabled_at is null
          and connection.status in ('ready_chatgpt','ready_api_key','ready_enterprise_access_token')
          and host.status = 'online' and host.revoked_at is null
          and host.last_heartbeat_at >= now() - (${hostStaleAfterMs} || ' milliseconds')::interval
      ) as ready_connection_count
  `;

  if (!snapshot) {
    throw new Error("System readiness query returned no result");
  }

  return evaluateSystemReadiness(
    {
      workerLastHeartbeatAt: snapshot.worker_last_heartbeat_at,
      enrolledHostCount: Number(snapshot.enrolled_host_count),
      onlineHostCount: Number(snapshot.online_host_count),
      requiredHostCount: Number(snapshot.required_host_count),
      requiredOnlineHostCount: Number(snapshot.required_online_host_count),
      readyConnectionCount: Number(snapshot.ready_connection_count),
    },
    { workerStaleAfterMs },
  );
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
