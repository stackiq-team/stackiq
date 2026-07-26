import { afterEach, describe, expect, it, vi } from "vitest";
import { DependencyType } from "@prisma/client";
import { analyzeDependencyRelationships } from "../dependencyRelationships.js";
import type { EnrichedDependencyInput } from "../dependencyScore.js";

function dependency(
  id: string,
  name: string,
  owner: string,
  repo: string
): EnrichedDependencyInput {
  return {
    dependency: {
      id,
      name,
      versionRequirement: "^1.0.0",
      type: DependencyType.DEPENDENCY,
    },
    gitHubMetrics: {
      dependencyId: id,
      packageName: name,
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        description: "",
        url: `https://github.com/${owner}/${repo}`,
        createdAt: "2020-01-01",
      },
      stars: 1,
      forks: 1,
      watchers: 1,
      contributors: 1,
      createdAt: "2020-01-01",
      projectAgeDays: 1,
      pullRequests: 1,
      issues: 1,
      license: "MIT",
      languages: [],
      primaryLanguage: "",
      topics: [],
      created_at: "2020-01-01",
    },
  };
}

describe("analyzeDependencyRelationships", () => {
  const originalMaxPairs = process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS;

  afterEach(() => {
    if (originalMaxPairs === undefined) {
      delete process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS;
    } else {
      process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS = originalMaxPairs;
    }
  });

  it("classifies open issue conflict mentions as high-confidence incompatibility evidence", async () => {
    const searchIssues = vi.fn().mockResolvedValue({
      total_count: 1,
      items: [
        {
          number: 6711,
          title: "Wildcard route breaks with path-to-regexp",
          html_url: "https://github.com/expressjs/express/issues/6711",
          state: "open",
          body: "This behavior comes from stricter path-to-regexp parsing.",
          labels: [{ name: "bug" }],
        },
      ],
    });

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "path-to-regexp", "pillarjs", "path-to-regexp"),
      ],
      searchIssues,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships[0]).toMatchObject({
      sourceDependencyId: "dep-1",
      targetDependencyId: "dep-2",
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: "HIGH",
      riskAdjustment: -12,
      evidence: {
        totalCount: 1,
        issues: [
          {
            issueNumber: 6711,
            matchedTerms: ["path-to-regexp", "breaks"],
            state: "open",
          },
        ],
      },
    });
  });

  it("prioritizes likely related package pairs before applying the pair cap", async () => {
    process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS = "1";
    const searchIssues = vi.fn().mockResolvedValue({
      total_count: 0,
      items: [],
    });

    await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "@prisma/client", "prisma", "prisma"),
        dependency("dep-3", "@prisma/adapter-pg", "prisma", "prisma"),
      ],
      searchIssues,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(searchIssues).toHaveBeenCalledTimes(1);
    expect(searchIssues.mock.calls[0]![0]).toMatchObject({
      owner: "prisma",
      repo: "prisma",
    });
    expect(searchIssues.mock.calls[0]![0].targetDependencyName).toMatch(/^@prisma\//);
  });

  it("reuses cached relationship pair results without searching GitHub", async () => {
    const searchIssues = vi.fn();
    process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS = "1";
    const relationshipCache = {
      findUnique: vi.fn().mockResolvedValue({
        cacheKey: "relationship-v1|expressjs/express|express|cors|3",
        relationshipType: "INTEGRATION_MENTION",
        confidence: "LOW",
        riskAdjustment: -1,
        summary: "Cached relationship summary.",
        searchTotalCount: 1,
        expiresAt: new Date(Date.now() + 60_000),
        evidence: {
          query: "repo:expressjs/express is:issue cors in:title,body",
          totalCount: 1,
          issues: [],
          searchedAt: "2026-07-26T00:00:00.000Z",
        },
      }),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn(),
    };

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      searchIssues,
      relationshipCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(searchIssues).not.toHaveBeenCalled();
    expect(relationshipCache.update).toHaveBeenCalled();
    expect(relationships[0]).toMatchObject({
      analysisId: "analysis-1",
      relationshipType: "INTEGRATION_MENTION",
      summary: "Cached relationship summary.",
    });
  });
});
