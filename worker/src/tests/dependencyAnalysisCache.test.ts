import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DependencyAnalysisCacheManager,
  DEFAULT_DEPENDENCY_CACHE_TTL_DAYS,
  DEFAULT_DEPENDENCY_CACHE_VERSION,
  DEFAULT_PARTIAL_DEPENDENCY_CACHE_TTL_DAYS,
  getDependencyCacheLockWaitMs,
  getDependencyCacheTtlDays,
  getDependencyCacheVersion,
  getIssuesConfigHash,
  getPartialDependencyCacheTtlDays,
} from "../cache/dependencyAnalysisCache.js";

const now = new Date("2026-01-01T00:00:00Z");

function createManager(overrides?: {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
  deleteMany?: ReturnType<typeof vi.fn>;
  lockClient?: any;
}) {
  const prisma = {
    dependencyAnalysisCache: {
      findUnique: overrides?.findUnique ?? vi.fn(),
      update: overrides?.update ?? vi.fn(),
      upsert: overrides?.upsert ?? vi.fn(),
      delete: overrides?.delete ?? vi.fn(),
      deleteMany: overrides?.deleteMany ?? vi.fn(),
    },
  } as any;

  return new DependencyAnalysisCacheManager(prisma, () => now, overrides?.lockClient ?? null);
}

