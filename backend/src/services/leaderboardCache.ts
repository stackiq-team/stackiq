import fs from "fs/promises";
import path from "path";
import type { LeaderboardCachePayload } from "./leaderboardTypes";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "leaderboard.json");

export async function loadLeaderboardCache(): Promise<LeaderboardCachePayload | null> {
  try {
    const fileContents = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(fileContents) as LeaderboardCachePayload;
    if (!parsed?.lastUpdatedAt || !parsed?.leaderboards) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLeaderboardCache(payload: LeaderboardCachePayload): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), "utf-8");
}
