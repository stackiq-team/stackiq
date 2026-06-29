import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  DependencyInput,
  DependencyScoreInput,
  EnrichedDependencyInput,
} from "../dependencyScore.js";
import type { GitHubMinerOutput } from "../types/githubMinerType.js";
import type { IssuesMiningMetrics, IssuesMiningResult } from "../types/issuesMining.types.js";

export const DEFAULT_DEPENDENCY_CACHE_TTL_DAYS = 14;
export const DEFAULT_PARTIAL_DEPENDENCY_CACHE_TTL_DAYS = 1;
export const DEFAULT_DEPENDENCY_CACHE_VERSION = "v1";
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOCK_WAIT_MS = 30 * 1000;
const LOCK_RETRY_DELAY_MS = 100;

export type DependencyCacheLookup = {
  ecosystem: string;
  packageManager: string;
  dependencyName: string;
  versionRequirement: string;
  versionBucket: string;
  repositoryFullName?: string | null;
  issuesConfigHash: string;
  cacheVersion: string;
};

export type CachedDependencyAnalysis = {
  cacheKey: string;
  gitHubMetrics: GitHubMinerOutput;
  issueResult: IssuesMiningResult | null;
  score: DependencyScoreInput;
  warnings: string[];
  expiresAt: Date;
};

type DependencyAnalysisCacheRow = {
  cacheKey: string;
  githubMinerRaw: Prisma.JsonValue | null;
  issuesMiningRaw: Prisma.JsonValue | null;
  score: number | null;
  riskLevel: string | null;
  popularityScore: number | null;
  maintenanceScore: number | null;
  resolutionQualityScore: number | null;
  normalizedMetrics: Prisma.JsonValue | null;
  warnings: Prisma.JsonValue | null;
  status: string;
  expiresAt: Date;
};

