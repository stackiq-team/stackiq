import type { EnrichedDependencyInput } from "./dependencyScore.js";
import { scoreDependency } from "./dependencyScore.js";

export type DependencyRelationshipType =
  | "KNOWN_INCOMPATIBILITY"
  | "POSSIBLE_CONFLICT"
  | "INTEGRATION_MENTION"
  | "UNKNOWN";

export type DependencyRelationshipConfidence = "HIGH" | "MEDIUM" | "LOW";

export type DependencyRelationshipEvidence = {
  issueNumber: number;
  title: string;
  url: string;
  state: "open" | "closed";
  labels: string[];
  matchedTerms: string[];
  bodyPreview: string | null;
};

export type DependencyRelationshipResult = {
  analysisId: string;
  sourceDependencyId: string;
  targetDependencyId: string;
  sourceDependencyName: string;
  targetDependencyName: string;
  sourceRepositoryFullName: string;
  relationshipType: DependencyRelationshipType;
  confidence: DependencyRelationshipConfidence;
  riskAdjustment: number;
  summary: string;
  evidence: {
    query: string;
    totalCount: number;
    issues: DependencyRelationshipEvidence[];
    searchedAt: string;
  };
};

type IssueSearchResult = {
  total_count?: number;
  items?: Array<{
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    body?: string | null;
    labels?: Array<{ name?: string }>;
  }>;
};

type RelationshipSearchInput = {
  owner: string;
  repo: string;
  targetDependencyName: string;
  perPage: number;
};

type RelationshipPair = {
  source: EnrichedDependencyInput & {
    gitHubMetrics: NonNullable<EnrichedDependencyInput["gitHubMetrics"]>;
  };
  target: EnrichedDependencyInput & {
    gitHubMetrics: NonNullable<EnrichedDependencyInput["gitHubMetrics"]>;
  };
  priority: number;
  reasons: string[];
};

type RelationshipCacheDelegate = {
  findUnique?: (args: any) => Promise<any>;
  update?: (args: any) => Promise<any>;
  upsert?: (args: any) => Promise<any>;
};

const conflictTerms = [
  "incompatible",
  "conflict",
  "breaks",
  "does not work",
  "not compatible",
  "version mismatch",
  "peer dependency",
  "breaking",
  "regression",
];

const integrationTerms = [
  "middleware",
  "configuration",
  "config",
  "setup",
  "migration",
  "works with",
  "integration",
];

const riskyLabels = ["bug", "regression", "compatibility", "breaking-change"];
const RELATIONSHIP_CACHE_VERSION = "relationship-v1";

