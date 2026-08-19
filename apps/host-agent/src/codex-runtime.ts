import {
  CodexAppServerAdapter,
  type CodexAppServerLaunch,
  fixtureAppServerLaunch,
  type NormalizedCodexRuntimeEvent,
} from "@maxxy/codex-adapter";
import type {
  ControlApprovalDecisionMessage,
  HostRuntimeEventMessage,
} from "@maxxy/contracts";
import { z } from "zod";
import type { HostAgentConfig } from "./config";
import { PathGuard } from "./paths";
import {
  CodexConnectionRegistry,
  type RuntimeCodexConnection,
} from "./registry";

const runtimeStartSchema = z.object({
  runId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  codexConnectionId: z.string().min(1),
  capacitySourceId: z.string().min(1).optional(),
  cwd: z.string().min(1),
  activeLeaseCount: z.number().int().min(0).default(0),
  fixtureScenario: z.string().min(1).optional(),
  launch: z
    .object({
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
    })
    .optional(),
});
const turnStartSchema = z.object({
  runId: z.string().min(1),
  prompt: z.string().min(1),
  threadId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  providerThreadId: z.string().min(1).optional(),
  waitForCompletion: z.boolean().default(false),
});
const turnSteerSchema = z.object({
  runId: z.string().min(1),
  message: z.string().min(1),
});
const turnInterruptSchema = z.object({
  runId: z.string().min(1),
  reason: z.string().optional(),
  waitForCompletion: z.boolean().default(false),
});

type RuntimeRecord = {
  adapter: CodexAppServerAdapter;
  connection: RuntimeCodexConnection;
  metadata: Omit<
    HostRuntimeEventMessage,
    "type" | "hostId" | "event" | "timestamp"
  >;
};

export type HostRuntimeEventSink = (
  message: Omit<HostRuntimeEventMessage, "type" | "hostId" | "timestamp">,
) => void | Promise<void>;

export class HostCodexRuntimeManager {
  private readonly runtimes = new Map<string, RuntimeRecord>();

  constructor(
    private readonly config: HostAgentConfig,
    private readonly events: HostRuntimeEventSink,
    private readonly paths = new PathGuard({
      projectRoot: config.projectRoot,
      worktreeRoot: config.worktreeRoot,
    }),
    private readonly registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    ),
  ) {}

  activeRunIds() {
    return [...this.runtimes.keys()];
  }

  async startRuntime(payload: Record<string, unknown>) {
    rejectRawSecrets(payload);
    const input = runtimeStartSchema.parse(payload);
    if (this.runtimes.has(input.runId)) {
      throw new Error(`Codex runtime is already active: ${input.runId}`);
    }

    const cwd = this.paths.resolveProjectPath(input.cwd);
    const connection = await this.registry.resolveForRuntime(
      input.codexConnectionId,
      input.activeLeaseCount,
    );
    const launch = this.launchFor(input);
    const metadata = {
      runId: input.runId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      codexConnectionId: connection.codexConnectionId,
      ...((input.capacitySourceId ?? connection.capacitySourceId)
        ? {
            capacitySourceId:
              input.capacitySourceId ?? connection.capacitySourceId,
          }
        : {}),
    };

    const adapter = new CodexAppServerAdapter({
      launch,
      codexHome: connection.credentialDir,
      cwd,
      onEvent: (event) => this.emitRuntimeEvent(input.runId, event),
    });
    this.runtimes.set(input.runId, { adapter, connection, metadata });
    try {
      await adapter.start();
    } catch (error) {
      this.runtimes.delete(input.runId);
      throw error;
    }

    return {
      runId: input.runId,
      codexConnectionId: connection.codexConnectionId,
      credentialSlotId: connection.credentialSlotId,
      status: "started",
    };
  }

  async startTurn(payload: Record<string, unknown>) {
    const input = turnStartSchema.parse(payload);
    const record = this.requireRuntime(input.runId);
    if (input.threadId) {
      record.metadata.threadId = input.threadId;
    }
    if (input.turnId) {
      record.metadata.turnId = input.turnId;
    }
    await record.adapter.startTurn({
      prompt: input.prompt,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.providerThreadId
        ? { providerThreadId: input.providerThreadId }
        : {}),
    });
    if (!input.waitForCompletion) {
      return { runId: input.runId, status: "turn_started" };
    }
    const terminal = await record.adapter.waitForTerminal(
      this.config.MAXXY_CODEX_TURN_TIMEOUT_MS,
    );
    return { runId: input.runId, terminal };
  }

  async steerTurn(payload: Record<string, unknown>) {
    const input = turnSteerSchema.parse(payload);
    await this.requireRuntime(input.runId).adapter.steerTurn({
      message: input.message,
    });
    return { runId: input.runId, status: "steered" };
  }

  async interruptTurn(payload: Record<string, unknown>) {
    const input = turnInterruptSchema.parse(payload);
    const record = this.requireRuntime(input.runId);
    await record.adapter.interruptTurn(
      input.reason ? { reason: input.reason } : {},
    );
    if (!input.waitForCompletion) {
      return { runId: input.runId, status: "interrupt_sent" };
    }
    const terminal = await record.adapter.waitForTerminal(
      this.config.MAXXY_CODEX_TURN_TIMEOUT_MS,
    );
    return { runId: input.runId, terminal };
  }

  async resolveApproval(message: ControlApprovalDecisionMessage) {
    const record = message.runId
      ? this.runtimes.get(message.runId)
      : [...this.runtimes.values()][0];
    if (!record) {
      return false;
    }
    await record.adapter.resolveApproval({
      approvalId: message.approvalId,
      decision: message.decision,
    });
    return true;
  }

  async stopRuntime(runId: string) {
    const record = this.runtimes.get(runId);
    if (!record) {
      return false;
    }
    await record.adapter.stop();
    this.runtimes.delete(runId);
    return true;
  }

  private requireRuntime(runId: string) {
    const record = this.runtimes.get(runId);
    if (!record) {
      throw new Error(`Codex runtime is not active: ${runId}`);
    }
    return record;
  }

  private async emitRuntimeEvent(
    runId: string,
    event: NormalizedCodexRuntimeEvent,
  ) {
    const record = this.runtimes.get(runId);
    if (!record) {
      return;
    }
    await this.events({ ...record.metadata, event });
    if (
      event.type === "turn.completed" ||
      event.type === "turn.failed" ||
      event.type === "runtime.disconnected"
    ) {
      await record.adapter.stop().catch(() => undefined);
      this.runtimes.delete(runId);
    }
  }

  private launchFor(
    input: z.infer<typeof runtimeStartSchema>,
  ): CodexAppServerLaunch {
    if (input.fixtureScenario) {
      return fixtureAppServerLaunch(input.fixtureScenario);
    }
    if (input.launch) {
      return input.launch;
    }
    return {
      command: this.config.CODEX_BINARY,
      args: this.config.CODEX_APP_SERVER_ARGS.split(" ").filter(Boolean),
    };
  }
}

function rejectRawSecrets(value: unknown, path: string[] = []) {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      /(token|secret|password|api[-_]?key|authorization|authJson|auth_json)/i.test(
        key,
      )
    ) {
      throw new Error(
        `Runtime payload must not include raw secret field: ${[...path, key].join(".")}`,
      );
    }
    rejectRawSecrets(entry, [...path, key]);
  }
}