describe("dependencyAnalysisCache", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    process.env.DEPENDENCY_CACHE_VERSION = "v2";
    process.env.DEPENDENCY_CACHE_TTL_DAYS = "9";
    process.env.PARTIAL_DEPENDENCY_CACHE_TTL_DAYS = "2";
    process.env.DEPENDENCY_CACHE_LOCK_WAIT_MS = "250";
    process.env.ISSUES_MINING_LOOKBACK_DAYS = "60";
    process.env.ISSUES_MINING_MAX_ISSUES = "80";
    process.env.ISSUES_MINING_MAX_OPEN_ISSUES = "30";
    process.env.ISSUES_MINING_MAX_CLOSED_ISSUES = "50";
    process.env.ISSUES_MINING_TIMELINE_ITEMS = "15";
    process.env.ISSUES_MINING_MAX_TIMELINE_PAGES = "1";
    process.env.ISSUES_MINING_INCLUDE_DEV_DEPENDENCIES = "true";
  });

  it("builds lookups and cache keys from dependency data", () => {
    const manager = createManager();
    const lookup = manager.buildLookup(
      { id: "dep-1", name: "React", versionRequirement: "^18.2.0", type: "DEPENDENCY" as any },
      "facebook/react"
    );

    expect(lookup).toMatchObject({
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "React",
      versionRequirement: "^18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      cacheVersion: "v2",
    });
    expect(lookup.issuesConfigHash).toHaveLength(16);
    expect(manager.buildCacheKey(lookup)).toContain("npm:npm:react:18.2.0:facebook/react:v2");
  });

  it("exposes the configured cache defaults", () => {
    expect(getDependencyCacheVersion()).toBe("v2");
    expect(getDependencyCacheTtlDays()).toBe(9);
    expect(getPartialDependencyCacheTtlDays()).toBe(2);
    expect(getDependencyCacheLockWaitMs()).toBe(250);
    expect(getIssuesConfigHash()).toHaveLength(16);
    expect(DEFAULT_DEPENDENCY_CACHE_VERSION).toBe("v1");
    expect(DEFAULT_DEPENDENCY_CACHE_TTL_DAYS).toBe(14);
    expect(DEFAULT_PARTIAL_DEPENDENCY_CACHE_TTL_DAYS).toBe(1);
  });

  it("falls back to defaults when cache env values are invalid", () => {
    process.env.DEPENDENCY_CACHE_TTL_DAYS = "0";
    process.env.PARTIAL_DEPENDENCY_CACHE_TTL_DAYS = "-1";
    process.env.DEPENDENCY_CACHE_LOCK_WAIT_MS = "not-a-number";

    expect(getDependencyCacheTtlDays()).toBe(DEFAULT_DEPENDENCY_CACHE_TTL_DAYS);
    expect(getPartialDependencyCacheTtlDays()).toBe(DEFAULT_PARTIAL_DEPENDENCY_CACHE_TTL_DAYS);
    expect(getDependencyCacheLockWaitMs()).toBe(5 * 60 * 1000);
  });

  it("normalizes blank repository names and empty version buckets", () => {
    const manager = createManager();
    const lookup = manager.buildLookup(
      { id: "dep-2", name: "pkg", versionRequirement: "  ^  ", type: "DEPENDENCY" as any },
      "   "
    );

    expect(lookup.repositoryFullName).toBeNull();
    expect(lookup.versionBucket).toBe("unknown-version");
  });

  it("returns cached analysis data and refreshes last access time", async () => {
    const lookup = {
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "react",
      versionRequirement: "18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      issuesConfigHash: "hash",
      cacheVersion: "v2",
    };
    const findUnique = vi.fn().mockResolvedValue({
      cacheKey: "cache-key",
      githubMinerRaw: {
        dependencyId: "dependency-1",
        repository: { fullName: "facebook/react" },
      },
      issuesMiningRaw: {
        status: "SUCCESS",
        metrics: { totalIssuesAnalyzed: 12 },
      },
      score: 88,
      riskLevel: "LOW",
      popularityScore: 80,
      maintenanceScore: 90,
      resolutionQualityScore: 70,
      normalizedMetrics: { popularityScore: 80 },
      warnings: ["warn-1", 123],
      status: "SUCCESS",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const update = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ findUnique, update });

    const result = await manager.findCache(lookup);

    expect(result?.cacheKey).toBe("cache-key");
    expect(result?.warnings).toEqual(["warn-1"]);
    expect(update).toHaveBeenCalledWith({
      where: { cacheKey: manager.buildCacheKey(lookup) },
      data: { lastAccessedAt: now },
    });
  });

  it("skips expired and failed cache rows", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({
      cacheKey: "expired",
      githubMinerRaw: { dependencyId: "dependency-1", repository: { fullName: "facebook/react" } },
      issuesMiningRaw: null,
      score: 1,
      riskLevel: "LOW",
      popularityScore: 1,
      maintenanceScore: 1,
      resolutionQualityScore: 1,
      normalizedMetrics: {},
      warnings: [],
      status: "SUCCESS",
      expiresAt: new Date("2025-01-01T00:00:00Z"),
    }).mockResolvedValueOnce({
      cacheKey: "failed",
      githubMinerRaw: { dependencyId: "dependency-1", repository: { fullName: "facebook/react" } },
      issuesMiningRaw: null,
      score: 1,
      riskLevel: "LOW",
      popularityScore: 1,
      maintenanceScore: 1,
      resolutionQualityScore: 1,
      normalizedMetrics: {},
      warnings: [],
      status: "FAILED",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const manager = createManager({ findUnique });

    await expect(manager.findCache({
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "react",
      versionRequirement: "18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      issuesConfigHash: "hash",
      cacheVersion: "v2",
    })).resolves.toBeNull();

    await expect(manager.findCache({
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "react",
      versionRequirement: "18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      issuesConfigHash: "hash",
      cacheVersion: "v2",
    })).resolves.toBeNull();
  });

  it("saves and expires dependency cache entries", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const manager = createManager({ upsert, deleteMany });

    await manager.save(
      {
        ecosystem: "npm",
        packageManager: "npm",
        dependencyName: "react",
        versionRequirement: "18.2.0",
        versionBucket: "18.2.0",
        repositoryFullName: "facebook/react",
        issuesConfigHash: "hash",
        cacheVersion: "v2",
      },
      {
        dependency: { id: "dep-1", name: "react", versionRequirement: "^18.2.0", type: "DEPENDENCY" },
        gitHubMetrics: {
          dependencyId: "dep-1",
          packageName: "react",
          repository: {
            owner: "facebook",
            name: "react",
            fullName: "facebook/react",
            description: "",
            url: "https://github.com/facebook/react",
            createdAt: "2013-05-01",
          },
          stars: 1,
          forks: 2,
          watchers: 3,
          contributors: 4,
          createdAt: "2013-05-01",
          projectAgeDays: 10,
          pullRequests: 5,
          issues: 6,
          license: "MIT",
          languages: [],
          primaryLanguage: "TypeScript",
          topics: [],
          created_at: "2013-05-01",
        },
        issueMetrics: null,
        issueData: null,
        warnings: ["warn-1"],
      } as any,
      {
        dependencyId: "dep-1",
        score: 88,
        riskLevel: "LOW",
        breakdown: {
          popularityScore: 80,
          maintenanceScore: 90,
          resolutionQualityScore: 70,
          normalizedInputs: {},
        },
        warnings: ["warn-1"],
      } as any,
      {
        status: "PARTIAL",
        metrics: { totalIssuesAnalyzed: 1 } as any,
        issueData: [],
      } as any
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cacheKey: expect.any(String) },
        create: expect.objectContaining({ status: "PARTIAL" }),
        update: expect.objectContaining({ status: "PARTIAL" }),
      })
    );

    expect(await manager.deleteExpired(new Date("2025-12-31T00:00:00Z"))).toBe(3);
  });

  it("does not persist when GitHub metrics are missing", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ upsert });

    await manager.save(
      {
        ecosystem: "npm",
        packageManager: "npm",
        dependencyName: "left-pad",
        versionRequirement: "1.0.0",
        versionBucket: "1.0.0",
        repositoryFullName: "example/repo",
        issuesConfigHash: "hash",
        cacheVersion: "v2",
      },
      {
        dependency: { id: "dep-2", name: "left-pad", versionRequirement: "1.0.0", type: "DEPENDENCY" },
        gitHubMetrics: null,
        issueMetrics: null,
        issueData: null,
        warnings: [],
      } as any,
      {
        dependencyId: "dep-2",
        score: 50,
        riskLevel: "MEDIUM",
        breakdown: {
          popularityScore: 50,
          maintenanceScore: 50,
          resolutionQualityScore: 50,
          normalizedInputs: {},
        },
        warnings: [],
      } as any,
      null
    );

    expect(upsert).not.toHaveBeenCalled();
  });

  it("invalidates a cache entry by key", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ delete: deleteMock });

    await manager.invalidate("cache-key-1");

    expect(deleteMock).toHaveBeenCalledWith({ where: { cacheKey: "cache-key-1" } });
  });

  it("acquires and releases a redis lock when available", async () => {
    let storedToken = "";
    const set = vi.fn().mockImplementation(async (_key: string, value: string) => {
      storedToken = value;
      return "OK";
    });
    const get = vi.fn().mockImplementation(async () => storedToken);
    const del = vi.fn().mockResolvedValue(1);
    const manager = createManager({
      lockClient: { set, get, del },
    });

    const release = await manager.acquireLock("cache-key");
    await release();

    expect(set).toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
  });

  it("returns a no-op release function when no lock client is configured", async () => {
    const manager = createManager();

    const release = await manager.acquireLock("cache-key");
    await expect(release()).resolves.toBeUndefined();
  });

  it("does not delete lock when token changes before release", async () => {
    let firstToken = "";
    const set = vi.fn().mockImplementation(async (_key: string, value: string) => {
      firstToken = value;
      return "OK";
    });
    const get = vi.fn().mockResolvedValue("different-token");
    const del = vi.fn().mockResolvedValue(0);
    const manager = createManager({
      lockClient: { set, get, del },
    });

    const release = await manager.acquireLock("cache-key");
    expect(firstToken).not.toBe("");
    await release();

    expect(del).not.toHaveBeenCalled();
  });

  it("throws when lock cannot be acquired before timeout", async () => {
    process.env.DEPENDENCY_CACHE_LOCK_WAIT_MS = "1";
    const set = vi.fn().mockResolvedValue(null);
    const manager = createManager({
      lockClient: {
        set,
        get: vi.fn().mockResolvedValue(null),
        del: vi.fn().mockResolvedValue(0),
      },
    });

    await expect(manager.acquireLock("cache-key")).rejects.toThrow(
      "Timed out waiting for dependency cache lock: cache-key"
    );
    expect(set).toHaveBeenCalled();
  });

  it("returns null when a cache row cannot be converted to expected shape", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      cacheKey: "cache-key",
      githubMinerRaw: { dependencyId: "dep-1", repository: { fullName: "owner/repo" } },
      issuesMiningRaw: null,
      score: null,
      riskLevel: null,
      popularityScore: null,
      maintenanceScore: null,
      resolutionQualityScore: null,
      normalizedMetrics: null,
      warnings: null,
      status: "SUCCESS",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const update = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ findUnique, update });

    const result = await manager.findCache({
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "react",
      versionRequirement: "18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      issuesConfigHash: "hash",
      cacheVersion: "v2",
    });

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns cache entry with null issue result when issue payload is invalid", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      cacheKey: "cache-key",
      githubMinerRaw: {
        dependencyId: "dependency-1",
        repository: { fullName: "facebook/react" },
      },
      issuesMiningRaw: ["bad-shape"],
      score: 88,
      riskLevel: "LOW",
      popularityScore: 80,
      maintenanceScore: 90,
      resolutionQualityScore: 70,
      normalizedMetrics: { popularityScore: 80 },
      warnings: ["warn"],
      status: "SUCCESS",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
    });
    const update = vi.fn().mockResolvedValue(undefined);
    const manager = createManager({ findUnique, update });

    const result = await manager.findCache({
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: "react",
      versionRequirement: "18.2.0",
      versionBucket: "18.2.0",
      repositoryFullName: "facebook/react",
      issuesConfigHash: "hash",
      cacheVersion: "v2",
    });

    expect(result).toMatchObject({
      cacheKey: "cache-key",
      issueResult: null,
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});