export async function analyzeDependencyRelationships(args: {
  analysisId: string;
  dependencies: EnrichedDependencyInput[];
  logger?: Pick<Console, "log" | "error">;
  searchIssues?: (input: RelationshipSearchInput) => Promise<IssueSearchResult>;
  relationshipCache?: RelationshipCacheDelegate | null;
}): Promise<DependencyRelationshipResult[]> {
  const logger = args.logger ?? console;
  if (process.env.DEPENDENCY_RELATIONSHIPS_ENABLED === "false") {
    logger.log(`[relationships] Skipped by configuration: analysisId=${args.analysisId}`);
    return [];
  }

  const candidates = args.dependencies.filter(hasRepository);
  const maxPairs = positiveInteger(process.env.DEPENDENCY_RELATIONSHIP_MAX_PAIRS, 30);
  const perPage = positiveInteger(process.env.DEPENDENCY_RELATIONSHIP_SEARCH_RESULTS, 3);
  const searchIssues = args.searchIssues ?? searchDependencyMentionIssues;
  const relationshipCache = args.relationshipCache ?? null;
  const results: DependencyRelationshipResult[] = [];
  const skippedWithoutRepository = args.dependencies.length - candidates.length;
  const prioritizedPairs = prioritizeRelationshipPairs(candidates);

  logger.log(
    `[relationships] Starting prioritized pair search: analysisId=${args.analysisId}, candidates=${candidates.length}, totalPairs=${prioritizedPairs.length}, skippedWithoutRepository=${skippedWithoutRepository}, maxPairs=${maxPairs}, perPage=${perPage}`
  );

  let searchedPairs = 0;
  let cacheHits = 0;
  for (const pair of prioritizedPairs) {
    const { source, target } = pair;
    if (searchedPairs >= maxPairs) {
      logger.log(
        `[relationships] Pair cap reached: analysisId=${args.analysisId}, maxPairs=${maxPairs}, totalPairs=${prioritizedPairs.length}, checkedPairs=${searchedPairs}, cacheHits=${cacheHits}`
      );
      return results;
    }

    searchedPairs += 1;
    const repository = source.gitHubMetrics.repository;
    const pairLabel = `${source.dependency.name}->${target.dependency.name}`;
    const cacheKey = buildRelationshipCacheKey(source, target, perPage);
    const cachedRelationship = await readCachedRelationship({
      cache: relationshipCache,
      cacheKey,
      analysisId: args.analysisId,
      source,
      target,
      logger,
    });

    if (cachedRelationship) {
      cacheHits += 1;
      logger.log(
        `[relationships] Cache hit: analysisId=${args.analysisId}, pair=${pairLabel}, repo=${repository.fullName}, pairIndex=${searchedPairs}/${maxPairs}`
      );
      results.push(cachedRelationship);
      continue;
    }

    logger.log(
      `[relationships] Searching prioritized pair: analysisId=${args.analysisId}, pair=${pairLabel}, repo=${repository.fullName}, priority=${pair.priority}, reasons=${pair.reasons.join("|") || "baseline"}, pairIndex=${searchedPairs}/${maxPairs}`
    );

    try {
      const issueSearchResult = await searchIssues({
        owner: repository.owner,
        repo: repository.name,
        targetDependencyName: target.dependency.name,
        perPage,
      });
      logger.log(
        `[relationships] Search result received: analysisId=${args.analysisId}, pair=${pairLabel}, totalCount=${issueSearchResult.total_count ?? 0}, returnedItems=${issueSearchResult.items?.length ?? 0}`
      );

      const relationship = classifyRelationship({
          analysisId: args.analysisId,
          source,
          target,
          issueSearchResult,
          searchedAt: new Date().toISOString(),
        });
      logger.log(
        `[relationships] Pair classified: analysisId=${args.analysisId}, pair=${pairLabel}, type=${relationship.relationshipType}, confidence=${relationship.confidence}, riskAdjustment=${relationship.riskAdjustment}, evidenceIssues=${relationship.evidence.issues.length}`
      );
      await writeCachedRelationship({
        cache: relationshipCache,
        cacheKey,
        relationship,
        source,
        target,
        logger,
      });
      results.push(relationship);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dependency relationship search error";
      logger.error(
        `[relationships] Search failed: analysisId=${args.analysisId}, source=${source.dependency.name}, target=${target.dependency.name}, error=${message}`
      );
      results.push(
        unknownRelationship({
          analysisId: args.analysisId,
          source,
          target,
          summary: `Relationship search failed for ${source.dependency.name} and ${target.dependency.name}: ${message}`,
          searchedAt: new Date().toISOString(),
        })
      );
    }
  }

  logger.log(
    `[relationships] Analysis complete: analysisId=${args.analysisId}, relationships=${results.length}, cacheHits=${cacheHits}`
  );

  return results;
}

async function searchDependencyMentionIssues(
  input: RelationshipSearchInput
): Promise<IssueSearchResult> {
  const token = getToken();
  const query = `repo:${input.owner}/${input.repo} is:issue ${input.targetDependencyName} in:title,body`;
  const params = new URLSearchParams({
    q: query,
    per_page: String(Math.max(1, Math.min(input.perPage, 10))),
  });

  const response = await fetch(`https://api.github.com/search/issues?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub issue search failed with status ${response.status}`);
  }

  return (await response.json()) as IssueSearchResult;
}

