import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function createLocalEnv(options = {}) {
  const root = resolve(options.root || ".");
  const localRoot = resolve(root, ".local");
  await mkdir(localRoot, { recursive: true });
  return {
    DB: new LocalD1(resolve(localRoot, "dcdcom.sqlite")),
    FILES: new LocalR2(resolve(localRoot, "r2")),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.5",
    EMAIL_PROVIDER_WEBHOOK: process.env.EMAIL_PROVIDER_WEBHOOK || "",
    SMS_PROVIDER_WEBHOOK: process.env.SMS_PROVIDER_WEBHOOK || "",
    COMMUNICATION_PROVIDER_WEBHOOK: process.env.COMMUNICATION_PROVIDER_WEBHOOK || ""
  };
}

class LocalD1 {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new LocalD1Statement(this.db, sql);
  }

  async batch(statements) {
    const results = [];
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return results;
  }
}

class LocalD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.bindings) };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.bindings) || null;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid)
      }
    };
  }
}

class LocalR2 {
  constructor(root) {
    this.root = root;
  }

  async put(key, value, options = {}) {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    const buffer = await toBuffer(value);
    await writeFile(path, buffer);
    await writeFile(`${path}.meta.json`, JSON.stringify({
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
      size: buffer.length
    }, null, 2));
    return { key, size: buffer.length };
  }

  async get(key) {
    try {
      const path = this.pathFor(key);
      const [buffer, metaText] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta.json`, "utf8").catch(() => "{}")
      ]);
      const meta = JSON.parse(metaText || "{}");
      return {
        key,
        size: buffer.length,
        httpMetadata: meta.httpMetadata || {},
        customMetadata: meta.customMetadata || {},
        body: new Blob([buffer], { type: meta.httpMetadata?.contentType || "application/octet-stream" }).stream()
      };
    } catch {
      return null;
    }
  }

  pathFor(key) {
    const safeKey = String(key).replace(/(^|\/)\.\.(\/|$)/g, "").replace(/^\/+/, "");
    return resolve(this.root, safeKey);
  }
}

async function toBuffer(value) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value);
  if (value?.arrayBuffer) return Buffer.from(await value.arrayBuffer());
  if (value?.getReader) {
    const chunks = [];
    const reader = value.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported R2 body type for local runtime.");
}
