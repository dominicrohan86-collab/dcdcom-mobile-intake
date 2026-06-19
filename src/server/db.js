import { schemaStatements } from "./schema.js";

const initializedBindings = new WeakSet();

export async function ensureDatabase(env) {
  if (!env?.DB || initializedBindings.has(env.DB)) return Boolean(env?.DB);
  await env.DB.batch(schemaStatements.map((statement) => env.DB.prepare(statement)));
  initializedBindings.add(env.DB);
  return true;
}

export async function all(env, sql, bindings = []) {
  await ensureDatabase(env);
  return env.DB.prepare(sql).bind(...bindings).all();
}

export async function first(env, sql, bindings = []) {
  await ensureDatabase(env);
  return env.DB.prepare(sql).bind(...bindings).first();
}

export async function run(env, sql, bindings = []) {
  await ensureDatabase(env);
  return env.DB.prepare(sql).bind(...bindings).run();
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
