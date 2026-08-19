import {
  type HostConnectionReport,
  hostControlMessageSchema,
  hostProtocolVersion,
} from "@maxxy/contracts";
import WebSocket from "ws";
import { HostCommandRunner } from "./command-runner";
import {
  type HostAgentConfig,
  requireEnrolledConfig,
  websocketUrl,
} from "./config";
import { log } from "./logger";
import { PathGuard } from "./paths";
import { CodexConnectionRegistry } from "./registry";
import { collectDiskAvailability, collectToolInventory } from "./tools";

export class HostAgentRuntime {
  private reconnectDelay: number;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private socket: WebSocket | undefined;
  private readonly runner: HostCommandRunner;
  private readonly registry: CodexConnectionRegistry;

  constructor(private readonly rawConfig: HostAgentConfig) {
    this.reconnectDelay = rawConfig.MAXXY_RECONNECT_MIN_DELAY_MS;
    this.registry = CodexConnectionRegistry.at(
      rawConfig.dataDir,
      rawConfig.codexAccountsDir,
    );
    this.runner = new HostCommandRunner(rawConfig, (message) => {
      const config = requireEnrolledConfig(this.rawConfig);
      this.send({
        type: "host.runtime_event",
        hostId: config.hostId,
        ...message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  async start() {
    await new PathGuard({
      projectRoot: this.rawConfig.projectRoot,
      worktreeRoot: this.rawConfig.worktreeRoot,
    }).ensureRoots();
    this.connect();
  }

  stop() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    this.socket?.close();
  }

  private connect() {
    const config = requireEnrolledConfig(this.rawConfig);
    const socket = new WebSocket(websocketUrl(config.controlPlaneUrl), {
      headers: {
        authorization: `Bearer ${config.hostToken}`,
        "x-maxxy-host-id": config.hostId,
      },
    });
    this.socket = socket;

    socket.on("open", () => {
      this.reconnectDelay = config.MAXXY_RECONNECT_MIN_DELAY_MS;
      log("info", "host-agent websocket connected", { hostId: config.hostId });
      void this.sendHello();
      void this.sendReconnectReport();
      this.heartbeat = setInterval(() => {
        void this.sendHeartbeat();
      }, config.MAXXY_HEARTBEAT_INTERVAL_MS);
    });

    socket.on("message", (data) => {
      void this.handleMessage(data.toString());
    });

    socket.on("close", () => {
      if (this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = undefined;
      }
      log("warn", "host-agent websocket closed", {
        hostId: config.hostId,
        reconnectDelay: this.reconnectDelay,
      });
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        config.MAXXY_RECONNECT_MAX_DELAY_MS,
      );
    });

    socket.on("error", (error) => {
      log("error", "host-agent websocket error", {
        hostId: config.hostId,
        error: error.message,
      });
      socket.close();
    });
  }

  private async sendHello() {
    const config = requireEnrolledConfig(this.rawConfig);
    const [inventory, connections] = await Promise.all([
      collectToolInventory(config),
      this.connectionReports(),
    ]);
    this.send({
      type: "host.hello",
      protocolVersion: hostProtocolVersion,
      hostId: config.hostId,
      hostName: config.hostName,
      inventory,
      capacity: await this.capacity(),
      connections,
      activeRuns: this.runner.activeRunIds(),
      timestamp: new Date().toISOString(),
    });
  }

  private async sendHeartbeat() {
    const config = requireEnrolledConfig(this.rawConfig);
    const [inventory, connections] = await Promise.all([
      collectToolInventory(config),
      this.connectionReports(),
    ]);
    this.send({
      type: "host.heartbeat",
      protocolVersion: hostProtocolVersion,
      hostId: config.hostId,
      status: "online",
      capacity: await this.capacity(),
      connections,
      toolHealth: {
        bun: inventory.bun,
        codex: inventory.codex,
        git: inventory.git,
        gh: inventory.gh,
      },
      activeRunIds: this.runner.activeRunIds(),
      timestamp: new Date().toISOString(),
    });
  }

  private async sendReconnectReport() {
    const config = requireEnrolledConfig(this.rawConfig);
    this.send({
      type: "host.reconnect_report",
      hostId: config.hostId,
      activeRuns: this.runner.activeRunIds(),
      localEventCount: 0,
      policy: "preserve_orphans",
      timestamp: new Date().toISOString(),
    });
  }

  private async handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log("warn", "host-agent received invalid json");
      return;
    }
    const control = hostControlMessageSchema.safeParse(parsed);
    if (!control.success) {
      return;
    }

    if (control.data.type === "control.approval_decision") {
      const handled = await this.runner.handleApprovalDecision(control.data);
      log("info", "host-agent approval decision received", {
        approvalId: control.data.approvalId,
        handled,
      });
      return;
    }

    const startedAt = new Date().toISOString();
    const result = await this.runner.handle(control.data);
    this.send({
      type: "host.command_result",
      commandId: control.data.commandId,
      command: control.data.command,
      status: result.status,
      ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
      ...(result.output ? { output: result.output } : {}),
      outputTruncated: result.outputTruncated ?? false,
      ...(result.error ? { error: result.error } : {}),
      startedAt,
      completedAt: new Date().toISOString(),
    });
  }

  private send(payload: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private async capacity() {
    return {
      maxConcurrentAgents: this.rawConfig.MAXXY_MAX_CONCURRENT_AGENTS,
      activeTaskCount: this.runner.activeRunIds().length,
      activeRunIds: this.runner.activeRunIds(),
      disk: await collectDiskAvailability(this.rawConfig),
    };
  }

  private connectionReports(): Promise<HostConnectionReport[]> {
    return this.registry.report();
  }
}
