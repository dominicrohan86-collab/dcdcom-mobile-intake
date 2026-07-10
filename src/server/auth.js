import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, json } from "./db.js";
import { auditLog, authIdentities, invites, oauthStates, passwordCredentials, passwordResetTokens, sessions, userPreferences, users } from "../../db/drizzle-schema.js";

const WRITE_ROLES = new Set(["admin", "estimator", "project_manager", "sales"]);
const ADMIN_ROLES = new Set(["admin", "project_manager"]);
const DEFAULT_ACCOUNT_ID = "acct_dcdcom";
const SESSION_COOKIE = "dcdcom_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 50_000;
const MIN_SESSION_SECRET_LENGTH = 32;

export async function authenticateRequest(env, request) {
  const secret = sessionSecret(env);
  if (!secret) return { response: authenticationConfigurationError() };
  return authenticateSignedSession(env, request, secret);
}

export async function requireWriteAccess(env, accountId, user) {
  return requireRole(env, accountId, user, WRITE_ROLES);
}

export async function requireAdminAccess(env, accountId, user) {
  return requireRole(env, accountId, user, ADMIN_ROLES);
}

export async function readCurrentUser(env, accountId, user) {
  const [current] = await getDb(env).select({ id: users.id, account_id: users.accountId, email: users.email, full_name: users.fullName, role: users.role, avatar_url: users.avatarUrl, timezone: users.timezone, locale: users.locale, is_active: users.isActive }).from(users).where(and(eq(users.accountId, accountId), eq(users.id, user.id))).limit(1);
  return current || null;
}

export async function loginWithPassword(env, request, payload) {
  if (!sessionSecret(env)) return authenticationConfigurationError();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const accountId = safeAccountId(payload.accountId || env.DEFAULT_ACCOUNT_ID || DEFAULT_ACCOUNT_ID);
  if (!email || !password) return json({ error: "Email and password are required." }, 400);

  const db = getDb(env);
  const [row] = await db
    .select({
      id: users.id,
      accountId: users.accountId,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      locale: users.locale,
      isActive: users.isActive,
      passwordHash: passwordCredentials.passwordHash,
      failedAttemptCount: passwordCredentials.failedAttemptCount,
      lockedUntil: passwordCredentials.lockedUntil,
      mustResetPassword: passwordCredentials.mustResetPassword
    })
    .from(users)
    .leftJoin(passwordCredentials, eq(users.id, passwordCredentials.userId))
    .where(and(eq(users.accountId, accountId), eq(users.email, email)))
    .limit(1);

  if (!row || !row.passwordHash) return json({ error: "Invalid email or password." }, 401);
  if (!row.isActive) return json({ error: "This account is inactive. Ask an administrator to restore access." }, 403);
  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) return json({ error: "This account is temporarily locked. Try again later." }, 423);

  const passwordOk = await verifyPassword(password, row.passwordHash);
  if (!passwordOk) {
    const failedAttemptCount = Number(row.failedAttemptCount || 0) + 1;
    const lockedUntil = failedAttemptCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await db.update(passwordCredentials).set({ failedAttemptCount, lockedUntil, updatedAt: new Date().toISOString() }).where(eq(passwordCredentials.userId, row.id));
    await logAuthEvent(env, accountId, row.id, "auth.login_failed", { email });
    return json({ error: lockedUntil ? "Too many failed attempts. This account is temporarily locked." : "Invalid email or password." }, lockedUntil ? 423 : 401);
  }

  await db.update(passwordCredentials).set({ failedAttemptCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() }).where(eq(passwordCredentials.userId, row.id));
  await db.update(users).set({ lastLoginAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(users.id, row.id));
  const session = await createSignedSession(env, request, toPublicUser(row));
  await logAuthEvent(env, accountId, row.id, "auth.login", { provider: "password" });
  return json({ user: toCurrentUserPayload(row), session: { expiresAt: session.expiresAt } }, { status: 200, headers: { "set-cookie": session.cookie } });
}

export async function signupWithPassword(env, request, payload) {
  return json({ error: "Self-service enrollment is disabled. Ask a workspace administrator for an invitation." }, 403);
}

