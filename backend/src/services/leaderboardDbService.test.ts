import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("../db/client", () => ({
  prisma: {
    leaderboardRepository: {
      findMany: findManyMock,
    },
  },
}));

import { getLeaderboardsFromDb } from "./leaderboardDbService";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    owner: "facebook",
    name: "react",
    fullName: "facebook/react",
    description: "React",
    url: "https://github.com/facebook/react",
    stars: 1,
    forks: 2,
    watchers: 3,
    issues: 4,
    pullRequests: 5,
    license: "MIT",
    primaryLanguage: "TypeScript",
    topics: ["react"],
    repositoryCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    pushedAt: new Date("2026-01-02T00:00:00.000Z"),
    githubPopularityScore: 90,
    githubActivityScore: 80,
    githubCompatibilityScore: 70,
    analysisScore: 88,
    analysisStatus: "COMPLETED",
    analysisResultToken: "token-1",
    packageJsonPresent: true,
    ...overrides,
  };
}

describe("getLeaderboardsFromDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXPLORE_TOP_LIMIT;
    delete process.env.LEADERBOARD_TOP_LIMIT;

    findManyMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([makeRow({ fullName: "vercel/next.js", name: "next.js" })])
      .mockResolvedValueOnce([makeRow({ fullName: "vuejs/core", name: "core" })]);
  });

  it("queries all categories and maps db rows", async () => {
    const result = await getLeaderboardsFromDb(7);

    expect(findManyMock).toHaveBeenNthCalledWith(1, {
      where: { category: "popular" },
      orderBy: [{ rank: "asc" }],
      take: 7,
    });
    expect(findManyMock).toHaveBeenNthCalledWith(2, {
      where: { category: "active" },
      orderBy: [{ rank: "asc" }],
      take: 3,
    });
    expect(findManyMock).toHaveBeenNthCalledWith(3, {
      where: { category: "bestRanked" },
      orderBy: [{ rank: "asc" }],
      take: 3,
    });

    expect(result.lastUpdatedAt).toEqual(expect.any(String));
    expect(result.leaderboards.popular[0]).toMatchObject({
      fullName: "facebook/react",
      createdAt: "2026-01-01T00:00:00.000Z",
      pushedAt: "2026-01-02T00:00:00.000Z",
      popularityScore: 90,
      activityScore: 80,
      compatibilityScore: 70,
      analysisScore: 88,
      analysisStatus: "COMPLETED",
      analysisResultToken: "token-1",
      packageJsonPresent: true,
    });
  });

  it("uses EXPLORE_TOP_LIMIT when no argument is provided", async () => {
    process.env.EXPLORE_TOP_LIMIT = "5.9";
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);

    await getLeaderboardsFromDb();

    expect(findManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 5 })
    );
  });

  it("falls back to default popular limit when config is invalid", async () => {
    process.env.EXPLORE_TOP_LIMIT = "not-a-number";
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);

    await getLeaderboardsFromDb();

    expect(findManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 3 })
    );
  });
});
