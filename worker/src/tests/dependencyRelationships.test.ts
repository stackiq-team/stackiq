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
  it("returns empty when disabled by environment", async () => {
    const envBackup = process.env.DEPENDENCY_RELATIONSHIPS_ENABLED;
    process.env.DEPENDENCY_RELATIONSHIPS_ENABLED = "false";

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships).toEqual([]);
    process.env.DEPENDENCY_RELATIONSHIPS_ENABLED = envBackup;
  });

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

  it("ignores expired cache entries and computes relationships", async () => {
    const relationshipCache = {
      findUnique: vi.fn().mockResolvedValue({
        cacheKey: "expired",
        relationshipType: "INTEGRATION_MENTION",
        confidence: "LOW",
        riskAdjustment: 0,
        summary: "expired",
        searchTotalCount: 1,
        expiresAt: new Date(Date.now() - 60_000),
      }),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    };

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express", [
          {
            number: 100,
            title: "configure cors middleware",
            url: "https://github.com/expressjs/express/issues/100",
            closed: true,
            publishedAt: "2026-01-01T00:00:00Z",
            closedAt: "2026-01-02T00:00:00Z",
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
            bodyPreview: "works with cors",
            labels: ["documentation"],
          },
        ]),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      relationshipCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationshipCache.update).not.toHaveBeenCalled();
    expect(relationshipCache.upsert).toHaveBeenCalled();
    const relation = relationships.find(
      (item) =>
        item.sourceDependencyId === "dep-1" &&
        item.targetDependencyId === "dep-2"
    );
    expect(relation).toMatchObject({
      relationshipType: "INTEGRATION_MENTION",
      confidence: "LOW",
    });
  });

  it("falls back to unknown relationship when deep issue loader throws", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const getIssueData = vi.fn().mockRejectedValue(new Error("loader failed"));

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      getIssueData,
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Deep issueMining sample unavailable")
    );
    expect(relationships[0]).toMatchObject({ relationshipType: "UNKNOWN" });
  });

  it("continues when cache read/write operations fail", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const relationshipCache = {
      findUnique: vi.fn().mockRejectedValue(new Error("cache read failed")),
      upsert: vi.fn().mockRejectedValue(new Error("cache write failed")),
    };

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-1",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express", [
          {
            number: 102,
            title: "compatibility warning with cors",
            url: "https://github.com/expressjs/express/issues/102",
            closed: true,
            publishedAt: "2026-01-01T00:00:00Z",
            closedAt: "2026-01-02T00:00:00Z",
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
            bodyPreview: "possible conflict with cors",
            labels: ["bug"],
          },
        ]),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      relationshipCache,
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Cache read failed"));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Cache write failed"));
    expect(relationships[0]).toBeDefined();
  });

  it("classifies multiple closed conflict mentions as possible conflict", async () => {
    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-2",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express", [
          {
            number: 201,
            title: "Conflict with cors in middleware ordering",
            url: "https://github.com/expressjs/express/issues/201",
            closed: true,
            publishedAt: "2026-01-01T00:00:00Z",
            closedAt: "2026-01-05T00:00:00Z",
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
            bodyPreview: "cors version mismatch conflict",
            labels: ["compatibility"],
          },
          {
            number: 202,
            title: "Regression: cors does not work after upgrade",
            url: "https://github.com/expressjs/express/issues/202",
            closed: true,
            publishedAt: "2026-02-01T00:00:00Z",
            closedAt: "2026-02-02T00:00:00Z",
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
            bodyPreview: "another conflict report for cors",
            labels: ["bug"],
          },
        ]),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      logger: { log: vi.fn(), error: vi.fn() },
    });

    const relation = relationships.find(
      (item) =>
        item.sourceDependencyId === "dep-1" &&
        item.targetDependencyId === "dep-2"
    );

    expect(relation).toMatchObject({
      relationshipType: "POSSIBLE_CONFLICT",
      confidence: "MEDIUM",
      evidence: {
        totalCount: 2,
      },
    });
  });

  it("skips dependencies that do not have a resolvable repository", async () => {
    const withoutRepository: EnrichedDependencyInput = {
      dependency: {
        id: "dep-missing",
        name: "missing",
        versionRequirement: "^1.0.0",
        type: DependencyType.DEPENDENCY,
      },
      gitHubMetrics: null,
    };

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-3",
      dependencies: [
        withoutRepository,
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships).toEqual([]);
  });

  it("uses score-sample fingerprint cache keys when auto sample key and enough issues are present", async () => {
    const issueData = Array.from({ length: 30 }).map((_, index) => ({
      number: 1000 + index,
      title: `Issue ${index}`,
      url: `https://github.com/expressjs/express/issues/${1000 + index}`,
      closed: true,
      publishedAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-02T00:00:00Z",
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
      bodyPreview: "reference to cors",
      labels: ["docs"],
    }));

    const relationshipCache = {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    };

    await analyzeDependencyRelationships({
      analysisId: "analysis-4",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express", issueData),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      issueDataSampleKey: "auto",
      relationshipCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    const cacheKeys = relationshipCache.findUnique.mock.calls.map(
      (call) => call?.[0]?.where?.cacheKey as string
    );
    expect(cacheKeys.some((key) => key.includes("score-sample:"))).toBe(true);
  });

  it("uses fallback evidence shape when cached evidence is missing", async () => {
    const relationshipCache = {
      findUnique: vi.fn().mockResolvedValue({
        relationshipType: "UNKNOWN",
        confidence: "LOW",
        riskAdjustment: 0,
        summary: "cached without evidence",
        searchTotalCount: 4,
        expiresAt: new Date(Date.now() + 60_000),
        evidence: null,
      }),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn(),
    };

    const relationships = await analyzeDependencyRelationships({
      analysisId: "analysis-5",
      dependencies: [
        dependency("dep-1", "express", "expressjs", "express"),
        dependency("dep-2", "cors", "expressjs", "cors"),
      ],
      relationshipCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(relationships[0]?.evidence.totalCount).toBe(4);
    expect(relationships[0]?.evidence.query).toMatch(/^issueMining:.+ mentions .+$/);
  });
});
