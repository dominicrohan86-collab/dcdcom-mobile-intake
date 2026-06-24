import { and, eq } from "drizzle-orm";
import { getDb, json } from "./db.js";
import { users } from "../../db/drizzle-schema.js";

const WRITE_ROLES = new Set(["admin", "estimator", "project_manager", "sales"]);
const ADMIN_ROLES = new Set(["admin", "project_manager"]);
const DEFAULT_ACCOUNT_ID = "acct_dcdcom";

export async function authenticateRequest(env, request) {
  const secret = env.AUTH_SESSION_SECRET || "";
  if (secret) return authenticateSignedSession(env, request, secret);
  return authenticateTrustedDevHeaders(env, request);
}

export async function requireWriteAccess(env, accountId, user) {
  return requireRole(env, accountId, user, WRITE_ROLES);
}

export async function requireAdminAccess(env, accountId, user) {
  return requireRole(env, accountId, user, ADMIN_ROLES);
}

export async function readCurrentUser(env, accountId, user) {
  const [current] = await getDb(env).select({ id: users.id, account_id: users.accountId, email: users.email, full_name: users.fullName, role: users.role, is_active: users.isActive }).from(users).where(and(eq(users.accountId, accountId), eq(users.id, user.id))).limit(1);
  return current || null;
}

async function requireRole(env, accountId, user, allowedRoles) {
  const currentUser = await readCurrentUser(env, accountId, user);
  if (!currentUser || !currentUser.is_active) {
    return json({ error: "User is not active in this workspace." }, 403);
  }
  if (!allowedRoles.has(currentUser.role)) {
    return json({ error: "You do not have permission to perform this action.", role: currentUser.role }, 403);
  }
  return null;
}

async function authenticateSignedSession(env, request, secret) {
  const token = bearerToken(request) || cookieToken(request, "dcdcom_session");
  if (!token) return { response: json({ error: "Authentication required." }, 401) };
  let payload;
  try {
    payload = await verifySignedToken(secret, token);
  } catch (error) {
    return { response: json({ error: "Invalid authentication token.", detail: error.message }, 401) };
  }
  const email = String(payload.email || "").toLowerCase();
  const accountId = safeAccountId(payload.accountId || payload.account_id || env.DEFAULT_ACCOUNT_ID || DEFAULT_ACCOUNT_ID);
  if (!email || !accountId) return { response: json({ error: "Authentication token is missing required account identity." }, 401) };
  return {
    accountId,
    user: {
      id: String(payload.sub || payload.userId || `user_${email.replace(/[^a-z0-9]+/g, "_")}`),
      email,
      fullName: String(payload.fullName || payload.full_name || email),
      role: payload.role || null,
      authMode: "signed_session"
    }
  };
}

function authenticateTrustedDevHeaders(env, request) {
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
  const accountHeader = request.headers.get("x-dcdcom-account-id");
  const accountId = safeAccountId(env.DEFAULT_ACCOUNT_ID || accountHeader || DEFAULT_ACCOUNT_ID);
  return {
    accountId,
    user: {
      id: `user_${email.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      email,
      fullName,
      authMode: "trusted_dev_headers"
    }
  };
}

function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function cookieToken(request, name) {
  const cookies = request.headers.get("cookie") || "";
  return cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

async function verifySignedToken(secret, token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new Error("Malformed token.");
  const expected = await hmac(secret, body);
  if (!constantTimeEqual(signature, expected)) throw new Error("Signature mismatch.");
  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) throw new Error("Token expired.");
  return payload;
}

async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left || "");
  const b = new TextEncoder().encode(right || "");
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}

function base64UrlEncode(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function safeAccountId(value) {
  const accountId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{3,80}$/.test(accountId) ? accountId : DEFAULT_ACCOUNT_ID;
}
