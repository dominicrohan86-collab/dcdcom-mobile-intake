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
await cp(resolve(root, "src"), resolve(client, "src"), { recursive: true });

await writeFile(
  resolve(server, "index.js"),
  `export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname === "/" || !pathname.includes(".")) pathname = "/index.html";
    const assetUrl = new URL(pathname, request.url);
    return env.ASSETS.fetch(new Request(assetUrl, request));
  }
};
`,
);

await mkdir(resolve(dist, ".openai"), { recursive: true });
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
