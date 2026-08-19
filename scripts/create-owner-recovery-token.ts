import { AuthRepository, createDatabase } from "@maxxy/database";
import { createSecretToken, hashSecret } from "@maxxy/security";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  OWNER_EMAIL: z.string().email(),
  RECOVERY_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24)
    .default(60 * 30),
});

const config = env.parse(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  const token = createSecretToken("mxr");
  const expiresAt = new Date(
    Date.now() + config.RECOVERY_TOKEN_TTL_SECONDS * 1000,
  );
  const repo = new AuthRepository(database.db);
  const user = await repo.findUserByEmail(config.OWNER_EMAIL);

  if (!user || user.role !== "owner") {
    throw new Error("OWNER_EMAIL must match an existing owner account");
  }

  await repo.createOwnerRecoveryToken({
    email: config.OWNER_EMAIL,
    tokenHash: hashSecret(token),
    expiresAt,
  });

  console.log(
    JSON.stringify({
      level: "info",
      service: "maxxy-owner-recovery",
      message: "owner recovery token created",
      ownerEmail: config.OWNER_EMAIL.toLowerCase(),
      token,
      expiresAt,
      timestamp: new Date().toISOString(),
    }),
  );
} finally {
  await database.close();
}
