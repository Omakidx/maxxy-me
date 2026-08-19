import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const passwordAlgorithm = "pbkdf2_sha256";
const passwordIterations = 310_000;
const passwordKeyLength = 32;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export function createSecretToken(prefix = "mxy") {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashSecret(secret: string) {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(
    password,
    salt,
    passwordIterations,
    passwordKeyLength,
    "sha256",
  ).toString("base64url");

  return `${passwordAlgorithm}$${passwordIterations}$${salt}$${digest}`;
}

export function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, iterations, salt, digest] = storedHash.split("$");
  if (algorithm !== passwordAlgorithm || !iterations || !salt || !digest) {
    return false;
  }

  const iterationCount = Number(iterations);
  if (!Number.isSafeInteger(iterationCount) || iterationCount <= 0) {
    return false;
  }

  const expected = Buffer.from(digest, "base64url");
  const actual = pbkdf2Sync(
    password,
    salt,
    iterationCount,
    expected.byteLength,
    "sha256",
  );

  return timingSafeEqualBuffer(actual, expected);
}

export function createSignedToken(secret: string, prefix = "csrf") {
  const value = createSecretToken(prefix);
  return signTokenValue(secret, value);
}

export function signTokenValue(secret: string, value: string) {
  const signature = createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
  return `${value}.${signature}`;
}

export function verifySignedToken(
  secret: string,
  signedToken: string | undefined,
) {
  if (!signedToken) {
    return false;
  }

  const index = signedToken.lastIndexOf(".");
  if (index < 1) {
    return false;
  }

  const value = signedToken.slice(0, index);
  const expected = signTokenValue(secret, value);
  return timingSafeEqualString(signedToken, expected);
}

export function timingSafeEqualString(left: string, right: string) {
  return timingSafeEqualBuffer(Buffer.from(left), Buffer.from(right));
}

export function redactToken(token: string) {
  const prefix = token.split("_", 1)[0] ?? "token";
  return `${prefix}_${token.slice(-6)}`;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  check(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitResult {
    const current = this.windows.get(key);
    const resetAt =
      current && current.resetAt > now ? current.resetAt : now + windowMs;
    const count = current && current.resetAt > now ? current.count + 1 : 1;

    this.windows.set(key, { count, resetAt });
    this.sweep(now);

    return {
      allowed: count <= limit,
      remaining: Math.max(limit - count, 0),
      resetAt: new Date(resetAt),
    };
  }

  reset(key: string) {
    this.windows.delete(key);
  }

  private sweep(now: number) {
    if (this.windows.size < 1_000) {
      return;
    }

    for (const [key, value] of this.windows.entries()) {
      if (value.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}

function timingSafeEqualBuffer(left: Buffer, right: Buffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return timingSafeEqual(left, right);
}
