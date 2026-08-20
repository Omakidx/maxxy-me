import { homedir, hostname } from "node:os";
import path from "node:path";
import { z } from "zod";

export const storedHostConfigSchema = z.object({
  controlPlaneUrl: z.string().url(),
  hostId: z.string().min(1),
  hostToken: z.string().min(20),
  hostName: z.string().min(1),
});

const envSchema = z.object({
  MAXXY_CONTROL_PLANE_URL: z.string().url().optional(),
  MAXXY_HOST_ID: z.string().min(1).optional(),
  MAXXY_HOST_TOKEN: z.string().min(20).optional(),
  MAXXY_HOST_NAME: z.string().min(1).default(hostname()),
  MAXXY_HOST_DATA_DIR: z
    .string()
    .min(1)
    .default(path.join(homedir(), ".local/share/maxxy-me/host-agent")),
  MAXXY_PROJECT_ROOT: z
    .string()
    .min(1)
    .default(path.join(homedir(), "projects")),
  MAXXY_WORKTREE_ROOT: z
    .string()
    .min(1)
    .default(path.join(homedir(), ".local/share/maxxy-me/worktrees")),
  MAXXY_CODEX_ACCOUNTS_DIR: z
    .string()
    .min(1)
    .default(path.join(homedir(), ".local/share/maxxy-me/codex-accounts")),
  MAXXY_MAX_CONCURRENT_AGENTS: z.coerce.number().int().positive().default(1),
  MAXXY_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000),
  MAXXY_RECONNECT_MIN_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  MAXXY_RECONNECT_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),
  MAXXY_COMMAND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
  MAXXY_OUTPUT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  MAXXY_PROTOCOL_VERSION: z.coerce.number().int().positive().default(1),
  CODEX_BINARY: z.string().min(1).default("codex"),
  CODEX_APP_SERVER_ARGS: z.string().default("app-server"),
  MAXXY_CODEX_TURN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
  GIT_BINARY: z.string().min(1).default("git"),
  GH_BINARY: z.string().min(1).default("gh"),
  HOST_ALLOWED_COMMAND_PROFILES: z.string().default("default"),
  MAXXY_ALLOWED_COMMANDS: z.string().default(""),
  MAXXY_DENIED_COMMANDS: z
    .string()
    .default(
      "rm,sudo,su,chmod,chown,mkfs,mount,umount,dd,shutdown,reboot,systemctl,docker,kubectl",
    ),
  GIT_AUTHOR_NAME: z.string().optional(),
  GIT_AUTHOR_EMAIL: z.string().optional(),
  GIT_COMMITTER_NAME: z.string().optional(),
  GIT_COMMITTER_EMAIL: z.string().optional(),
});

export type StoredHostConfig = z.infer<typeof storedHostConfigSchema>;
export type HostAgentConfig = ReturnType<typeof loadConfig>;

export function loadConfig(stored?: StoredHostConfig) {
  const env = envSchema.parse(process.env);
  const controlPlaneUrl =
    env.MAXXY_CONTROL_PLANE_URL ?? stored?.controlPlaneUrl;
  const hostId = env.MAXXY_HOST_ID ?? stored?.hostId;
  const hostToken = env.MAXXY_HOST_TOKEN ?? stored?.hostToken;
  const hostName = env.MAXXY_HOST_NAME ?? stored?.hostName ?? hostname();

  return {
    ...env,
    controlPlaneUrl,
    hostId,
    hostToken,
    hostName,
    dataDir: path.resolve(env.MAXXY_HOST_DATA_DIR),
    projectRoot: path.resolve(env.MAXXY_PROJECT_ROOT),
    worktreeRoot: path.resolve(env.MAXXY_WORKTREE_ROOT),
    codexAccountsDir: path.resolve(env.MAXXY_CODEX_ACCOUNTS_DIR),
    allowedCommandProfiles: new Set(
      env.HOST_ALLOWED_COMMAND_PROFILES.split(",")
        .map((profile) => profile.trim())
        .filter(Boolean),
    ),
    allowedCommands: new Set(
      env.MAXXY_ALLOWED_COMMANDS.split(",")
        .map((command) => command.trim())
        .filter(Boolean),
    ),
    deniedCommands: new Set(
      env.MAXXY_DENIED_COMMANDS.split(",")
        .map((command) => command.trim())
        .filter(Boolean),
    ),
  };
}

export function requireEnrolledConfig(config: HostAgentConfig) {
  if (!config.controlPlaneUrl || !config.hostId || !config.hostToken) {
    throw new Error(
      "Host is not enrolled. Run `maxxy-host enroll --server <url> --token <token>` first or set MAXXY_HOST_ID/MAXXY_HOST_TOKEN.",
    );
  }
  return {
    ...config,
    controlPlaneUrl: config.controlPlaneUrl,
    hostId: config.hostId,
    hostToken: config.hostToken,
  };
}

export function websocketUrl(controlPlaneUrl: string) {
  const url = new URL(controlPlaneUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  url.search = "";
  return url.toString();
}
