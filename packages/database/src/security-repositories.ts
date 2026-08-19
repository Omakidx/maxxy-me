import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  auditLogs,
  hosts,
  hostTokens,
  personalApiTokens,
  sessions,
  users,
  verificationTokens,
} from "./schema";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export type AuthenticatedApiToken = {
  tokenId: string;
  scopes: string[];
  expiresAt: Date | null;
  user: AuthenticatedUser;
};

export class AuthRepository {
  constructor(private readonly db: Database) {}

  async countOwners() {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "owner"));
    return row?.count ?? 0;
  }

  async createOwner(input: {
    name: string;
    email: string;
    passwordHash: string;
  }) {
    const [row] = await this.db
      .insert(users)
      .values({
        id: id("usr"),
        name: input.name,
        email: input.email.toLowerCase(),
        role: "owner",
        passwordHash: input.passwordHash,
      })
      .returning();
    return row;
  }

  async findUserByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const [row] = await this.db
      .insert(sessions)
      .values({
        id: id("sess"),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    return row;
  }

  async findSessionByTokenHash(
    tokenHash: string,
    now = new Date(),
  ): Promise<AuthenticatedSession | null> {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      user: {
        id: row.userId,
        name: row.name,
        email: row.email,
        role: row.role,
      },
    };
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .returning({ id: sessions.id, userId: sessions.userId });
    return deleted[0] ?? null;
  }

  async createOwnerRecoveryToken(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const [row] = await this.db
      .insert(verificationTokens)
      .values({
        id: id("verify"),
        identifier: `owner-recovery:${input.email.toLowerCase()}`,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    return row;
  }

  async recoverOwnerPassword(input: {
    tokenHash: string;
    passwordHash: string;
    now?: Date;
  }) {
    return this.db.transaction(async (tx) => {
      const now = input.now ?? new Date();
      const [token] = await tx
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.tokenHash, input.tokenHash),
            gt(verificationTokens.expiresAt, now),
          ),
        )
        .limit(1);

      if (!token || !token.identifier.startsWith("owner-recovery:")) {
        return null;
      }

      const email = token.identifier.slice("owner-recovery:".length);
      const [user] = await tx
        .update(users)
        .set({ passwordHash: input.passwordHash, updatedAt: sql`now()` })
        .where(and(eq(users.email, email), eq(users.role, "owner")))
        .returning();

      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.id, token.id));
      return user ?? null;
    });
  }
}

export class HostEnrollmentRepository {
  constructor(private readonly db: Database) {}

  async createEnrollment(input: {
    hostName: string;
    enrollmentTokenHash: string;
    expiresAt: Date;
    maxConcurrentAgents?: number;
  }) {
    return this.db.transaction(async (tx) => {
      const [host] = await tx
        .insert(hosts)
        .values({
          id: id("host"),
          name: input.hostName,
          status: "connecting",
          maxConcurrentAgents: input.maxConcurrentAgents ?? 1,
        })
        .returning();

      if (!host) {
        throw new Error("Host was not created");
      }

      const [token] = await tx
        .insert(hostTokens)
        .values({
          id: id("hosttok"),
          hostId: host.id,
          tokenHash: input.enrollmentTokenHash,
          purpose: "enrollment",
          expiresAt: input.expiresAt,
        })
        .returning();

      if (!token) {
        throw new Error("Host enrollment token was not created");
      }

      return { host, token };
    });
  }

