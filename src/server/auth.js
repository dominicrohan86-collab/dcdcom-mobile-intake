import { first, json } from "./db.js";

const WRITE_ROLES = new Set(["admin", "estimator", "project_manager", "sales"]);
const ADMIN_ROLES = new Set(["admin", "project_manager"]);

export async function requireWriteAccess(env, accountId, user) {
  return requireRole(env, accountId, user, WRITE_ROLES);
}

export async function requireAdminAccess(env, accountId, user) {
  return requireRole(env, accountId, user, ADMIN_ROLES);
}

export async function readCurrentUser(env, accountId, user) {
  return first(env, `
    SELECT id, account_id, email, full_name, role, is_active
    FROM users
    WHERE account_id = ? AND id = ?
    LIMIT 1
  `, [accountId, user.id]);
}

async function requireRole(env, accountId, user, allowedRoles) {
  const currentUser = await readCurrentUser(env, accountId, user);
  if (!currentUser || currentUser.is_active !== 1) {
    return json({ error: "User is not active in this workspace." }, 403);
  }
  if (!allowedRoles.has(currentUser.role)) {
    return json({ error: "You do not have permission to perform this action.", role: currentUser.role }, 403);
  }
  return null;
}
