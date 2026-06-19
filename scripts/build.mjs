import { mkdir, cp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const dist = resolve(root, "dist");
const client = resolve(dist, "client");
const server = resolve(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });
await cp(resolve(root, "public"), client, { recursive: true });
await mkdir(resolve(client, "src"), { recursive: true });
await cp(resolve(root, "src", "lib"), resolve(client, "src", "lib"), { recursive: true });
await cp(resolve(root, "src", "state"), resolve(client, "src", "state"), { recursive: true });
await cp(resolve(root, "src", "ui"), resolve(client, "src", "ui"), { recursive: true });
await cp(resolve(root, "src", "main.js"), resolve(client, "src", "main.js"));
await cp(resolve(root, "src", "server"), server, { recursive: true });

await writeFile(
  resolve(server, "index.js"),
  `import { handleApi } from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname === "/" || !pathname.includes(".")) pathname = "/index.html";
    const assetUrl = new URL(pathname, request.url);
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
`,
);

await mkdir(resolve(dist, ".openai"), { recursive: true });
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
await cp(resolve(root, "db"), resolve(dist, ".openai", "db"), { recursive: true });