function prioritizeRelationshipPairs(
  candidates: Array<EnrichedDependencyInput & {
    gitHubMetrics: NonNullable<EnrichedDependencyInput["gitHubMetrics"]>;
  }>
): RelationshipPair[] {
  const pairs: RelationshipPair[] = [];

  for (const source of candidates) {
    for (const target of candidates) {
      if (source.dependency.id === target.dependency.id) continue;

      const reasons: string[] = [];
      let priority = 0;
      const sourceScore = safeDependencyScore(source);
      const targetScore = safeDependencyScore(target);
      const sourceRepo = source.gitHubMetrics.repository;
      const targetRepo = target.gitHubMetrics.repository;

      if (source.dependency.type === "DEPENDENCY") {
        priority += 30;
        reasons.push("production-source");
      }
      if (target.dependency.type === "DEPENDENCY") {
        priority += 20;
        reasons.push("production-target");
      }
      if (sourceScore != null) {
        priority += Math.max(0, 100 - sourceScore);
        if (sourceScore < 60) reasons.push("risky-source");
      }
      if (targetScore != null) {
        priority += Math.max(0, 100 - targetScore) * 0.5;
        if (targetScore < 60) reasons.push("risky-target");
      }
      if (sourceRepo.fullName === targetRepo.fullName) {
        priority += 60;
        reasons.push("same-repository");
      } else if (sourceRepo.owner === targetRepo.owner) {
        priority += 25;
        reasons.push("same-owner");
      }
      if (sharePackageFamily(source.dependency.name, target.dependency.name)) {
        priority += 35;
        reasons.push("same-package-family");
      }
      priority += Math.min(20, (source.gitHubMetrics.issues ?? 0) / 500);
      priority += Math.min(10, (target.gitHubMetrics.issues ?? 0) / 1000);

      pairs.push({ source, target, priority: Math.round(priority), reasons });
    }
  }

  return pairs.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const sourceCompare = a.source.dependency.name.localeCompare(b.source.dependency.name);
    if (sourceCompare !== 0) return sourceCompare;
    return a.target.dependency.name.localeCompare(b.target.dependency.name);
  });
}

function safeDependencyScore(dependency: EnrichedDependencyInput) {
  try {
    return scoreDependency(dependency).score;
  } catch {
    return null;
  }
}

function sharePackageFamily(sourceName: string, targetName: string) {
  const sourceFamily = packageFamily(sourceName);
  const targetFamily = packageFamily(targetName);
  if (!sourceFamily || !targetFamily) return false;
  return sourceFamily === targetFamily;
}

function packageFamily(packageName: string) {
  const normalized = packageName.toLowerCase();
  if (normalized.startsWith("@")) {
    const [scope, name] = normalized.split("/");
    if (!scope) return normalized;
    return `${scope}/${name?.split("-")[0] ?? ""}`;
  }
  return normalized.split("-")[0] ?? normalized;
}

function buildRelationshipCacheKey(
  source: RelationshipPair["source"],
  target: RelationshipPair["target"],
  perPage: number
) {
  return [
    RELATIONSHIP_CACHE_VERSION,
    source.gitHubMetrics.repository.fullName.toLowerCase(),
    source.dependency.name.toLowerCase(),
    target.dependency.name.toLowerCase(),
    String(perPage),
  ].join("|");
}

