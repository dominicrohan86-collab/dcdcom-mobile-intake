import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/drizzle-schema.js";

const clients = new WeakMap();

export async function ensureDatabase(env) {
  return Boolean(env?.DB);
}

export function getDb(env) {
  if (!env?.DB) throw new Error("D1 binding DB is not configured.");
  if (!clients.has(env.DB)) clients.set(env.DB, drizzle(env.DB, { schema }));
  return clients.get(env.DB);
}

export function json(data, init = 200) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const requestId = data?.requestId || crypto.randomUUID();
  return new Response(JSON.stringify(data, null, 2), {
    ...responseInit,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "x-request-id": requestId,
      ...(responseInit.headers || {})
    }
  });
}

export function readUser(request) {
  const email = request.headers.get("oai-authenticated-user-email") || "alex@dcdcom.com";
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let fullName = "Alex Morgan";
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      fullName = decodeURIComponent(encodedName);
    } catch {
      fullName = email;
    }
  }
  return { id: `user_${email.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, email, fullName };
}
