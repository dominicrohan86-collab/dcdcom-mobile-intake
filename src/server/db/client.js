import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../db/schema/drizzle-schema.js";

const clients = new WeakMap();
const prepared = new WeakSet();

export async function ensureDatabase(env) {
  if (!env?.DB) return false;
  if (!prepared.has(env.DB)) {
    await ensureProductionAuthStorage(env.DB);
    await retireLegacyDemoIdentity(env.DB);
    await ensureNotificationStorage(env.DB);
    await ensureChatStorage(env.DB);
    prepared.add(env.DB);
  }
  return true;
}

async function retireLegacyDemoIdentity(DB) {
  const legacyUserId = "user_alex_dcdcom_com";
  const revokedAt = new Date().toISOString();
  await DB.prepare("DELETE FROM password_credentials WHERE user_id = ?").bind(legacyUserId).run().catch(() => {});
  await DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(revokedAt, legacyUserId).run().catch(() => {});
  await DB.prepare("UPDATE password_reset_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(revokedAt, legacyUserId).run().catch(() => {});
  await DB.prepare("UPDATE users SET is_active = false, updated_at = ? WHERE id = ?").bind(revokedAt, legacyUserId).run().catch(() => {});
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

async function ensureChatStorage(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS chat_sessions (
    id text PRIMARY KEY NOT NULL,
    account_id text NOT NULL,
    created_by_user_id text,
    scope text DEFAULT 'workspace' NOT NULL,
    inquiry_id text,
    title text NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE set null,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (account_id, created_by_user_id, updated_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_sessions_inquiry ON chat_sessions (account_id, inquiry_id, updated_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
    id text PRIMARY KEY NOT NULL,
    session_id text NOT NULL,
    account_id text NOT NULL,
    inquiry_id text,
    role text NOT NULL,
    body text NOT NULL,
    metadata_json text DEFAULT '{}' NOT NULL,
    created_by_user_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE cascade,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_account ON chat_messages (account_id, created_at)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS chat_sources (
    id text PRIMARY KEY NOT NULL,
    message_id text NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    label text NOT NULL,
    excerpt text,
    confidence_score integer,
    metadata_json text DEFAULT '{}' NOT NULL,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE cascade
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_sources_message ON chat_sources (message_id)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_sources_entity ON chat_sources (source_type, source_id)").run();

  await DB.prepare(`CREATE TABLE IF NOT EXISTS chat_files (
    id text PRIMARY KEY NOT NULL,
    session_id text NOT NULL,
    account_id text NOT NULL,
    inquiry_id text,
    file_id text,
    storage_key text NOT NULL,
    file_name text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer,
    content_hash text,
    extracted_text text,
    extraction_status text DEFAULT 'pending' NOT NULL,
    retention_expires_at text,
    uploaded_by_user_id text,
    uploaded_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE cascade,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE cascade,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE cascade,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE set null,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE set null
  )`).run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_files_session ON chat_files (session_id, uploaded_at)").run();
  await DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_files_account ON chat_files (account_id, uploaded_at)").run();
  await DB.prepare("ALTER TABLE chat_files ADD COLUMN retention_expires_at text").run().catch(() => {});
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
