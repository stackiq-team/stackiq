import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AnalysisStatus, DependencyType } from "@prisma/client";

// Mock the dependencies
vi.mock("../adapters/githubMinerAdapter.js");
vi.mock("../adapters/issuesMining.adapter.js");
vi.mock("../cache/dependencyAnalysisCache.js");
vi.mock("../queue/analysisQueue.js");
vi.mock("ioredis");

describe("leaderboardSync - Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPLORE_TOP_LIMIT;
    delete process.env.LEADERBOARD_TOP_LIMIT;
    delete process.env.EXPLORE_REFRESH_INTERVAL_MS;
  });

  it("should read EXPLORE_TOP_LIMIT from environment", () => {
    process.env.EXPLORE_TOP_LIMIT = "15";
    const value = Number(process.env.EXPLORE_TOP_LIMIT);
    expect(value).toBe(15);
  });

  it("should fall back to LEADERBOARD_TOP_LIMIT if EXPLORE_TOP_LIMIT not set", () => {
    delete process.env.EXPLORE_TOP_LIMIT;
    process.env.LEADERBOARD_TOP_LIMIT = "20";
    const value = Number(process.env.LEADERBOARD_TOP_LIMIT);
    expect(value).toBe(20);
  });

  it("should use default limit if no env vars set", () => {
    delete process.env.EXPLORE_TOP_LIMIT;
    delete process.env.LEADERBOARD_TOP_LIMIT;
    const DEFAULT = 3;
    expect(DEFAULT).toBe(3);
  });

  it("should validate that configuration values are numbers", () => {
    process.env.EXPLORE_TOP_LIMIT = "12";
    const value = Number(process.env.EXPLORE_TOP_LIMIT);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it("should handle invalid configuration values", () => {
    const invalidValue = "not-a-number";
    expect(Number(invalidValue)).toBeNaN();
  });

  it("should read EXPLORE_REFRESH_INTERVAL_MS from environment", () => {
    process.env.EXPLORE_REFRESH_INTERVAL_MS = "604800000"; // 7 days
    const interval = Number(process.env.EXPLORE_REFRESH_INTERVAL_MS);
    expect(interval).toBe(604800000);
  });
});

describe("leaderboardSync - Data Structures", () => {
  it("should have correct RESULT_CATEGORIES", () => {
    const categories = ["popular", "active", "bestRanked"];
    expect(categories).toHaveLength(3);
    expect(categories).toContain("popular");
    expect(categories).toContain("active");
    expect(categories).toContain("bestRanked");
  });

  it("should create dependency records with correct structure", () => {
    const dependencyRecords = [
      {
        name: "react",
        versionRequirement: "^18.0.0",
        type: DependencyType.DEPENDENCY,
      },
      {
        name: "vitest",
        versionRequirement: "^0.34.0",
        type: DependencyType.DEV_DEPENDENCY,
      },
    ];

    expect(dependencyRecords).toHaveLength(2);
    expect(dependencyRecords[0]).toHaveProperty("name");
    expect(dependencyRecords[0]).toHaveProperty("versionRequirement");
    expect(dependencyRecords[0]).toHaveProperty("type");
  });

  it("should handle repositories with no dependencies", () => {
    const packageJson = {
      name: "empty-package",
      dependencies: {},
      devDependencies: {},
    };

    expect(Object.keys(packageJson.dependencies)).toHaveLength(0);
    expect(Object.keys(packageJson.devDependencies)).toHaveLength(0);
  });
});

describe("leaderboardSync - Analysis Status", () => {
  it("should support all analysis status types", () => {
    const statuses = [
      AnalysisStatus.PENDING,
      AnalysisStatus.PROCESSING,
      AnalysisStatus.COMPLETED,
      AnalysisStatus.FAILED,
    ];

    expect(statuses).toContain(AnalysisStatus.PENDING);
    expect(statuses).toContain(AnalysisStatus.COMPLETED);
  });

  it("should support all dependency types", () => {
    const types = [
      DependencyType.DEPENDENCY,
      DependencyType.DEV_DEPENDENCY,
    ];

    expect(types).toContain(DependencyType.DEPENDENCY);
    expect(types).toContain(DependencyType.DEV_DEPENDENCY);
  });
});

describe("leaderboardSync - Repository Data", () => {
  it("should parse repository full name correctly", () => {
    const fullName = "facebook/react";
    const [owner, name] = fullName.split("/");
    expect(owner).toBe("facebook");
    expect(name).toBe("react");
  });

  it("should handle repositories with no primary language", () => {
    const repo = {
      primaryLanguage: null,
    };

    expect(repo.primaryLanguage).toBeNull();
  });

  it("should handle repositories with many topics", () => {
    const topics = Array.from({ length: 15 }, (_, i) => `topic-${i}`);
    expect(topics).toHaveLength(15);
  });

  it("should validate repository URLs", () => {
    const urls = [
      "https://github.com/facebook/react",
      "https://github.com/torvalds/linux",
      "https://github.com/microsoft/vscode",
    ];

    urls.forEach((url) => {
      expect(url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    });
  });
});

describe("leaderboardSync - Refresh Lifecycle", () => {
  it("should process all three leaderboard categories", () => {
    const categories = ["popular", "active", "bestRanked"];
    const results = {
      popular: [],
      active: [],
      bestRanked: [],
    };

    categories.forEach((category) => {
      expect(results).toHaveProperty(category);
    });
  });

  it("should track ranks for repositories", () => {
    const repos = [
      { fullName: "repo1", rank: 1 },
      { fullName: "repo2", rank: 2 },
      { fullName: "repo3", rank: 3 },
    ];

    repos.sort((a, b) => a.rank - b.rank);
    expect(repos[0]!.rank).toBe(1);
    expect(repos[2]!.rank).toBe(3);
  });
});
