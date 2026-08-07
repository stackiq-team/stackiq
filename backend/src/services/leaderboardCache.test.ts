import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock, mkdirMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    readFile: readFileMock,
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
  readFile: readFileMock,
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

import { loadLeaderboardCache, saveLeaderboardCache } from "./leaderboardCache";

describe("leaderboard cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and parses cached leaderboard payload", async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        lastUpdatedAt: "2026-08-03T00:00:00.000Z",
        leaderboards: {
          popular: [],
          active: [],
          bestRanked: [],
        },
      })
    );

    const result = await loadLeaderboardCache();

    expect(result).toMatchObject({
      lastUpdatedAt: "2026-08-03T00:00:00.000Z",
      leaderboards: {
        popular: [],
        active: [],
        bestRanked: [],
      },
    });
  });

  it("returns null for malformed cache payload", async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ foo: "bar" }));

    await expect(loadLeaderboardCache()).resolves.toBeNull();
  });

  it("returns null when cache file cannot be read", async () => {
    readFileMock.mockRejectedValueOnce(new Error("missing"));

    await expect(loadLeaderboardCache()).resolves.toBeNull();
  });

  it("creates cache directory and writes formatted json", async () => {
    mkdirMock.mockResolvedValueOnce(undefined);
    writeFileMock.mockResolvedValueOnce(undefined);

    await saveLeaderboardCache({
      lastUpdatedAt: "2026-08-03T00:00:00.000Z",
      leaderboards: {
        popular: [],
        active: [],
        bestRanked: [],
      },
    });

    expect(mkdirMock).toHaveBeenCalledWith(
      expect.stringContaining(".cache"),
      { recursive: true }
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining("leaderboard.json"),
      expect.stringContaining('"lastUpdatedAt"'),
      "utf-8"
    );
  });
});
