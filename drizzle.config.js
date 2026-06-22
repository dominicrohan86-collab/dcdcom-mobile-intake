import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/drizzle-schema.js",
  out: "./db/migrations"
});
