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
  workspaces: JsonRecord[];
  tasks: JsonRecord[];
  capacity: JsonRecord[];
  approvals: JsonRecord[];
  events: JsonRecord[];
};

const emptyData: DashboardData = {
  hosts: [],
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
      setData({
        user: me.user as JsonRecord,
        hosts: (hosts.hosts as JsonRecord[]) ?? [],
        workspaces: (workspaces.workspaces as JsonRecord[]) ?? [],
        tasks: (tasks.tasks as JsonRecord[]) ?? [],
        capacity: (capacity.capacity as JsonRecord[]) ?? [],
        approvals: (approvals.approvals as JsonRecord[]) ?? [],
        events: (events.events as JsonRecord[]) ?? [],
      });
      setState("ready");
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
            <p className="eyebrow">Phase 8</p>
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
                    <span>PR</span>
                  </div>
                  {data.tasks.map((task) => (
                    <div className="table-row" key={text(task.id)}>
                      <span>{text(task.title)}</span>
                      <span>
                        <Badge variant="muted">{text(task.status)}</Badge>
                      </span>
                      <span>{text(task.workspace_name)}</span>
                      <span>{text(task.assigned_host_id)}</span>
                      <span>{text(task.pull_request_url)}</span>
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
              <Card className="form-card">
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

              <Card className="form-card">
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
