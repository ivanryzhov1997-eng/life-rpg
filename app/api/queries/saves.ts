import { and, eq } from "drizzle-orm";
import { gameSaves, type GameSave, type InsertGameSave } from "@db/schema";
import { getDb } from "./connection";

export async function findSaveByUser(userId: number): Promise<GameSave | undefined> {
  return getDb().query.gameSaves.findFirst({ where: eq(gameSaves.userId, userId) });
}

export async function createSave(save: InsertGameSave): Promise<void> {
  await getDb().insert(gameSaves).values(save);
}

/**
 * Compare-and-swap update.
 *
 * The expected revision is part of the UPDATE predicate, so concurrent
 * devices cannot both overwrite the same revision. A successful update
 * advances the revision exactly once.
 */
export async function updateSave(
  userId: number,
  expectedRevision: number,
  save: Pick<InsertGameSave, "payload" | "deviceId">,
): Promise<boolean> {
  const result = await getDb()
    .update(gameSaves)
    .set({ ...save, revision: expectedRevision + 1 })
    .where(
      and(
        eq(gameSaves.userId, userId),
        eq(gameSaves.revision, expectedRevision),
      ),
    );

  return result[0].affectedRows === 1;
}

export function isDuplicateSaveError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}
