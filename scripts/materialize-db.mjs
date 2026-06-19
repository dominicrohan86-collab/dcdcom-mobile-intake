import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const schemaPath = resolve(root, "db", "schema.ts");
const source = await readFile(schemaPath, "utf8");
const matches = [...source.matchAll(/`([\s\S]*?)`/g)];
const statements = matches.map((match) => match[1].trim());
const sql = `${statements.join(";\n\n")};\n`;

await mkdir(resolve(root, "db", "migrations"), { recursive: true });
await mkdir(resolve(root, "src", "server"), { recursive: true });
await writeFile(resolve(root, "db", "schema.sql"), sql);
await writeFile(resolve(root, "db", "migrations", "0001_initial.sql"), sql);
await cp(schemaPath, resolve(root, "src", "server", "schema.js"));
