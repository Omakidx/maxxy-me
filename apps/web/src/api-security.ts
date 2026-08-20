import type { IncomingMessage, ServerResponse } from "node:http";
import { hostClientMessageSchema } from "@maxxy/contracts";
import {
  AuthRepository,
  createDatabase,
  HostEnrollmentRepository,
  PersonalApiTokenRepository,
  SecurityAuditRepository,
} from "@maxxy/database";
import {
  createSecretToken,
  createSignedToken,
  FixedWindowRateLimiter,
  hashPassword,
  hashSecret,
  verifyPassword,
  verifySignedToken,
} from "@maxxy/security";
import { type ZodError, z } from "zod";
import { log } from "./logger";

const sessionCookieName = "maxxy_session";
const csrfCookieName = "maxxy_csrf";
const sessionTtlMs =
  Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7) * 1000;
const wsTicketTtlMs = Number(process.env.WS_TICKET_TTL_SECONDS ?? 60) * 1000;
const wsConnectionTtlMs =
  Number(process.env.WS_CONNECTION_TTL_SECONDS ?? 60 * 15) * 1000;
const appEnv = process.env.APP_ENV ?? "development";
const nodeEnv = process.env.NODE_ENV ?? "development";
const secureCookies = requiresSecureCookies();
const appSecret =
  process.env.APP_SECRET ??
  (nodeEnv === "production" ? undefined : "development-only-maxxy-secret");

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : null;
const rateLimiter = new FixedWindowRateLimiter();
const wsTickets = new Map<string, WebSocketTicket>();

const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(256),
});
const bootstrapSchema = credentialsSchema.extend({
  name: z.string().min(1).max(120),
});
const recoverySchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(12).max(256),
});
const hostEnrollmentSchema = z.object({
  hostName: z.string().min(1).max(120),
  expiresInSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24)
    .default(60 * 30),
  maxConcurrentAgents: z.number().int().min(1).max(20).default(1),
});
const hostExchangeSchema = z.object({
  enrollmentToken: z.string().min(20),
  hostVersion: z.string().max(120).optional(),
  toolInventory: z.record(z.unknown()).default({}),
});
const personalTokenSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(80)).min(1).max(20).default(["owner"]),
  expiresAt: z.string().datetime().optional(),
});
const wsTicketSchema = z.object({
  purpose: z.enum(["control", "host"]).default("control"),
  ttlSeconds: z.number().int().min(10).max(300).optional(),
});
export const websocketMessageSchema = hostClientMessageSchema;

export type Identity = {
  kind: "session" | "api_token";
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  sessionId?: string;
  tokenId?: string;
  scopes: string[];
};

type WebSocketTicket = {
  tokenHash: string;
  expiresAt: Date;
  identity: Identity;
  purpose: "control" | "host";
};

export type HostWebSocketIdentity = {
  tokenId: string;
  host: {
    id: string;
    name: string;
    status: string;
  };
};

export type WebSocketAuth =
  | { ok: true; kind: "owner"; ticket: WebSocketTicket }
  | { ok: true; kind: "host"; host: HostWebSocketIdentity }
  | { ok: false; code: number; reason: string };

type AuthResult =
  | { ok: true; identity: Identity; csrfRequired: boolean }
  | { ok: false; status: number; code: string; message: string };

export function getWebSocketOptions() {
  return {
    connectionTtlMs: wsConnectionTtlMs,
    maxPayloadBytes: Number(process.env.WS_MAX_MESSAGE_BYTES ?? 64 * 1024),
  };
}

export function requiresSecureWebSocket(environment = appEnv) {
  return environment !== "development";
}

export function requiresSecureCookies(
  environment = appEnv,
  appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000",
) {
  return (
    requiresSecureWebSocket(environment) ||
    new URL(appUrl).protocol === "https:"
  );
}
export function parseWebSocketMessage(message: unknown) {
  return websocketMessageSchema.safeParse(message);
}

