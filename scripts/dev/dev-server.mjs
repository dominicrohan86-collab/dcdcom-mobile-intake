import http from "node:http";
import { createServer as createViteServer } from "vite";
import { handleApi } from "../../src/server/api.js";
import { createLocalEnv } from "./local-runtime.mjs";

const env = await createLocalEnv();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const apiResponse = await handleApi(toFetchRequest(request, url), env);
      if (apiResponse) return sendFetchResponse(response, apiResponse);
    }
    vite.middlewares(request, response, (error) => {
      if (error) {
        response.statusCode = 500;
        response.end(error.message);
      }
    });
  } catch (error) {
    response.statusCode = 500;
    response.end(error.message);
  }
});

server.listen(port, host, () => {
  console.log(`DC Decom React app running at http://${host}:${port}`);
  console.log("Vite UI + local Hono-compatible API + SQLite-backed D1 + filesystem-backed R2");
});

function toFetchRequest(request, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value != null) headers.set(key, String(value));
  }
  const init = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    init.body = request;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendFetchResponse(response, fetchResponse) {
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}