type DependencyAnalysisCacheDelegate = {
  findUnique(args: {
    where: { cacheKey: string };
  }): Promise<DependencyAnalysisCacheRow | null>;
  update(args: {
    where: { cacheKey: string };
    data: { lastAccessedAt: Date };
  }): Promise<unknown>;
  upsert(args: {
    where: { cacheKey: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  delete(args: { where: { cacheKey: string } }): Promise<unknown>;
  deleteMany(args: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
};

export type DependencyAnalysisCachePrisma = {
  dependencyAnalysisCache: DependencyAnalysisCacheDelegate;
};

type RedisLockClient = {
  set(
    key: string,
    value: string,
    px: "PX",
    milliseconds: number,
    nx: "NX"
  ): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

export class DependencyAnalysisCacheManager {
  constructor(
    private readonly prisma: DependencyAnalysisCachePrisma,
    private readonly now: () => Date = () => new Date(),
    private readonly lockClient?: RedisLockClient | null
  ) {}

  buildLookup(dependency: DependencyInput, repositoryFullName?: string | null): DependencyCacheLookup {
    return {
      ecosystem: "npm",
      packageManager: "npm",
      dependencyName: dependency.name,
      versionRequirement: dependency.versionRequirement,
      versionBucket: normalizeVersionBucket(dependency.versionRequirement),
      repositoryFullName: normalizeOptional(repositoryFullName),
      issuesConfigHash: getIssuesConfigHash(),
      cacheVersion: getDependencyCacheVersion(),
    };
  }

  buildCacheKey(lookup: DependencyCacheLookup) {
    return [
      lookup.ecosystem,
      lookup.packageManager,
      lookup.dependencyName.toLowerCase(),
      lookup.versionBucket.toLowerCase(),
      (lookup.repositoryFullName ?? "unknown-repository").toLowerCase(),
      lookup.cacheVersion,
      lookup.issuesConfigHash,
    ].join(":");
  }

  async findCache(lookup: DependencyCacheLookup): Promise<CachedDependencyAnalysis | null> {
    const cacheKey = this.buildCacheKey(lookup);
    const row = await this.prisma.dependencyAnalysisCache.findUnique({
      where: { cacheKey },
    });

    if (!row || this.isExpired(row) || row.status === "FAILED") {
      return null;
    }

    const cached = toCachedDependencyAnalysis(row);
    if (!cached) return null;

    await this.prisma.dependencyAnalysisCache.update({
      where: { cacheKey },
      data: { lastAccessedAt: this.now() },
    });

    return cached;
  }

  isExpired(entry: { expiresAt: Date }) {
    return entry.expiresAt.getTime() <= this.now().getTime();
  }

  async save(
    lookup: DependencyCacheLookup,
    enrichedDependency: EnrichedDependencyInput,
    score: DependencyScoreInput,
    issueResult: IssuesMiningResult | null
  ) {
    if (!enrichedDependency.gitHubMetrics) return;

    const cacheKey = this.buildCacheKey(lookup);
    const repository = enrichedDependency.gitHubMetrics.repository;
    const status = issueResult?.status ?? "SUCCESS";
    const ttlDays =
      status === "PARTIAL"
        ? getPartialDependencyCacheTtlDays()
        : getDependencyCacheTtlDays();
    const expiresAt = addDays(this.now(), ttlDays);

    const data = {
      cacheKey,
      ecosystem: lookup.ecosystem,
      packageManager: lookup.packageManager,
      dependencyName: lookup.dependencyName,
      versionRequirement: lookup.versionRequirement,
      versionBucket: lookup.versionBucket,
      repositoryOwner: repository.owner || null,
      repositoryName: repository.name || null,
      repositoryFullName: repository.fullName || null,
      repositoryUrl: repository.url || null,
      githubMinerRaw: enrichedDependency.gitHubMetrics as unknown as Prisma.InputJsonValue,
      issuesMiningRaw: issueResult as unknown as Prisma.InputJsonValue,
      issueMetrics: enrichedDependency.issueMetrics as unknown as Prisma.InputJsonValue,
      normalizedMetrics: score.breakdown.normalizedInputs as unknown as Prisma.InputJsonValue,
      score: score.score,
      riskLevel: score.riskLevel,
      popularityScore: score.breakdown.popularityScore,
      maintenanceScore: score.breakdown.maintenanceScore,
      resolutionQualityScore: score.breakdown.resolutionQualityScore,
      warnings: score.warnings as unknown as Prisma.InputJsonValue,
      status,
      issuesConfigHash: lookup.issuesConfigHash,
      cacheVersion: lookup.cacheVersion,
      expiresAt,
      lastAccessedAt: this.now(),
    };

    await this.prisma.dependencyAnalysisCache.upsert({
      where: { cacheKey },
      create: data,
      update: data,
    });
  }

  async invalidate(cacheKey: string) {
    await this.prisma.dependencyAnalysisCache.delete({
      where: { cacheKey },
    });
  }

  async deleteExpired(before = this.now()) {
    const result = await this.prisma.dependencyAnalysisCache.deleteMany({
      where: {
        expiresAt: {
          lt: before,
        },
      },
    });
    return result.count;
  }

  async acquireLock(cacheKey: string) {
    if (!this.lockClient) return async () => {};

    const lockKey = `stackiq:dependency-cache-lock:${hashForKey(cacheKey)}`;
    const token = randomUUID();
    const deadline = Date.now() + DEFAULT_LOCK_WAIT_MS;

    while (Date.now() < deadline) {
      const acquired = await this.lockClient.set(
        lockKey,
        token,
        "PX",
        DEFAULT_LOCK_TTL_MS,
        "NX"
      );

      if (acquired === "OK") {
        return async () => {
          const currentToken = await this.lockClient?.get(lockKey);
          if (currentToken === token) {
            await this.lockClient?.del(lockKey);
          }
        };
      }

      await sleep(LOCK_RETRY_DELAY_MS);
    }

    throw new Error(`Timed out waiting for dependency cache lock: ${cacheKey}`);
  }
}

export function getDependencyCacheVersion() {
  return process.env.DEPENDENCY_CACHE_VERSION || DEFAULT_DEPENDENCY_CACHE_VERSION;
}

export function getDependencyCacheTtlDays() {
  return positiveNumber(
    process.env.DEPENDENCY_CACHE_TTL_DAYS,
    DEFAULT_DEPENDENCY_CACHE_TTL_DAYS
  );
}

export function getPartialDependencyCacheTtlDays() {
  return positiveNumber(
    process.env.PARTIAL_DEPENDENCY_CACHE_TTL_DAYS,
    DEFAULT_PARTIAL_DEPENDENCY_CACHE_TTL_DAYS
  );
}

export function getIssuesConfigHash() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lookbackDays: process.env.ISSUES_MINING_LOOKBACK_DAYS ?? "60",
        maxIssues: process.env.ISSUES_MINING_MAX_ISSUES ?? "",
        timelineItems: process.env.ISSUES_MINING_TIMELINE_ITEMS ?? "",
        maxTimelinePages: process.env.ISSUES_MINING_MAX_TIMELINE_PAGES ?? "",
        includeDevDependencies:
          process.env.ISSUES_MINING_INCLUDE_DEV_DEPENDENCIES ?? "true",
      })
    )
    .digest("hex")
    .slice(0, 16);
}

function toCachedDependencyAnalysis(
  row: DependencyAnalysisCacheRow
): CachedDependencyAnalysis | null {
  if (!isGitHubMinerOutput(row.githubMinerRaw)) return null;
  if (!isDependencyScoreInput(row)) return null;

  return {
    cacheKey: row.cacheKey,
    gitHubMetrics: row.githubMinerRaw,
    issueResult: isIssuesMiningResult(row.issuesMiningRaw) ? row.issuesMiningRaw : null,
    score: {
      dependencyId: "",
      score: row.score,
      riskLevel: row.riskLevel,
      breakdown: {
        popularityScore: row.popularityScore,
        maintenanceScore: row.maintenanceScore,
        resolutionQualityScore: row.resolutionQualityScore,
        normalizedInputs: row.normalizedMetrics as any,
      },
      warnings: Array.isArray(row.warnings)
        ? row.warnings.filter((item): item is string => typeof item === "string")
        : [],
    },
    warnings: Array.isArray(row.warnings)
      ? row.warnings.filter((item): item is string => typeof item === "string")
      : [],
    expiresAt: row.expiresAt,
  };
}

function isDependencyScoreInput(
  row: DependencyAnalysisCacheRow
): row is DependencyAnalysisCacheRow & {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  normalizedMetrics: Record<string, number | null>;
} {
  return (
    typeof row.score === "number" &&
    (row.riskLevel === "LOW" || row.riskLevel === "MEDIUM" || row.riskLevel === "HIGH") &&
    isRecord(row.normalizedMetrics)
  );
}

function isGitHubMinerOutput(value: unknown): value is GitHubMinerOutput {
  return (
    isRecord(value) &&
    typeof value.dependencyId === "string" &&
    isRecord(value.repository) &&
    typeof value.repository.fullName === "string"
  );
}

function isIssuesMiningResult(value: unknown): value is IssuesMiningResult {
  return (
    isRecord(value) &&
    (value.status === "SUCCESS" || value.status === "PARTIAL" || value.status === "FAILED") &&
    isRecord(value.metrics)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeVersionBucket(versionRequirement: string) {
  return versionRequirement.trim().replace(/^[\^~]/, "") || "unknown-version";
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hashForKey(cacheKey: string) {
  return createHash("sha256").update(cacheKey).digest("hex").slice(0, 32);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