export async function logoutSession(env, request) {
  const token = cookieToken(request, SESSION_COOKIE) || bearerToken(request);
  if (token) {
    const hash = await sha256Hex(token);
    await getDb(env).update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.tokenHash, hash));
  }
  return json({ ok: true }, { status: 200, headers: { "set-cookie": expireSessionCookie(request) } });
}

export async function readSession(env, request) {
  const context = await authenticateRequest(env, request);
  if (context.response) return context.response;
  const current = await readCurrentUser(env, context.accountId, context.user);
  if (!current?.is_active) return json({ error: "Authentication required." }, 401);
  return json({ user: toCurrentUserPayload(current), accountId: context.accountId, authenticated: true });
}

export async function requestPasswordReset(env, request, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const accountId = safeAccountId(payload.accountId || env.DEFAULT_ACCOUNT_ID || DEFAULT_ACCOUNT_ID);
  const db = getDb(env);
  const [user] = await db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.email, email))).limit(1);
  if (user?.isActive) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    await db.insert(passwordResetTokens).values({
      id: `reset_${crypto.randomUUID()}`,
      accountId,
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt,
      requestedIpHash: await sha256Hex(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local"),
      requestedUserAgentHash: await sha256Hex(request.headers.get("user-agent") || "")
    });
    await logAuthEvent(env, accountId, user.id, "auth.password_reset_requested", { email });
    const resetUrl = `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`;
    await deliverAuthLink(env, "password_reset", { email, resetUrl, expiresAt });
    return json({ ok: true, message: "If an account exists for that email, password reset instructions will be sent.", resetUrl: exposeLocalAuthLinks(env) ? resetUrl : undefined });
  }
  await logAuthEvent(env, accountId, null, "auth.password_reset_requested_unknown", { email });
  return json({ ok: true, message: "If an account exists for that email, password reset instructions will be sent." });
}

export async function resetPassword(env, request, payload) {
  if (!sessionSecret(env)) return authenticationConfigurationError();
  const token = String(payload.token || "");
  const password = String(payload.password || "");
  const tokenHash = await sha256Hex(token);
  const db = getDb(env);
  const [row] = await db.select({
    resetId: passwordResetTokens.id,
    userId: passwordResetTokens.userId,
    accountId: passwordResetTokens.accountId,
    expiresAt: passwordResetTokens.expiresAt,
    usedAt: passwordResetTokens.usedAt,
    revokedAt: passwordResetTokens.revokedAt,
    email: users.email,
    fullName: users.fullName,
    role: users.role,
    avatarUrl: users.avatarUrl,
    timezone: users.timezone,
    locale: users.locale,
    isActive: users.isActive
  }).from(passwordResetTokens).leftJoin(users, eq(users.id, passwordResetTokens.userId)).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
  if (!row || row.usedAt || row.revokedAt || new Date(row.expiresAt).getTime() < Date.now()) return json({ error: "Password reset link is invalid or expired." }, 400);
  if (!row.isActive) return json({ error: "This account is inactive." }, 403);
  await db.insert(passwordCredentials).values({ userId: row.userId, passwordHash: await hashPassword(password), passwordAlgorithm: PASSWORD_ALGORITHM, mustResetPassword: false }).onConflictDoUpdate({ target: passwordCredentials.userId, set: { passwordHash: await hashPassword(password), passwordAlgorithm: PASSWORD_ALGORITHM, passwordUpdatedAt: new Date().toISOString(), mustResetPassword: false, failedAttemptCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() } });
  await db.update(passwordResetTokens).set({ usedAt: new Date().toISOString() }).where(eq(passwordResetTokens.id, row.resetId));
  await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
  await logAuthEvent(env, row.accountId, row.userId, "auth.password_reset_completed");
  const session = await createSignedSession(env, request, { id: row.userId, accountId: row.accountId, email: row.email, fullName: row.fullName, role: row.role, avatarUrl: row.avatarUrl });
  return json({ ok: true, user: toCurrentUserPayload(row), session: { expiresAt: session.expiresAt } }, { status: 200, headers: { "set-cookie": session.cookie } });
}

