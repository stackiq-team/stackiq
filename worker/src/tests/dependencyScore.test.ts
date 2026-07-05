import { DependencyType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  normalizeCappedMetric,
  normalizeInverseDays,
  normalizeInverseRate,
  normalizeLogMetric,
  normalizeRate,
  scoreDependencies,
  scoreDependency,
} from "../dependencyScore.js";

const dependency = {
  id: "dependency-1",
  name: "react",
  versionRequirement: "^19.0.0",
  type: DependencyType.DEPENDENCY,
};

const gitHubMetrics = {
  dependencyId: "dependency-1",
  packageName: "react",
  repository: {
    owner: "facebook",
    name: "react",
    fullName: "facebook/react",
    description: "React",
    url: "https://github.com/facebook/react",
    createdAt: "2015-01-01",
  },
  stars: 100000,
  forks: 20000,
  watchers: 5000,
  contributors: 100,
  createdAt: "2015-01-01",
  projectAgeDays: 365 * 5,
  pullRequests: 20000,
  issues: 100,
  license: "MIT",
  languages: ["JavaScript"],
  primaryLanguage: "JavaScript",
  topics: ["react"],
  created_at: "2015-01-01",
  npm: {
    weeklyDownloads: 10000000,
    packageAgeDays: 365 * 5,
    latestPublishAgeDays: 0,
    versionCount: 100,
    dependencyCount: 0,
    devDependencyCount: 0,
    hasLicense: true,
    hasRepository: true,
    hasReadme: true,
  },
};

const issueMetrics = {
  totalIssuesAnalyzed: 10,
  openIssues: 0,
  closedIssues: 10,
  closedIssuesAnalyzed: 10,
  recentActivityCount: 4,
  averageResolutionTimeHours: 7 * 24,
  averageResolutionTimeDays: 7,
  averageFirstResponseTimeDays: 1,
  firstResponseTimeHours: 24,
  closureRate: 1,
  noResponseRate: 0,
  closeRateByPR: 1,
  closedByPrRate: 1,
  closedByPRRate: 1,
  codeResolutionRate: 1,
  postCloseActivityRate: 0,
  openToAssignedTimeHours: 24,
  mergedPRRate: 1,
  uncodedCloseRate: 0,
};

describe("dependency scoring", () => {
  it("normalizes raw metrics to 0-100", () => {
    expect(normalizeLogMetric(100000, 100000)).toBe(100);
    expect(normalizeLogMetric(0, 100000)).toBe(0);
    expect(normalizeCappedMetric(50, 100)).toBe(50);
    expect(normalizeRate(0.75)).toBe(75);
    expect(normalizeInverseRate(0.25)).toBe(75);
    expect(normalizeInverseDays(7, 7, 180)).toBe(100);
    expect(normalizeInverseDays(180, 7, 180)).toBe(0);
  });

  it("calculates baseline dependency scores from npm and GitHub metrics", () => {
    const result = scoreDependency({
      dependency,
      gitHubMetrics,
      issueMetrics,
    });

    expect(result.breakdown.popularityScore).toBe(100);
    expect(result.breakdown.maintenanceScore).toBe(100);
    expect(result.breakdown.resolutionQualityScore).toBe(100);
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe("LOW");
  });

  it("includes issuesMining quality in the final dependency score when issue metrics exist", () => {
    const result = scoreDependency({
      dependency,
      gitHubMetrics,
      issueMetrics: {
        ...issueMetrics,
        averageResolutionTimeDays: 180,
        averageResolutionTimeHours: 180 * 24,
        averageFirstResponseTimeDays: 90,
        firstResponseTimeHours: 90 * 24,
        closureRate: 0,
        noResponseRate: 1,
        closeRateByPR: 0,
        closedByPrRate: 0,
        closedByPRRate: 0,
        codeResolutionRate: 0,
        postCloseActivityRate: 1,
      },
    });

    expect(result.breakdown.popularityScore).toBe(100);
    expect(result.breakdown.maintenanceScore).toBe(100);
    expect(result.breakdown.resolutionQualityScore).toBe(0);
    expect(result.score).toBe(80);
    expect(result.riskLevel).toBe("LOW");
  });

  it("does not penalize dependencies when issuesMining has no usable metrics", () => {
    const result = scoreDependency({
      dependency,
      gitHubMetrics,
      issueMetrics: null,
    });

    expect(result.breakdown.popularityScore).toBe(100);
    expect(result.breakdown.maintenanceScore).toBe(100);
    expect(result.breakdown.resolutionQualityScore).toBeNull();
    expect(result.score).toBe(100);
  });

  it("uses an unknown baseline score when enrichment data is missing", () => {
    const result = scoreDependency({
      dependency,
      gitHubMetrics: null,
      issueMetrics: null,
    });

    expect(result.score).toBe(50);
    expect(result.riskLevel).toBe("HIGH");
    expect(result.warnings).toHaveLength(0);
    expect(result.breakdown.popularityScore).toBeNull();
    expect(result.breakdown.maintenanceScore).toBeNull();
    expect(result.breakdown.resolutionQualityScore).toBeNull();
  });

  it("calculates weighted global scores with devDependencies at half weight", () => {
    const result = scoreDependencies([
      {
        dependency,
        gitHubMetrics,
        issueMetrics,
      },
      {
        dependency: {
          ...dependency,
          id: "dependency-2",
          name: "eslint",
          type: DependencyType.DEV_DEPENDENCY,
        },
        gitHubMetrics: null,
        issueMetrics: null,
      },
    ]);

    expect(result.globalScore).toBe(83);
    expect(result.riskLevel).toBe("LOW");
  });
});