async function readCachedRelationship(args: {
  cache: RelationshipCacheDelegate | null;
  cacheKey: string;
  analysisId: string;
  source: RelationshipPair["source"];
  target: RelationshipPair["target"];
  logger: Pick<Console, "log" | "error">;
}) {
  if (!args.cache?.findUnique) return null;

  try {
    const cached = await args.cache.findUnique({
      where: { cacheKey: args.cacheKey },
    });
    if (!cached) return null;

    if (new Date(cached.expiresAt).getTime() <= Date.now()) return null;

    await args.cache.update?.({
      where: { cacheKey: args.cacheKey },
      data: { lastAccessedAt: new Date() },
    });

    const evidence = getRecord(cached.evidence) ?? {
      query: `repo:${args.source.gitHubMetrics.repository.fullName} is:issue ${args.target.dependency.name} in:title,body`,
      totalCount: cached.searchTotalCount ?? 0,
      issues: [],
      searchedAt: new Date().toISOString(),
    };

    return {
      analysisId: args.analysisId,
      sourceDependencyId: args.source.dependency.id,
      targetDependencyId: args.target.dependency.id,
      sourceDependencyName: args.source.dependency.name,
      targetDependencyName: args.target.dependency.name,
      sourceRepositoryFullName: args.source.gitHubMetrics.repository.fullName,
      relationshipType: cached.relationshipType as DependencyRelationshipType,
      confidence: cached.confidence as DependencyRelationshipConfidence,
      riskAdjustment: cached.riskAdjustment ?? 0,
      summary: cached.summary,
      evidence: evidence as DependencyRelationshipResult["evidence"],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown relationship cache read error";
    args.logger.error(`[relationships] Cache read failed: key=${args.cacheKey}, error=${message}`);
    return null;
  }
}

async function writeCachedRelationship(args: {
  cache: RelationshipCacheDelegate | null;
  cacheKey: string;
  relationship: DependencyRelationshipResult;
  source: RelationshipPair["source"];
  target: RelationshipPair["target"];
  logger: Pick<Console, "log" | "error">;
}) {
  if (!args.cache?.upsert) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + relationshipCacheTtlDays() * 24 * 60 * 60 * 1000);
  const data = {
    cacheKey: args.cacheKey,
    sourceRepositoryFullName: args.source.gitHubMetrics.repository.fullName,
    sourcePackageName: args.source.dependency.name,
    targetPackageName: args.target.dependency.name,
    relationshipType: args.relationship.relationshipType,
    confidence: args.relationship.confidence,
    riskAdjustment: args.relationship.riskAdjustment,
    summary: args.relationship.summary,
    evidence: args.relationship.evidence,
    searchTotalCount: args.relationship.evidence.totalCount,
    searchResultCount: args.relationship.evidence.issues.length,
    cacheVersion: RELATIONSHIP_CACHE_VERSION,
    expiresAt,
    lastAccessedAt: now,
  };

  try {
    await args.cache.upsert({
      where: { cacheKey: args.cacheKey },
      create: data,
      update: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown relationship cache write error";
    args.logger.error(`[relationships] Cache write failed: key=${args.cacheKey}, error=${message}`);
  }
}

function relationshipCacheTtlDays() {
  return positiveInteger(process.env.DEPENDENCY_RELATIONSHIP_CACHE_TTL_DAYS, 14);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function classifyRelationship(args: {
  analysisId: string;
  source: EnrichedDependencyInput;
  target: EnrichedDependencyInput;
  issueSearchResult: IssueSearchResult;
  searchedAt: string;
}): DependencyRelationshipResult {
  const evidence = extractEvidence(args.issueSearchResult, args.target.dependency.name);
  const conflictEvidence = evidence.filter((item) =>
    item.matchedTerms.some((term) => conflictTerms.includes(term))
  );
  const openConflictEvidence = conflictEvidence.filter((item) => item.state === "open");
  const labelRiskEvidence = evidence.filter((item) =>
    item.labels.some((label) => riskyLabels.includes(label.toLowerCase()))
  );

  if (openConflictEvidence.length > 0) {
    return relationshipResult({
      ...args,
      evidence,
      relationshipType: "KNOWN_INCOMPATIBILITY",
      confidence: "HIGH",
      riskAdjustment: -12,
      summary: `${args.source.dependency.name} has open issue evidence mentioning ${args.target.dependency.name} with conflict language.`,
    });
  }

  if (conflictEvidence.length >= 2) {
    return relationshipResult({
      ...args,
      evidence,
      relationshipType: "POSSIBLE_CONFLICT",
      confidence: "MEDIUM",
      riskAdjustment: -8,
      summary: `${args.source.dependency.name} has multiple issues mentioning ${args.target.dependency.name} with conflict language.`,
    });
  }

  if (conflictEvidence.length === 1 || labelRiskEvidence.length > 0) {
    return relationshipResult({
      ...args,
      evidence,
      relationshipType: "POSSIBLE_CONFLICT",
      confidence: "MEDIUM",
      riskAdjustment: -5,
      summary: `${args.source.dependency.name} has issue evidence suggesting possible friction with ${args.target.dependency.name}.`,
    });
  }

  if (evidence.length > 0) {
    return relationshipResult({
      ...args,
      evidence,
      relationshipType: "INTEGRATION_MENTION",
      confidence: "LOW",
      riskAdjustment: -1,
      summary: `${args.source.dependency.name} issues mention ${args.target.dependency.name}, but no strong incompatibility signal was found.`,
    });
  }

  return unknownRelationship({
    analysisId: args.analysisId,
    source: args.source,
    target: args.target,
    summary: `No issue evidence found connecting ${args.source.dependency.name} to ${args.target.dependency.name}.`,
    searchedAt: args.searchedAt,
  });
}

function extractEvidence(
  result: IssueSearchResult,
  targetDependencyName: string
): DependencyRelationshipEvidence[] {
  return (result.items ?? []).flatMap((issue) => {
    if (typeof issue.number !== "number" || !issue.title || !issue.html_url) return [];

    const labels = (issue.labels ?? [])
      .map((label) => label.name)
      .filter((label): label is string => typeof label === "string" && label.trim() !== "");
    const text = `${issue.title}\n${issue.body ?? ""}\n${labels.join(" ")}`.toLowerCase();
    if (!text.includes(targetDependencyName.toLowerCase())) return [];

    const matchedTerms = [
      targetDependencyName,
      ...conflictTerms,
      ...integrationTerms,
    ].filter((term) => text.includes(term.toLowerCase()));

    return [
      {
        issueNumber: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state === "closed" ? "closed" : "open",
        labels,
        matchedTerms,
        bodyPreview: issue.body ? issue.body.slice(0, 600) : null,
      },
    ];
  });
}

function relationshipResult(args: {
  analysisId: string;
  source: EnrichedDependencyInput;
  target: EnrichedDependencyInput;
  issueSearchResult: IssueSearchResult;
  searchedAt: string;
  evidence: DependencyRelationshipEvidence[];
  relationshipType: DependencyRelationshipType;
  confidence: DependencyRelationshipConfidence;
  riskAdjustment: number;
  summary: string;
}): DependencyRelationshipResult {
  const repository = args.source.gitHubMetrics!.repository;
  return {
    analysisId: args.analysisId,
    sourceDependencyId: args.source.dependency.id,
    targetDependencyId: args.target.dependency.id,
    sourceDependencyName: args.source.dependency.name,
    targetDependencyName: args.target.dependency.name,
    sourceRepositoryFullName: repository.fullName,
    relationshipType: args.relationshipType,
    confidence: args.confidence,
    riskAdjustment: args.riskAdjustment,
    summary: args.summary,
    evidence: {
      query: `repo:${repository.fullName} is:issue ${args.target.dependency.name} in:title,body`,
      totalCount: args.issueSearchResult.total_count ?? 0,
      issues: args.evidence,
      searchedAt: args.searchedAt,
    },
  };
}

function unknownRelationship(args: {
  analysisId: string;
  source: EnrichedDependencyInput;
  target: EnrichedDependencyInput;
  summary: string;
  searchedAt: string;
}): DependencyRelationshipResult {
  const repository = args.source.gitHubMetrics!.repository;
  return {
    analysisId: args.analysisId,
    sourceDependencyId: args.source.dependency.id,
    targetDependencyId: args.target.dependency.id,
    sourceDependencyName: args.source.dependency.name,
    targetDependencyName: args.target.dependency.name,
    sourceRepositoryFullName: repository.fullName,
    relationshipType: "UNKNOWN",
    confidence: "LOW",
    riskAdjustment: 0,
    summary: args.summary,
    evidence: {
      query: `repo:${repository.fullName} is:issue ${args.target.dependency.name} in:title,body`,
      totalCount: 0,
      issues: [],
      searchedAt: args.searchedAt,
    },
  };
}

function hasRepository(
  dependency: EnrichedDependencyInput
): dependency is EnrichedDependencyInput & {
  gitHubMetrics: NonNullable<EnrichedDependencyInput["gitHubMetrics"]>;
} {
  const repository = dependency.gitHubMetrics?.repository;
  return Boolean(repository?.owner && repository.name && repository.fullName);
}

function getToken() {
  const token = process.env.GITHUB_API_TOKEN?.split(",").map((value) => value.trim()).find(Boolean);
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is required to analyze dependency relationships");
  }
  return token;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
