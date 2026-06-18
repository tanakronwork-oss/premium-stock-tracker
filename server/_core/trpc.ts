import { initTRPC } from "@trpc/server";
import superjson from "superjson";

type Context = {
  req?: unknown;
  res?: unknown;
  user?: unknown;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure;
