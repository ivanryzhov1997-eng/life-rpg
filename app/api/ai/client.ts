import { env } from "../lib/env";

export class AiUnavailable extends Error { constructor(message: string) { super(message); this.name = "AiUnavailable"; } }
export class ContentRejected extends Error { constructor(message: string) { super(message); this.name = "ContentRejected"; } }
export class AiMisconfigured extends Error { constructor(message: string) { super(message); this.name = "AiMisconfigured"; } }
export class AiTransient extends Error { constructor(message: string) { super(message); this.name = "AiTransient"; } }

export function mapAiError(status: number, body: unknown = {}): Error {
  const details = JSON.stringify(body).toLowerCase();
  if (status === 429) return new AiUnavailable("Лимит Groq временно исчерпан");
  if (status === 401 || status === 403) {
    return new AiMisconfigured("Groq отклонил серверный API-ключ или доступ к модели");
  }
  if (status === 400 || status === 422) {
    return new ContentRejected(details || "Groq не принял формат запроса");
  }
  if (status >= 500) return new AiTransient("Groq временно недоступен");
  return new AiTransient(`Неожиданный ответ Groq: HTTP ${status}`);
}

export function classifyAiError(error: unknown): Error {
  if (error instanceof AiUnavailable || error instanceof ContentRejected || error instanceof AiMisconfigured || error instanceof AiTransient) return error;
  if (!env.groqApiKey) return new AiMisconfigured("На сервере не задан GROQ_API_KEY");
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  const status = candidate?.status ?? candidate?.statusCode;
  if (typeof status === "number") return mapAiError(status, candidate);
  return new AiTransient(candidate?.message || "Ошибка обращения к Groq");
}

export async function listModels() {
  if (!env.groqApiKey) throw new AiMisconfigured("На сервере не задан GROQ_API_KEY");
  const response = await fetch(`${env.groqBaseUrl.replace(/\/+$/, "")}/models`, {
    headers: { Authorization: `Bearer ${env.groqApiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 429) throw new AiUnavailable("Лимит Groq временно исчерпан");
    throw new AiTransient(`Groq вернул HTTP ${response.status}`);
  }
  const body = await response.json() as { data?: Array<{ id?: string }> };
  const models = (body.data ?? []).map((model) => ({ id: model.id ?? "" })).filter((model) => model.id);
  const defaultModelId = env.groqModel;
  if (!models.some((model) => model.id === defaultModelId)) throw new AiUnavailable(`Модель ${defaultModelId} недоступна в аккаунте Groq`);
  return { models, defaultModelId };
}
