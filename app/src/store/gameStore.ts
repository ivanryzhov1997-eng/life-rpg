import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { del as idbDelete, get as idbGet, set as idbSet } from "idb-keyval";
import {
  calculateStreak,
  levelFromXp,
  localDateKey,
  stageFromXp,
  xpForQuest,
  type AiQuestDraft,
  type GameState,
  type Goal,
  type Horizon,
  type Quest,
  type QuestType,
  type Settings,
} from "@contracts/game";
import { createInitialState, isLegacyDemoSave } from "@/lib/seed";

export type NewQuestInput = {
  title: string;
  type: QuestType;
  difficulty: number;
  description: string;
  completionCriteria: string;
  minutes: number;
  directionId: string;
  skillId: string | null;
  goalId: string | null;
  goalUnits: number;
  fromAi?: boolean;
};

type CompletionResult = { xp: number; luck: boolean; levelUp: boolean } | null;

type GameActions = {
  completeQuest: (id: string, reflection?: string) => CompletionResult;
  undoHabit: (id: string) => void;
  undoQuest: (id: string) => void;
  rolloverHabits: () => void;
  addQuest: (input: NewQuestInput) => string;
  updateQuest: (id: string, input: NewQuestInput) => void;
  deleteQuest: (id: string) => void;
  duplicateQuest: (id: string) => string | null;
  acceptAiDrafts: (directionId: string, drafts: AiQuestDraft[]) => void;
  addDirection: (name: string, description: string) => void;
  addSkill: (directionId: string, parentId: string | null, name: string) => string;
  updateSkill: (id: string, input: { name: string; parentId: string | null }) => void;
  deleteSkill: (id: string) => void;
  addGoal: (input: { title: string; horizon: Horizon; target: number; unit: string; directionId: string | null }) => void;
  setGoalProgress: (id: string, current: number) => void;
  deleteGoal: (id: string) => void;
  setHeroName: (name: string) => void;
  setSettings: (settings: Partial<Settings>) => void;
  importState: (state: GameState) => void;
};

export type GameStore = GameState & GameActions;

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function questFromInput(input: NewQuestInput): Quest {
  return {
    ...input,
    id: id(),
    xp: xpForQuest(input.type, input.difficulty),
    fromAi: input.fromAi ?? false,
    done: false,
    completedAt: null,
    lastCompletedDate: null,
    completionDates: [],
    habitStreak: 0,
    awardedXp: 0,
    reflection: null,
    createdAt: now(),
  };
}

