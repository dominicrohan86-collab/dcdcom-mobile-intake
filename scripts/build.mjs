import { mkdir, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";

const root = resolve(".");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await viteBuild({ root, build: { outDir: resolve(dist, "client"), emptyOutDir: true } });
await mkdir(resolve(dist, "server"), { recursive: true });
await esbuild({
  entryPoints: [resolve(root, "src/server/index.js")],
  outfile: resolve(dist, "server/index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["worker", "browser"],
  minify: false,
  sourcemap: true
});
await mkdir(resolve(dist, ".openai"), { recursive: true });
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
await cp(resolve(root, "db"), resolve(dist, ".openai", "db"), { recursive: true });
