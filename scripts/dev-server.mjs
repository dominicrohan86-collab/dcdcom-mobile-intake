import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const publicRoot = resolve("public");
const sourceRoot = resolve("src");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || !extname(pathname)) pathname = "/index.html";
    const root = pathname.startsWith("/src/") ? sourceRoot : publicRoot;
    const relativePath = pathname.startsWith("/src/") ? pathname.replace(/^\/src\//, "") : pathname;
    const filePath = normalize(join(root, relativePath));
    if (!filePath.startsWith(root)) throw new Error("Invalid path");
    const info = await stat(filePath);
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    const index = await readFile(join(publicRoot, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(index);
  }
});

server.listen(port, host, () => {
  console.log(`DCDcom app running at http://${host}:${port}`);
});
