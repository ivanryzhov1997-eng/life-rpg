import { generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aiQuestDraftSchema, stageSchema, xpForQuest } from "@contracts/game";
import { authedQuery, createRouter } from "./middleware";
import { groq } from "./ai/provider";
import {
  AiMisconfigured,
  AiTransient,
  AiUnavailable,
  ContentRejected,
  classifyAiError,
  listModels,
} from "./ai/client";

const assistInput = z.object({
  mode: z.enum(["diagnose", "tree", "day", "mentor"]),
  question: z.string().max(1200).default(""),
  minutes: z.number().int().min(5).max(240).default(30),
  energy: z.enum(["low", "medium", "high"]).default("medium"),
  directionName: z.string().min(1).max(100),
  stage: stageSchema,
  existingSkills: z.array(z.string().max(120)).max(30).default([]),
});

const assistOutput = z.object({
  advice: z.string().min(1).max(1200),
  diagnosis: z.string().max(1200).nullable(),
  quests: z.array(aiQuestDraftSchema).max(4),
  skills: z
    .array(z.object({ name: z.string().min(1).max(120), parentName: z.string().max(120).nullable() }))
    .max(8),
});

function russianError(error: unknown): TRPCError {
  const classified = classifyAiError(error);
  let message = "ИИ временно недоступен. Повторите запрос позже — офлайн-ядро продолжает работать.";
  if (classified instanceof AiUnavailable) {
    message = "Лимит ИИ-сервиса исчерпан. Ручные квесты и офлайн-прогресс доступны без ограничений.";
  } else if (classified instanceof ContentRejected) {
    message = "Не удалось обработать запрос. Переформулируйте его короче и конкретнее.";
  } else if (classified instanceof AiMisconfigured) {
    message = "ИИ-proxy ещё не подготовлен. Откройте или опубликуйте сайт ещё раз; офлайн-ядро уже работает.";
  } else if (classified instanceof AiTransient) {
    message = "Сервис ИИ временно занят. Повторите запрос позже — автоматически мы его не дублируем.";
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: classified });
}

export const aiRouter = createRouter({
  status: authedQuery.query(async () => {
    try {
      const { defaultModelId } = await listModels();
      return { available: true, model: defaultModelId, message: "Серверный proxy готов" };
    } catch (error) {
      return { available: false, model: null, message: russianError(error).message };
    }
  }),

  assist: authedQuery.input(assistInput).mutation(async ({ input }) => {
    try {
      const { defaultModelId } = await listModels();
      const modeInstructions = {
        diagnose: "Оцени стадию по описанию пользователя, дай честную диагностику и один следующий ориентир. Квесты и дерево не создавай.",
        tree: "Предложи небольшое дерево из 4–7 навыков с parentName для детей. Не записывай его сам: пользователь примет черновик отдельно.",
        day: "Создай 2–3 квеста на день с учётом стадии, времени и энергии. Новичку — только маленькие реалистичные действия. Не включай BOSS без явной готовности.",
        mentor: "Ответь как спокойный наставник и предложи до двух измеримых квестов-черновиков. Не выдавай мотивационную лекцию.",
      }[input.mode];
      const result = await generateObject({
        model: groq(defaultModelId),
        schema: assistOutput,
        system: `Ты — наставник русскоязычного приложения LIFE RPG. Отвечай только на русском. Награда даётся только за реальный измеримый результат. ${modeInstructions} Каждый квест должен иметь конкретный completionCriteria, реалистичные minutes и difficulty 1–5. Не обещай запись данных: только черновик.`,
        prompt: JSON.stringify({
          вопрос: input.question,
          направление: input.directionName,
          стадия: input.stage,
          доступные_минуты: input.minutes,
          энергия: input.energy,
          существующие_навыки: input.existingSkills,
        }),
        maxOutputTokens: 2400,
      });
      return {
        ...result.object,
        quests: result.object.quests.map((quest) => ({
          ...quest,
          xp: xpForQuest(quest.type, quest.difficulty),
        })),
      };
    } catch (error) {
      throw russianError(error);
    }
  }),
});
