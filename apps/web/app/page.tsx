"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { Badge, Button, Card, CardLabel, Input, Textarea } from "./ui";

type ApiState = "loading" | "ready" | "signed_out" | "bootstrap" | "error";
type JsonRecord = Record<string, unknown>;

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

async function parseJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const message = text(body.message, text(body.error, "Request failed"));
    throw new Error(message);
  }
  return body;
}

export default function Page() {
  const [state, setState] = useState<ApiState>("loading");
  const [csrfToken, setCsrfToken] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [deploymentMode, setDeploymentMode] = useState<"" | "local" | "vps">(
    "",
  );
  const [githubReady, setGithubReady] = useState(false);
  const [activeOnboardingStep, setActiveOnboardingStep] = useState(0);
  const [enrollmentForm, setEnrollmentForm] = useState({
    hostName: "Primary execution host",
    maxConcurrentAgents: 1,
  });
  const [enrollmentCommand, setEnrollmentCommand] = useState("");
  const [codexLoginCommand, setCodexLoginCommand] = useState("");
  const [connectionForm, setConnectionForm] = useState({
    hostId: "",
    label: "Primary Codex connection",
    authMode: "chatgpt",
    credentialSlotId: "primary",
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
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskReview, setTaskReview] = useState<JsonRecord | undefined>();
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
  const openPrTasks = data.tasks.filter(
    (task) => text(task.status) === "awaiting_review",
  );
  const signedIn = state === "ready";
  const readyCodexConnections = data.codexConnections.filter((connection) =>
    [
      "ready_chatgpt",
      "ready_api_key",
      "ready_enterprise_access_token",
    ].includes(text(connection.status)),
  );
  const selectedHostConnections = data.codexConnections.filter(
    (connection) => text(connection.host_id) === connectionForm.hostId,
  );
  const onboardingSteps = [
    { label: "Deployment", complete: Boolean(deploymentMode) },
    { label: "Owner", complete: signedIn },
    { label: "GitHub", complete: githubReady },
    { label: "Host", complete: onlineHosts.length > 0 },
    { label: "Codex", complete: readyCodexConnections.length > 0 },
    { label: "Repository", complete: data.workspaces.length > 0 },
    { label: "First task", complete: data.tasks.length > 0 },
  ];
  const onboardingComplete = onboardingSteps.every((step) => step.complete);
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
      const [hosts, workspaces, tasks, capacity, approvals, events] =
        await Promise.all([
          api("/api/hosts"),
          api("/api/workspaces"),
          api("/api/tasks"),
          api("/api/codex-capacity/summary"),
          api("/api/approvals"),
          api("/api/events?limit=20"),
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
      setMessage("");
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
    try {
      if (!connectionForm.hostId) {
        throw new Error("Enroll a host before adding a Codex connection");
      }
      const result = await api(
        `/api/hosts/${encodeURIComponent(connectionForm.hostId)}/codex-connections/setup`,
        {
          method: "POST",
          body: JSON.stringify({
            label: connectionForm.label,
            authMode: connectionForm.authMode,
            credentialSlotId: connectionForm.credentialSlotId,
            capacitySourceLabel: connectionForm.label,
            capacitySourceKind:
              connectionForm.authMode === "api_key"
                ? "api_project"
                : "chatgpt_account",
            maxConcurrentRuns: 1,
          }),
        },
      );
      const connection = result.connection as JsonRecord;
      const authMode = text(connection.auth_mode, connectionForm.authMode);
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
        "--credential-slot",
        shellQuote(
          text(connection.credential_slot_id, connectionForm.credentialSlotId),
        ),
        "--capacity-source-id",
        shellQuote(text(connection.capacity_source_id)),
        ...(deploymentMode === "vps" && authMode === "chatgpt"
          ? ["--device-auth"]
          : []),
      ].join(" ");
      setCodexLoginCommand(
        authMode === "api_key"
          ? `read -rsp 'OpenAI API key: ' OPENAI_API_KEY; printf '%s' "$OPENAI_API_KEY" | ${command}; unset OPENAI_API_KEY`
          : command,
      );
      setMessage(
        "Codex connection prepared. Run the login command on the selected host.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createTask() {
    try {
      await api("/api/tasks", {
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
    setGithubReady(window.localStorage.getItem("maxxy.githubReady") === "true");
  }, []);

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
    if (!signedIn) return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [signedIn, csrfToken]);

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
          <a className="nav-link active" href="#dashboard">
            Dashboard
          </a>
          <a className="nav-link" href="#onboarding">
            Setup
          </a>
          <a className="nav-link" href="#plans">
            Plans
          </a>
          <a className="nav-link" href="#tasks">
            Tasks
          </a>
          <a className="nav-link" href="#hosts">
            Hosts
          </a>
          <a className="nav-link" href="#approvals">
            Approvals
          </a>
          <a className="nav-link" href="#events">
            Events
          </a>
        </nav>
      </aside>

      <section className="workspace" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal coding workspace</p>
            <h1>Execution dashboard</h1>
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

        {message ? <div className="notice">{message}</div> : null}

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
            <Card className="onboarding-panel" id="onboarding">
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
                            className={deploymentMode === mode ? "active" : ""}
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
                  {activeOnboardingStep === 2 ? (
                    <>
                      <h3>Authorize GitHub</h3>
                      <p>
                        Install the GitHub App for the repositories you plan to
                        import and configure its webhook secret.
                      </p>
                      <label className="check-field">
                        <input
                          checked={githubReady}
                          onChange={(event) => {
                            setGithubReady(event.target.checked);
                            window.localStorage.setItem(
                              "maxxy.githubReady",
                              String(event.target.checked),
                            );
                          }}
                          type="checkbox"
                        />
                        GitHub App installed and webhook configured
                      </label>
                      <a
                        className="doc-link"
                        href="https://github.com/Omakidx/maxxy-me/blob/main/docs/github-app.md"
                      >
                        Open GitHub setup guide
                      </a>
                    </>
                  ) : null}
                  {activeOnboardingStep === 3 ? (
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
                      <h3>Connect and check Codex</h3>
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
                        <label className="field">
                          <span>Authentication</span>
                          <select
                            value={connectionForm.authMode}
                            onChange={(event) =>
                              setConnectionForm({
                                ...connectionForm,
                                authMode: event.target.value,
                              })
                            }
                          >
                            <option value="chatgpt">ChatGPT account</option>
                            <option value="api_key">API key</option>
                          </select>
                        </label>
                      </div>
                      <div className="two-col">
                        <Input
                          label="Connection label"
                          value={connectionForm.label}
                          onChange={(event) =>
                            setConnectionForm({
                              ...connectionForm,
                              label: event.target.value,
                            })
                          }
                        />
                        <Input
                          label="Credential slot"
                          value={connectionForm.credentialSlotId}
                          onChange={(event) =>
                            setConnectionForm({
                              ...connectionForm,
                              credentialSlotId: event.target.value,
                            })
                          }
                        />
                      </div>
                      <Button
                        disabled={
                          !connectionForm.hostId ||
                          !connectionForm.label ||
                          !connectionForm.credentialSlotId
                        }
                        onClick={() => void setupCodexConnection()}
                        variant="primary"
                      >
                        Register connection
                      </Button>
                      {codexLoginCommand ? (
                        <>
                          <p>
                            Keep the host agent running and execute this in a
                            separate terminal on the selected host.
                          </p>
                          <code className="command-block">
                            {codexLoginCommand}
                          </code>
                        </>
                      ) : null}
                      <div className="connection-statuses">
                        {selectedHostConnections.map((connection) => (
                          <div key={text(connection.id)}>
                            <strong>{text(connection.label)}</strong>
                            <Badge
                              variant={
                                text(connection.status).startsWith("ready_")
                                  ? "success"
                                  : "muted"
                              }
                            >
                              {text(connection.status)}
                            </Badge>
                          </div>
                        ))}
                        {selectedHostConnections.length === 0 ? (
                          <p>No Codex connections registered yet.</p>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  {activeOnboardingStep === 5 ? (
                    <>
                      <h3>Import a repository</h3>
                      <p>
                        Register the GitHub remote and persistent host paths.
                      </p>
                      <a className="doc-link" href="#repository-setup">
                        Continue to repository setup
                      </a>
                    </>
                  ) : null}
                  {activeOnboardingStep === 6 ? (
                    <>
                      <h3>Create the first task</h3>
                      <p>
                        Give Codex a focused change and follow its validation
                        and pull request evidence below.
                      </p>
                      <a className="doc-link" href="#first-task">
                        Continue to task setup
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
            </Card>

            <section className="metric-grid" aria-label="System summary">
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

            <section className="content-grid">
              <Card className="task-panel" id="tasks">
                <div className="section-heading">
                  <div>
                    <CardLabel>Queue</CardLabel>
                    <h2>Task execution</h2>
                  </div>
                  <Badge>Live</Badge>
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
                      <span>{text(task.title)}</span>
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

              <Card as="aside" className="side-panel" id="hosts">
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
                        {text(host.status)} · {numberValue(host.active_leases)}{" "}
                        active leases
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
            </section>

            <Card className="plan-panel" id="plans">
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
                      disabled={!managerPlan}
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

            <section className="form-grid">
              <Card className="form-card" id="repository-setup">
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

              <Card className="form-card" id="first-task">
                <CardLabel>Task</CardLabel>
                <h2>Create task</h2>
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
                  label="Title"
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, title: event.target.value })
                  }
                />
                <Textarea
                  label="Prompt"
                  value={taskForm.prompt}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, prompt: event.target.value })
                  }
                />
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
                    !selectedWorkspaceId || !taskForm.title || !taskForm.prompt
                  }
                  onClick={() => void createTask()}
                  variant="primary"
                >
                  Create task
                </Button>
              </Card>
            </section>

            <section className="content-grid lower-grid" id="review">
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
                        (taskReview.commands as JsonRecord[] | undefined)?.map(
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

            <section className="content-grid lower-grid">
              <Card className="task-panel" id="approvals">
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

              <Card as="aside" className="side-panel" id="events">
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
            </section>
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
