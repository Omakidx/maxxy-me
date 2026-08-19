import {
  CodexCapacityRepository,
  CodexCapacitySourceRepository,
  CodexConnectionRepository,
  createDatabase,
  HostRepository,
  SeedRepository,
  WorkspaceRepository,
} from "@maxxy/database";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  APP_ENV: z.string().default("development"),
  SEED_OWNER_EMAIL: z.string().email().default("owner@maxxy.local"),
  SEED_OWNER_NAME: z.string().default("Maxxy Owner"),
  SEED_REPOSITORY_OWNER: z.string().default("Omakidx"),
  SEED_REPOSITORY_NAME: z.string().default("maxxy-me"),
  SEED_REPOSITORY_REMOTE_URL: z
    .string()
    .url()
    .default("https://github.com/Omakidx/maxxy-me.git"),
  SEED_PROJECT_PATH: z.string().default("/srv/maxxy-me/current"),
  SEED_WORKTREE_ROOT: z.string().default("/srv/maxxy-me/worktrees"),
});

const config = env.parse(process.env);

if (config.APP_ENV === "production") {
  throw new Error("Refusing to seed development data when APP_ENV=production");
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned from the database`);
  }
  return row;
}

const database = createDatabase(config.DATABASE_URL);

try {
  const seeds = new SeedRepository(database.db);
  const hosts = new HostRepository(database.db);
  const workspaces = new WorkspaceRepository(database.db);
  const sources = new CodexCapacitySourceRepository(database.db);
  const capacity = new CodexCapacityRepository(database.db);
  const connections = new CodexConnectionRepository(database.db);

  const owner = requireRow(
    await seeds.upsertDevelopmentOwner({
      id: "usr_dev_owner",
      name: config.SEED_OWNER_NAME,
      email: config.SEED_OWNER_EMAIL,
    }),
    "owner",
  );
  const host = requireRow(
    await hosts.upsertHost({
      id: "host_local_dev",
      name: "Local development host",
      status: "online",
      maxConcurrentAgents: 2,
      protocolVersion: 1,
      toolInventory: { runtime: "bun", shell: "bash" },
    }),
    "host",
  );
  const repository = requireRow(
    await workspaces.upsertRepository({
      id: "repo_maxxy_me",
      owner: config.SEED_REPOSITORY_OWNER,
      name: config.SEED_REPOSITORY_NAME,
      remoteUrl: config.SEED_REPOSITORY_REMOTE_URL,
      defaultBranch: "main",
    }),
    "repository",
  );
  const workspace = await workspaces
    .createWorkspace({
      id: "ws_maxxy_me_dev",
      name: "maxxy-me development",
      repositoryId: repository.id,
      defaultHostId: host.id,
      projectPath: config.SEED_PROJECT_PATH,
      worktreeRoot: config.SEED_WORKTREE_ROOT,
      baseBranch: "main",
      maximumConcurrentAgents: 2,
    })
    .then((row) => requireRow(row, "workspace"))
    .catch(async () => {
      const [existing] = await database.db.query.workspaces.findMany({
        where: (workspaceTable, { eq }) =>
          eq(workspaceTable.id, "ws_maxxy_me_dev"),
        limit: 1,
      });
      return requireRow(existing, "workspace");
    });

  const source = requireRow(
    await sources.upsertSource({
      id: "capsrc_local_chatgpt",
      label: "Local ChatGPT capacity",
      kind: "chatgpt_account",
      providerScopeHint: "local-browser-session",
      maxConcurrentRuns: 1,
    }),
    "capacity source",
  );
  const connection = requireRow(
    await connections.upsertConnection({
      id: "codexconn_local_chatgpt",
      hostId: host.id,
      capacitySourceId: source.id,
      label: "Local Codex CLI",
      authMode: "chatgpt",
      status: "ready_chatgpt",
      credentialSlotId: "local-chatgpt-session",
      maxConcurrentRuns: 1,
    }),
    "Codex connection",
  );
  const pool = await capacity
    .createPool({
      id: "pool_dev_default",
      workspaceId: workspace.id,
      name: "Development capacity pool",
      routingPolicy: "balanced",
    })
    .then((row) => requireRow(row, "capacity pool"))
    .catch(async () => {
      const [existing] = await database.db.query.codexCapacityPools.findMany({
        where: (poolTable, { eq }) => eq(poolTable.id, "pool_dev_default"),
        limit: 1,
      });
      return requireRow(existing, "capacity pool");
    });

  await capacity.addMember({
    poolId: pool.id,
    connectionId: connection.id,
    priority: 10,
    maxActiveRuns: 1,
  });
  await seeds.upsertDefaultAgentProfile({
    id: "agent_planner_default",
    workspaceId: workspace.id,
    name: "Planner",
    role: "architect",
    instructions:
      "Break goals into sequenced implementation tasks with explicit handoff criteria.",
    sandboxMode: "workspace-write",
    canCreateSubagents: true,
  });
  await seeds.upsertDefaultAgentProfile({
    id: "agent_implementer_default",
    workspaceId: workspace.id,
    name: "Implementer",
    role: "backend",
    instructions:
      "Implement scoped tasks, run verification, and leave concise handoff notes.",
    sandboxMode: "workspace-write",
  });
  await seeds.upsertDefaultAgentProfile({
    id: "agent_reviewer_default",
    workspaceId: workspace.id,
    name: "Reviewer",
    role: "reviewer",
    instructions:
      "Review changes for correctness, regressions, security, and missing tests.",
    sandboxMode: "read-only",
  });

  console.log(
    JSON.stringify({
      level: "info",
      service: "maxxy-db-seed",
      message: "development seed complete",
      ownerId: owner.id,
      workspaceId: workspace.id,
      hostId: host.id,
      capacitySourceId: source.id,
      connectionId: connection.id,
      timestamp: new Date().toISOString(),
    }),
  );
} finally {
  await database.close();
}
