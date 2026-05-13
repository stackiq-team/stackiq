import { Client } from "pg";

export const db = new Client({
  connectionString: process.env.DATABASE_URL,
});

export async function connectDB() {
  await db.connect();
  console.log("Database connected");
}