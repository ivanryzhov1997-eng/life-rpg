import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildAiProxyQuotaWindows,
  classifyAiProxyToken,
  validateAiProxyPayload,
} from "../_shared/ai-proxy-security.mjs";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_BODY_BYTES = 64 * 1024;
const AUTH_TIMEOUT_MS = 5_000;
const QUOTA_TIMEOUT_MS = 5_000;
const GROQ_TIMEOUT_MS = 45_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

class BodyTooLargeError extends Error {}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function readBodyLimited(req: Request): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing request body");

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyTooLargeError("Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readPositiveEnv(name: string, fallback: number, max = 10_000): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveRequester(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const classification = classifyAiProxyToken(token, anonKey);

  if (classification.kind === "guest") {
    const ip = req.headers.get("cf-connecting-ip")?.trim();
    if (!ip) throw new Error("Trusted client IP is unavailable");
    return { kind: "guest" as const, identity: "guest:" + ip };
  }

  if (!anonKey) throw new Error("Supabase anon key is not configured");
  const authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: "Bearer " + classification.token,
    },
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });

  if (!authResponse.ok) {
    return null;
  }

  const user = await authResponse.json();
  if (!user || typeof user.id !== "string" || !user.id) return null;
  return { kind: "user" as const, identity: "user:" + user.id };
}

async function consumeQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucketKey = await hmacHex(serviceRoleKey, bucket);
  const response = await fetch(supabaseUrl + "/rest/v1/rpc/consume_ai_proxy_rate_limit", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_bucket_key: bucketKey,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    }),
    signal: AbortSignal.timeout(QUOTA_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("AI quota service returned HTTP " + response.status);
  }
  const allowed = await response.json();
  if (typeof allowed !== "boolean") throw new Error("AI quota service returned an invalid response");
  return allowed;
}

async function isWithinQuota(
  identity: string,
  kind: "guest" | "user",
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const perMinute = kind === "user"
    ? readPositiveEnv("AI_PROXY_USER_PER_MINUTE", 12)
    : readPositiveEnv("AI_PROXY_GUEST_PER_MINUTE", 4);
  const perDay = kind === "user"
    ? readPositiveEnv("AI_PROXY_USER_PER_DAY", 200)
    : readPositiveEnv("AI_PROXY_GUEST_PER_DAY", 30);

  for (const window of buildAiProxyQuotaWindows(identity)) {
    const limit = window.windowSeconds === 60 ? perMinute : perDay;
    if (!await consumeQuota(
      supabaseUrl,
      serviceRoleKey,
      window.bucket,
      limit,
      window.windowSeconds,
    )) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405, { Allow: "POST, OPTIONS" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey || !groqKey) {
    console.error("AI proxy is missing a required server secret");
    return jsonResponse({ error: "AI service is not configured" }, 503);
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await readBodyLimited(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const validated = validateAiProxyPayload(input);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, 400);
  }

  let requester: Awaited<ReturnType<typeof resolveRequester>>;
  try {
    requester = await resolveRequester(req, supabaseUrl, anonKey);
  } catch (error) {
    console.error("AI proxy identity check failed", error);
    return jsonResponse({ error: "AI access check is temporarily unavailable" }, 503);
  }

  if (!requester) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  try {
    const allowed = await isWithinQuota(
      requester.identity,
      requester.kind,
      supabaseUrl,
      serviceRoleKey,
    );
    if (!allowed) {
      return jsonResponse({ error: "AI request limit reached. Try again later." }, 429);
    }
  } catch (error) {
    console.error("AI proxy quota check failed", error);
    // Fail closed: never spend the Groq key when quota enforcement is unavailable.
    return jsonResponse({ error: "AI service is temporarily unavailable" }, 503);
  }

  try {
    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + groqKey,
      },
      body: JSON.stringify(validated.payload),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });

    const responseBody = await groqResponse.text();
    return new Response(responseBody, {
      status: groqResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": groqResponse.headers.get("content-type") || "application/json",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Groq upstream request failed", error);
    return jsonResponse({ error: "AI provider is temporarily unavailable" }, 502);
  }
});