export async function handleSecurityApi(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const requestUrl = getRequestUrl(request);
  const pathname = requestUrl.pathname;

  if (!pathname.startsWith("/api/")) {
    return false;
  }

  if (pathname === "/api/health") {
    return false;
  }

  try {
    if (!validateTrustedOrigin(request)) {
      sendError(
        response,
        403,
        "untrusted_origin",
        "Request origin is not trusted",
      );
      return true;
    }

    if (pathname === "/api/auth/csrf" && request.method === "GET") {
      const csrfToken = issueCsrfCookie(response);
      sendJson(response, 200, { csrfToken });
      return true;
    }

    if (pathname === "/api/auth/bootstrap" && request.method === "GET") {
      const auth = requireDatabase(response);
      if (!auth) {
        return true;
      }
      const ownerCount = await new AuthRepository(auth.db).countOwners();
      sendJson(response, 200, { canBootstrap: ownerCount === 0 });
      return true;
    }

    if (pathname === "/api/auth/bootstrap" && request.method === "POST") {
      await handleBootstrap(request, response);
      return true;
    }

    if (pathname === "/api/auth/sign-in" && request.method === "POST") {
      await handleSignIn(request, response);
      return true;
    }

    if (pathname === "/api/auth/recover" && request.method === "POST") {
      await handleRecovery(request, response);
      return true;
    }

    if (
      pathname === "/api/hosts/exchange-enrollment" &&
      request.method === "POST"
    ) {
      await handleHostEnrollmentExchange(request, response);
      return true;
    }

    if (pathname === "/api/auth/sign-out" && request.method === "POST") {
      const auth = await requireOwner(request, response, { csrf: true });
      if (!auth) {
        return true;
      }
      await handleSignOut(request, response, auth);
      return true;
    }

    if (pathname === "/api/auth/me" && request.method === "GET") {
      const auth = await requireOwner(request, response, {
        csrf: false,
        scope: "owner",
      });
      if (!auth) {
        return true;
      }
      sendJson(response, 200, {
        user: auth.identity.user,
        authKind: auth.identity.kind,
      });
      return true;
    }

    if (pathname === "/api/host-enrollments" && request.method === "POST") {
      const auth = await requireOwner(request, response, {
        csrf: true,
        scope: "hosts:write",
      });
      if (!auth) {
        return true;
      }
      await handleCreateHostEnrollment(request, response, auth.identity);
      return true;
    }

    if (pathname === "/api/personal-api-tokens" && request.method === "GET") {
      const auth = await requireOwner(request, response, {
        csrf: false,
        scope: "tokens:read",
      });
      if (!auth) {
        return true;
      }
      const repo = new PersonalApiTokenRepository(requireDb().db);
      sendJson(response, 200, {
        tokens: await repo.listTokens(auth.identity.user.id),
      });
      return true;
    }

    if (pathname === "/api/personal-api-tokens" && request.method === "POST") {
      const auth = await requireOwner(request, response, {
        csrf: true,
        scope: "tokens:write",
      });
      if (!auth) {
        return true;
      }
      await handleCreatePersonalToken(request, response, auth.identity);
      return true;
    }

    const tokenMatch = pathname.match(/^\/api\/personal-api-tokens\/([^/]+)$/);
    if (tokenMatch && request.method === "DELETE") {
      const auth = await requireOwner(request, response, {
        csrf: true,
        scope: "tokens:write",
      });
      if (!auth) {
        return true;
      }
      await handleRevokePersonalToken(response, auth.identity, tokenMatch[1]);
      return true;
    }

    if (pathname === "/api/ws-ticket" && request.method === "POST") {
      const auth = await requireOwner(request, response, {
        csrf: true,
        scope: "ws:connect",
      });
      if (!auth) {
        return true;
      }
      await handleCreateWebSocketTicket(request, response, auth.identity);
      return true;
    }

    sendError(response, 404, "not_found", "API route was not found");
    return true;
  } catch (error) {
    try {
      handleApiError(response, error);
    } catch (unhandled) {
      log("error", "security api request failed", {
        pathname,
        error:
          unhandled instanceof Error ? unhandled.message : String(unhandled),
      });
      sendError(response, 500, "internal_error", "Request failed");
    }
    return true;
  }
}

