import { canTransitionTask, type TaskStatus } from "@maxxy/contracts";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  agentProfiles,
  approvals,
  auditLogs,
  codexCapacityPoolMembers,
  codexCapacityPools,
  codexCapacitySnapshots,
  codexCapacitySources,
  codexConnectionLeases,
  codexConnections,
  events,
  githubWebhookDeliveries,
  hostHeartbeats,
  hosts,
  idempotencyKeys,
  pullRequestChecks,
  pullRequests,
  repositories,
  taskLeases,
  taskRuntimeAttempts,
  tasks,
  users,
  workspaces,
} from "../schema";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class HostRepository {
  constructor(private readonly db: Database) {}

  async upsertHost(input: {
    id?: string;
    name: string;
    status?: string;
    maxConcurrentAgents?: number;
    protocolVersion?: number;
    toolInventory?: Record<string, unknown>;
  }) {
    const host = {
      id: input.id ?? id("host"),
      name: input.name,
      status: input.status ?? "unknown",
      maxConcurrentAgents: input.maxConcurrentAgents ?? 1,
      protocolVersion: input.protocolVersion,
      toolInventory: input.toolInventory ?? {},
    };

    const [row] = await this.db
      .insert(hosts)
      .values(host)
      .onConflictDoUpdate({
        target: hosts.id,
        set: {
          name: host.name,
          status: host.status,
          maxConcurrentAgents: host.maxConcurrentAgents,
          protocolVersion: host.protocolVersion,
          toolInventory: host.toolInventory,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return row;
  }

  async recordHeartbeat(input: {
    hostId: string;
    status: string;
    activeRuns?: number;
    capacity?: Record<string, unknown>;
    tools?: Record<string, unknown>;
  }) {
    const [heartbeat] = await this.db
      .insert(hostHeartbeats)
      .values({
        hostId: input.hostId,
        status: input.status,
        activeRuns: input.activeRuns ?? 0,
        capacity: input.capacity ?? {},
        tools: input.tools ?? {},
      })
      .returning();

    await this.db
      .update(hosts)
      .set({
        status: input.status,
        lastHeartbeatAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(hosts.id, input.hostId));

    return heartbeat;
  }
}

export class WorkspaceRepository {
  constructor(private readonly db: Database) {}

  async upsertRepository(input: {
    id?: string;
    owner: string;
    name: string;
    remoteUrl: string;
    defaultBranch?: string;
  }) {
    const [row] = await this.db
      .insert(repositories)
      .values({
        id: input.id ?? id("repo"),
        provider: "github",
        owner: input.owner,
        name: input.name,
        remoteUrl: input.remoteUrl,
        defaultBranch: input.defaultBranch ?? "main",
      })
      .onConflictDoUpdate({
        target: [repositories.provider, repositories.owner, repositories.name],
        set: {
          remoteUrl: input.remoteUrl,
          defaultBranch: input.defaultBranch ?? "main",
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return row;
  }

  async createWorkspace(input: {
    id?: string;
    name: string;
    repositoryId: string;
    defaultHostId?: string;
    projectPath: string;
    worktreeRoot: string;
    baseBranch?: string;
    maximumConcurrentAgents?: number;
  }) {
    const [row] = await this.db
      .insert(workspaces)
      .values({
        id: input.id ?? id("ws"),
        name: input.name,
        repositoryId: input.repositoryId,
        defaultHostId: input.defaultHostId,
        projectPath: input.projectPath,
        worktreeRoot: input.worktreeRoot,
        baseBranch: input.baseBranch ?? "main",
        maximumConcurrentAgents: input.maximumConcurrentAgents ?? 1,
      })
      .returning();

    return row;
  }
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  async createTask(input: {
    id?: string;
    workspaceId: string;
    title: string;
    prompt: string;
    priority?: number;
    idempotencyKey?: string;
  }) {
    const taskId = input.id ?? id("task");
    const insert = this.db.insert(tasks).values({
      id: taskId,
      workspaceId: input.workspaceId,
      title: input.title,
      prompt: input.prompt,
      priority: input.priority ?? 100,
      idempotencyKey: input.idempotencyKey,
    });

    if (input.idempotencyKey) {
      const [row] = await insert
        .onConflictDoUpdate({
          target: [tasks.workspaceId, tasks.idempotencyKey],
          set: { updatedAt: sql`now()` },
        })
        .returning();
      return row;
    }

    const [row] = await insert.returning();
    return row;
  }

  async transitionTask(taskId: string, nextStatus: TaskStatus) {
    const [current] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!current) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const currentStatus = current.status as TaskStatus;
    if (!canTransitionTask(currentStatus, nextStatus)) {
      throw new Error(
        `Invalid task transition: ${currentStatus} -> ${nextStatus}`,
      );
    }

    const [row] = await this.db
      .update(tasks)
      .set({ status: nextStatus, updatedAt: sql`now()` })
      .where(eq(tasks.id, taskId))
      .returning();

    return row;
  }

  async acquireTaskLease(input: {
    taskId: string;
    hostId: string;
    leaseSeconds: number;
  }) {
    const [lease] = await this.db
      .insert(taskLeases)
      .values({
        id: id("tasklease"),
        taskId: input.taskId,
        hostId: input.hostId,
        status: "active",
        expiresAt: sql`now() + (${input.leaseSeconds} || ' seconds')::interval`,
        heartbeatAt: sql`now()`,
      })
      .onConflictDoNothing()
      .returning();

    return lease ?? null;
  }

  async expireStaleLeases(now = new Date()) {
    return this.db
      .update(taskLeases)
      .set({ status: "expired", updatedAt: sql`now()` })
      .where(
        and(eq(taskLeases.status, "active"), lt(taskLeases.expiresAt, now)),
      )
      .returning();
  }
}

export class EventRepository {
  constructor(private readonly db: Database) {}

  async appendEvent(input: {
    type: string;
    workspaceId?: string;
    taskId?: string;
    hostId?: string;
    attemptId?: string;
    codexConnectionId?: string;
    capacitySourceId?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    return this.db.transaction(async (tx) => {
      if (input.workspaceId) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`,
        );
      }

      if (input.workspaceId && input.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(events)
          .where(
            and(
              eq(events.workspaceId, input.workspaceId),
              eq(events.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          return existing;
        }
      }

      const [sequenceRow] = await tx
        .select({
          nextSequence: sql<number>`coalesce(max(${events.sequence}), -1) + 1`,
        })
        .from(events)
        .where(
          input.workspaceId
            ? eq(events.workspaceId, input.workspaceId)
            : isNull(events.workspaceId),
        );
      const nextSequence = sequenceRow?.nextSequence ?? 0;

      const [row] = await tx
        .insert(events)
        .values({
          id: id("evt"),
          type: input.type,
          workspaceId: input.workspaceId,
          taskId: input.taskId,
          hostId: input.hostId,
          attemptId: input.attemptId,
          codexConnectionId: input.codexConnectionId,
          capacitySourceId: input.capacitySourceId,
          sequence: nextSequence,
          payload: input.payload ?? {},
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      return row;
    });
  }
}

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  async createApproval(input: {
    taskId?: string;
    agentSessionId?: string;
    type: string;
    requestedPayload?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(approvals)
      .values({
        id: id("approval"),
        taskId: input.taskId,
        agentSessionId: input.agentSessionId,
        type: input.type,
        requestedPayload: input.requestedPayload ?? {},
      })
      .returning();
    return row;
  }

  async decideApproval(input: {
    approvalId: string;
    decision: string;
    decidedByUserId?: string;
  }) {
    const [row] = await this.db
      .update(approvals)
      .set({
        status: "resolved",
        decision: input.decision,
        decidedByUserId: input.decidedByUserId,
        decidedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(approvals.id, input.approvalId),
          eq(approvals.status, "pending"),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export class PullRequestRepository {
  constructor(private readonly db: Database) {}

  async upsertPullRequest(input: {
    id?: string;
    repositoryId: string;
    taskId?: string;
    number: number;
    title: string;
    status: string;
    headBranch: string;
    baseBranch: string;
    url: string;
    githubNodeId?: string;
  }) {
    const [row] = await this.db
      .insert(pullRequests)
      .values({ ...input, id: input.id ?? id("pr") })
      .onConflictDoUpdate({
        target: [pullRequests.repositoryId, pullRequests.number],
        set: {
          title: input.title,
          status: input.status,
          headBranch: input.headBranch,
          baseBranch: input.baseBranch,
          url: input.url,
          githubNodeId: input.githubNodeId,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  async upsertCheck(input: {
    pullRequestId: string;
    name: string;
    status: string;
    conclusion?: string;
    detailsUrl?: string;
  }) {
    const [row] = await this.db
      .insert(pullRequestChecks)
      .values({ id: id("prcheck"), ...input })
      .onConflictDoUpdate({
        target: [pullRequestChecks.pullRequestId, pullRequestChecks.name],
        set: {
          status: input.status,
          conclusion: input.conclusion,
          detailsUrl: input.detailsUrl,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  async recordWebhookDelivery(input: {
    deliveryId: string;
    eventName: string;
    action?: string;
    signatureVerified: boolean;
    payload?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(githubWebhookDeliveries)
      .values({ id: id("ghdel"), ...input, payload: input.payload ?? {} })
      .onConflictDoNothing({ target: githubWebhookDeliveries.deliveryId })
      .returning();

    return { row: row ?? null, duplicate: !row };
  }
}

export class AuditRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    actorUserId?: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(auditLogs)
      .values({ id: id("audit"), ...input, metadata: input.metadata ?? {} })
      .returning();
    return row;
  }
}

export class CodexCapacitySourceRepository {
  constructor(private readonly db: Database) {}

  async upsertSource(input: {
    id?: string;
    label: string;
    kind: string;
    providerScopeHint?: string;
    maxConcurrentRuns?: number;
  }) {
    const sourceId = input.id ?? id("capsrc");
    const [row] = await this.db
      .insert(codexCapacitySources)
      .values({
        ...input,
        id: sourceId,
        maxConcurrentRuns: input.maxConcurrentRuns ?? 1,
      })
      .onConflictDoUpdate({
        target: codexCapacitySources.id,
        set: {
          label: input.label,
          kind: input.kind,
          providerScopeHint: input.providerScopeHint,
          maxConcurrentRuns: input.maxConcurrentRuns ?? 1,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }
}

export class CodexCapacityRepository {
  constructor(private readonly db: Database) {}

  async createPool(input: {
    id?: string;
    workspaceId?: string;
    name: string;
    routingPolicy?: string;
  }) {
    const [row] = await this.db
      .insert(codexCapacityPools)
      .values({
        id: input.id ?? id("pool"),
        workspaceId: input.workspaceId,
        name: input.name,
        routingPolicy: input.routingPolicy ?? "balanced",
      })
      .returning();
    return row;
  }

  async addMember(input: {
    poolId: string;
    connectionId: string;
    priority?: number;
    maxActiveRuns?: number;
  }) {
    const [row] = await this.db
      .insert(codexCapacityPoolMembers)
      .values({
        poolId: input.poolId,
        connectionId: input.connectionId,
        priority: input.priority ?? 100,
        maxActiveRuns: input.maxActiveRuns ?? 1,
      })
      .onConflictDoUpdate({
        target: [
          codexCapacityPoolMembers.poolId,
          codexCapacityPoolMembers.connectionId,
        ],
        set: {
          priority: input.priority ?? 100,
          maxActiveRuns: input.maxActiveRuns ?? 1,
          enabled: true,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  async recordSnapshot(input: {
    capacitySourceId: string;
    reportingConnectionId: string;
    availability: string;
    remainingPercent?: number;
    resetAt?: Date;
    observationSource: string;
    payload?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(codexCapacitySnapshots)
      .values({ id: id("capsnap"), ...input, payload: input.payload ?? {} })
      .returning();
    return row;
  }
}

export class CodexConnectionRepository {
  constructor(private readonly db: Database) {}

  async upsertConnection(input: {
    id?: string;
    hostId: string;
    capacitySourceId: string;
    label: string;
    authMode: string;
    status: string;
    credentialSlotId: string;
    maxConcurrentRuns?: number;
  }) {
    const connectionId = input.id ?? id("codexconn");
    const [row] = await this.db
      .insert(codexConnections)
      .values({
        ...input,
        id: connectionId,
        maxConcurrentRuns: input.maxConcurrentRuns ?? 1,
      })
      .onConflictDoUpdate({
        target: codexConnections.id,
        set: {
          label: input.label,
          authMode: input.authMode,
          status: input.status,
          credentialSlotId: input.credentialSlotId,
          maxConcurrentRuns: input.maxConcurrentRuns ?? 1,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  async acquireLease(input: {
    taskId: string;
    codexConnectionId: string;
    capacitySourceId: string;
    leaseSeconds: number;
  }) {
    const [lease] = await this.db
      .insert(codexConnectionLeases)
      .values({
        id: id("codexlease"),
        taskId: input.taskId,
        codexConnectionId: input.codexConnectionId,
        capacitySourceId: input.capacitySourceId,
        status: "active",
        expiresAt: sql`now() + (${input.leaseSeconds} || ' seconds')::interval`,
      })
      .onConflictDoNothing()
      .returning();
    return lease ?? null;
  }

  async expireStaleLeases(now = new Date()) {
    return this.db
      .update(codexConnectionLeases)
      .set({ status: "expired", updatedAt: sql`now()` })
      .where(
        and(
          eq(codexConnectionLeases.status, "active"),
          lt(codexConnectionLeases.expiresAt, now),
        ),
      )
      .returning();
  }
}

export class TaskAttemptRepository {
  constructor(private readonly db: Database) {}

  async createAttempt(input: {
    taskId: string;
    attemptNumber: number;
    hostId: string;
    codexConnectionId: string;
    capacitySourceId: string;
    handoffFromAttemptId?: string;
    handoffReason?: string;
    billingModeChanged?: boolean;
    runtimeSnapshot?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(taskRuntimeAttempts)
      .values({
        id: id("attempt"),
        ...input,
        runtimeSnapshot: input.runtimeSnapshot ?? {},
      })
      .returning();
    return row;
  }
}

export class IdempotencyRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    scope: string;
    key: string;
    requestHash: string;
    response?: Record<string, unknown>;
    expiresAt?: Date;
  }) {
    const [row] = await this.db
      .insert(idempotencyKeys)
      .values({ id: id("idem"), ...input })
      .onConflictDoNothing({
        target: [idempotencyKeys.scope, idempotencyKeys.key],
      })
      .returning();
    return { row: row ?? null, duplicate: !row };
  }
}

export class SeedRepository {
  constructor(private readonly db: Database) {}

  async upsertDevelopmentOwner(input: {
    id: string;
    name: string;
    email: string;
  }) {
    const [row] = await this.db
      .insert(users)
      .values({ ...input, role: "owner" })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: input.name, updatedAt: sql`now()` },
      })
      .returning();
    return row;
  }

  async upsertDefaultAgentProfile(input: {
    id: string;
    workspaceId?: string;
    name: string;
    role: string;
    instructions: string;
    sandboxMode: string;
    canCreateSubagents?: boolean;
  }) {
    const [row] = await this.db
      .insert(agentProfiles)
      .values({
        ...input,
        canCreateSubagents: input.canCreateSubagents ?? false,
      })
      .onConflictDoUpdate({
        target: agentProfiles.id,
        set: {
          name: input.name,
          role: input.role,
          instructions: input.instructions,
          sandboxMode: input.sandboxMode,
          canCreateSubagents: input.canCreateSubagents ?? false,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }
}

export async function recoverExpiredLeases(db: Database, now = new Date()) {
  const taskRepo = new TaskRepository(db);
  const connectionRepo = new CodexConnectionRepository(db);

  const [expiredTaskLeases, expiredConnectionLeases] = await Promise.all([
    taskRepo.expireStaleLeases(now),
    connectionRepo.expireStaleLeases(now),
  ]);

  return { expiredTaskLeases, expiredConnectionLeases };
}

export async function findReadyCodexConnections(db: Database) {
  return db
    .select()
    .from(codexConnections)
    .where(
      or(
        eq(codexConnections.status, "ready_chatgpt"),
        eq(codexConnections.status, "ready_api_key"),
        eq(codexConnections.status, "ready_enterprise_access_token"),
      ),
    )
    .orderBy(desc(codexConnections.lastHealthAt));
}
