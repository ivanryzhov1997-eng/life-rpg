import { describe, expect, it } from "vitest";
import { AiMisconfigured, AiTransient, AiUnavailable, ContentRejected, mapAiError } from "./ai/client";

describe("обработка ошибок Groq", () => {
  it("распознаёт исчерпание квоты", () => {
    expect(mapAiError(429)).toBeInstanceOf(AiUnavailable);
  });

  it("не маскирует неверный ключ или отсутствие доступа", () => {
    expect(mapAiError(401)).toBeInstanceOf(AiMisconfigured);
    expect(mapAiError(403)).toBeInstanceOf(AiMisconfigured);
  });

  it("распознаёт некорректный запрос", () => {
    expect(mapAiError(400, { error: "invalid_request" })).toBeInstanceOf(ContentRejected);
  });

  it("распознаёт временную ошибку сервера", () => {
    expect(mapAiError(503)).toBeInstanceOf(AiTransient);
  });
});