export async function authenticateWebSocketUpgrade(
  request: IncomingMessage,
): Promise<WebSocketAuth> {
  const requestUrl = getRequestUrl(request);

  if (!validateTrustedOrigin(request)) {
    return { ok: false, code: 1008, reason: "untrusted origin" };
  }

  if (requiresSecureWebSocket() && !isSecureForwardedRequest(request)) {
    return {
      ok: false,
      code: 1008,
      reason: "secure websocket required",
    };
  }

  const hostId = hostIdFromRequest(request);
  const hostToken = bearerTokenFromRequest(request);
  if (hostId || hostToken) {
    return authenticateHostWebSocket(hostId, hostToken);
  }

  const ticket = requestUrl.searchParams.get("ticket");
  if (!ticket) {
    return {
      ok: false,
      code: 1008,
      reason: "websocket ticket or host credentials required",
    };
  }

  const tokenHash = hashSecret(ticket);
  const stored = wsTickets.get(tokenHash);
  wsTickets.delete(tokenHash);
  sweepWebSocketTickets();

  if (!stored || stored.expiresAt <= new Date()) {
    return {
      ok: false,
      code: 1008,
      reason: "websocket ticket expired",
    };
  }

  return { ok: true, kind: "owner", ticket: stored };
}

function hostIdFromRequest(request: IncomingMessage) {
  const value = request.headers["x-maxxy-host-id"];
  return Array.isArray(value) ? value[0] : value;
}

function bearerTokenFromRequest(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  return authorization.slice("Bearer ".length).trim();
}

async function authenticateHostWebSocket(
  hostId: string | undefined,
  hostToken: string | undefined,
): Promise<WebSocketAuth> {
  if (!hostId || !hostToken) {
    return { ok: false, code: 1008, reason: "host credentials incomplete" };
  }
  if (!database) {
    return { ok: false, code: 1011, reason: "database unavailable" };
  }

  const rate = rateLimiter.check(`host-ws:${hostId}`, 120, 60_000);
  if (!rate.allowed) {
    return { ok: false, code: 1008, reason: "host websocket rate limited" };
  }

  const verified = await new HostEnrollmentRepository(
    database.db,
  ).verifyHostToken(hashSecret(hostToken));
  if (
    !verified ||
    verified.hostId !== hostId ||
    verified.status === "revoked"
  ) {
    return { ok: false, code: 1008, reason: "host token invalid" };
  }

  return {
    ok: true,
    kind: "host",
    host: {
      tokenId: verified.tokenId,
      host: {
        id: verified.hostId,
        name: verified.name,
        status: verified.status,
      },
    },
  };
}

async function handleBootstrap(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const db = requireDatabase(response);
  if (!db) {
    return;
  }

  const body = bootstrapSchema.parse(await readJson(request));
  const rate = rateLimiter.check(`bootstrap:${clientIp(request)}`, 5, 60_000);
  if (!rate.allowed) {
    sendRateLimit(response, rate.resetAt);
    return;
  }

  const authRepo = new AuthRepository(db.db);
  if ((await authRepo.countOwners()) > 0) {
    sendError(response, 409, "owner_exists", "Owner account already exists");
    return;
  }

  const user = await authRepo.createOwner({
    name: body.name,
    email: body.email,
    passwordHash: hashPassword(body.password),
  });

  if (!user) {
    throw new Error("Owner was not created");
  }

  const session = await createSession(response, authRepo, user.id);
  await audit("auth.owner_bootstrap", user.id, "user", user.id, {
    email: user.email,
  });
  sendJson(response, 201, {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    sessionExpiresAt: session.expiresAt,
    csrfToken: issueCsrfCookie(response),
  });
}

