"use client";

import {
  Activity,
  Bot,
  CircleDot,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SystemReadiness } from "../src/system-readiness";
import { ThemeToggle } from "./theme-toggle";
import { Badge, Button, Card, CardLabel, Input, Textarea } from "./ui";

export type DashboardPage =
  | "dashboard"
  | "setup"
  | "agent"
  | "plans"
  | "tasks"
  | "hosts"
  | "approvals"
  | "events"
  | "settings";

const pageTitles: Record<DashboardPage, string> = {
  dashboard: "Execution dashboard",
  setup: "Workspace setup",
  agent: "Agent console",
  plans: "Agent plans",
  tasks: "Task queue",
  hosts: "Execution hosts",
  approvals: "Approvals",
  events: "Activity events",
  settings: "Settings",
};
type ApiState = "loading" | "ready" | "signed_out" | "bootstrap" | "error";
type JsonRecord = Record<string, unknown>;
type DeploymentMode = "" | "local" | "vps";
type StreamState = "connecting" | "live" | "offline";

type PlannedTask = {
  title: string;
  prompt: string;
  role: string;
  ownershipClaims: { pattern: string; mode: string }[];
  dependsOnIndexes: number[];
  mayRunInParallel?: boolean;
};

type ManagerPlan = {
  workspaceId: string;
  goal: string;
  strategy: string;
  parallelGroups: number[][];
  tasks: PlannedTask[];
};

type DashboardData = {
  user?: JsonRecord;
  hosts: JsonRecord[];
  codexConnections: JsonRecord[];
  workspaces: JsonRecord[];
  tasks: JsonRecord[];
  capacity: JsonRecord[];
  approvals: JsonRecord[];
  events: JsonRecord[];
  readiness?: SystemReadiness;
};

const emptyData: DashboardData = {
  hosts: [],
  codexConnections: [],
  workspaces: [],
  tasks: [],
  capacity: [],
  approvals: [],
  events: [],
};

function text(value: unknown, fallback = "-") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function isReadyConnection(connection: JsonRecord) {
  return text(connection.status).startsWith("ready_");
}

export function isPendingConnection(connection: JsonRecord) {
  return ["signed_out", "authenticating", "error"].includes(
    text(connection.status),
  );
}

