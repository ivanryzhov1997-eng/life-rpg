import { z } from "zod";
import { gameStateSchema } from "@contracts/game";
import { authedQuery, createRouter } from "./middleware";
import {
  createSave,
  findSaveByUser,
  isDuplicateSaveError,
  updateSave,
} from "./queries/saves";

function conflict(
  current: Awaited<ReturnType<typeof findSaveByUser>>,
) {
  return {
    status: "conflict" as const,
    revision: current?.revision ?? 0,
    state: current?.payload ?? null,
  };
}

export const saveRouter = createRouter({
  get: authedQuery.query(async ({ ctx }) => {
    const save = await findSaveByUser(ctx.user.id);
    if (!save) return null;
    return {
      state: save.payload,
      revision: save.revision,
      updatedAt: save.updatedAt,
    };
  }),

  sync: authedQuery
    .input(
      z.object({
        state: gameStateSchema,
        revision: z.number().int().positive().nullable(),
        deviceId: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = await findSaveByUser(ctx.user.id);

      if (!current) {
        // A client that previously had a cloud revision must not silently
        // recreate a deleted/stale save as a fresh revision.
        if (input.revision !== null) return conflict(undefined);

        try {
          await createSave({
            userId: ctx.user.id,
            payload: input.state,
            revision: 1,
            deviceId: input.deviceId,
          });
          return { status: "saved" as const, revision: 1 };
        } catch (error) {
          // Another device may have inserted the first save after our read.
          if (!isDuplicateSaveError(error)) throw error;
          return conflict(await findSaveByUser(ctx.user.id));
        }
      }

      // Timestamps are client-controlled and are never a substitute for CAS.
      if (input.revision !== current.revision) return conflict(current);

      const saved = await updateSave(ctx.user.id, current.revision, {
        payload: input.state,
        deviceId: input.deviceId,
      });

      if (saved) {
        return { status: "saved" as const, revision: current.revision + 1 };
      }

      // The row changed between read and update. Return the latest server
      // revision so the client can resolve the conflict instead of overwriting.
      return conflict(await findSaveByUser(ctx.user.id));
    }),
});