async function handleSignIn(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const db = requireDatabase(response);
  if (!db) {
    return;
  }

  const body = credentialsSchema.parse(await readJson(request));
  const rate = rateLimiter.check(
    `signin:${clientIp(request)}:${body.email}`,
    8,
    60_000,
  );
  if (!rate.allowed) {
    sendRateLimit(response, rate.resetAt);
    return;
  }

  const authRepo = new AuthRepository(db.db);
  const user = await authRepo.findUserByEmail(body.email);

  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    await audit("auth.sign_in_failed", undefined, "user", user?.id, {
      email: body.email,
      ip: clientIp(request),
    });
    sendError(
      response,
      401,
      "invalid_credentials",
      "Email or password is incorrect",
    );
    return;
  }

  const session = await createSession(response, authRepo, user.id);
  await audit("auth.sign_in", user.id, "session", session.id, {
    ip: clientIp(request),
  });
  sendJson(response, 200, {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    sessionExpiresAt: session.expiresAt,
    csrfToken: issueCsrfCookie(response),
  });
}

async function handleSignOut(
  request: IncomingMessage,
  response: ServerResponse,
  auth: { identity: Identity },
) {
  const sessionToken = parseCookies(request.headers.cookie)[sessionCookieName];
  if (sessionToken) {
    await new AuthRepository(requireDb().db).revokeSessionByTokenHash(
      hashSecret(sessionToken),
    );
  }
  clearCookie(response, sessionCookieName);
  clearCookie(response, csrfCookieName);
  await audit(
    "auth.sign_out",
    auth.identity.user.id,
    "user",
    auth.identity.user.id,
    { authKind: auth.identity.kind },
  );
  sendJson(response, 200, { ok: true });
}

async function handleRecovery(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const db = requireDatabase(response);
  if (!db) {
    return;
  }

  const body = recoverySchema.parse(await readJson(request));
  const rate = rateLimiter.check(`recovery:${clientIp(request)}`, 5, 60_000);
  if (!rate.allowed) {
    sendRateLimit(response, rate.resetAt);
    return;
  }

  const authRepo = new AuthRepository(db.db);
  const user = await authRepo.recoverOwnerPassword({
    tokenHash: hashSecret(body.token),
    passwordHash: hashPassword(body.newPassword),
  });

  if (!user) {
    sendError(
      response,
      401,
      "invalid_recovery_token",
      "Recovery token is invalid or expired",
    );
    return;
  }

  await audit("auth.owner_recovered", user.id, "user", user.id, {
    email: user.email,
  });
  sendJson(response, 200, { ok: true });
}

async function handleCreateHostEnrollment(
  request: IncomingMessage,
  response: ServerResponse,
  identity: Identity,
) {
  const body = hostEnrollmentSchema.parse(await readJson(request));
  const enrollmentToken = createSecretToken("mxh_enroll");
  const repo = new HostEnrollmentRepository(requireDb().db);
  const expiresAt = new Date(Date.now() + body.expiresInSeconds * 1000);
  const enrollment = await repo.createEnrollment({
    hostName: body.hostName,
    maxConcurrentAgents: body.maxConcurrentAgents,
    enrollmentTokenHash: hashSecret(enrollmentToken),
    expiresAt,
  });

  await audit(
    "host.enrollment_token_created",
    identity.user.id,
    "host",
    enrollment.host.id,
    { expiresAt },
  );
  sendJson(response, 201, {
    host: {
      id: enrollment.host.id,
      name: enrollment.host.name,
      status: enrollment.host.status,
    },
    enrollmentToken,
    expiresAt,
  });
}

