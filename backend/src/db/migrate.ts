import fs from "fs";
import path from "path";
import { db } from "./client";

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function hasMigration(name: string) {
  const res = await db.query(
    "SELECT 1 FROM migrations WHERE name = $1",
    [name]
  );
  return (res.rowCount ?? 0) > 0;
}

async function markMigration(name: string) {
  await db.query(
    "INSERT INTO migrations(name) VALUES ($1)",
    [name]
  );
}

export async function runMigrations() {
  await ensureMigrationsTable();

  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).sort();

  for (const file of files) {
    if (await hasMigration(file)) {
      console.log("Skipping:", file);
      continue;
    }

    console.log("Running:", file);

    const sql = fs.readFileSync(path.join(dir, file), "utf-8");

    await db.query(sql);
    await markMigration(file);
  }

  console.log("All migrations done");
}