function pendingTimeLabel(connection: JsonRecord) {
  const expiresAt = new Date(text(connection.login_expires_at, "")).getTime();
  if (!Number.isFinite(expiresAt)) return "less than 10 minutes";
  const remainingSeconds = Math.max(
    0,
    Math.ceil((expiresAt - Date.now()) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function githubToolStatus(host: JsonRecord | undefined) {
  return record(record(host?.tool_inventory).gh);
}

function isGitHubAuthenticated(host: JsonRecord | undefined) {
  return githubToolStatus(host).authenticated === true;
}

export function connectionLoginCommand(
  connection: JsonRecord,
  deploymentMode: DeploymentMode,
) {
  const authMode = text(connection.auth_mode, "chatgpt");
  const launcher =
    deploymentMode === "vps"
      ? "sudo -u maxxy-host /usr/local/bin/maxxy-host"
      : "./deploy/maxxy-host";
  const command = [
    launcher,
    "codex-login",
    "--connection-id",
    shellQuote(text(connection.id)),
    "--auth-mode",
    shellQuote(authMode),
    "--capacity-source-id",
    shellQuote(text(connection.capacity_source_id)),
    "--expires-at",
    shellQuote(text(connection.login_expires_at)),
    ...(deploymentMode === "vps" && authMode === "chatgpt"
      ? ["--device-auth"]
      : []),
  ].join(" ");

  return authMode === "api_key"
    ? `read -rsp 'OpenAI API key: ' OPENAI_API_KEY; printf '%s' "$OPENAI_API_KEY" | ${command}; unset OPENAI_API_KEY`
    : command;
}

function eventSummary(event: JsonRecord) {
  const payload = record(event.payload);
  const type = text(event.type);
  if (type === "agent.message_delta") return "Streaming agent response";
  if (type === "agent.message_completed") return "Agent response completed";
  if (type === "command.output") return "Streaming command output";
  if (type === "command.completed") {
    return `Command finished with exit ${numberValue(payload.exitCode)}`;
  }
  if (type.startsWith("file_change.")) {
    return `${type.endsWith("completed") ? "Updated" : "Editing"} ${text(payload.path, "file")}`;
  }
  return text(
    payload.message,
    text(
      payload.summary,
      text(payload.command, text(payload.status, type.replaceAll(".", " "))),
    ),
  );
}

export function agentTranscript(events: JsonRecord[]) {
  const segments = new Map<string, { content: string }>();

  for (const [index, event] of events.entries()) {
    const type = text(event.type);
    const payload = record(event.payload);
    if (type === "agent.message_delta" || type === "agent.message_completed") {
      const key = `message:${text(payload.messageId, String(index))}`;
      const current = segments.get(key) ?? { content: "" };
      current.content =
        type === "agent.message_completed"
          ? text(payload.content, current.content)
          : `${current.content}${text(payload.delta, "")}`;
      segments.set(key, current);
      continue;
    }
    if (
      type === "command.started" ||
      type === "command.output" ||
      type === "command.completed"
    ) {
      const key = `command:${text(payload.commandId, String(index))}`;
      const current = segments.get(key) ?? { content: "" };
      if (type === "command.started") {
        current.content = `$ ${text(payload.command, "command")}\n`;
      } else if (type === "command.output") {
        current.content += text(payload.output, "");
      } else {
        current.content += `\n[exit ${numberValue(payload.exitCode)}]`;
      }
      segments.set(key, current);
    }
  }

  return [...segments.values()]
    .map((segment) => segment.content.trimEnd())
    .filter(Boolean)
    .join("\n\n")
    .slice(-20_000);
}

export function isTaskWorking(task: JsonRecord | undefined) {
  return Boolean(
    task &&
      [
        "claimed",
        "starting",
        "running",
        "validating",
        "pushing",
        "opening_pull_request",
      ].includes(text(task.status)),
  );
}

function formatTimestamp(value: unknown) {
  const date = new Date(text(value, ""));
  return Number.isNaN(date.valueOf())
    ? "Just now"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const responseError = record(body.error);
    const message = text(
      body.message,
      text(responseError.message, text(body.error, "Request failed")),
    );
    throw new Error(message);
  }
  return body;
}

export default function DashboardApp({
  activePage,
}: {
  activePage: DashboardPage;
}) {
  const [state, setState] = useState<ApiState>("loading");
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [connectionAction, setConnectionAction] = useState("");
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>("");
  const [githubHostId, setGithubHostId] = useState("");
  const [githubAction, setGithubAction] = useState("");
  const [githubLoginCommand, setGithubLoginCommand] = useState("");
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(0);
  const [enrollmentForm, setEnrollmentForm] = useState({
    hostName: "Primary execution host",
    maxConcurrentAgents: 1,
  });
  const [enrollmentCommand, setEnrollmentCommand] = useState("");
  const [connectionForm, setConnectionForm] = useState<{
    hostId: string;
    authMode: "chatgpt" | "api_key";
  }>({
    hostId: "",
    authMode: "chatgpt",
  });
  const [authForm, setAuthForm] = useState({
    name: "Owner",
    email: "owner@example.com",
    password: "",
  });
  const [workspaceForm, setWorkspaceForm] = useState({
    name: "maxxy-me",
    owner: "owner",
    repo: "maxxy-me",
    remoteUrl: "https://github.com/owner/maxxy-me.git",
    projectPath: "/var/lib/maxxy-me/projects/maxxy-me",
    worktreeRoot: "/var/lib/maxxy-me/worktrees",
    baseBranch: "main",
  });
  const [taskForm, setTaskForm] = useState({
    workspaceId: "",
    title: "",
    prompt: "",
    startImmediately: true,
  });
  const [planForm, setPlanForm] = useState({
    goal: "",
    frontendOwnership: "apps/web/app",
    backendOwnership: "apps/web/src",
    startImmediately: true,
  });
  const [managerPlan, setManagerPlan] = useState<ManagerPlan | undefined>();
  const [streamState, setStreamState] = useState<StreamState>("offline");
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskReview, setTaskReview] = useState<JsonRecord | undefined>();
  const previousPendingConnectionIds = useRef<Set<string>>(new Set());
  const streamRefreshTimer = useRef<number | undefined>(undefined);
  const agentOutputRef = useRef<HTMLPreElement | null>(null);
  const [validationProfileText, setValidationProfileText] = useState(
    JSON.stringify(
      {
        failFast: true,
        commands: [
          { command: "bun", args: ["run", "lint"], required: true },
          { command: "bun", args: ["run", "typecheck"], required: true },
          { command: "bun", args: ["test"], required: true },
          { command: "bun", args: ["run", "build"], required: true },
        ],
      },
      null,
      2,
    ),
  );

  const selectedWorkspaceId =
    taskForm.workspaceId || text(data.workspaces[0]?.id, "");
  const pendingApprovals = data.approvals.filter(
    (approval) => text(approval.status) === "pending",
  );
  const onlineHosts = data.hosts.filter(
    (host) => text(host.status) === "online",
  );
  const activeTasks = data.tasks.filter((task) =>
    [
      "assigned",
      "claimed",
      "starting",
      "running",
      "validating",
      "pushing",
      "opening_pull_request",
    ].includes(text(task.status)),
  );
  const focusedTask =
    data.tasks.find((task) => text(task.id) === focusedTaskId) ??
    activeTasks[0] ??
    data.tasks[0];
  const focusedTaskEvents = focusedTask
    ? data.events.filter(
        (event) => text(event.task_id, "") === text(focusedTask.id, ""),
      )
    : [];
  const latestFocusedEvent = focusedTaskEvents.at(-1);
  const focusedAgentOutput = agentTranscript(focusedTaskEvents);
  const focusedTaskWorking = isTaskWorking(focusedTask);
  const systemReady = data.readiness?.ready === true;
  const readinessMessage = systemReady
    ? "All execution services are ready."
    : (data.readiness?.reasons[0] ?? "Checking execution services.");
  const openPrTasks = data.tasks.filter(
    (task) => text(task.status) === "awaiting_review",
  );
  const signedIn = state === "ready";
  const readyCodexConnections = data.codexConnections.filter(isReadyConnection);
  const pendingCodexConnections =
    data.codexConnections.filter(isPendingConnection);
  const connectedCodexConnections = data.codexConnections.filter(
    (connection) => !isPendingConnection(connection),
  );
  const hostsById = new Map(
    data.hosts.map((host) => [text(host.id), host] as const),
  );
  const githubHosts = data.hosts.filter(isGitHubAuthenticated);
  const githubReady = githubHosts.length > 0;
  const onboardingSteps = [
    { label: "Deployment", complete: Boolean(deploymentMode) },
    { label: "Owner", complete: signedIn },
    { label: "Host", complete: onlineHosts.length > 0 },
    { label: "GitHub", complete: githubReady },
    { label: "Codex", complete: readyCodexConnections.length > 0 },
    { label: "Repository", complete: data.workspaces.length > 0 },
    { label: "First task", complete: data.tasks.length > 0 },
  ];
  const onboardingComplete = onboardingSteps.every((step) => step.complete);
  const setupComplete = data.hosts.length > 0 && data.workspaces.length > 0;
  const statusLabel = useMemo(() => {
    if (state === "loading") return "Checking session";
    if (state === "bootstrap") return "Owner setup required";
    if (state === "signed_out") return "Signed out";
    if (state === "error") return "Needs attention";
    return `Signed in as ${text(data.user?.email, "owner")}`;
  }, [data.user?.email, state]);

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (csrfToken && init.method && init.method !== "GET") {
      headers.set("x-csrf-token", csrfToken);
    }
    return parseJson(
      await fetch(path, { ...init, headers, credentials: "same-origin" }),
    );
  }

  async function refresh() {
    try {
      const bootstrap = await parseJson(
        await fetch("/api/auth/bootstrap", { credentials: "same-origin" }),
      );
      if (bootstrap.canBootstrap === true) {
        setState("bootstrap");
        return;
      }

      const meResponse = await fetch("/api/auth/me", {
        credentials: "same-origin",
      });
      if (meResponse.status === 401) {
        setState("signed_out");
        return;
      }
      const me = await parseJson(meResponse);
      const [hosts, workspaces, tasks, capacity, approvals, events, readiness] =
        await Promise.all([
          api("/api/hosts"),
          api("/api/workspaces"),
          api("/api/tasks"),
          api("/api/codex-capacity/summary"),
          api("/api/approvals"),
          api("/api/events?limit=200"),
          api("/api/system/readiness"),
        ]);
      const hostRows = (hosts.hosts as JsonRecord[]) ?? [];
      const connectionResponses = await Promise.all(
        hostRows.map((host) =>
          api(
            `/api/hosts/${encodeURIComponent(text(host.id))}/codex-connections`,
          ),
        ),
      );
      const codexConnections = connectionResponses.flatMap(
        (result) => (result.connections as JsonRecord[]) ?? [],
      );
      setData({
        user: me.user as JsonRecord,
        hosts: hostRows,
        codexConnections,
        workspaces: (workspaces.workspaces as JsonRecord[]) ?? [],
        tasks: (tasks.tasks as JsonRecord[]) ?? [],
        capacity: (capacity.capacity as JsonRecord[]) ?? [],
        approvals: (approvals.approvals as JsonRecord[]) ?? [],
        events: (events.events as JsonRecord[]) ?? [],
        readiness: readiness as unknown as SystemReadiness,
      });
      setState("ready");
      const onlineHost = hostRows.find(
        (host) => text(host.status) === "online",
      );
      setConnectionForm((current) => ({
        ...current,
        hostId: hostRows.some(
          (host) =>
            text(host.id) === current.hostId && text(host.status) === "online",
        )
          ? current.hostId
          : text(onlineHost?.id, ""),
      }));
      setGithubHostId((current) =>
        hostRows.some(
          (host) => text(host.id) === current && text(host.status) === "online",
        )
          ? current
          : text(onlineHost?.id, ""),
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function ensureCsrf() {
    const csrf = await parseJson(
      await fetch("/api/auth/csrf", { credentials: "same-origin" }),
    );
    const token = text(csrf.csrfToken, "");
    setCsrfToken(token);
    return token;
  }

  async function submitAuth(mode: "bootstrap" | "sign-in") {
    try {
      const token = await ensureCsrf();
      const body =
        mode === "bootstrap"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      await parseJson(
        await fetch(
          `/api/auth/${mode === "bootstrap" ? "bootstrap" : "sign-in"}`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": token,
            },
            body: JSON.stringify(body),
          },
        ),
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function signOut() {
    try {
      await api("/api/auth/sign-out", { method: "POST" });
      setData(emptyData);
      setState("signed_out");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createWorkspace() {
    try {
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: workspaceForm.name,
          repository: {
            owner: workspaceForm.owner,
            name: workspaceForm.repo,
            remoteUrl: workspaceForm.remoteUrl,
            defaultBranch: workspaceForm.baseBranch,
          },
          projectPath: workspaceForm.projectPath,
          worktreeRoot: workspaceForm.worktreeRoot,
          baseBranch: workspaceForm.baseBranch,
          maximumConcurrentAgents: 1,
        }),
      });
      setMessage("Workspace created");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createHostEnrollment() {
    try {
      const result = await api("/api/hosts/enrollment", {
        method: "POST",
        body: JSON.stringify(enrollmentForm),
      });
      const token = text(result.enrollmentToken, "");
      const launcher =
        deploymentMode === "vps"
          ? "sudo -u maxxy-host /usr/local/bin/maxxy-host"
          : "./deploy/maxxy-host";
      setEnrollmentCommand(
        `${launcher} enroll --server ${window.location.origin} --token ${token}`,
      );
      setMessage(
        "Enrollment command created. It is single-use and expires soon.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function setupCodexConnection() {
    setConnectionAction("new:prepare");
    try {
      if (!connectionForm.hostId) {
        throw new Error("Enroll an online host before adding an account");
      }
      if (
        pendingCodexConnections.some(
          (connection) => text(connection.host_id) === connectionForm.hostId,
        )
      ) {
        throw new Error(
          "Cancel the current connection attempt before starting another one.",
        );
      }
      await api(
        `/api/hosts/${encodeURIComponent(connectionForm.hostId)}/codex-connections/setup`,
        {
          method: "POST",
          body: JSON.stringify({ authMode: connectionForm.authMode }),
        },
      );
      setMessage(
        "Waiting for authentication. Run the generated command within 10 minutes.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionAction("");
    }
  }

  function prepareGitHubCommand(action: "login" | "logout") {
    if (!githubHostId) {
      setMessage(
        "Start and select an execution host before connecting GitHub.",
      );
      return;
    }
    const launcher =
      deploymentMode === "vps"
        ? "sudo -u maxxy-host /usr/local/bin/maxxy-host"
        : "./deploy/maxxy-host";
    setGithubLoginCommand(`${launcher} github-${action}`);
    setMessage(
      action === "login"
        ? "GitHub login command generated. Run it on the selected host, then verify the connection."
        : "GitHub logout command generated. Run it on the selected host, then verify the disconnection.",
    );
  }

  async function verifyGitHubConnection() {
    if (!githubHostId) {
      setMessage("Select an online execution host to verify GitHub.");
      return;
    }
    setGithubAction("verify");
    try {
      const result = await api(
        `/api/hosts/${encodeURIComponent(githubHostId)}/refresh-tools`,
        { method: "POST" },
      );
      const host = record(result.host);
      const github = githubToolStatus(host);
      setMessage(
        github.authenticated === true
          ? `GitHub connected as ${text(github.account, "an authenticated account")}.`
          : "GitHub is still signed out on this host. Run the generated login command and try verification again.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGithubAction("");
    }
  }

  async function cancelPendingConnection(connection: JsonRecord) {
    const connectionId = text(connection.id, "");
    if (!connectionId) return;
    setConnectionAction(`${connectionId}:cancel`);
    try {
      await api(`/api/codex-connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      setMessage("Codex connection attempt cancelled.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionAction("");
    }
  }

  async function manageCodexConnection(
    connection: JsonRecord,
    action: "connect" | "disconnect" | "remove",
  ) {
    const connectionId = text(connection.id, "");
    if (!connectionId) return;
    if (
      action === "remove" &&
      !window.confirm(
        `Remove ${text(connection.label, "this Codex connection")}? The account record will be deleted, and its host credential will be removed immediately when the host is online.`,
      )
    ) {
      return;
    }

    const actionKey = `${connectionId}:${action}`;
    setConnectionAction(actionKey);
    try {
      if (action === "connect") {
        await api(
          `/api/codex-connections/${encodeURIComponent(connectionId)}/reauthenticate`,
          { method: "POST" },
        );
        setMessage(
          "Waiting for authentication. Run the generated command within 10 minutes.",
        );
      } else if (action === "disconnect") {
        const result = await api(
          `/api/codex-connections/${encodeURIComponent(connectionId)}/disable`,
          { method: "POST" },
        );
        const cleanupPending = result.hostCleanup === "pending";
        setMessage(
          cleanupPending
            ? `${text(connection.label)} disconnected. The offline host could not be reached, so its local credential may still need manual deletion.`
            : `${text(connection.label)} disconnected and its host credential was removed.`,
        );
      } else {
        const result = await api(
          `/api/codex-connections/${encodeURIComponent(connectionId)}`,
          { method: "DELETE" },
        );
        const cleanupPending = result.hostCleanup === "pending";
        setMessage(
          cleanupPending
            ? `${text(connection.label)} removed. The offline host could not be reached, so its local credential may still need manual deletion.`
            : `${text(connection.label)} and its host credential were removed.`,
        );
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectionAction("");
    }
  }

  async function createTask() {
    try {
      const result = await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          title: taskForm.title,
          prompt: taskForm.prompt,
          priority: 100,
          startImmediately: taskForm.startImmediately,
        }),
      });
      setTaskForm((current) => ({ ...current, title: "", prompt: "" }));
      setFocusedTaskId(text(record(result.task).id, ""));
      setMessage("Task created");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadTaskReview(taskId: string) {
    try {
      setSelectedTaskId(taskId);
      const result = await api(
        `/api/tasks/${encodeURIComponent(taskId)}/review`,
      );
      setTaskReview(result.review as JsonRecord);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function runTaskAction(
    taskId: string,
    action: "start" | "cancel" | "retry",
  ) {
    try {
      await api(
        `/api/tasks/${encodeURIComponent(taskId)}/${encodeURIComponent(action)}`,
        { method: "POST" },
      );
      setFocusedTaskId(taskId);
      setMessage(`Task ${action} requested`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveValidationProfile() {
    try {
      if (!selectedWorkspaceId) {
        throw new Error("Create a workspace before saving validation");
      }
      await api(
        `/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/validation-profile`,
        {
          method: "PATCH",
          body: validationProfileText,
        },
      );
      setMessage("Validation profile saved");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function seedAgentProfiles() {
    try {
      if (!selectedWorkspaceId) {
        throw new Error("Create a workspace before seeding profiles");
      }
      await api(
        `/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/agent-profiles/seed`,
        { method: "POST" },
      );
      setMessage("Default Phase 9 agent profiles seeded");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function previewManagerPlan() {
    try {
      if (!selectedWorkspaceId) {
        throw new Error("Create a workspace before planning");
      }
      const result = await api("/api/manager-plans/preview", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          goal: planForm.goal,
          frontendOwnership: planForm.frontendOwnership,
          backendOwnership: planForm.backendOwnership,
        }),
      });
      setManagerPlan(result.plan as ManagerPlan);
      setMessage("Manager plan ready for approval");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function approveManagerPlan() {
    try {
      if (!managerPlan) {
        throw new Error("Preview a manager plan before approval");
      }
      await api("/api/manager-plans/approve", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: managerPlan.workspaceId,
          goal: managerPlan.goal,
          tasks: managerPlan.tasks,
          startImmediately: planForm.startImmediately,
        }),
      });
      setManagerPlan(undefined);
      setPlanForm((current) => ({ ...current, goal: "" }));
      setMessage("Manager plan approved and tasks created");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function decideApproval(approvalId: unknown, decision: string) {
    try {
      await api(
        `/api/approvals/${encodeURIComponent(text(approvalId))}/decision`,
        {
          method: "POST",
          body: JSON.stringify({ decision }),
        },
      );
      setMessage(`Approval ${decision}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void ensureCsrf().then(refresh);
  }, []);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("maxxy.deploymentMode");
    if (storedMode === "local" || storedMode === "vps") {
      setDeploymentMode(storedMode);
    }
  }, []);

  useEffect(() => {
    const currentPendingIds = new Set(
      pendingCodexConnections.map((connection) => text(connection.id)),
    );
    const previousPendingIds = previousPendingConnectionIds.current;
    const connected = [...previousPendingIds].some((connectionId) =>
      data.codexConnections.some(
        (connection) =>
          text(connection.id) === connectionId && isReadyConnection(connection),
      ),
    );
    const disappeared = [...previousPendingIds].some(
      (connectionId) =>
        !data.codexConnections.some(
          (connection) => text(connection.id) === connectionId,
        ),
    );
    if (connected) {
      setMessage("Codex account connected.");
    } else if (disappeared && !connectionAction.endsWith(":cancel")) {
      setMessage("Codex connection attempt expired.");
    }
    previousPendingConnectionIds.current = currentPendingIds;
  }, [connectionAction, data.codexConnections, pendingCodexConnections]);

  useEffect(() => {
    if (!signedIn) return;
    const firstIncomplete = onboardingSteps.findIndex((step) => !step.complete);
    if (firstIncomplete >= 0) {
      setActiveOnboardingStep(firstIncomplete);
    }
  }, [
    signedIn,
    deploymentMode,
    githubReady,
    data.hosts.length,
    data.workspaces.length,
    data.tasks.length,
    readyCodexConnections.length,
  ]);

  useEffect(() => {
    if (!focusedTaskId && activeTasks[0]) {
      setFocusedTaskId(text(activeTasks[0].id, ""));
    }
  }, [activeTasks, focusedTaskId]);

  useEffect(() => {
    const output = agentOutputRef.current;
    if (output) {
      output.scrollTop = output.scrollHeight;
    }
  }, [focusedAgentOutput]);

  useEffect(() => {
    if (!signedIn || !csrfToken) return;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const connect = async () => {
      setStreamState("connecting");
      try {
        const ticket = await api("/api/ws-ticket", {
          method: "POST",
          body: JSON.stringify({ purpose: "control" }),
        });
        if (stopped) return;
        socket = new WebSocket(text(ticket.wsUrl, ""));
        socket.addEventListener("open", () => setStreamState("live"));
        socket.addEventListener("message", (message) => {
          const envelope = JSON.parse(String(message.data)) as JsonRecord;
          if (envelope.type !== "workspace.event") return;
          const event = record(envelope.event);
          const eventId = text(event.id, "");
          setData((current) => {
            if (
              eventId &&
              current.events.some((existing) => text(existing.id) === eventId)
            ) {
              return current;
            }
            return {
              ...current,
              events: [...current.events, event]
                .sort(
                  (left, right) =>
                    new Date(text(left.occurred_at, "")).valueOf() -
                    new Date(text(right.occurred_at, "")).valueOf(),
                )
                .slice(-200),
            };
          });
          if (streamRefreshTimer.current) {
            window.clearTimeout(streamRefreshTimer.current);
          }
          streamRefreshTimer.current = window.setTimeout(
            () => void refresh(),
            750,
          );
        });
        socket.addEventListener("close", () => {
          if (stopped) return;
          setStreamState("offline");
          reconnectTimer = window.setTimeout(() => void connect(), 2_000);
        });
        socket.addEventListener("error", () => setStreamState("offline"));
      } catch {
        if (stopped) return;
        setStreamState("offline");
        reconnectTimer = window.setTimeout(() => void connect(), 2_000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      socket?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (streamRefreshTimer.current) {
        window.clearTimeout(streamRefreshTimer.current);
      }
    };
  }, [signedIn, csrfToken]);

  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [signedIn, csrfToken]);
  useEffect(() => {
    if (state === "ready" && activePage === "setup" && setupComplete) {
      router.replace("/");
    }
  }, [activePage, router, setupComplete, state]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 8_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div>
            <strong>maxxy-me</strong>
            <span>Codex control plane</span>
          </div>
        </div>
        <nav className="nav-list">
          <Link
            className={`nav-link ${activePage === "dashboard" ? "active" : ""}`}
            href="/"
          >
            <LayoutDashboard aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
          {!setupComplete ? (
            <Link
              className={`nav-link ${activePage === "setup" ? "active" : ""}`}
              href="/setup"
            >
              <ShieldCheck aria-hidden="true" />
              <span>Setup</span>
            </Link>
          ) : null}
          <Link
            className={`nav-link ${activePage === "agent" ? "active" : ""}`}
            href="/agent"
          >
            <Bot aria-hidden="true" />
            <span>Agent console</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "plans" ? "active" : ""}`}
            href="/plans"
          >
            <ListTodo aria-hidden="true" />
            <span>Plans</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "tasks" ? "active" : ""}`}
            href="/tasks"
          >
            <Play aria-hidden="true" />
            <span>Tasks</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "hosts" ? "active" : ""}`}
            href="/hosts"
          >
            <Server aria-hidden="true" />
            <span>Hosts</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "approvals" ? "active" : ""}`}
            href="/approvals"
          >
            <CircleDot aria-hidden="true" />
            <span>Approvals</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "events" ? "active" : ""}`}
            href="/events"
          >
            <Activity aria-hidden="true" />
            <span>Events</span>
          </Link>
          <Link
            className={`nav-link ${activePage === "settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </nav>
      </aside>

      <section className={`workspace route-${activePage}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal coding workspace</p>
            <h1>{pageTitles[activePage]}</h1>
            <p className="subtle">{statusLabel}</p>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <Button onClick={() => void refresh()}>Sync</Button>
            {signedIn ? (
              <Button onClick={() => void signOut()}>Sign out</Button>
            ) : null}
          </div>
        </header>

        {message ? (
          <output aria-live="polite" className="notification-card">
            <span>{message}</span>
            <button
              aria-label="Dismiss notification"
              className="notification-dismiss"
              onClick={() => setMessage("")}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          </output>
        ) : null}

        {!signedIn ? (
          <Card className="auth-card">
            <CardLabel>
              {state === "bootstrap" ? "Bootstrap" : "Sign in"}
            </CardLabel>
            <h2>
              {state === "bootstrap" ? "Create owner account" : "Owner access"}
            </h2>
            {state === "bootstrap" ? (
              <Input
                label="Name"
                value={authForm.name}
                onChange={(event) =>
                  setAuthForm({ ...authForm, name: event.target.value })
                }
              />
            ) : null}
            <Input
              label="Email"
              type="email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm({ ...authForm, email: event.target.value })
              }
            />
            <Input
              label="Password"
              type="password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm({ ...authForm, password: event.target.value })
              }
            />
            <Button
              disabled={!authForm.email || !authForm.password}
              onClick={() =>
                void submitAuth(state === "bootstrap" ? "bootstrap" : "sign-in")
              }
              variant="primary"
            >
              {state === "bootstrap" ? "Create owner" : "Sign in"}
            </Button>
          </Card>
        ) : (
          <>
            {activePage === "setup" && !setupComplete ? (
              <Card className="onboarding-panel route-view view-setup">
                <div className="section-heading">
                  <div>
                    <CardLabel>Guided onboarding</CardLabel>
                    <h2>
                      {onboardingComplete ? "Workspace ready" : "Finish setup"}
                    </h2>
                  </div>
                  <Badge variant={onboardingComplete ? "success" : "muted"}>
                    {onboardingSteps.filter((step) => step.complete).length} /{" "}
                    {onboardingSteps.length}
                  </Badge>
                </div>
                <div className="onboarding-layout">
                  <div
                    aria-label="Setup steps"
                    className="onboarding-steps"
                    role="tablist"
                  >
                    {onboardingSteps.map((step, index) => (
                      <button
                        aria-selected={activeOnboardingStep === index}
                        className={`onboarding-step ${activeOnboardingStep === index ? "active" : ""}`}
                        key={step.label}
                        onClick={() => setActiveOnboardingStep(index)}
                        role="tab"
                        type="button"
                      >
                        <span>{index + 1}</span>
                        <strong>{step.label}</strong>
                        <Badge variant={step.complete ? "success" : "muted"}>
                          {step.complete ? "Done" : "Open"}
                        </Badge>
                      </button>
                    ))}
                  </div>
                  <div className="onboarding-content" role="tabpanel">
                    {activeOnboardingStep === 0 ? (
                      <>
                        <h3>Choose where maxxy-me runs</h3>
                        <p>
                          Use local mode for development or VPS mode for an
                          always-on private workspace.
                        </p>
                        <div className="segmented-control">
                          {(["local", "vps"] as const).map((mode) => (
                            <button
                              aria-pressed={deploymentMode === mode}
                              className={
                                deploymentMode === mode ? "active" : ""
                              }
                              key={mode}
                              onClick={() => {
                                setDeploymentMode(mode);
                                window.localStorage.setItem(
                                  "maxxy.deploymentMode",
                                  mode,
                                );
                              }}
                              type="button"
                            >
                              {mode === "local"
                                ? "Local development"
                                : "Production VPS"}
                            </button>
                          ))}
                        </div>
                        {deploymentMode ? (
                          <a
                            className="doc-link"
                            href={
                              deploymentMode === "local"
                                ? "https://github.com/Omakidx/maxxy-me#local-development"
                                : "https://github.com/Omakidx/maxxy-me/blob/main/docs/vps-deployment.md"
                            }
                          >
                            Open deployment guide
                          </a>
                        ) : null}
                      </>
                    ) : null}
                    {activeOnboardingStep === 1 ? (
                      <>
                        <h3>Owner account</h3>
                        <p>
                          Your private owner account is active as{" "}
                          {text(data.user?.email, "owner")}.
                        </p>
                        <Badge variant="success">Public signup disabled</Badge>
                      </>
                    ) : null}
                    {activeOnboardingStep === 3 ? (
                      <>
                        <h3>Connect GitHub on the host</h3>
                        <p>
                          The execution host uses its authenticated GitHub CLI
                          account to push branches and create draft pull
                          requests.
                        </p>
                        {githubReady ? (
                          <Badge variant="success">
                            GitHub authenticated on an execution host
                          </Badge>
                        ) : (
                          <Link className="doc-link" href="/settings">
                            Connect GitHub in Settings
                          </Link>
                        )}
                        <a
                          className="doc-link"
                          href="https://github.com/Omakidx/maxxy-me/blob/main/docs/github-app.md"
                        >
                          Open GitHub setup guide
                        </a>
                      </>
                    ) : null}
                    {activeOnboardingStep === 2 ? (
                      <>
                        <h3>Enroll an execution host</h3>
                        <div className="two-col">
                          <Input
                            label="Host name"
                            value={enrollmentForm.hostName}
                            onChange={(event) =>
                              setEnrollmentForm({
                                ...enrollmentForm,
                                hostName: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Concurrent agents"
                            max="20"
                            min="1"
                            type="number"
                            value={enrollmentForm.maxConcurrentAgents}
                            onChange={(event) =>
                              setEnrollmentForm({
                                ...enrollmentForm,
                                maxConcurrentAgents: Number(event.target.value),
                              })
                            }
                          />
                        </div>
                        <Button
                          disabled={!enrollmentForm.hostName}
                          onClick={() => void createHostEnrollment()}
                          variant="primary"
                        >
                          Create enrollment command
                        </Button>
                        {enrollmentCommand ? (
                          <>
                            <code className="command-block">
                              {enrollmentCommand}
                            </code>
                            <p>
                              {deploymentMode === "vps"
                                ? "Run this on the installed VPS host before the token expires."
                                : "Run this from the maxxy-me repository root before the token expires."}
                            </p>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {activeOnboardingStep === 4 ? (
                      <>
                        <h3>Codex account</h3>
                        <div className="connection-statuses">
                          {readyCodexConnections.map((connection) => (
                            <div key={text(connection.id)}>
                              <strong>{text(connection.label)}</strong>
                              <Badge variant="success">connected</Badge>
                            </div>
                          ))}
                        </div>
                        <Link className="doc-link" href="/settings">
                          {readyCodexConnections.length > 0
                            ? "Manage Codex accounts"
                            : "Connect Codex account"}
                        </Link>
                      </>
                    ) : null}
                    {activeOnboardingStep === 5 ? (
                      <>
                        <h3>Import a repository</h3>
                        <p>
                          Register the GitHub remote and persistent host paths.
                        </p>
                        <Link className="doc-link" href="/setup">
                          Continue to repository setup
                        </Link>
                      </>
                    ) : null}
                    {activeOnboardingStep === 6 ? (
                      <>
                        <h3>Create the first task</h3>
                        <p>
                          Give Codex a focused change and follow its validation
                          and pull request evidence below.
                        </p>
                        <Link className="doc-link" href="/agent">
                          Continue to task setup
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            {activePage === "dashboard" ? (
              <section
                className="metric-grid route-view view-dashboard"
                aria-label="System summary"
              >
                <Metric
                  label="Active tasks"
                  value={activeTasks.length}
                  detail="Tasks currently assigned, running, validating, pushing, or opening a PR."
                />
                <Metric
                  label="Hosts online"
                  value={`${onlineHosts.length} / ${data.hosts.length}`}
                  detail="Enrolled host agents connected through authenticated WSS."
                />
                <Metric
                  label="Ready capacity"
                  value={data.capacity.length}
                  detail="Capacity sources reported by the control plane."
                />
                <Metric
                  label="Review queue"
                  value={openPrTasks.length}
                  detail="Tasks waiting for owner review after draft PR creation."
                />
              </section>
            ) : null}

            {activePage === "agent" ? (
              <Card className="execution-studio route-view view-agent">
                <div className="section-heading execution-heading">
                  <div>
                    <CardLabel>Agent console</CardLabel>
                    <h2>Prompt and live execution</h2>
                  </div>
                  <Badge
                    className="stream-badge"
                    variant={streamState === "live" ? "success" : "muted"}
                  >
                    <Radio aria-hidden="true" />
                    {streamState}
                  </Badge>
                </div>
                <output
                  className={`system-status-bar ${systemReady ? "ready" : "blocked"}`}
                >
                  <div className="system-status-copy">
                    {data.readiness ? (
                      <ShieldCheck aria-hidden="true" />
                    ) : (
                      <LoaderCircle
                        aria-hidden="true"
                        className="working-spinner"
                      />
                    )}
                    <div>
                      <strong>
                        {systemReady ? "Execution ready" : "Execution paused"}
                      </strong>
                      <span>{readinessMessage}</span>
                    </div>
                  </div>
                  <div className="readiness-checks">
                    {(
                      [
                        "database",
                        "worker",
                        "hosts",
                        "codex",
                        "github",
                      ] as const
                    ).map((check) => (
                      <Badge
                        key={check}
                        variant={
                          data.readiness?.checks[check] === "ok"
                            ? "success"
                            : "muted"
                        }
                      >
                        {check}
                      </Badge>
                    ))}
                  </div>
                </output>
                <div className="execution-grid">
                  <section className="prompt-composer">
                    <label className="field">
                      <span>Workspace</span>
                      <select
                        value={selectedWorkspaceId}
                        onChange={(event) =>
                          setTaskForm({
                            ...taskForm,
                            workspaceId: event.target.value,
                          })
                        }
                      >
                        {data.workspaces.map((workspace) => (
                          <option
                            value={text(workspace.id)}
                            key={text(workspace.id)}
                          >
                            {text(workspace.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label="Task title"
                      placeholder="Describe the outcome"
                      value={taskForm.title}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, title: event.target.value })
                      }
                    />
                    <Textarea
                      className="agent-prompt"
                      label="Prompt"
                      placeholder="Tell the agent what to build, change, or investigate..."
                      value={taskForm.prompt}
                      onChange={(event) =>
                        setTaskForm({ ...taskForm, prompt: event.target.value })
                      }
                    />
                    <div className="composer-actions">
                      <label className="check-field">
                        <input
                          checked={taskForm.startImmediately}
                          type="checkbox"
                          onChange={(event) =>
                            setTaskForm({
                              ...taskForm,
                              startImmediately: event.target.checked,
                            })
                          }
                        />
                        Start immediately
                      </label>
                      <Button
                        disabled={
                          !systemReady ||
                          !selectedWorkspaceId ||
                          !taskForm.title ||
                          !taskForm.prompt
                        }
                        title={systemReady ? undefined : readinessMessage}
                        onClick={() => void createTask()}
                        variant="primary"
                      >
                        <Play aria-hidden="true" />
                        Run task
                      </Button>
                    </div>
                  </section>

                  <section
                    aria-live="polite"
                    className="live-execution"
                    aria-label="Live agent activity"
                  >
                    {focusedTask ? (
                      <>
                        <div className="focused-task-header">
                          <div>
                            <span className="activity-kicker">
                              Focused task
                            </span>
                            <h3>{text(focusedTask.title)}</h3>
                            <p>
                              {text(focusedTask.workspace_name)} ·{" "}
                              {text(
                                focusedTask.assigned_host_id,
                                "Awaiting host",
                              )}
                            </p>
                          </div>
                          <Badge
                            variant={
                              activeTasks.some(
                                (task) =>
                                  text(task.id) === text(focusedTask.id),
                              )
                                ? "success"
                                : "muted"
                            }
                          >
                            {text(focusedTask.status)}
                          </Badge>
                        </div>
                        <div className="current-activity">
                          {focusedTaskWorking ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="working-spinner"
                            />
                          ) : (
                            <Bot aria-hidden="true" />
                          )}
                          <div>
                            <span>
                              {focusedTaskWorking
                                ? "Agent is currently"
                                : "Task status"}
                            </span>
                            <strong>
                              {latestFocusedEvent
                                ? eventSummary(latestFocusedEvent)
                                : text(focusedTask.status).replaceAll("_", " ")}
                            </strong>
                          </div>
                        </div>
                        <div className="row-actions task-actions">
                          {["queued", "blocked"].includes(
                            text(focusedTask.status),
                          ) ? (
                            <Button
                              disabled={!systemReady}
                              title={systemReady ? undefined : readinessMessage}
                              onClick={() =>
                                void runTaskAction(
                                  text(focusedTask.id),
                                  "start",
                                )
                              }
                            >
                              <Play aria-hidden="true" />
                              Start
                            </Button>
                          ) : null}
                          {["failed", "cancelled"].includes(
                            text(focusedTask.status),
                          ) ? (
                            <Button
                              disabled={!systemReady}
                              title={systemReady ? undefined : readinessMessage}
                              onClick={() =>
                                void runTaskAction(
                                  text(focusedTask.id),
                                  "retry",
                                )
                              }
                            >
                              <Play aria-hidden="true" />
                              Retry
                            </Button>
                          ) : null}
                          {activeTasks.some(
                            (task) => text(task.id) === text(focusedTask.id),
                          ) ? (
                            <Button
                              onClick={() =>
                                void runTaskAction(
                                  text(focusedTask.id),
                                  "cancel",
                                )
                              }
                            >
                              <Unplug aria-hidden="true" />
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                        <div className="streaming-output">
                          <div className="streaming-output-heading">
                            <span>Agent output</span>
                            {focusedTaskWorking ? (
                              <LoaderCircle
                                aria-label="Agent working"
                                className="working-spinner"
                              />
                            ) : null}
                          </div>
                          <pre
                            aria-busy={focusedTaskWorking}
                            aria-live="polite"
                            ref={agentOutputRef}
                            role="log"
                          >
                            {focusedAgentOutput ||
                              (focusedTaskWorking
                                ? "Waiting for the first output chunk..."
                                : "No streamed agent output for this task.")}
                          </pre>
                        </div>
                        <div className="activity-feed">
                          {focusedTaskEvents
                            .slice(-12)
                            .reverse()
                            .map((event, index) => (
                              <div
                                className="activity-item"
                                key={text(event.id)}
                              >
                                <span
                                  className={
                                    index === 0
                                      ? "activity-marker active"
                                      : "activity-marker"
                                  }
                                />
                                <div>
                                  <strong>{eventSummary(event)}</strong>
                                  <span>
                                    {text(event.type)} ·{" "}
                                    {formatTimestamp(event.occurred_at)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          {focusedTaskEvents.length === 0 ? (
                            <p className="empty">
                              Activity will appear here when the host starts
                              this task.
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="execution-empty">
                        <Bot aria-hidden="true" />
                        <p>Create a task to follow the agent in real time.</p>
                      </div>
                    )}
                  </section>
                </div>
              </Card>
            ) : null}

            {activePage === "tasks" || activePage === "hosts" ? (
              <section className="content-grid route-view view-tasks view-hosts split-route-grid">
                {activePage === "tasks" ? (
                  <Card className="task-panel view-tasks-only">
                    <div className="section-heading">
                      <div>
                        <CardLabel>Queue</CardLabel>
                        <h2>Task execution</h2>
                      </div>
                      <Badge>{streamState}</Badge>
                    </div>
                    <div className="table">
                      <div className="table-row table-head">
                        <span>Task</span>
                        <span>Status</span>
                        <span>Workspace</span>
                        <span>Host</span>
                        <span>Review</span>
                      </div>
                      {data.tasks.map((task) => (
                        <div className="table-row" key={text(task.id)}>
                          <span>
                            <button
                              className="task-focus"
                              onClick={() => setFocusedTaskId(text(task.id))}
                              type="button"
                            >
                              {text(task.title)}
                            </button>
                          </span>
                          <span>
                            <Badge variant="muted">{text(task.status)}</Badge>
                          </span>
                          <span>{text(task.workspace_name)}</span>
                          <span>{text(task.assigned_host_id)}</span>
                          <span>
                            <button
                              className="link-button"
                              onClick={() => void loadTaskReview(text(task.id))}
                              type="button"
                            >
                              Review
                            </button>
                          </span>
                        </div>
                      ))}
                      {data.tasks.length === 0 ? (
                        <p className="empty">No tasks yet.</p>
                      ) : null}
                    </div>
                  </Card>
                ) : null}

                {activePage === "hosts" ? (
                  <Card as="aside" className="side-panel view-hosts-only">
                    <div className="section-heading">
                      <div>
                        <CardLabel>Hosts</CardLabel>
                        <h2>Execution plane</h2>
                      </div>
                    </div>
                    <dl className="detail-list">
                      {data.hosts.map((host) => (
                        <div key={text(host.id)}>
                          <dt>{text(host.name)}</dt>
                          <dd>
                            {text(host.status)} ·{" "}
                            {numberValue(host.active_leases)} active leases
                          </dd>
                        </div>
                      ))}
                      {data.hosts.length === 0 ? (
                        <div>
                          <dt>No hosts</dt>
                          <dd>
                            Create an enrollment token from the API to connect a
                            host.
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </Card>
                ) : null}
              </section>
            ) : null}

            {activePage === "plans" ? (
              <Card className="plan-panel route-view view-plans">
                <div className="section-heading">
                  <div>
                    <CardLabel>Manager</CardLabel>
                    <h2>Plan parallel agent work</h2>
                  </div>
                  <Button onClick={() => void seedAgentProfiles()}>
                    Seed profiles
                  </Button>
                </div>
                <div className="plan-grid">
                  <div className="plan-form">
                    <Textarea
                      label="Goal"
                      value={planForm.goal}
                      onChange={(event) =>
                        setPlanForm({ ...planForm, goal: event.target.value })
                      }
                    />
                    <div className="two-col">
                      <Input
                        label="Frontend ownership"
                        value={planForm.frontendOwnership}
                        onChange={(event) =>
                          setPlanForm({
                            ...planForm,
                            frontendOwnership: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Backend ownership"
                        value={planForm.backendOwnership}
                        onChange={(event) =>
                          setPlanForm({
                            ...planForm,
                            backendOwnership: event.target.value,
                          })
                        }
                      />
                    </div>
                    <label className="check-field">
                      <input
                        checked={planForm.startImmediately}
                        type="checkbox"
                        onChange={(event) =>
                          setPlanForm({
                            ...planForm,
                            startImmediately: event.target.checked,
                          })
                        }
                      />
                      Queue approved plan immediately
                    </label>
                    <div className="row-actions">
                      <Button
                        disabled={!selectedWorkspaceId || !planForm.goal}
                        onClick={() => void previewManagerPlan()}
                      >
                        Preview plan
                      </Button>
                      <Button
                        disabled={!managerPlan || !systemReady}
                        title={systemReady ? undefined : readinessMessage}
                        onClick={() => void approveManagerPlan()}
                        variant="primary"
                      >
                        Approve plan
                      </Button>
                    </div>
                  </div>
                  <div className="stack-list">
                    {managerPlan?.tasks.map((task, index) => (
                      <div
                        className="list-item"
                        key={`${task.role}-${task.title}`}
                      >
                        <div>
                          <strong>{task.title}</strong>
                          <span>
                            {task.role} · owns{" "}
                            {task.ownershipClaims
                              .map((claim) => claim.pattern)
                              .join(", ") || "read-only review"}
                          </span>
                          <span>
                            Depends on{" "}
                            {task.dependsOnIndexes.length > 0
                              ? task.dependsOnIndexes
                                  .map((dependency) => `#${dependency + 1}`)
                                  .join(", ")
                              : "no tasks"}
                          </span>
                        </div>
                        <Badge
                          variant={task.mayRunInParallel ? "success" : "muted"}
                        >
                          #{index + 1}
                        </Badge>
                      </div>
                    )) ?? (
                      <p className="empty">Preview a plan to inspect tasks.</p>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

            {activePage === "setup" || activePage === "settings" ? (
              <section className="form-grid workspace-settings-grid route-view view-setup view-settings split-route-grid">
                {activePage === "setup" && !setupComplete ? (
                  <Card className="form-card view-setup-only">
                    <CardLabel>Workspace</CardLabel>
                    <h2>Create workspace</h2>
                    <Input
                      label="Name"
                      value={workspaceForm.name}
                      onChange={(event) =>
                        setWorkspaceForm({
                          ...workspaceForm,
                          name: event.target.value,
                        })
                      }
                    />
                    <div className="two-col">
                      <Input
                        label="GitHub owner"
                        value={workspaceForm.owner}
                        onChange={(event) =>
                          setWorkspaceForm({
                            ...workspaceForm,
                            owner: event.target.value,
                          })
                        }
                      />
                      <Input
                        label="Repository"
                        value={workspaceForm.repo}
                        onChange={(event) =>
                          setWorkspaceForm({
                            ...workspaceForm,
                            repo: event.target.value,
                          })
                        }
                      />
                    </div>
                    <Input
                      label="Remote URL"
                      value={workspaceForm.remoteUrl}
                      onChange={(event) =>
                        setWorkspaceForm({
                          ...workspaceForm,
                          remoteUrl: event.target.value,
                        })
                      }
                    />
                    <Input
                      label="Project path"
                      value={workspaceForm.projectPath}
                      onChange={(event) =>
                        setWorkspaceForm({
                          ...workspaceForm,
                          projectPath: event.target.value,
                        })
                      }
                    />
                    <Input
                      label="Worktree root"
                      value={workspaceForm.worktreeRoot}
                      onChange={(event) =>
                        setWorkspaceForm({
                          ...workspaceForm,
                          worktreeRoot: event.target.value,
                        })
                      }
                    />
                    <Button
                      onClick={() => void createWorkspace()}
                      variant="primary"
                    >
                      Create workspace
                    </Button>
                  </Card>
                ) : null}

                {activePage === "settings" ? (
                  <Card className="account-settings view-settings-only">
                    <div className="section-heading">
                      <div>
                        <CardLabel>Settings</CardLabel>
                        <h2>Connected accounts</h2>
                      </div>
                      <Badge>
                        {connectedCodexConnections.length + githubHosts.length}
                      </Badge>
                    </div>
                    <div className="settings-content">
                      <section className="account-form">
                        <div className="account-subheading">
                          <h3>Add Codex account</h3>
                          <span>Execution credentials</span>
                        </div>
                        <div className="two-col">
                          <label className="field">
                            <span>Execution host</span>
                            <select
                              value={connectionForm.hostId}
                              onChange={(event) =>
                                setConnectionForm({
                                  ...connectionForm,
                                  hostId: event.target.value,
                                })
                              }
                            >
                              <option value="">Select host</option>
                              {data.hosts.map((host) => (
                                <option
                                  disabled={text(host.status) !== "online"}
                                  key={text(host.id)}
                                  value={text(host.id)}
                                >
                                  {text(host.name)} ({text(host.status)})
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="field">
                            <span>Authentication</span>
                            <fieldset
                              aria-label="Codex authentication"
                              className="segmented-control"
                            >
                              <button
                                aria-pressed={
                                  connectionForm.authMode === "chatgpt"
                                }
                                className={
                                  connectionForm.authMode === "chatgpt"
                                    ? "active"
                                    : undefined
                                }
                                onClick={() =>
                                  setConnectionForm({
                                    ...connectionForm,
                                    authMode: "chatgpt",
                                  })
                                }
                                type="button"
                              >
                                ChatGPT subscription
                              </button>
                              <button
                                aria-pressed={
                                  connectionForm.authMode === "api_key"
                                }
                                className={
                                  connectionForm.authMode === "api_key"
                                    ? "active"
                                    : undefined
                                }
                                onClick={() =>
                                  setConnectionForm({
                                    ...connectionForm,
                                    authMode: "api_key",
                                  })
                                }
                                type="button"
                              >
                                API key
                              </button>
                            </fieldset>
                          </div>
                        </div>
                        <Button
                          disabled={
                            Boolean(connectionAction) ||
                            !connectionForm.hostId ||
                            pendingCodexConnections.some(
                              (connection) =>
                                text(connection.host_id) ===
                                connectionForm.hostId,
                            )
                          }
                          onClick={() => void setupCodexConnection()}
                          variant="primary"
                        >
                          <Plus aria-hidden="true" />
                          {connectionAction === "new:prepare"
                            ? "Preparing command..."
                            : connectionForm.authMode === "api_key"
                              ? "Connect API key"
                              : "Connect ChatGPT"}
                        </Button>
                      </section>

                      {pendingCodexConnections.length > 0 ? (
                        <section
                          aria-live="polite"
                          className="pending-connections"
                        >
                          {pendingCodexConnections.map((connection) => (
                            <div
                              className="pending-connection"
                              key={text(connection.id)}
                            >
                              <div className="pending-connection-heading">
                                <span className="account-icon">
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="working-spinner"
                                  />
                                </span>
                                <div>
                                  <strong>Waiting for authentication</strong>
                                  <span>
                                    {text(
                                      hostsById.get(text(connection.host_id))
                                        ?.name,
                                      "Execution host",
                                    )}
                                    {" · "}
                                    Expires in {pendingTimeLabel(connection)}
                                  </span>
                                </div>
                                <Badge variant="muted">pending</Badge>
                              </div>
                              <code className="command-block">
                                {connectionLoginCommand(
                                  connection,
                                  deploymentMode,
                                )}
                              </code>
                              <Button
                                disabled={Boolean(connectionAction)}
                                onClick={() =>
                                  void cancelPendingConnection(connection)
                                }
                              >
                                <X aria-hidden="true" />
                                {connectionAction ===
                                `${text(connection.id)}:cancel`
                                  ? "Cancelling..."
                                  : "Cancel"}
                              </Button>
                            </div>
                          ))}
                        </section>
                      ) : null}

                      <section
                        className="account-list"
                        aria-label="Codex accounts"
                      >
                        {connectedCodexConnections.map((connection) => (
                          <div
                            className="account-row"
                            key={text(connection.id)}
                          >
                            <div className="account-identity">
                              <span className="account-icon">
                                <Bot aria-hidden="true" />
                              </span>
                              <div>
                                <strong>{text(connection.label)}</strong>
                                <span>
                                  {text(
                                    hostsById.get(text(connection.host_id))
                                      ?.name,
                                    "Unknown host",
                                  )}
                                  {" · "}
                                  {text(
                                    hostsById.get(text(connection.host_id))
                                      ?.status,
                                    "unavailable",
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="account-meta">
                              <span>
                                {text(connection.auth_mode).replaceAll(
                                  "_",
                                  " ",
                                )}
                              </span>
                            </div>
                            <Badge
                              variant={
                                isReadyConnection(connection)
                                  ? "success"
                                  : "muted"
                              }
                            >
                              {text(connection.status).replaceAll("_", " ")}
                            </Badge>
                            <div className="account-actions">
                              <Button
                                disabled={
                                  Boolean(connectionAction) ||
                                  text(
                                    hostsById.get(text(connection.host_id))
                                      ?.status,
                                  ) !== "online"
                                }
                                title={
                                  text(
                                    hostsById.get(text(connection.host_id))
                                      ?.status,
                                  ) === "online"
                                    ? undefined
                                    : "The assigned execution host is offline"
                                }
                                onClick={() =>
                                  void manageCodexConnection(
                                    connection,
                                    "connect",
                                  )
                                }
                              >
                                <Play aria-hidden="true" />
                                {connectionAction ===
                                `${text(connection.id)}:connect`
                                  ? "Connecting..."
                                  : isReadyConnection(connection)
                                    ? "Reconnect"
                                    : "Connect"}
                              </Button>
                              {text(connection.status) !== "disabled" ? (
                                <Button
                                  disabled={Boolean(connectionAction)}
                                  onClick={() =>
                                    void manageCodexConnection(
                                      connection,
                                      "disconnect",
                                    )
                                  }
                                >
                                  <Unplug aria-hidden="true" />
                                  {connectionAction ===
                                  `${text(connection.id)}:disconnect`
                                    ? "Disconnecting..."
                                    : "Disconnect"}
                                </Button>
                              ) : null}
                              <Button
                                disabled={Boolean(connectionAction)}
                                onClick={() =>
                                  void manageCodexConnection(
                                    connection,
                                    "remove",
                                  )
                                }
                                title="Remove account"
                              >
                                <Trash2 aria-hidden="true" />
                                Remove account
                              </Button>
                            </div>
                          </div>
                        ))}
                        {connectedCodexConnections.length === 0 ? (
                          <div className="execution-empty">
                            <Bot aria-hidden="true" />
                            <p>No Codex accounts have been added yet.</p>
                          </div>
                        ) : null}
                      </section>
                    </div>

                    <section className="account-provider-section">
                      <div className="section-heading">
                        <div>
                          <CardLabel>GitHub</CardLabel>
                          <h3>Pull request account</h3>
                        </div>
                        <Badge variant={githubReady ? "success" : "muted"}>
                          {githubHosts.length} connected
                        </Badge>
                      </div>
                      <p className="settings-note">
                        Authentication lives on the execution host that pushes
                        task branches and opens draft pull requests. The account
                        must have access to every repository assigned to that
                        host.
                      </p>
                      <div className="two-col">
                        <label className="field">
                          <span>Execution host</span>
                          <select
                            value={githubHostId}
                            onChange={(event) => {
                              setGithubHostId(event.target.value);
                              setGithubLoginCommand("");
                            }}
                          >
                            <option value="">Select host</option>
                            {data.hosts.map((host) => (
                              <option
                                disabled={text(host.status) !== "online"}
                                key={text(host.id)}
                                value={text(host.id)}
                              >
                                {text(host.name)} ({text(host.status)})
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="field">
                          <span>Detected account</span>
                          <div className="readonly-value">
                            {isGitHubAuthenticated(hostsById.get(githubHostId))
                              ? text(
                                  githubToolStatus(hostsById.get(githubHostId))
                                    .account,
                                  "Authenticated",
                                )
                              : "Not connected"}
                          </div>
                        </div>
                      </div>
                      <div className="row-actions">
                        <Button
                          disabled={!githubHostId || Boolean(githubAction)}
                          onClick={() =>
                            prepareGitHubCommand(
                              isGitHubAuthenticated(hostsById.get(githubHostId))
                                ? "logout"
                                : "login",
                            )
                          }
                          variant="primary"
                        >
                          {isGitHubAuthenticated(
                            hostsById.get(githubHostId),
                          ) ? (
                            <Unplug aria-hidden="true" />
                          ) : (
                            <GitBranch aria-hidden="true" />
                          )}
                          {isGitHubAuthenticated(hostsById.get(githubHostId))
                            ? "Disconnect GitHub"
                            : "Connect GitHub"}
                        </Button>
                        <Button
                          disabled={!githubHostId || Boolean(githubAction)}
                          onClick={() => void verifyGitHubConnection()}
                        >
                          <RefreshCw
                            aria-hidden="true"
                            className={
                              githubAction === "verify"
                                ? "working-spinner"
                                : undefined
                            }
                          />
                          {githubAction === "verify"
                            ? "Verifying..."
                            : "Verify connection"}
                        </Button>
                      </div>
                      {githubLoginCommand ? (
                        <div className="login-command">
                          <span>
                            Run this command on the selected host, then select
                            Verify connection.
                          </span>
                          <code className="command-block">
                            {githubLoginCommand}
                          </code>
                        </div>
                      ) : null}
                      <div className="account-list github-account-list">
                        {data.hosts.map((host) => {
                          const github = githubToolStatus(host);
                          const authenticated = github.authenticated === true;
                          return (
                            <div className="account-row" key={text(host.id)}>
                              <div className="account-identity">
                                <span className="account-icon">
                                  <GitBranch aria-hidden="true" />
                                </span>
                                <div>
                                  <strong>
                                    {authenticated
                                      ? text(github.account, "GitHub account")
                                      : "GitHub not connected"}
                                  </strong>
                                  <span>{text(host.name)}</span>
                                </div>
                              </div>
                              <div className="account-meta">
                                <span>{text(host.status)}</span>
                                <span>Push and draft PR delivery</span>
                              </div>
                              <Badge
                                variant={authenticated ? "success" : "muted"}
                              >
                                {authenticated ? "connected" : "signed out"}
                              </Badge>
                            </div>
                          );
                        })}
                        {data.hosts.length === 0 ? (
                          <div className="execution-empty">
                            <GitBranch aria-hidden="true" />
                            <p>Enroll an execution host before GitHub login.</p>
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </Card>
                ) : null}
              </section>
            ) : null}

            {activePage === "tasks" ? (
              <section className="content-grid lower-grid route-view view-tasks">
                <Card className="task-panel">
                  <div className="section-heading">
                    <div>
                      <CardLabel>Review</CardLabel>
                      <h2>Merge evidence</h2>
                    </div>
                    <Badge variant={taskReview ? "success" : "muted"}>
                      {taskReview ? text(selectedTaskId) : "Select task"}
                    </Badge>
                  </div>
                  {taskReview ? (
                    <div className="review-grid">
                      <ReviewBlock
                        title="Completion report"
                        items={reportItems(taskReview.report as JsonRecord)}
                      />
                      <ReviewBlock
                        title="Changed files"
                        items={stringArray(
                          (taskReview.report as JsonRecord | undefined)
                            ?.changedFiles,
                        )}
                      />
                      <ReviewBlock
                        title="Command output"
                        items={
                          (
                            taskReview.commands as JsonRecord[] | undefined
                          )?.map(
                            (command) =>
                              `${text(command.command)} · ${text(command.status)}${command.exitCode === null || command.exitCode === undefined ? "" : ` · exit ${command.exitCode}`}`,
                          ) ?? []
                        }
                      />
                      <ReviewBlock
                        title="Pull request checks"
                        items={
                          (taskReview.checks as JsonRecord[] | undefined)?.map(
                            (check) =>
                              `${text(check.name)} · ${text(check.status)} · ${text(check.conclusion)}`,
                          ) ?? []
                        }
                      />
                    </div>
                  ) : (
                    <p className="empty">
                      Choose Review on a task row to load merge evidence.
                    </p>
                  )}
                </Card>

                <Card as="aside" className="side-panel">
                  <div className="section-heading">
                    <div>
                      <CardLabel>Validation</CardLabel>
                      <h2>Workspace profile</h2>
                    </div>
                  </div>
                  <Textarea
                    label="Validation JSON"
                    value={validationProfileText}
                    onChange={(event) =>
                      setValidationProfileText(event.target.value)
                    }
                  />
                  <Button
                    disabled={!selectedWorkspaceId}
                    onClick={() => void saveValidationProfile()}
                    variant="primary"
                  >
                    Save validation
                  </Button>
                </Card>
              </section>
            ) : null}

            {activePage === "approvals" || activePage === "events" ? (
              <section className="content-grid lower-grid route-view view-approvals view-events split-route-grid">
                {activePage === "approvals" ? (
                  <Card className="task-panel view-approvals-only">
                    <div className="section-heading">
                      <div>
                        <CardLabel>Approvals</CardLabel>
                        <h2>Pending decisions</h2>
                      </div>
                      <Badge>{pendingApprovals.length}</Badge>
                    </div>
                    <div className="stack-list">
                      {pendingApprovals.map((approval) => (
                        <div className="list-item" key={text(approval.id)}>
                          <div>
                            <strong>
                              {text(approval.task_title, "Task approval")}
                            </strong>
                            <span>
                              {text(
                                approval.requested_action,
                                text(approval.type, "approval.requested"),
                              )}
                            </span>
                          </div>
                          <div className="row-actions">
                            <Button
                              onClick={() =>
                                void decideApproval(approval.id, "approve_once")
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              onClick={() =>
                                void decideApproval(approval.id, "decline")
                              }
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                      {pendingApprovals.length === 0 ? (
                        <p className="empty">No pending approvals.</p>
                      ) : null}
                    </div>
                  </Card>
                ) : null}

                {activePage === "events" ? (
                  <Card as="aside" className="side-panel view-events-only">
                    <div className="section-heading">
                      <div>
                        <CardLabel>Events</CardLabel>
                        <h2>Recent activity</h2>
                      </div>
                    </div>
                    <div className="stack-list compact">
                      {data.events
                        .slice(-8)
                        .reverse()
                        .map((event) => (
                          <div className="list-item" key={text(event.id)}>
                            <strong>{text(event.type)}</strong>
                            <span>
                              #{numberValue(event.sequence)} ·{" "}
                              {text(event.occurred_at)}
                            </span>
                          </div>
                        ))}
                      {data.events.length === 0 ? (
                        <p className="empty">No events yet.</p>
                      ) : null}
                    </div>
                  </Card>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card className="metric-card">
      <CardLabel>{label}</CardLabel>
      <strong>{value}</strong>
      <p>{detail}</p>
    </Card>
  );
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function reportItems(report?: JsonRecord) {
  if (!report) {
    return [];
  }
  return [
    text(report.implementationSummary),
    `Migration notes: ${text(report.migrationNotes)}`,
    ...(stringArray(report.knownRisks).length > 0
      ? stringArray(report.knownRisks).map((risk) => `Risk: ${risk}`)
      : ["No known risks recorded."]),
    text(report.pullRequestUrl, "No pull request URL recorded."),
  ];
}

function ReviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="review-block">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>No entries recorded.</p>
      )}
    </div>
  );
}
