import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCache = {
  lastUpdatedAt: new Date().toISOString(),
  leaderboards: {
    popular: [
      {
        owner: "facebook",
        name: "react",
        fullName: "facebook/react",
        description: "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
        url: "https://github.com/facebook/react",
        stars: 100000,
        forks: 20000,
        watchers: 50000,
        issues: 1500,
        pullRequests: 300,
        license: "MIT",
        primaryLanguage: "JavaScript",
        topics: ["react", "javascript", "library"],
        createdAt: "2013-05-24T16:15:54Z",
        pushedAt: "2026-07-01T00:00:00Z",
        popularityScore: 100,
        activityScore: 100,
        compatibilityScore: 100,
        score: 100,
      },
    ],
    active: [],
    bestRanked: [],
  },
};

vi.mock("../../services/leaderboardService", () => ({
  getLeaderboards: vi.fn(),
}));

import * as LeaderboardService from "../../services/leaderboardService";
import { app } from "../../app";

describe("GET /leaderboards", () => {
  const getLeaderboardsMock = LeaderboardService.getLeaderboards as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached leaderboards successfully", async () => {
    getLeaderboardsMock.mockResolvedValue(mockCache);

    const response = await request(app).get("/leaderboards");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Success");
    expect(response.body.lastUpdatedAt).toBe(mockCache.lastUpdatedAt);
    expect(response.body.leaderboards.popular[0].fullName).toBe("facebook/react");
    expect(getLeaderboardsMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when leaderboard service fails", async () => {
    getLeaderboardsMock.mockRejectedValue(new Error("GitHub unavailable"));

    const response = await request(app).get("/leaderboards");

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toBe("GitHub unavailable");
  });
});
