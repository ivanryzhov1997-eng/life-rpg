import { levelFromXp, type GameState } from "@contracts/game";

export function createInitialState(): GameState {
  return {
    schemaVersion: 1,
    hero: {
      name: "Герой",
      xp: 0,
      level: levelFromXp(0),
      streakDays: 0,
      activityDates: [],
      totalCompleted: 0,
      habitCompletions: 0,
      bossCompleted: 0,
    },
    directions: [],
    skills: [],
    goals: [],
    quests: [],
    lore: [],
    settings: {
      theme: "dark",
      preset: "rose",
      confirmCriteria: true,
      onboardingSeen: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isLegacyDemoSave(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  const hero = state.hero;
  const directions = state.directions ?? [];
  const skills = state.skills ?? [];
  const goals = state.goals ?? [];
  const quests = state.quests ?? [];
  const lore = state.lore ?? [];
  return hero?.name === "Алекс" &&
    hero.xp === 120 &&
    hero.totalCompleted === 4 &&
    hero.streakDays === 3 &&
    directions.length === 2 &&
    directions.some((item) => item.id === "focus" && item.xp === 80) &&
    directions.some((item) => item.id === "body" && item.xp === 40) &&
    skills.length === 5 &&
    goals.length === 2 &&
    quests.length === 5 &&
    quests.some((item) => item.id === "done-first" && item.done) &&
    lore.some((item) => item.id === "lore-start");
}
