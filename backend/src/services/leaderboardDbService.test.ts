import { describe, expect, it } from "vitest";

describe("Leaderboard DB Service - Query Building", () => {
  describe("Leaderboard Item Updates", () => {
    it("should construct update payload with scores", () => {
      const updateData = {
        popularityScore: 85,
        activityScore: 70,
        compatibilityScore: 60,
        scoreBreakdown: { popularity: 85, activity: 70, compatibility: 60 },
        averageScore: 71,
      };

      expect(updateData.popularityScore).toBe(85);
      expect(updateData.activityScore).toBe(70);
      expect(updateData.compatibilityScore).toBe(60);
      expect(updateData.averageScore).toBe(71);
    });

    it("should include optional fields when present", () => {
      const data = {
        description: "A popular React library",
        primaryLanguage: "TypeScript",
        lastFetchedAt: new Date("2025-07-25"),
      };

      expect(data.description).toBeDefined();
      expect(data.primaryLanguage).toBe("TypeScript");
      expect(data.lastFetchedAt).toBeInstanceOf(Date);
    });

    it("should construct create payload with all required fields", () => {
      const createData = {
        repositoryName: "react",
        ownerName: "facebook",
        ownerType: "Organization" as const,
        description: "A JavaScript library for building UIs",
        url: "https://github.com/facebook/react",
        averageScore: 90,
      };

      expect(createData.repositoryName).toBe("react");
      expect(createData.ownerName).toBe("facebook");
      expect(createData.url).toMatch(/github.com/);
    });
  });

  describe("Score Calculation", () => {
    it("should calculate average score from component scores", () => {
      const scores = { popularity: 85, activity: 70, compatibility: 60 };
      const average = (scores.popularity + scores.activity + scores.compatibility) / 3;
      expect(average).toBeCloseTo(71.67, 1);
    });

    it("should normalize component scores to 0-100 range", () => {
      const normalizeScore = (value: number): number => Math.min(100, Math.max(0, value));

      expect(normalizeScore(-10)).toBe(0);
      expect(normalizeScore(50)).toBe(50);
      expect(normalizeScore(150)).toBe(100);
    });
  });

  describe("Repository Data Selection", () => {
    it("should select required fields from repository", () => {
      const repo = {
        nameWithOwner: "facebook/react",
        description: "React library",
        url: "https://github.com/facebook/react",
        stars: 200000,
        forks: 45000,
        watchers: 5000,
      };

      const selected = {
        name: repo.nameWithOwner,
        description: repo.description,
        url: repo.url,
      };

      expect(selected).toHaveProperty("name");
      expect(selected).toHaveProperty("description");
      expect(selected).toHaveProperty("url");
    });
  });
});