export async function acceptInvite(env, request, payload) {
  if (!sessionSecret(env)) return authenticationConfigurationError();
  const token = String(payload.token || "");
  const db = getDb(env);
  const [invite] = await db.select().from(invites).where(eq(invites.tokenHash, await sha256Hex(token))).limit(1);
  if (!invite || invite.acceptedAt || invite.revokedAt || new Date(invite.expiresAt).getTime() < Date.now()) return json({ error: "Invite link is invalid or expired." }, 400);
  const email = invite.email.toLowerCase();
  const fullName = String(payload.fullName || email).trim();
  const [existing] = await db.select().from(users).where(and(eq(users.accountId, invite.accountId), eq(users.email, email))).limit(1);
  const userId = existing?.id || `user_${email.replace(/[^a-z0-9]+/g, "_")}`;
  if (existing) {
    await db.update(users).set({ fullName, role: invite.role, isActive: true, updatedAt: new Date().toISOString() }).where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({ id: userId, accountId: invite.accountId, email, fullName, role: invite.role });
    await db.insert(userPreferences).values({ userId }).onConflictDoNothing();
  }
  if (payload.password) {
    await db.insert(passwordCredentials).values({ userId, passwordHash: await hashPassword(payload.password), passwordAlgorithm: PASSWORD_ALGORITHM }).onConflictDoUpdate({ target: passwordCredentials.userId, set: { passwordHash: await hashPassword(payload.password), passwordAlgorithm: PASSWORD_ALGORITHM, passwordUpdatedAt: new Date().toISOString(), mustResetPassword: false, failedAttemptCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() } });
  }
  await db.update(invites).set({ acceptedAt: new Date().toISOString() }).where(eq(invites.id, invite.id));
  await logAuthEvent(env, invite.accountId, userId, "auth.invite_accepted", { email, role: invite.role });
  const session = await createSignedSession(env, request, { id: userId, accountId: invite.accountId, email, fullName, role: invite.role, avatarUrl: existing?.avatarUrl || null });
  return json({ ok: true, user: toCurrentUserPayload({ id: userId, accountId: invite.accountId, email, fullName, role: invite.role, avatarUrl: existing?.avatarUrl || null }) }, { status: 200, headers: { "set-cookie": session.cookie } });
}

export async function changePassword(env, accountId, user, payload) {
  const db = getDb(env);
  const [credential] = await db.select().from(passwordCredentials).where(eq(passwordCredentials.userId, user.id)).limit(1);
  if (!credential || !await verifyPassword(payload.currentPassword, credential.passwordHash)) {
    await logAuthEvent(env, accountId, user.id, "auth.password_change_failed");
    return json({ error: "Current password is incorrect." }, 401);
  }
  await db.update(passwordCredentials).set({ passwordHash: await hashPassword(payload.newPassword), passwordAlgorithm: PASSWORD_ALGORITHM, passwordUpdatedAt: new Date().toISOString(), mustResetPassword: false, failedAttemptCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() }).where(eq(passwordCredentials.userId, user.id));
  await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
  await logAuthEvent(env, accountId, user.id, "auth.password_changed");
  return json({ ok: true, message: "Password changed. Please sign in again." });
}

export async function listActiveSessions(env, accountId, userId) {
  const rows = await getDb(env).select({ id: sessions.id, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt, rotatedAt: sessions.rotatedAt, revokedAt: sessions.revokedAt, userAgentHash: sessions.userAgentHash }).from(sessions).where(and(eq(sessions.accountId, accountId), eq(sessions.userId, userId))).orderBy(desc(sessions.createdAt)).limit(20);
  return json({ sessions: rows.map((row) => ({ id: row.id, createdAt: row.createdAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt, current: false })) });
}

export async function revokeSession(env, accountId, userId, sessionId) {
  await getDb(env).update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.accountId, accountId), eq(sessions.userId, userId), eq(sessions.id, sessionId)));
  await logAuthEvent(env, accountId, userId, "auth.session_revoked", { sessionId });
  return json({ ok: true });
}

export async function listAccountUsers(env, accountId) {
  const db = getDb(env);
  const [userRows, inviteRows] = await Promise.all([
    db.select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, avatarUrl: users.avatarUrl, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt }).from(users).where(eq(users.accountId, accountId)).orderBy(desc(users.createdAt)),
    db.select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, acceptedAt: invites.acceptedAt, revokedAt: invites.revokedAt, createdAt: invites.createdAt }).from(invites).where(eq(invites.accountId, accountId)).orderBy(desc(invites.createdAt)).limit(20)
  ]);
  return json({ users: userRows.map((row) => ({ ...row, permissions: permissionsForRole(row.role) })), invites: inviteRows });
}

