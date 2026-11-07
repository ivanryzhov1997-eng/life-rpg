import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import * as cookie from "cookie";
import { getCookie, setCookie } from "hono/cookie";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import {
  createAnonymousUser,
  findUserByRecoveryHash,
  findUserByUnionId,
  setRecoveryCodeHash,
} from "./queries/users";
import { signSessionToken, verifySessionToken } from "./session";

const auth = new Hono();
const AUTH_WINDOW_MS = 60_000;
const AUTH_BLOCK_MS = 15 * 60_000;
const AUTH_MAX_ATTEMPTS = 5;
const authAttempts = new Map<string, { windowStartedAt: number; count: number; blockedUntil: number }>();

// Process-local limiter. The socket peer address is used rather than trusting
// an arbitrary X-Forwarded-For header supplied by the client.
auth.use("*", async (c, next) => {
  const ip = getConnInfo(c).remote.address ?? "unknown";
  const now = Date.now();
  let state = authAttempts.get(ip);

  if (state?.blockedUntil && state.blockedUntil > now) {
    c.header("Retry-After", String(Math.ceil((state.blockedUntil - now) / 1000)));
    return c.json({ error: "Too many authentication attempts. Try again later." }, 429);
  }

  if (!state || now - state.windowStartedAt >= AUTH_WINDOW_MS) {
    state = { windowStartedAt: now, count: 0, blockedUntil: 0 };
  }

  state.count += 1;
  if (state.count > AUTH_MAX_ATTEMPTS) {
    state.blockedUntil = now + AUTH_BLOCK_MS;
    authAttempts.set(ip, state);
    c.header("Retry-After", String(Math.ceil(AUTH_BLOCK_MS / 1000)));
    return c.json({ error: "Too many authentication attempts. Try again later." }, 429);
  }

  authAttempts.set(ip, state);

  // Opportunistically remove expired entries to keep the map bounded.
  if (authAttempts.size > 10_000) {
    for (const [key, value] of authAttempts) {
      if (value.blockedUntil <= now && now - value.windowStartedAt >= AUTH_WINDOW_MS) {
        authAttempts.delete(key);
      }
    }
  }

  await next();
});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function currentUser(token: string | undefined) {
  if (!token) return null;
  const payload = await verifySessionToken(token);
  return payload ? findUserByUnionId(payload.unionId) : null;
}

function issueSession(c: Context, unionId: string) {
  return signSessionToken({ unionId, clientId: "life-rpg" }).then((token) => {
    setCookie(c, Session.cookieName, token, {
      ...getSessionCookieOptions(c.req.raw.headers),
      maxAge: Session.maxAgeMs / 1000,
    });
  });
}

auth.post("/bootstrap", async (c) => {
  const existing = await currentUser(getCookie(c, Session.cookieName));
  if (existing) return c.json({ ok: true, created: false });
  const unionId = `anon_${randomUUID()}`;
  await createAnonymousUser(unionId);
  await issueSession(c, unionId);
  return c.json({ ok: true, created: true });
});

auth.post("/recovery-code", async (c) => {
  const user = await currentUser(getCookie(c, Session.cookieName));
  if (!user) return c.json({ error: "Session required" }, 401);
  const code = randomBytes(18).toString("base64url").toUpperCase();
  await setRecoveryCodeHash(user.id, hash(code));
  return c.json({ code });
});

auth.post("/recover", async (c) => {
  const body = await c.req.json<{ code?: string }>().catch(
    (): { code?: string } => ({}),
  );
  const code = body.code?.trim().replace(/\s+/g, "").toUpperCase();
  if (!code || code.length < 20 || code.length > 80) {
    return c.json({ error: "Invalid recovery code" }, 400);
  }
  const user = await findUserByRecoveryHash(hash(code));
  if (!user) return c.json({ error: "Recovery code not found" }, 404);
  await issueSession(c, user.unionId);
  return c.json({ ok: true, recovered: true });
});

export async function authenticateRequest(headers: Headers) {
  const parsed = cookie.parse(headers.get("cookie") || "");
  const user = await currentUser(parsed[Session.cookieName]);
  if (!user) throw new Error("Anonymous session required");
  return user;
}

export default auth;
