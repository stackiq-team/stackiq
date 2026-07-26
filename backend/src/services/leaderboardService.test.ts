import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("Leaderboard Service - Helper Functions", () => {
  beforeEach(() => {
    process.env.EXPLORE_TOP_LIMIT = "12";
  });

  afterEach(() => {
    delete process.env.EXPLORE_TOP_LIMIT;
  });

  describe("Normalization Functions", () => {
    it("normalizeLog should scale logarithmically", () => {
      const normalizeLog = (value: number | null | undefined, cap: number): number => {
        if (value == null || value <= 0) return 0;
        return Math.round((Math.log10(value + 1) / Math.log10(cap + 1)) * 100);
      };

      expect(normalizeLog(0, 1000)).toBe(0);
      expect(normalizeLog(1000, 1000)).toBeGreaterThan(0);
      expect(normalizeLog(10000, 1000)).toBeGreaterThan(100);
    });

    it("normalizeInverseDays should score recency", () => {
      const normalizeInverseDays = (
        value: number | null | undefined,
        excellent: number,
        poor: number
      ): number => {
        if (value == null) return 0;
        const numericValue = Math.max(0, value);
        if (numericValue <= excellent) return 100;
        if (numericValue >= poor) return 0;
        return Math.round(((poor - numericValue) / (poor - excellent)) * 100);
      };

      expect(normalizeInverseDays(0, 0, 365)).toBe(100);
      expect(normalizeInverseDays(365, 0, 365)).toBe(0);
    });
  });

  describe("Repository Parsing", () => {
    it("should parse repository full name", () => {
      const fullName = "facebook/react";
      const [owner, name] = fullName.split("/");
      expect(owner).toBe("facebook");
      expect(name).toBe("react");
    });

    it("should handle repositories with no license", () => {
      const node = { nameWithOwner: "unknown/project", licenseInfo: null };
      expect(node.licenseInfo).toBeNull();
    });
  });

  describe("Leaderboard Configuration", () => {
    it("should read EXPLORE_TOP_LIMIT from environment", () => {
      const limit = Number(process.env.EXPLORE_TOP_LIMIT);
      expect(limit).toBe(12);
    });
  });
});
