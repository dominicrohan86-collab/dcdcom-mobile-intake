import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
assert(manifest.name === "DCDcom Mobile Intake", "Manifest should use the production app name");
assert(manifest.short_name === "DCDcom", "Manifest should include a short app name");
assert(manifest.start_url.startsWith("/today"), "Manifest should launch into the Today workspace");
assert(manifest.scope === "/", "Manifest scope should cover app routes");
assert(manifest.display === "standalone", "Manifest should install as a standalone app");
assert(manifest.orientation === "portrait", "Manifest should prefer portrait on phones");

const iconPurposes = manifest.icons.map((icon) => icon.purpose || "any").join(" ");
for (const size of ["192x192", "512x512"]) {
  assert(manifest.icons.some((icon) => icon.sizes === size && icon.type === "image/png"), `Manifest should include a ${size} PNG icon`);
}
assert(iconPurposes.includes("maskable"), "Manifest should include a maskable icon");

for (const file of [
  "public/icons/app-icon.svg",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/maskable-512.png",
  "public/icons/apple-touch-icon.png",
  "public/offline.html",
  "public/sw.js"
]) {
  await access(file);
}

const index = await readFile("index.html", "utf8");
for (const token of ["rel=\"manifest\"", "apple-mobile-web-app-capable", "apple-touch-icon", "mobile-web-app-capable"]) {
  assert(index.includes(token), `index.html should include ${token}`);
}

const sw = await readFile("public/sw.js", "utf8");
for (const token of ["self.__DCDCOM_PRECACHE_URLS", "API_PREFIX = \"/api/\"", "SKIP_WAITING", "networkFirstNavigation", "cacheFirst"]) {
  assert(sw.includes(token), `Service worker should include ${token}`);
}

const app = await readFile("src/client/App.jsx", "utf8");
assert(app.includes("registerPwa") && app.includes("applyPwaUpdate") && app.includes("A new version of DCDcom Intake is ready"), "App should register the PWA and expose update reload behavior");

const buildScript = await readFile("scripts/build.mjs", "utf8");
assert(buildScript.includes("injectServiceWorkerPrecache") && buildScript.includes("self.__DCDCOM_PRECACHE_URLS"), "Build should inject hashed static assets into the service worker");

console.log("PWA source checks passed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
