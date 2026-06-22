import { and, eq } from "drizzle-orm";
import { getDb, json } from "./db.js";
import { users } from "../../db/drizzle-schema.js";

const WRITE_ROLES = new Set(["admin", "estimator", "project_manager", "sales"]);
const ADMIN_ROLES = new Set(["admin", "project_manager"]);

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
