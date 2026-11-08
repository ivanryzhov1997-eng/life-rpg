import { eq } from "drizzle-orm";
import { gameSaves, type GameSave, type InsertGameSave } from "@db/schema";
import { getDb } from "./connection";

export async function findSaveByUser(userId: number): Promise<GameSave | undefined> {
  return getDb().query.gameSaves.findFirst({ where: eq(gameSaves.userId, userId) });
}

export async function createSave(save: InsertGameSave): Promise<void> {
  await getDb().insert(gameSaves).values(save);
}

export async function updateSave(
  userId: number,
  save: Pick<InsertGameSave, "payload" | "deviceId" | "revision">,
): Promise<void> {
  await getDb().update(gameSaves).set(save).where(eq(gameSaves.userId, userId));
}
