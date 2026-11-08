import { z } from "zod";

export const questTypes = ["SIDE", "MAIN", "BOSS", "HABIT"] as const;
export const stages = ["novice", "intermediate", "advanced", "pro"] as const;
export const horizons = ["short", "medium", "long"] as const;

export const questTypeSchema = z.enum(questTypes);
export const stageSchema = z.enum(stages);
export const horizonSchema = z.enum(horizons);
export const difficultySchema = z.number().int().min(1).max(5);

export const questSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  type: questTypeSchema,
  difficulty: difficultySchema,
  xp: z.number().int().nonnegative(),
  description: z.string().max(1000),
  completionCriteria: z.string().min(1).max(500),
  minutes: z.number().int().min(1).max(1440),
  directionId: z.string().min(1),
  skillId: z.string().nullable(),
  goalId: z.string().nullable(),
  goalUnits: z.number().nonnegative(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
  fromAi: z.boolean(),
  lastCompletedDate: z.string().nullable(),
  completionDates: z.array(z.string()),
  habitStreak: z.number().int().nonnegative(),
  awardedXp: z.number().int().nonnegative(),
  reflection: z.string().nullable(),
  createdAt: z.string(),
});

export const directionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  stage: stageSchema,
  xp: z.number().int().nonnegative(),
});

export const skillSchema = z.object({
  id: z.string().min(1),
  directionId: z.string().min(1),
  parentId: z.string().nullable(),
  name: z.string().min(1).max(120),
  xp: z.number().int().nonnegative(),
});

export const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  horizon: horizonSchema,
  target: z.number().positive(),
  current: z.number().nonnegative(),
  unit: z.string().min(1).max(40),
  directionId: z.string().nullable(),
  createdAt: z.string(),
});

export const loreSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  createdAt: z.string(),
});

export const heroSchema = z.object({
  name: z.string().min(1).max(80),
  xp: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  streakDays: z.number().int().nonnegative(),
  activityDates: z.array(z.string()),
  restDays: z.array(z.string()).default([]),
  equippedTitle: z.string().nullable().default(null),
  totalCompleted: z.number().int().nonnegative(),
  habitCompletions: z.number().int().nonnegative(),
  bossCompleted: z.number().int().nonnegative(),
});

export const settingsSchema = z.object({
  theme: z.enum(["dark", "light"]),
  preset: z.enum(["rose", "blue"]),
  confirmCriteria: z.boolean(),
  onboardingSeen: z.boolean(),
});

export const gameStateSchema = z.object({
  schemaVersion: z.literal(1),
  hero: heroSchema,
  quests: z.array(questSchema),
  directions: z.array(directionSchema),
  skills: z.array(skillSchema),
  goals: z.array(goalSchema),
  lore: z.array(loreSchema),
  settings: settingsSchema,
  updatedAt: z.string(),
});

export const aiQuestDraftSchema = z.object({
  title: z.string().min(1).max(160),
  type: z.enum(["SIDE", "MAIN", "BOSS"]),
  difficulty: difficultySchema,
  description: z.string().max(1000),
  completionCriteria: z.string().min(1).max(500),
  minutes: z.number().int().min(1).max(480),
  goalUnits: z.number().nonnegative().default(0),
});

export type QuestType = z.infer<typeof questTypeSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Horizon = z.infer<typeof horizonSchema>;
export type Quest = z.infer<typeof questSchema>;
export type Direction = z.infer<typeof directionSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type LoreEntry = z.infer<typeof loreSchema>;
export type Hero = z.infer<typeof heroSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type AiQuestDraft = z.infer<typeof aiQuestDraftSchema>;

export const XP_TABLE: Record<QuestType, readonly number[]> = {
  SIDE: [20, 50, 120, 280, 650],
  MAIN: [80, 180, 400, 800, 1600],
  BOSS: [250, 600, 1200, 2500, 5000],
  HABIT: [10, 15, 25, 40, 60],
};

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  SIDE: "Побочный",
  MAIN: "Основной",
  BOSS: "Босс",
  HABIT: "Привычка",
};

export const STAGE_LABELS: Record<Stage, string> = {
  novice: "Новичок",
  intermediate: "Средний",
  advanced: "Продвинутый",
  pro: "Профи",
};

export const HORIZON_LABELS: Record<Horizon, string> = {
  short: "До 4 недель",
  medium: "1–6 месяцев",
  long: "Больше 6 месяцев",
};

export function xpForQuest(type: QuestType, difficulty: number): number {
  return XP_TABLE[type][Math.max(0, Math.min(4, difficulty - 1))];
}

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const start = (level - 1) ** 2 * 100;
  const end = level ** 2 * 100;
  return {
    level,
    start,
    end,
    current: xp - start,
    required: end - start,
    percent: Math.min(100, Math.max(0, ((xp - start) / (end - start)) * 100)),
  };
}

export function stageFromXp(xp: number): Stage {
  if (xp >= 5000) return "pro";
  if (xp >= 1500) return "advanced";
  if (xp >= 400) return "intermediate";
  return "novice";
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** A single missed day is absorbed into the streak instead of resetting it. */
export function calculateStreak(dates: string[], today = localDateKey()): number {
  const unique = [...new Set(dates)].filter(Boolean).sort().reverse();
  if (!unique.length || daysBetween(unique[0], today) > 2) return 0;
  let streak = 1;
  let missedDays = 0;
  for (let index = 1; index < unique.length; index += 1) {
    const gap = daysBetween(unique[index], unique[index - 1]);
    if (gap === 1) streak += 1;
    else if (gap === 2 && missedDays === 0) {
      streak += 2;
      missedDays += 1;
    } else if (gap > 0) break;
  }
  return streak;
}

export function titleForLevel(level: number): string {
  if (level >= 20) return "Хранитель реальности";
  if (level >= 12) return "Мастер своей главы";
  if (level >= 7) return "Следопыт";
  if (level >= 3) return "Искатель";
  return "Новичок";
}
