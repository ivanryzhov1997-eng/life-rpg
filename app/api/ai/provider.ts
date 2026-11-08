import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../lib/env";

export const groq = createOpenAICompatible({
  name: "groq",
  baseURL: env.groqBaseUrl,
  apiKey: env.groqApiKey,
  includeUsage: true,
  supportsStructuredOutputs: true,
});
