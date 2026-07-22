import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const assetsDir = "dist/client/assets";
const assets = await readdir(assetsDir);
let jsGzip = 0;
let cssGzip = 0;

for (const asset of assets) {
  const file = await readFile(join(assetsDir, asset));
  const gzipSize = gzipSync(file).byteLength;
  if (asset.endsWith(".js")) jsGzip += gzipSize;
  if (asset.endsWith(".css")) cssGzip += gzipSize;
}

const total = jsGzip + cssGzip;
assert(jsGzip <= 230_000, `JS gzip budget exceeded: ${jsGzip} bytes`);
assert(cssGzip <= 25_000, `CSS gzip budget exceeded: ${cssGzip} bytes`);
assert(total <= 260_000, `Total asset gzip budget exceeded: ${total} bytes`);

console.log(`Performance budget passed: js=${jsGzip} css=${cssGzip} total=${total}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
