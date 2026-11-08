import { z } from "zod";
import { gameStateSchema } from "@contracts/game";
import { authedQuery, createRouter } from "./middleware";
import { createSave, findSaveByUser, updateSave } from "./queries/saves";

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
        await createSave({
          userId: ctx.user.id,
          payload: input.state,
          revision: 1,
          deviceId: input.deviceId,
        });
        return { status: "saved" as const, revision: 1 };
      }

      const isCurrentRevision = input.revision === current.revision;
      const isNewerPayload = input.state.updatedAt >= current.payload.updatedAt;
      if (isCurrentRevision || isNewerPayload) {
        const revision = current.revision + 1;
        await updateSave(ctx.user.id, {
          payload: input.state,
          revision,
          deviceId: input.deviceId,
        });
        return { status: "saved" as const, revision };
      }

      return {
        status: "conflict" as const,
        revision: current.revision,
        state: current.payload,
      };
    }),
});