async function handleHostEnrollmentExchange(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const body = hostExchangeSchema.parse(await readJson(request));
  const rate = rateLimiter.check(
    `host-exchange:${clientIp(request)}`,
    20,
    60_000,
  );
  if (!rate.allowed) {
    sendRateLimit(response, rate.resetAt);
    return;
  }

  const hostToken = createSecretToken("mxh");
  const repo = new HostEnrollmentRepository(requireDb().db);
  const exchange = await repo.exchangeEnrollment({
    enrollmentTokenHash: hashSecret(body.enrollmentToken),
    hostAuthTokenHash: hashSecret(hostToken),
    ...(body.hostVersion ? { hostVersion: body.hostVersion } : {}),
    toolInventory: body.toolInventory,
  });

  if (!exchange) {
    sendError(
      response,
      401,
      "invalid_enrollment_token",
      "Host enrollment token is invalid, expired, or already used",
    );
    return;
  }

  await audit("host.enrolled", undefined, "host", exchange.host.id, {
    hostVersion: body.hostVersion,
  });
  sendJson(response, 200, {
    host: {
      id: exchange.host.id,
      name: exchange.host.name,
      status: exchange.host.status,
    },
    hostToken,
  });
}

async function handleCreatePersonalToken(
  request: IncomingMessage,
  response: ServerResponse,
  identity: Identity,
) {
  const body = personalTokenSchema.parse(await readJson(request));
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
  const rawToken = createSecretToken("mxp");
  const repo = new PersonalApiTokenRepository(requireDb().db);
  const token = await repo.createToken({
    userId: identity.user.id,
    name: body.name,
    tokenHash: hashSecret(rawToken),
    scopes: body.scopes,
    ...(expiresAt ? { expiresAt } : {}),
  });

  if (!token) {
    throw new Error("Personal API token was not created");
  }

  await audit(
    "token.personal_created",
    identity.user.id,
    "personal_api_token",
    token.id,
    { scopes: body.scopes, expiresAt },
  );
  sendJson(response, 201, {
    token: rawToken,
    tokenRecord: {
      id: token.id,
      name: token.name,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    },
  });
}

async function handleRevokePersonalToken(
  response: ServerResponse,
  identity: Identity,
  tokenId: string | undefined,
) {
  if (!tokenId) {
    sendError(response, 404, "not_found", "Personal API token was not found");
    return;
  }

  const token = await new PersonalApiTokenRepository(
    requireDb().db,
  ).revokeToken({ userId: identity.user.id, tokenId });
  if (!token) {
    sendError(response, 404, "not_found", "Personal API token was not found");
    return;
  }

  await audit(
    "token.personal_revoked",
    identity.user.id,
    "personal_api_token",
    token.id,
    {},
  );
  sendJson(response, 200, { ok: true });
}

async function handleCreateWebSocketTicket(
  request: IncomingMessage,
  response: ServerResponse,
  identity: Identity,
) {
  const body = wsTicketSchema.parse(await readJson(request).catch(() => ({})));
  const token = createSecretToken("mxw");
  const tokenHash = hashSecret(token);
  const ttlMs = (body.ttlSeconds ?? wsTicketTtlMs / 1000) * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  wsTickets.set(tokenHash, {
    tokenHash,
    expiresAt,
    identity,
    purpose: body.purpose,
  });
  sweepWebSocketTickets();
  await audit("ws.ticket_created", identity.user.id, "user", identity.user.id, {
    purpose: body.purpose,
    expiresAt,
  });

  sendJson(response, 201, {
    ticket: token,
    expiresAt,
    wsUrl: buildWebSocketUrl(token),
  });
}

export async function requireOwner(
  request: IncomingMessage,
  response: ServerResponse,
  options: { csrf: boolean; scope?: string },
) {
  const result = await authenticateRequest(request);
  if (!result.ok) {
    sendError(response, result.status, result.code, result.message);
    return null;
  }

  if (result.identity.user.role !== "owner") {
    sendError(response, 403, "forbidden", "Owner role is required");
    return null;
  }

  if (
    options.scope &&
    result.identity.kind === "api_token" &&
    !hasScope(result.identity.scopes, options.scope)
  ) {
    sendError(
      response,
      403,
      "missing_scope",
      `API token requires ${options.scope} scope`,
    );
    return null;
  }

  if (options.csrf && result.csrfRequired && !verifyCsrf(request)) {
    sendError(response, 403, "csrf_failed", "CSRF token is missing or invalid");
    return null;
  }

  return result;
}

