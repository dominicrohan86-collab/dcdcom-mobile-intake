import { app } from "./app.js";

export function handleApi(request, env, executionCtx) {
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;
  return app.fetch(request, env, executionCtx);
}
