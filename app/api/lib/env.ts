import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

const appSecret = required("APP_SECRET");
if (process.env.NODE_ENV === "production" && Buffer.byteLength(appSecret, "utf8") < 32) {
  throw new Error("APP_SECRET must contain at least 32 bytes in production");
}

export const env = {
  // jose requires a sufficiently long HS256 key. Keep a clearly local-only
  // fallback so a fresh developer checkout can boot without production secrets.
  appSecret: appSecret || "local-development-secret-do-not-use-in-production",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqBaseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
};
