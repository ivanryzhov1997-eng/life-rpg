import { describe, expect, it } from "vitest";
import { calculateStreak, gameStateSchema, levelFromXp, localDateKey, stageFromXp, xpForQuest } from "@contracts/game";
import { createInitialState } from "./seed";

function offset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

describe("честная прогрессия", () => {
  it("использует согласованную таблицу XP", () => {
    expect(xpForQuest("SIDE", 1)).toBe(20);
    expect(xpForQuest("MAIN", 3)).toBe(400);
    expect(xpForQuest("BOSS", 5)).toBe(5000);
    expect(xpForQuest("HABIT", 2)).toBe(15);
  });

  it("вычисляет уровень и стадию от накопленного XP", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(399)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
    expect(stageFromXp(399)).toBe("novice");
    expect(stageFromXp(400)).toBe("intermediate");
  });

  it("прощает один пропущенный день без обнуления серии", () => {
    expect(calculateStreak([offset(0), offset(-1), offset(-2)])).toBe(3);
    expect(calculateStreak([offset(0), offset(-2), offset(-3)])).toBe(4);
    expect(calculateStreak([offset(-4), offset(-5)])).toBe(0);
  });

  it("валидирует стартовый сейв по схеме версии 1", () => {
    expect(gameStateSchema.parse(createInitialState()).schemaVersion).toBe(1);
  });
});