async function authenticateRequest(
  request: IncomingMessage,
): Promise<AuthResult> {
  const db = database;
  if (!db) {
    return {
      ok: false,
      status: 503,
      code: "database_not_configured",
      message: "DATABASE_URL is required",
    };
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const rawToken = authorization.slice("Bearer ".length).trim();
    const token = await new PersonalApiTokenRepository(db.db).verifyToken(
      hashSecret(rawToken),
    );
    if (!token) {
      return {
        ok: false,
        status: 401,
        code: "invalid_token",
        message: "API token is invalid, revoked, or expired",
      };
    }

    const rate = rateLimiter.check(`api-token:${token.tokenId}`, 120, 60_000);
    if (!rate.allowed) {
      return {
        ok: false,
        status: 429,
        code: "rate_limited",
        message: "Rate limit exceeded",
      };
    }

    return {
      ok: true,
      identity: {
        kind: "api_token",
        user: token.user,
        tokenId: token.tokenId,
        scopes: token.scopes,
      },
      csrfRequired: false,
    };
  }

  const sessionToken = parseCookies(request.headers.cookie)[sessionCookieName];
  if (!sessionToken) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Authentication is required",
    };
  }

  const session = await new AuthRepository(db.db).findSessionByTokenHash(
    hashSecret(sessionToken),
  );
  if (!session) {
    return {
      ok: false,
      status: 401,
      code: "session_expired",
      message: "Session is invalid or expired",
    };
  }

  return {
    ok: true,
    identity: {
      kind: "session",
      sessionId: session.sessionId,
      user: session.user,
      scopes: ["owner"],
    },
    csrfRequired: true,
  };
}

async function createSession(
  response: ServerResponse,
  authRepo: AuthRepository,
  userId: string,
) {
  const sessionToken = createSecretToken("mxs");
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  const session = await authRepo.createSession({
    userId,
    tokenHash: hashSecret(sessionToken),
    expiresAt,
  });
  if (!session) {
    throw new Error("Session was not created");
  }

  setCookie(response, sessionCookieName, sessionToken, {
    httpOnly: true,
    maxAge: Math.floor(sessionTtlMs / 1000),
    sameSite: "Strict",
    secure: secureCookies,
  });
  return session;
}

function issueCsrfCookie(response: ServerResponse) {
  const secret = requireAppSecret();
  const csrfToken = createSignedToken(secret, "csrf");
  setCookie(response, csrfCookieName, csrfToken, {
    httpOnly: false,
    maxAge: Math.floor(sessionTtlMs / 1000),
    sameSite: "Strict",
    secure: secureCookies,
  });
  return csrfToken;
}

function verifyCsrf(request: IncomingMessage) {
  const header = request.headers["x-csrf-token"];
  const csrfHeader = Array.isArray(header) ? header[0] : header;
  const csrfCookie = parseCookies(request.headers.cookie)[csrfCookieName];
  return Boolean(
    csrfHeader &&
      csrfCookie &&
      csrfHeader === csrfCookie &&
      verifySignedToken(requireAppSecret(), csrfHeader),
  );
}

function validateTrustedOrigin(request: IncomingMessage) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET")) {
    return true;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (!originValue) {
    return false;
  }

  return trustedOrigins(request).has(originValue);
}

function trustedOrigins(request: IncomingMessage) {
  const origins = new Set<string>();
  const host = request.headers.host;
  const protocol = isSecureForwardedRequest(request) ? "https" : "http";
  if (host) {
    origins.add(`${protocol}://${host}`);
  }
  if (process.env.APP_URL) {
    origins.add(new URL(process.env.APP_URL).origin);
  }
  for (const origin of (process.env.TRUSTED_ORIGINS ?? "").split(",")) {
    const trimmed = origin.trim();
    if (trimmed) {
      origins.add(new URL(trimmed).origin);
    }
  }
  if (appEnv !== "production") {
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:8080");
    origins.add("http://localhost:8080");
  }
  return origins;
}

function isSecureForwardedRequest(request: IncomingMessage) {
  const proto = request.headers["x-forwarded-proto"];
  return proto === "https" || (Array.isArray(proto) && proto.includes("https"));
}

