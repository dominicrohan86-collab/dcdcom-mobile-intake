import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/drizzle-schema.js";

const clients = new WeakMap();
const prepared = new WeakSet();

export async function ensureDatabase(env) {
  if (!env?.DB) return false;
  if (!prepared.has(env.DB)) {
    await ensureProductionAuthStorage(env.DB);
    await ensureNotificationStorage(env.DB);
    prepared.add(env.DB);
  }
  return true;
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

async function ensureNotificationStorage(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    user_id text NOT NULL,
    inquiry_id text,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    severity text DEFAULT 'info' NOT NULL,
    status text DEFAULT 'unread' NOT NULL,
    action_label text,
    action_route text,
    metadata_json text DEFAULT '{}' NOT NULL,
    dedupe_key text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    read_at text,
    archived_at text,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications (account_id, user_id, status, created_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_inquiry ON notifications (inquiry_id, created_at)").run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe ON notifications (account_id, user_id, dedupe_key)").run();
}

async function ensureProductionAuthStorage(DB) {
  for (const statement of [
    "ALTER TABLE users ADD COLUMN timezone text DEFAULT 'America/New_York' NOT NULL",
    "ALTER TABLE users ADD COLUMN locale text DEFAULT 'en-US' NOT NULL",
    "ALTER TABLE users ADD COLUMN last_login_at text",
    "ALTER TABLE users ADD COLUMN last_seen_at text",
    "ALTER TABLE activity_events ADD COLUMN visibility text DEFAULT 'internal' NOT NULL",
    "ALTER TABLE activity_events ADD COLUMN source text DEFAULT 'app' NOT NULL",
    "ALTER TABLE files ADD COLUMN content_hash text",
    "ALTER TABLE files ADD COLUMN thumbnail_storage_key text",
    "ALTER TABLE files ADD COLUMN thumbnail_content_type text",
    "ALTER TABLE files ADD COLUMN thumbnail_status text DEFAULT 'pending' NOT NULL",
    "ALTER TABLE files ADD COLUMN thumbnail_generated_at text"
  ]) {
    await DB.prepare(statement).run().catch(() => {});
  }
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_files_inquiry_hash ON files (inquiry_id, content_hash)").run().catch(() => {});

  await DB.prepare(`CREATE TABLE IF NOT EXISTS inquiry_comments (
    id text PRIMARY KEY NOT NULL,
    inquiry_id text NOT NULL,
    author_user_id text,
    body text NOT NULL,
    mentions_json text DEFAULT '[]' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    edited_at text,
    deleted_at text,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_inquiry ON inquiry_comments (inquiry_id, created_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_author ON inquiry_comments (author_user_id, created_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS file_share_links (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    file_id text NOT NULL,
    inquiry_id text,
    token_hash text NOT NULL,
    label text,
    created_by_user_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at text NOT NULL,
    revoked_at text,
    last_accessed_at text,
    access_count integer DEFAULT 0 NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE cascade,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_file_share_token ON file_share_links (token_hash)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_file_shares_file ON file_share_links (file_id, revoked_at, expires_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_file_shares_account ON file_share_links (account_id, created_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS file_retention_policies (
    account_id text PRIMARY KEY NOT NULL,
    retention_days integer DEFAULT 365 NOT NULL,
    archive_after_days integer DEFAULT 180 NOT NULL,
    legal_hold integer DEFAULT false NOT NULL,
    updated_by_user_id text,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS auth_identities (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text NOT NULL,
    email_verified integer DEFAULT false NOT NULL,
    metadata_json text DEFAULT '{}' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_identity_subject ON auth_identities (provider, provider_subject)").run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_identity_account_email ON auth_identities (account_id, provider, email)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities (user_id)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS password_credentials (
    user_id text PRIMARY KEY NOT NULL,
    password_hash text NOT NULL,
    password_algorithm text DEFAULT 'pbkdf2_sha256' NOT NULL,
    password_updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    must_reset_password integer DEFAULT false NOT NULL,
    failed_attempt_count integer DEFAULT 0 NOT NULL,
    locked_until text,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    token_hash text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at text NOT NULL,
    rotated_at text,
    revoked_at text,
    ip_hash text,
    user_agent_hash text,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_token_hash ON sessions (token_hash)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, revoked_at, expires_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash text PRIMARY KEY NOT NULL,
    code_verifier_encrypted text NOT NULL,
    redirect_to text DEFAULT '/' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at text NOT NULL
  )`).run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS invites (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'estimator' NOT NULL,
    invited_by_user_id text,
    token_hash text NOT NULL,
    expires_at text NOT NULL,
    accepted_at text,
    revoked_at text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_invites_token_hash ON invites (token_hash)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_invites_account_email ON invites (account_id, email)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    token_hash text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at text NOT NULL,
    used_at text,
    revoked_at text,
    requested_ip_hash text,
    requested_user_agent_hash text,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash ON password_reset_tokens (token_hash)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id, used_at, expires_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS user_saved_views (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    screen text NOT NULL,
    name text NOT NULL,
    filters_json text DEFAULT '{}' NOT NULL,
    sort_json text DEFAULT '{}' NOT NULL,
    is_default integer DEFAULT false NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_saved_views_user_screen ON user_saved_views (user_id, screen)").run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_views_user_screen_name ON user_saved_views (user_id, screen, name)").run().catch(() => {});

  await DB.prepare(`CREATE TABLE IF NOT EXISTS user_recent_items (
    user_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    last_viewed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata_json text DEFAULT '{}' NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_recent_items ON user_recent_items (user_id, entity_type, entity_id)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_recent_items_user ON user_recent_items (user_id, last_viewed_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS device_push_subscriptions (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    endpoint text NOT NULL,
    keys_json text DEFAULT '{}' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at text,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_push_endpoint ON device_push_subscriptions (endpoint)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_push_user ON device_push_subscriptions (user_id, revoked_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS inquiry_watchers (
    id text PRIMARY KEY NOT NULL,
    inquiry_id text NOT NULL,
    user_id text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uq_inquiry_watchers ON inquiry_watchers (inquiry_id, user_id)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_inquiry_watchers_user ON inquiry_watchers (user_id, created_at)").run();
}
