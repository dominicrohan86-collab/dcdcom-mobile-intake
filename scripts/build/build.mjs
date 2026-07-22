import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { posix, resolve, relative, sep } from "node:path";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";

const root = resolve(".");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await viteBuild({ root, build: { outDir: resolve(dist, "client"), emptyOutDir: true } });
await injectServiceWorkerPrecache(resolve(dist, "client"));
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

async function injectServiceWorkerPrecache(clientDist) {
  const serviceWorkerPath = resolve(clientDist, "sw.js");
  const files = await listStaticFiles(clientDist);
  const urls = files
    .filter((file) => file !== "sw.js" && !file.endsWith("/sw.js"))
    .map((file) => `/${file}`)
    .sort();
  const version = await hashFiles(clientDist, files);
  const source = await readFile(serviceWorkerPath, "utf8");
  const output = source
    .replace("self.__DCDCOM_PRECACHE_URLS = [];", `self.__DCDCOM_PRECACHE_URLS = ${JSON.stringify(urls, null, 2)};`)
    .replace('self.__DCDCOM_CACHE_VERSION = "dev";', `self.__DCDCOM_CACHE_VERSION = "${version}";`);
  await writeFile(serviceWorkerPath, output);
}

async function listStaticFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listStaticFiles(absolute, base));
    else if (entry.isFile()) files.push(toPublicPath(relative(base, absolute)));
  }
  return files;
}

async function hashFiles(clientDist, files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const absolute = resolve(clientDist, ...file.split("/"));
    const metadata = await stat(absolute);
    hash.update(file);
    hash.update(String(metadata.size));
    hash.update(await readFile(absolute));
  }
  return hash.digest("hex").slice(0, 12);
}

function toPublicPath(path) {
  return path.split(sep).join(posix.sep);
}
