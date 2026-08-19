import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApprovalDecision } from "@maxxy/contracts";
import {
  isTerminalRuntimeEvent,
  type NormalizedCodexRuntimeEvent,
  parseAndNormalizeRawCodexEventLine,
} from "./events";

export type CodexAppServerLaunch = {
  command: string;
  args: string[];
};

export type CodexAppServerAdapterOptions = {
  launch: CodexAppServerLaunch;
  codexHome: string;
  cwd: string;
  env?: Record<string, string | undefined>;
  onEvent?: (event: NormalizedCodexRuntimeEvent) => void | Promise<void>;
  startupTimeoutMs?: number;
};

export type TurnStartInput = {
  prompt: string;
  threadId?: string;
  providerThreadId?: string;
  metadata?: Record<string, unknown>;
};

export class CodexAppServerAdapter {
  private child: ReturnType<typeof spawn> | undefined;
  private requestSequence = 0;
  private stdoutBuffer = "";
  private readonly terminalWaiters = new Set<{
    resolve: (event: NormalizedCodexRuntimeEvent) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private intentionalShutdown = false;

  constructor(private readonly options: CodexAppServerAdapterOptions) {}

  async start() {
    if (this.child) {
      return;
    }

    const child = spawn(this.options.launch.command, this.options.launch.args, {
      cwd: this.options.cwd,
      env: this.sanitizedEnv(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout?.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8").trim();
      if (output) {
        void this.emit({
          type: "agent.status_changed",
          payload: { status: "stderr", output },
        });
      }
    });
    child.on("error", (error: Error) => {
      void this.emit({
        type: "runtime.disconnected",
        payload: { error: error.message },
      });
      this.rejectTerminalWaiters(error);
    });
    child.on(
      "close",
      (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (!this.intentionalShutdown) {
          const event: NormalizedCodexRuntimeEvent = {
            type: "runtime.disconnected",
            payload: { exitCode, signal },
          };
          void this.emit(event);
          this.resolveTerminalWaiters(event);
        }
        this.child = undefined;
      },
    );

    await this.sendRequest("runtime.start", {});
  }

  async startTurn(input: TurnStartInput) {
    await this.sendRequest(
      input.providerThreadId ? "thread.resume" : "thread.create",
      {
        threadId: input.threadId,
        providerThreadId: input.providerThreadId,
        metadata: input.metadata ?? {},
      },
    );
    return this.sendRequest("turn.start", input);
  }

  steerTurn(input: { message: string; metadata?: Record<string, unknown> }) {
    return this.sendRequest("turn.steer", input);
  }

  interruptTurn(input: { reason?: string }) {
    return this.sendRequest("turn.interrupt", input);
  }

  resolveApproval(input: { approvalId: string; decision: ApprovalDecision }) {
    return this.sendRequest("approval.resolve", input);
  }

  async waitForTerminal(timeoutMs: number) {
    return new Promise<NormalizedCodexRuntimeEvent>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.terminalWaiters.delete(waiter);
          reject(new Error("Codex turn timed out"));
        }, timeoutMs),
      };
      this.terminalWaiters.add(waiter);
    });
  }

  async stop() {
    this.intentionalShutdown = true;
    if (!this.child) {
      return;
    }
    await this.sendRequest("runtime.shutdown", {}).catch(() => undefined);
    this.child.kill("SIGTERM");
    this.child = undefined;
  }

  private async sendRequest(type: string, payload: Record<string, unknown>) {
    const child = this.child;
    if (!child || child.killed) {
      throw new Error("Codex App Server is not running");
    }
    this.requestSequence += 1;
    const id = `req_${this.requestSequence}`;
    child.stdin?.write(`${JSON.stringify({ id, type, payload })}\n`);
    return id;
  }

  private handleStdout(chunk: Buffer) {
    this.stdoutBuffer += chunk.toString("utf8");
    while (this.stdoutBuffer.includes("\n")) {
      const index = this.stdoutBuffer.indexOf("\n");
      const line = this.stdoutBuffer.slice(0, index).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      if (!line) {
        continue;
      }
      const parsed = parseAndNormalizeRawCodexEventLine(line);
      void this.emit(parsed.event);
      if (!parsed.ok || isTerminalRuntimeEvent(parsed.event)) {
        this.resolveTerminalWaiters(parsed.event);
      }
    }
  }

  private async emit(event: NormalizedCodexRuntimeEvent) {
    await this.options.onEvent?.(event);
  }

  private resolveTerminalWaiters(event: NormalizedCodexRuntimeEvent) {
    for (const waiter of this.terminalWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(event);
    }
    this.terminalWaiters.clear();
  }

  private rejectTerminalWaiters(error: Error) {
    for (const waiter of this.terminalWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.terminalWaiters.clear();
  }

  private sanitizedEnv(): NodeJS.ProcessEnv {
    const allowed = [
      "PATH",
      "HOME",
      "TMPDIR",
      "TEMP",
      "TMP",
      "LANG",
      "LC_ALL",
      "TERM",
    ];
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV ?? "development",
    };
    for (const key of allowed) {
      const value = process.env[key];
      if (value) {
        env[key] = value;
      }
    }
    env.CODEX_HOME = this.options.codexHome;
    env.MAXXY_CODEX_ADAPTER = "1";
    for (const [key, value] of Object.entries(this.options.env ?? {})) {
      if (value !== undefined && !isSensitiveEnvKey(key)) {
        env[key] = value;
      }
    }
    return env;
  }
}

export function fixtureAppServerLaunch(scenario: string): CodexAppServerLaunch {
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/codex-fixture-server.ts",
  );
  return { command: process.execPath, args: [fixturePath, scenario] };
}

function isSensitiveEnvKey(key: string) {
  return /(TOKEN|SECRET|PASSWORD|API_KEY|AUTH|CREDENTIAL)/i.test(key);
}
