import { describe, expect, it, vi } from "vitest";
import { DependencyType } from "@prisma/client";
import { analyzeDependencyRelationships } from "../dependencyRelationships.js";
import type { EnrichedDependencyInput } from "../dependencyScore.js";

function dependency(
  id: string,
  name: string,
  owner: string,
  repo: string,
  issueData: EnrichedDependencyInput["issueData"] = []
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
    issueData,
  };
}

describe("analyzeDependencyRelationships", () => {
  it("classifies open issueMining conflict mentions as high-confidence incompatibility evidence", async () => {
    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express", [
        {
          number: 6711,
          title: "Wildcard route breaks with path-to-regexp",
          url: "https://github.com/expressjs/express/issues/6711",
          closed: false,
          publishedAt: "2026-01-01T00:00:00Z",
          closedAt: null,
          assigneesCount: 0,
          firstAssignedAt: null,
          closer: {
            stateReason: null,
            type: null,
            merged: null,
            closedByBot: null,
            closedByLogin: null,
            wasReclassified: false,
          },
          hasConnectedEvent: false,
          hasPostCloseActivity: false,
          tooManyTimelineItems: false,
          timelineTotalCount: 0,
          timelineCapturedCount: 0,
          bodyPreview: "This behavior comes from stricter path-to-regexp parsing.",
          labels: ["bug"],
        },
        ]),
        dependency("dep-2", "path-to-regexp", "pillarjs", "path-to-regexp"),
      ],
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships[0]).toMatchObject({
      sourceDependencyId: "dep-1",
      targetDependencyId: "dep-2",
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: "HIGH",
      riskAdjustment: 0,
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

  it("uses a deeper issueMining sample loader when the score sample has no relationship evidence", async () => {
    const getIssueData = vi.fn().mockResolvedValue([
      {
        number: 9021,
        title: "CORS middleware does not work with this setup",
        url: "https://github.com/expressjs/express/issues/9021",
        closed: false,
        publishedAt: "2026-01-01T00:00:00Z",
        closedAt: null,
        assigneesCount: 0,
        firstAssignedAt: null,
        closer: {
          stateReason: null,
          type: null,
          merged: null,
          closedByBot: null,
          closedByLogin: null,
          wasReclassified: false,
        },
        hasConnectedEvent: false,
        hasPostCloseActivity: false,
        tooManyTimelineItems: false,
        timelineTotalCount: 0,
        timelineCapturedCount: 0,
        bodyPreview: "The cors package conflicts with this middleware order.",
        labels: ["bug"],
      },
    ]);

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      getIssueData,
      issueDataSampleKey: "deep-issuemining:max=80",
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(getIssueData).toHaveBeenCalled();
    const relationship = relationships.find(
      (item) => item.sourceDependencyId === "dep-1" && item.targetDependencyId === "dep-2"
    );

    expect(relationship).toMatchObject({
      sourceDependencyId: "dep-1",
      targetDependencyId: "dep-2",
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: "HIGH",
      evidence: {
        totalCount: 1,
        issues: [
          {
            issueNumber: 9021,
            matchedTerms: expect.arrayContaining(["cors", "does not work", "conflict"]),
          },
        ],
      },
    });
  });

  it("checks every directional package pair while keeping likely related pairs first", async () => {
    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "@prisma/client", "prisma", "prisma"),
        dependency("dep-3", "@prisma/adapter-pg", "prisma", "prisma"),
      ],
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships).toHaveLength(6);
    expect(relationships[0]).toMatchObject({
      sourceRepositoryFullName: "prisma/prisma",
      relationshipType: "UNKNOWN",
    });
    expect(relationships[0]?.targetDependencyName).toMatch(/^@prisma\//);
  });

  it("reuses cached relationship pair results without searching GitHub", async () => {
    const relationshipCache = {
      findUnique: vi.fn().mockResolvedValue({
        cacheKey: "relationship-v1|expressjs/express|express|cors|3",
        relationshipType: "INTEGRATION_MENTION",
        confidence: "LOW",
        riskAdjustment: 0,
        summary: "Cached relationship summary.",
        searchTotalCount: 1,
        expiresAt: new Date(Date.now() + 60_000),
        evidence: {
          query: "issueMining:expressjs/express mentions cors",
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
      relationshipCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationshipCache.update).toHaveBeenCalled();
    expect(relationships[0]).toMatchObject({
      analysisId: "analysis-1",
      relationshipType: "INTEGRATION_MENTION",
      summary: "Cached relationship summary.",
    });
  });
});