  async exchangeEnrollment(input: {
    enrollmentTokenHash: string;
    hostAuthTokenHash: string;
    hostVersion?: string;
    toolInventory?: Record<string, unknown>;
    now?: Date;
  }) {
    return this.db.transaction(async (tx) => {
      const now = input.now ?? new Date();
      const [enrollment] = await tx
        .select()
        .from(hostTokens)
        .where(
          and(
            eq(hostTokens.tokenHash, input.enrollmentTokenHash),
            eq(hostTokens.purpose, "enrollment"),
            isNull(hostTokens.consumedAt),
            isNull(hostTokens.revokedAt),
          ),
        )
        .limit(1);

      if (
        !enrollment ||
        (enrollment.expiresAt && enrollment.expiresAt <= now) ||
        !enrollment.hostId
      ) {
        return null;
      }

      const [host] = await tx
        .update(hosts)
        .set({
          status: "online",
          hostVersion: input.hostVersion,
          toolInventory: input.toolInventory ?? {},
          lastHeartbeatAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(hosts.id, enrollment.hostId))
        .returning();

      if (!host) {
        return null;
      }

      await tx
        .update(hostTokens)
        .set({ consumedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(hostTokens.id, enrollment.id));

      const [authToken] = await tx
        .insert(hostTokens)
        .values({
          id: id("hosttok"),
          hostId: host.id,
          tokenHash: input.hostAuthTokenHash,
          purpose: "host_auth",
        })
        .returning();

      if (!authToken) {
        throw new Error("Host auth token was not created");
      }

      return { host, authToken };
    });
  }

  async verifyHostToken(tokenHash: string) {
    const [row] = await this.db
      .select({
        tokenId: hostTokens.id,
        hostId: hosts.id,
        name: hosts.name,
        status: hosts.status,
      })
      .from(hostTokens)
      .innerJoin(hosts, eq(hostTokens.hostId, hosts.id))
      .where(
        and(
          eq(hostTokens.tokenHash, tokenHash),
          eq(hostTokens.purpose, "host_auth"),
          isNull(hostTokens.consumedAt),
          isNull(hostTokens.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

export class PersonalApiTokenRepository {
  constructor(private readonly db: Database) {}

  async createToken(input: {
    userId: string;
    name: string;
    tokenHash: string;
    scopes: string[];
    expiresAt?: Date;
  }) {
    const [row] = await this.db
      .insert(personalApiTokens)
      .values({
        id: id("pat"),
        userId: input.userId,
        name: input.name,
        tokenHash: input.tokenHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      })
      .returning();
    return row;
  }

  async listTokens(userId: string) {
    return this.db
      .select({
        id: personalApiTokens.id,
        name: personalApiTokens.name,
        scopes: personalApiTokens.scopes,
        expiresAt: personalApiTokens.expiresAt,
        revokedAt: personalApiTokens.revokedAt,
        lastUsedAt: personalApiTokens.lastUsedAt,
        createdAt: personalApiTokens.createdAt,
      })
      .from(personalApiTokens)
      .where(eq(personalApiTokens.userId, userId));
  }

  async verifyToken(
    tokenHash: string,
    now = new Date(),
  ): Promise<AuthenticatedApiToken | null> {
    const [row] = await this.db
      .select({
        tokenId: personalApiTokens.id,
        scopes: personalApiTokens.scopes,
        expiresAt: personalApiTokens.expiresAt,
        revokedAt: personalApiTokens.revokedAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(personalApiTokens)
      .innerJoin(users, eq(personalApiTokens.userId, users.id))
      .where(
        and(
          eq(personalApiTokens.tokenHash, tokenHash),
          isNull(personalApiTokens.revokedAt),
        ),
      )
      .limit(1);

    if (!row || (row.expiresAt && row.expiresAt <= now)) {
      return null;
    }

    await this.db
      .update(personalApiTokens)
      .set({ lastUsedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(personalApiTokens.id, row.tokenId));

    return {
      tokenId: row.tokenId,
      scopes: row.scopes as string[],
      expiresAt: row.expiresAt,
      user: {
        id: row.userId,
        name: row.name,
        email: row.email,
        role: row.role,
      },
    };
  }

  async revokeToken(input: { userId: string; tokenId: string }) {
    const [row] = await this.db
      .update(personalApiTokens)
      .set({ revokedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(personalApiTokens.id, input.tokenId),
          eq(personalApiTokens.userId, input.userId),
        ),
      )
      .returning();
    return row ?? null;
  }
}

export class SecurityAuditRepository {
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
      .values({
        id: id("audit"),
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata ?? {},
      })
      .returning();
    return row;
  }
}
