import { authRouter } from "./auth-router";
import { saveRouter } from "./save-router";
import { aiRouter } from "./ai-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  save: saveRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
