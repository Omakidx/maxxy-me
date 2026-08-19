import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createSecretToken,
  hashPassword,
  hashSecret,
  verifyPassword,
} from "@maxxy/security";
import { createDatabase } from "./client";
import { runMigrations } from "./migrator";
import {
  AuthRepository,
  HostEnrollmentRepository,
  PersonalApiTokenRepository,
  SecurityAuditRepository,
} from "./security-repositories";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
let database: ReturnType<typeof createDatabase> | undefined;

function requireRow<T>(row: T | null | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned from the database`);
  }
  return row;
}

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  await runMigrations({ databaseUrl, releaseVersion: "test" });
  database = createDatabase(databaseUrl);
});

afterAll(async () => {
  await database?.close();
});

describe("security repositories", () => {
  integrationTest(
    "bootstraps an owner session and supports one-time recovery",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const suffix = crypto.randomUUID();
      const auth = new AuthRepository(database.db);
      const passwordHash = hashPassword("phase-three-password");
      const owner = requireRow(
        await auth.createOwner({
          name: "Phase Three Owner",
          email: `phase3-${suffix}@maxxy.local`,
          passwordHash,
        }),
        "owner",
      );
      const sessionToken = createSecretToken("mxs");
      const session = requireRow(
        await auth.createSession({
          userId: owner.id,
          tokenHash: hashSecret(sessionToken),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        "session",
      );

      expect(
        (await auth.findSessionByTokenHash(hashSecret(sessionToken)))
          ?.sessionId,
      ).toBe(session.id);
      expect(verifyPassword("phase-three-password", owner.passwordHash)).toBe(
        true,
      );

      const recoveryToken = createSecretToken("mxr");
      await auth.createOwnerRecoveryToken({
        email: owner.email,
        tokenHash: hashSecret(recoveryToken),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const recovered = requireRow(
        await auth.recoverOwnerPassword({
          tokenHash: hashSecret(recoveryToken),
          passwordHash: hashPassword("phase-three-new-password"),
        }),
        "recovered owner",
      );

      expect(
        verifyPassword("phase-three-new-password", recovered.passwordHash),
      ).toBe(true);
      expect(
        await auth.recoverOwnerPassword({
          tokenHash: hashSecret(recoveryToken),
          passwordHash,
        }),
      ).toBeNull();
    },
  );

  integrationTest(
    "exchanges a host enrollment token exactly once",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const enrollments = new HostEnrollmentRepository(database.db);
      const enrollmentToken = createSecretToken("mxh_enroll");
      const hostAuthToken = createSecretToken("mxh");
      const enrollment = await enrollments.createEnrollment({
        hostName: `phase3-host-${crypto.randomUUID()}`,
        enrollmentTokenHash: hashSecret(enrollmentToken),
        expiresAt: new Date(Date.now() + 60_000),
        maxConcurrentAgents: 2,
      });

      const exchanged = requireRow(
        await enrollments.exchangeEnrollment({
          enrollmentTokenHash: hashSecret(enrollmentToken),
          hostAuthTokenHash: hashSecret(hostAuthToken),
          hostVersion: "test",
          toolInventory: { shell: true },
        }),
        "host enrollment exchange",
      );

      expect(exchanged.host.id).toBe(enrollment.host.id);
      expect(
        await enrollments.exchangeEnrollment({
          enrollmentTokenHash: hashSecret(enrollmentToken),
          hostAuthTokenHash: hashSecret(createSecretToken("mxh")),
        }),
      ).toBeNull();
      expect(
        (await enrollments.verifyHostToken(hashSecret(hostAuthToken)))?.hostId,
      ).toBe(enrollment.host.id);
    },
  );

  integrationTest(
    "creates, verifies, lists, and revokes personal API tokens",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const auth = new AuthRepository(database.db);
      const owner = requireRow(
        await auth.createOwner({
          name: "Token Owner",
          email: `tokens-${crypto.randomUUID()}@maxxy.local`,
          passwordHash: hashPassword("phase-three-password"),
        }),
        "owner",
      );
      const personalTokens = new PersonalApiTokenRepository(database.db);
      const rawToken = createSecretToken("mxp");
      const token = requireRow(
        await personalTokens.createToken({
          userId: owner.id,
          name: "Automation",
          tokenHash: hashSecret(rawToken),
          scopes: ["tokens:read"],
          expiresAt: new Date(Date.now() + 60_000),
        }),
        "personal API token",
      );

      expect(
        (await personalTokens.verifyToken(hashSecret(rawToken)))?.tokenId,
      ).toBe(token.id);
      expect(await personalTokens.listTokens(owner.id)).toHaveLength(1);
      expect(
        (
          await personalTokens.revokeToken({
            userId: owner.id,
            tokenId: token.id,
          })
        )?.revokedAt,
      ).toBeInstanceOf(Date);
      expect(await personalTokens.verifyToken(hashSecret(rawToken))).toBeNull();
    },
  );

  integrationTest("records security audit events", async () => {
    if (!database) {
      throw new Error("Database fixture is not initialized");
    }

    const audit = new SecurityAuditRepository(database.db);
    const row = requireRow(
      await audit.record({
        action: "test.security_event",
        targetType: "test",
        targetId: crypto.randomUUID(),
        metadata: { phase: 3 },
      }),
      "audit log",
    );

    expect(row.action).toBe("test.security_event");
  });
});
