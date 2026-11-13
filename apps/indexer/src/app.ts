import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { type AppVars, authMiddleware } from "./auth";
import type { AppContext } from "./context";
import { accountRoutes } from "./routes/accounts";
import { dmRoutes } from "./routes/dm";
import { readRoutes } from "./routes/read";
import { walletRoutes } from "./routes/wallets";
import { HttpError, writeRoutes } from "./routes/write";

export function createApp(ctx: AppContext) {
  const app = new OpenAPIHono<{ Variables: AppVars }>();
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );
  app.use("*", authMiddleware(ctx.db, ctx.env.JWT_SECRET));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, ...err.extra }, err.status);
    ctx.log.error({ err: err.message, path: c.req.path }, "request failed");
    return c.json({ error: "internal_error" }, 500);
  });
  app.route("/", readRoutes(ctx));
  app.route("/", writeRoutes(ctx));
  app.route("/", dmRoutes(ctx));
  app.route("/", accountRoutes(ctx));
  app.route("/", walletRoutes(ctx));
  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "socialonchain API",
      version: "1.0.0",
      description:
        "Public read API over the onchain social graph (Avalanche) + Farcaster (read-only). FeedSpec JSON Schema: /feedspec.schema.json",
    },
  });
  return app;
}
