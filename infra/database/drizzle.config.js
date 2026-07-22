import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  // Drizzle Kit resolves migration paths internally. Keeping these project-relative
  // prevents it from prefixing an already absolute path while loading snapshots.
  schema: "./db/schema/drizzle-schema.js",
  out: "./db/migrations"
});
