self.__DCDCOM_PRECACHE_URLS = [];
self.__DCDCOM_CACHE_VERSION = "dev";

const STATIC_CACHE = `dcdcom-static-${self.__DCDCOM_CACHE_VERSION}`;
const RUNTIME_CACHE = `dcdcom-runtime-${self.__DCDCOM_CACHE_VERSION}`;
const API_PREFIX = "/api/";
const NAVIGATION_FALLBACK = "/index.html";
const OFFLINE_FALLBACK = "/offline.html";
const PRECACHE_URLS = Array.from(new Set([
  "/",
  NAVIGATION_FALLBACK,
  OFFLINE_FALLBACK,
  ...self.__DCDCOM_PRECACHE_URLS
]));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const expected = new Set([STATIC_CACHE, RUNTIME_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("dcdcom-") && !expected.has(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticRequest(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(NAVIGATION_FALLBACK, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(NAVIGATION_FALLBACK)) || (await caches.match(OFFLINE_FALLBACK)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

function isStaticRequest(request, url) {
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) return true;
  if (["manifest", "image", "font", "style", "script", "worker"].includes(request.destination)) return true;
  return ["/manifest.webmanifest", "/dcdecom-logo.svg", "/screenshot.jpeg", OFFLINE_FALLBACK].includes(url.pathname);
}

function isCacheable(response) {
  return response && response.ok && ["basic", "default"].includes(response.type);
}