export async function createInvite(env, request, accountId, actorUserId, payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const role = payload.role || "estimator";
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString();
  const invite = {
    id: `invite_${crypto.randomUUID()}`,
    accountId,
    email,
    role,
    invitedByUserId: actorUserId,
    tokenHash: await sha256Hex(token),
    expiresAt
  };
  await getDb(env).insert(invites).values(invite);
  const inviteUrl = `${new URL(request.url).origin}/accept-invite?token=${encodeURIComponent(token)}`;
  await deliverAuthLink(env, "invite", { email, inviteUrl, role, expiresAt });
  await logAuthEvent(env, accountId, actorUserId, "auth.invite_created", { email, role });
  return json({ invite: { id: invite.id, email, role, expiresAt, inviteUrl: exposeLocalAuthLinks(env) ? inviteUrl : undefined } }, 201);
}

export async function updateAccountUser(env, accountId, actorUserId, userId, payload) {
  const patch = {};
  if (payload.role) patch.role = payload.role;
  if (payload.isActive !== undefined) patch.isActive = Boolean(payload.isActive);
  patch.updatedAt = new Date().toISOString();
  const db = getDb(env);
  const [target] = await db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.id, userId))).limit(1);
  if (!target) return json({ error: "User not found." }, 404);
  await db.update(users).set(patch).where(eq(users.id, userId));
  if (payload.isActive === false) await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await logAuthEvent(env, accountId, actorUserId, "auth.user_updated", { userId, role: updated.role, isActive: updated.isActive });
  return json({ user: toCurrentUserPayload(updated) });
}