export async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 64 * 1024) {
      throw new RequestError(
        413,
        "payload_too_large",
        "JSON payload is too large",
      );
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(
      400,
      "invalid_json",
      "Request body must be valid JSON",
    );
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

export function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: { code, message, details } }));
}

function sendRateLimit(response: ServerResponse, resetAt: Date) {
  response.setHeader(
    "retry-after",
    Math.max(Math.ceil((resetAt.getTime() - Date.now()) / 1000), 1),
  );
  sendError(response, 429, "rate_limited", "Rate limit exceeded", { resetAt });
}

function setCookie(
  response: ServerResponse,
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAge: number;
    sameSite: "Strict" | "Lax";
    secure: boolean;
  },
) {
  appendSetCookie(
    response,
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${options.maxAge}; SameSite=${options.sameSite}${options.httpOnly ? "; HttpOnly" : ""}${options.secure ? "; Secure" : ""}`,
  );
}

function clearCookie(response: ServerResponse, name: string) {
  appendSetCookie(
    response,
    `${name}=; Path=/; Max-Age=0; SameSite=Strict${secureCookies ? "; Secure" : ""}`,
  );
}

function appendSetCookie(response: ServerResponse, cookie: string) {
  const existing = response.getHeader("set-cookie");
  if (!existing) {
    response.setHeader("set-cookie", cookie);
    return;
  }
  response.setHeader(
    "set-cookie",
    Array.isArray(existing)
      ? [...existing, cookie]
      : [String(existing), cookie],
  );
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(value.join("="));
    }
  }
  return cookies;
}

function hasScope(scopes: string[], requiredScope: string) {
  return (
    scopes.includes("owner") ||
    scopes.includes("*") ||
    scopes.includes(requiredScope)
  );
}

function buildWebSocketUrl(ticket: string) {
  const appUrl = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
  appUrl.protocol = requiresSecureWebSocket()
    ? "wss:"
    : appUrl.protocol === "https:"
      ? "wss:"
      : "ws:";
  appUrl.pathname = "/api/ws";
  appUrl.search = new URLSearchParams({ ticket }).toString();
  return appUrl.toString();
}

function getRequestUrl(request: IncomingMessage) {
  return new URL(
    request.url ?? "/",
    `${isSecureForwardedRequest(request) ? "https" : "http"}://${request.headers.host ?? "localhost"}`,
  );
}

function clientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    value?.split(",", 1)[0]?.trim() || request.socket.remoteAddress || "unknown"
  );
}

function requireDatabase(response: ServerResponse) {
  if (!database) {
    sendError(
      response,
      503,
      "database_not_configured",
      "DATABASE_URL is required for this API route",
    );
    return null;
  }
  return database;
}

export function requireDb() {
  if (!database) {
    throw new Error("DATABASE_URL is required for this API route");
  }
  return database;
}

function requireAppSecret() {
  if (!appSecret) {
    throw new Error("APP_SECRET is required in production");
  }
  return appSecret;
}

export async function audit(
  action: string,
  actorUserId?: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  if (!database) {
    return;
  }

  await new SecurityAuditRepository(database.db).record({
    action,
    ...(actorUserId ? { actorUserId } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    ...(metadata ? { metadata } : {}),
  });
}

function sweepWebSocketTickets() {
  const now = Date.now();
  for (const [tokenHash, ticket] of wsTickets.entries()) {
    if (ticket.expiresAt.getTime() <= now) {
      wsTickets.delete(tokenHash);
    }
  }
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function handleApiError(response: ServerResponse, error: unknown) {
  if (error instanceof RequestError) {
    sendError(response, error.status, error.code, error.message);
    return;
  }

  if (isZodError(error)) {
    sendError(
      response,
      400,
      "validation_error",
      "Request validation failed",
      error.issues,
    );
    return;
  }

  throw error;
}

function isZodError(error: unknown): error is ZodError {
  return Boolean(error && typeof error === "object" && "issues" in error);
}