const offlineStorage: StateStorage = {
  getItem: async (name) => {
    const saved = await idbGet<string>(name);
    return saved ?? localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    await idbSet(name, value);
    localStorage.removeItem(name);
  },
  removeItem: async (name) => {
    await idbDelete(name);
    localStorage.removeItem(name);
  },
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      completeQuest: (questId, reflection) => {
        let result: CompletionResult = null;
        set((state) => {
          const quest = state.quests.find((item) => item.id === questId);
          if (!quest || quest.done) return state;
          const today = localDateKey();
          const timestamp = now();
          const luck = Math.random() < 0.08;
          const bonus = luck ? Math.max(5, Math.round(quest.xp * 0.2)) : 0;
          const awardedXp = quest.xp + bonus;
          const previousLevel = levelFromXp(state.hero.xp);
          const heroXp = state.hero.xp + awardedXp;
          const level = levelFromXp(heroXp);
          const activityDates = [...new Set([...state.hero.activityDates, today])];
          const isHabit = quest.type === "HABIT";
          const completionDates = isHabit ? [...new Set([...quest.completionDates, today])] : quest.completionDates;
          const nextLore = [...state.lore];
          if (quest.type === "MAIN" || quest.type === "BOSS") {
            nextLore.unshift({
              id: id(),
              title: quest.type === "BOSS" ? "Босс повержен" : "Сюжет сдвинут",
              text: reflection?.trim()
                ? `«${quest.title}». ${reflection.trim()}`
                : `Завершён квест «${quest.title}». Награда: ${awardedXp} XP.`,
              createdAt: timestamp,
            });
          }
          if (level > previousLevel) {
            nextLore.unshift({
              id: id(),
              title: `Уровень ${level}`,
              text: "Новая глава открыта не за вход в приложение, а за реальные завершённые действия.",
              createdAt: timestamp,
            });
          }
          result = { xp: awardedXp, luck, levelUp: level > previousLevel };
          return {
            hero: {
              ...state.hero,
              xp: heroXp,
              level,
              streakDays: calculateStreak(activityDates),
              activityDates,
              totalCompleted: state.hero.totalCompleted + 1,
              habitCompletions: state.hero.habitCompletions + (isHabit ? 1 : 0),
              bossCompleted: state.hero.bossCompleted + (quest.type === "BOSS" ? 1 : 0),
            },
            quests: state.quests.map((item) =>
              item.id === questId
                ? {
                    ...item,
                    done: true,
                    completedAt: timestamp,
                    lastCompletedDate: isHabit ? today : item.lastCompletedDate,
                    completionDates,
                    habitStreak: isHabit ? calculateStreak(completionDates) : item.habitStreak,
                    awardedXp,
                    reflection: reflection?.trim() || null,
                  }
                : item,
            ),
            directions: state.directions.map((direction) => {
              if (direction.id !== quest.directionId) return direction;
              const xp = direction.xp + awardedXp;
              return { ...direction, xp, stage: stageFromXp(xp) };
            }),
            skills: state.skills.map((skill) =>
              skill.id === quest.skillId ? { ...skill, xp: skill.xp + awardedXp } : skill,
            ),
            goals: state.goals.map((goal) =>
              goal.id === quest.goalId
                ? { ...goal, current: Math.min(goal.target, goal.current + quest.goalUnits) }
                : goal,
            ),
            lore: nextLore.slice(0, 60),
            updatedAt: timestamp,
          };
        });
        if (result && "vibrate" in navigator) navigator.vibrate(35);
        return result;
      },

      undoHabit: (questId) => {
        set((state) => {
          const quest = state.quests.find((item) => item.id === questId);
          const today = localDateKey();
          if (!quest || quest.type !== "HABIT" || !quest.done || quest.lastCompletedDate !== today) return state;
          const hasOtherActivity = state.quests.some(
            (item) => item.id !== questId && item.completedAt && localDateKey(new Date(item.completedAt)) === today,
          );
          const activityDates = hasOtherActivity
            ? state.hero.activityDates
            : state.hero.activityDates.filter((date) => date !== today);
          const completionDates = quest.completionDates.filter((date) => date !== today);
          const awardedXp = quest.awardedXp;
          return {
            hero: {
              ...state.hero,
              xp: Math.max(0, state.hero.xp - awardedXp),
              level: levelFromXp(Math.max(0, state.hero.xp - awardedXp)),
              activityDates,
              streakDays: calculateStreak(activityDates),
              totalCompleted: Math.max(0, state.hero.totalCompleted - 1),
              habitCompletions: Math.max(0, state.hero.habitCompletions - 1),
            },
            quests: state.quests.map((item) =>
              item.id === questId
                ? {
                    ...item,
                    done: false,
                    completedAt: null,
                    lastCompletedDate: completionDates.at(-1) ?? null,
                    completionDates,
                    habitStreak: calculateStreak(completionDates),
                    awardedXp: 0,
                  }
                : item,
            ),
            directions: state.directions.map((direction) => {
              if (direction.id !== quest.directionId) return direction;
              const xp = Math.max(0, direction.xp - awardedXp);
              return { ...direction, xp, stage: stageFromXp(xp) };
            }),
            skills: state.skills.map((skill) =>
              skill.id === quest.skillId ? { ...skill, xp: Math.max(0, skill.xp - awardedXp) } : skill,
            ),
            goals: state.goals.map((goal) =>
              goal.id === quest.goalId
                ? { ...goal, current: Math.max(0, goal.current - quest.goalUnits) }
                : goal,
            ),
            updatedAt: now(),
          };
        });
      },

      undoQuest: (questId) => {
        set((state) => {
          const quest = state.quests.find((item) => item.id === questId);
          if (!quest || quest.type === "HABIT" || !quest.done || !quest.completedAt) return state;
          const completedDate = localDateKey(new Date(quest.completedAt));
          const hasOtherActivity = state.quests.some((item) =>
            item.id !== questId && (item.type === "HABIT"
              ? item.completionDates.includes(completedDate)
              : !!item.completedAt && localDateKey(new Date(item.completedAt)) === completedDate),
          );
          const activityDates = hasOtherActivity ? state.hero.activityDates : state.hero.activityDates.filter((date) => date !== completedDate);
          const heroXp = Math.max(0, state.hero.xp - quest.awardedXp);
          const timestamp = quest.completedAt;
          return {
            hero: {
              ...state.hero, xp: heroXp, level: levelFromXp(heroXp),
              activityDates, streakDays: calculateStreak(activityDates),
              totalCompleted: Math.max(0, state.hero.totalCompleted - 1),
              bossCompleted: Math.max(0, state.hero.bossCompleted - (quest.type === "BOSS" ? 1 : 0)),
            },
            quests: state.quests.map((item) => item.id === questId
              ? { ...item, done: false, completedAt: null, awardedXp: 0, reflection: null }
              : item),
            directions: state.directions.map((direction) => {
              if (direction.id !== quest.directionId) return direction;
              const xp = Math.max(0, direction.xp - quest.awardedXp);
              return { ...direction, xp, stage: stageFromXp(xp) };
            }),
            skills: state.skills.map((skill) => skill.id === quest.skillId
              ? { ...skill, xp: Math.max(0, skill.xp - quest.awardedXp) } : skill),
            goals: state.goals.map((goal) => goal.id === quest.goalId
              ? { ...goal, current: Math.max(0, goal.current - quest.goalUnits) } : goal),
            lore: state.lore.filter((entry) => entry.createdAt !== timestamp),
            updatedAt: now(),
          };
        });
      },

      rolloverHabits: () => {
        const today = localDateKey();
        set((state) => ({
          quests: state.quests.map((quest) =>
            quest.type === "HABIT" && quest.done && quest.lastCompletedDate !== today
              ? { ...quest, done: false, completedAt: null, awardedXp: 0 }
              : quest,
          ),
          hero: { ...state.hero, streakDays: calculateStreak(state.hero.activityDates) },
        }));
      },

      addQuest: (input) => {
        const quest = questFromInput(input);
        set((state) => ({ quests: [quest, ...state.quests], updatedAt: now() }));
        return quest.id;
      },

      updateQuest: (questId, input) => {
        set((state) => ({
          quests: state.quests.map((quest) => quest.id === questId && !quest.done
            ? { ...quest, ...input, xp: xpForQuest(input.type, input.difficulty), id: quest.id, done: quest.done, completedAt: quest.completedAt, createdAt: quest.createdAt }
            : quest),
          updatedAt: now(),
        }));
      },

      deleteQuest: (questId) => {
        set((state) => ({ quests: state.quests.filter((quest) => quest.id !== questId), updatedAt: now() }));
      },

      duplicateQuest: (questId) => {
        const source = get().quests.find((quest) => quest.id === questId);
        if (!source) return null;
        const copy = questFromInput({
          title: `${source.title} (копия)`, type: source.type, difficulty: source.difficulty,
          description: source.description, completionCriteria: source.completionCriteria,
          minutes: source.minutes, directionId: source.directionId, skillId: source.skillId,
          goalId: source.goalId, goalUnits: source.goalUnits, fromAi: source.fromAi,
        });
        set((state) => ({ quests: [copy, ...state.quests], updatedAt: now() }));
        return copy.id;
      },

      acceptAiDrafts: (directionId, drafts) => {
        const goals = get().goals;
        const goalId = goals.find((goal) => goal.directionId === directionId)?.id ?? null;
        const quests = drafts.map((draft) =>
          questFromInput({
            ...draft,
            directionId,
            skillId: null,
            goalId: draft.goalUnits > 0 ? goalId : null,
            fromAi: true,
          }),
        );
        set((state) => ({ quests: [...quests, ...state.quests], updatedAt: now() }));
      },

      addDirection: (name, description) => {
        set((state) => ({
          directions: [
            ...state.directions,
            { id: id(), name: name.trim(), description: description.trim(), stage: "novice", xp: 0 },
          ],
          updatedAt: now(),
        }));
      },

      addSkill: (directionId, parentId, name) => {
        const skillId = id();
        set((state) => ({
          skills: [...state.skills, { id: skillId, directionId, parentId, name: name.trim(), xp: 0 }],
          updatedAt: now(),
        }));
        return skillId;
      },

      updateSkill: (skillId, input) => {
        set((state) => {
          const target = state.skills.find((skill) => skill.id === skillId);
          if (!target || input.parentId === skillId) return state;
          if (input.parentId && !state.skills.some((skill) => skill.id === input.parentId && skill.directionId === target.directionId)) return state;
          let parent = input.parentId;
          while (parent) { if (parent === skillId) return state; parent = state.skills.find((skill) => skill.id === parent)?.parentId ?? null; }
          return { skills: state.skills.map((skill) => skill.id === skillId ? { ...skill, name: input.name.trim(), parentId: input.parentId } : skill), updatedAt: now() };
        });
      },

      deleteSkill: (skillId) => {
        set((state) => {
          const remove = new Set([skillId]); let changed = true;
          while (changed) { changed = false; for (const skill of state.skills) if (skill.parentId && remove.has(skill.parentId) && !remove.has(skill.id)) { remove.add(skill.id); changed = true; } }
          return { skills: state.skills.filter((skill) => !remove.has(skill.id)), quests: state.quests.map((quest) => quest.skillId && remove.has(quest.skillId) ? { ...quest, skillId: null } : quest), updatedAt: now() };
        });
      },

      addGoal: (input) => {
        const goal: Goal = { ...input, id: id(), current: 0, createdAt: now() };
        set((state) => ({ goals: [...state.goals, goal], updatedAt: now() }));
      },

      setGoalProgress: (goalId, current) => set((state) => ({ goals: state.goals.map((goal) => goal.id === goalId ? { ...goal, current: Math.max(0, Math.min(goal.target, current)) } : goal), updatedAt: now() })),

      deleteGoal: (goalId) => set((state) => ({ goals: state.goals.filter((goal) => goal.id !== goalId), quests: state.quests.map((quest) => quest.goalId === goalId ? { ...quest, goalId: null, goalUnits: 0 } : quest), updatedAt: now() })),

      setHeroName: (name) => set({ hero: { ...get().hero, name: name.trim() || "Герой" }, updatedAt: now() }),
      setSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings }, updatedAt: now() })),
      importState: (state) => set({ ...state }),
    }),
    {
      name: "life-rpg-local-v1",
      version: 2,
      migrate: (persistedState, version) => {
        if (version < 2 && isLegacyDemoSave(persistedState)) {
          return createInitialState();
        }
        return persistedState as GameState;
      },
      storage: createJSONStorage(() => offlineStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        hero: state.hero,
        quests: state.quests,
        directions: state.directions,
        skills: state.skills,
        goals: state.goals,
        lore: state.lore,
        settings: state.settings,
        updatedAt: state.updatedAt,
      }),
    },
  ),
);

export function gameSnapshot(state: GameState): GameState {
  return {
    schemaVersion: 1,
    hero: state.hero,
    quests: state.quests,
    directions: state.directions,
    skills: state.skills,
    goals: state.goals,
    lore: state.lore,
    settings: state.settings,
    updatedAt: state.updatedAt,
  };
}