export async function createGoogleLoginRedirect(env, request) {
  if (!sessionSecret(env)) return authenticationConfigurationError();
  const googleConfig = googleLoginConfig(env, request);
  if (!googleConfig.clientId) return json({ error: "Google Sign-In is not configured for this environment." }, 503);
  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo") || "/");
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);
  await getDb(env).insert(oauthStates).values({
    stateHash: await sha256Hex(state),
    codeVerifierEncrypted: verifier,
    redirectTo,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account"
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
}

export async function completeGoogleLogin(env, request) {
  if (!sessionSecret(env)) return redirectAuthFailure(request, "Authentication is unavailable because the server is not securely configured.");
  const googleConfig = googleLoginConfig(env, request);
  if (!googleConfig.clientId || !googleConfig.clientSecret) return redirectAuthFailure(request, "Google Sign-In is not configured.");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return redirectAuthFailure(request, url.searchParams.get("error"));
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const [stored] = await getDb(env).select().from(oauthStates).where(and(eq(oauthStates.stateHash, await sha256Hex(state)), gt(oauthStates.expiresAt, new Date().toISOString()))).limit(1);
  if (!stored || !code) return redirectAuthFailure(request, "Google login expired. Please try again.");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      code,
      code_verifier: stored.codeVerifierEncrypted,
      grant_type: "authorization_code",
      redirect_uri: googleConfig.redirectUri
    })
  });
  if (!tokenResponse.ok) return redirectAuthFailure(request, "Google login could not be completed.");
  const tokens = await tokenResponse.json();
  const claims = parseJwt(tokens.id_token);
  const email = String(claims.email || "").toLowerCase();
  if (!email || claims.email_verified === false) return redirectAuthFailure(request, "Google did not return a verified email address.");
  const accountId = safeAccountId(env.DEFAULT_ACCOUNT_ID || DEFAULT_ACCOUNT_ID);
  const db = getDb(env);
  const googleFullName = googleProfileName(claims, email);
  const [existingUser] = await db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.email, email))).limit(1);
  if (!existingUser) return redirectAuthFailure(request, "Access is by invitation. Ask a workspace administrator to invite this Google account first.");
  const user = existingUser;
  if (!user.isActive) return redirectAuthFailure(request, "This account is inactive. Ask an administrator to restore access.");
  await db.insert(authIdentities).values({
    id: `auth_${crypto.randomUUID()}`,
    accountId,
    userId: user.id,
    provider: "google",
    providerSubject: String(claims.sub),
    email,
    emailVerified: true,
    metadataJson: JSON.stringify({ name: googleFullName, picture: claims.picture || null })
  }).onConflictDoUpdate({ target: [authIdentities.provider, authIdentities.providerSubject], set: { accountId, userId: user.id, email, emailVerified: true, updatedAt: new Date().toISOString() } });
  const fullName = shouldRefreshProfileName(user.fullName, email) ? googleFullName : user.fullName;
  await db.update(users).set({ fullName, lastLoginAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), avatarUrl: user.avatarUrl || claims.picture || null, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  const session = await createSignedSession(env, request, toPublicUser({ ...user, fullName, avatarUrl: user.avatarUrl || claims.picture || null }));
  await logAuthEvent(env, accountId, user.id, "auth.login", { provider: "google" });
  return new Response(null, { status: 302, headers: { location: safeRedirect(stored.redirectTo), "set-cookie": session.cookie } });
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
  const token = bearerToken(request) || cookieToken(request, SESSION_COOKIE);
  if (!token) return { response: json({ error: "Authentication required." }, 401) };
  let payload;
  try {
    payload = await verifySignedToken(secret, token);
  } catch (error) {
    return { response: json({ error: "Invalid authentication token.", detail: error.message }, 401) };
  }
  if (!payload.sid) return { response: json({ error: "Invalid authentication token." }, 401) };
  const validSession = await findValidSession(env, token, payload.sid);
  if (!validSession || validSession.userId !== String(payload.sub || payload.userId || "") || validSession.accountId !== safeAccountId(payload.accountId || payload.account_id || "")) return { response: json({ error: "Session expired. Please sign in again." }, 401) };
  const email = String(payload.email || "").toLowerCase();
  const accountId = safeAccountId(payload.accountId || payload.account_id || env.DEFAULT_ACCOUNT_ID || DEFAULT_ACCOUNT_ID);
  if (!email || !accountId) return { response: json({ error: "Authentication token is missing required account identity." }, 401) };
  const currentUser = await readCurrentUser(env, accountId, { id: validSession.userId });
  if (!currentUser?.is_active || currentUser.email.toLowerCase() !== email) return { response: json({ error: "Session expired. Please sign in again." }, 401) };
  return {
    accountId,
    user: {
      id: String(payload.sub || payload.userId || `user_${email.replace(/[^a-z0-9]+/g, "_")}`),
      email,
      fullName: String(payload.fullName || payload.full_name || email),
      role: payload.role || null,
      avatarUrl: payload.avatarUrl || null,
      authMode: "signed_session"
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

async function findValidSession(env, token, id) {
  const [session] = await getDb(env).select({ id: sessions.id, userId: sessions.userId, accountId: sessions.accountId, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt }).from(sessions).where(and(eq(sessions.id, id), eq(sessions.tokenHash, await sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date().toISOString()))).limit(1);
  return session || null;
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

async function createSignedSession(env, request, user) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured.");
  const sessionId = `sess_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const token = await signToken(secret, { sid: sessionId, sub: user.id, email: user.email, fullName: user.fullName, role: user.role, accountId: user.accountId, avatarUrl: user.avatarUrl || null, exp });
  await getDb(env).insert(sessions).values({
    id: sessionId,
    userId: user.id,
    accountId: user.accountId,
    tokenHash: await sha256Hex(token),
    expiresAt,
    ipHash: await sha256Hex(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local"),
    userAgentHash: await sha256Hex(request.headers.get("user-agent") || "")
  });
  return { token, expiresAt, cookie: sessionCookie(request, token, expiresAt) };
}

async function signToken(secret, payload) {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
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

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_ALGORITHM}$${PASSWORD_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(key)}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterationsText, saltText, hashText] = String(stored || "").split("$");
  if (algorithm !== PASSWORD_ALGORITHM || !iterationsText || !saltText || !hashText) return false;
  const key = await pbkdf2(password, new Uint8Array(Array.from(atob(base64UrlDecodeToBase64(saltText)), (char) => char.charCodeAt(0))), Number(iterationsText));
  return constantTimeEqual(base64UrlEncode(key), hashText);
}

async function pbkdf2(password, salt, iterations) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function logAuthEvent(env, accountId, userId, action, metadata = {}) {
  await getDb(env).insert(auditLog).values({
    id: `audit_${crypto.randomUUID()}`,
    accountId,
    actorUserId: userId || null,
    entityType: "auth",
    entityId: userId || accountId,
    action,
    afterJson: JSON.stringify(metadata)
  }).catch(() => {});
}

async function deliverAuthLink(env, type, payload) {
  const webhook = env.AUTH_LINK_WEBHOOK || env.EMAIL_PROVIDER_WEBHOOK || "";
  if (!webhook) return { status: "not_configured" };
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, ...payload })
    });
    return { status: response.ok ? "sent" : "failed", statusCode: response.status };
  } catch (error) {
    return { status: "failed", error: error.message };
  }
}

function exposeLocalAuthLinks(env) {
  return env.EXPOSE_AUTH_LINKS === "true";
}

function sessionSecret(env) {
  const secret = String(env?.AUTH_SESSION_SECRET || "").trim();
  return secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : "";
}

function authenticationConfigurationError() {
  return json({ error: "Authentication is unavailable because the server is not securely configured." }, 503);
}

function toCurrentUserPayload(user) {
  return {
    id: user.id,
    accountId: user.account_id || user.accountId,
    accountName: user.accountName || "DC Decom",
    email: user.email,
    fullName: user.full_name || user.fullName,
    role: user.role,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
    timezone: user.timezone || "America/New_York",
    locale: user.locale || "en-US",
    permissions: permissionsForRole(user.role),
    integrations: {},
    featureFlags: { googleSignIn: true, personalizedWorkspace: true }
  };
}

function toPublicUser(user) {
  return {
    id: user.id,
    accountId: user.account_id || user.accountId,
    email: user.email,
    fullName: user.full_name || user.fullName,
    role: user.role,
    avatarUrl: user.avatar_url || user.avatarUrl || null
  };
}

function permissionsForRole(role) {
  const base = ["inquiries:read", "documents:read", "profile:update"];
  if (WRITE_ROLES.has(role)) base.push("inquiries:write", "documents:write", "communications:send");
  if (ADMIN_ROLES.has(role)) base.push("users:manage", "integrations:manage", "audit:read");
  return base;
}

function sessionCookie(request, token, expiresAt) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${cookieSecureSuffix(request)}`;
}

function expireSessionCookie(request) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecureSuffix(request)}`;
}

function cookieSecureSuffix(request) {
  const url = new URL(request.url);
  return url.protocol === "https:" ? "; Secure" : "";
}

function randomToken(byteLength = 32) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function googleProfileName(claims, email) {
  const directName = cleanName(claims.name);
  if (directName) return directName;
  const nameParts = [claims.given_name, claims.family_name].map(cleanName).filter(Boolean);
  return nameParts.length ? nameParts.join(" ") : nameFromEmail(email);
}

function shouldRefreshProfileName(fullName, email) {
  const current = cleanName(fullName);
  if (!current) return true;
  const lowerCurrent = current.toLowerCase();
  const lowerEmail = String(email || "").toLowerCase();
  return lowerCurrent === lowerEmail || lowerCurrent === nameFromEmail(email).toLowerCase();
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nameFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "DC Decom User";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "DC Decom User";
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function googleLoginConfig(env, request) {
  return {
    clientId: env.GOOGLE_LOGIN_CLIENT_ID || env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: env.GOOGLE_LOGIN_REDIRECT_URI || `${new URL(request.url).origin}/api/auth/google/callback`
  };
}

function redirectAuthFailure(request, message) {
  const params = new URLSearchParams({ auth: "error", message: String(message || "Authentication failed.") });
  return Response.redirect(`${new URL(request.url).origin}/login?${params.toString()}`, 302);
}

function safeRedirect(value) {
  const path = String(value || "/");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function parseJwt(token) {
  const [, body] = String(token || "").split(".");
  if (!body) return {};
  try {
    return JSON.parse(base64UrlDecode(body));
  } catch {
    return {};
  }
}

function base64UrlDecodeToBase64(value) {
  return String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
}

function safeAccountId(value) {
  const accountId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{3,80}$/.test(accountId) ? accountId : DEFAULT_ACCOUNT_ID;
}
