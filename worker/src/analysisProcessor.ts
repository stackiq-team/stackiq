import { AnalysisStatus } from "@prisma/client";
import type { Job } from "bullmq";
import { Redis } from "ioredis";
import {
  createRedisConnectionOptions,
  type AnalysisJobData,
} from "./queue/config.js";
import { runIssuesMining } from "./adapters/issuesMining.adapter.js";
import {
  scoreDependency,
  scoreDependencies,
  type DependencyInput,
  type DependencyScoreInput,
  type EnrichedDependencyInput,
  type NormalizedInputs,
  type RiskLevel,
} from "./dependencyScore.js";
import { fetchGitHubMinerData } from "./adapters/githubMinerAdapter.js";
import type { GitHubMinerInput, GitHubMinerOutput } from "./types/githubMinerType.js";
import type { IssuesMiningMetrics, IssuesMiningResult, IssueSummary } from "./types/issuesMining.types.js";
import { DependencyAnalysisCacheManager } from "./cache/dependencyAnalysisCache.js";
import { sendResultEmail } from "./adapters/email.adapter.js";
import {
  analyzeDependencyRelationships,
  type DependencyRelationshipResult,
} from "./dependencyRelationships.js";
import { refreshLeaderboardRepositories } from "./leaderboardSync.js";
import { compactIssueSummariesForStorage } from "./utils/issueDataPersistence.js";
import { sanitizeJsonValue } from "./utils/jsonSanitizer.js";
import { buildFullStackReportPdf } from "./reporting/fullStackReport.js";

type AnalysisResultData = {
  globalScore: number;
  riskLevel: string;
  summary: string;
  dependencyScores?: DependencyScoreData[];
};

type DependencyScoreData = {
  dependencyId: string;
  score: number;
  riskLevel: RiskLevel;
  breakdown?: {
    popularityScore: number | null;
    maintenanceScore: number | null;
    resolutionQualityScore: number | null;
    normalizedInputs: NormalizedInputs;
  };
  warnings?: string[];
};

type DependencyScoreCreateData = {
  analysisResultId: string;
  dependencyId: string;
  score: number;
  riskLevel: string;
  popularityScore?: number | null;
  maintenanceScore?: number | null;
  resolutionQualityScore?: number | null;
  normalizedInputs?: any;
  githubMetrics?: any;
  issueMetrics?: any;
  issueData?: any;
  warnings?: any;
};

type AnalysisRepository = {
  analysis: {
    findUnique(args: {
      where: { id: string };
      include: { dependencies: true };
    }): Promise<{ id: string; dependencies: DependencyInput[], resultToken?: string | null } | null>;
    update(args: {
      where: { id: string };
      data: {
        status: AnalysisStatus;
        errorMessage?: string | null;
      };
    }): Promise<unknown>;
  };
  analysisResult: {
    upsert(args: {
      where: { analysisId: string };
      create: Omit<AnalysisResultData, "dependencyScores"> & { analysisId: string };
      update: Omit<AnalysisResultData, "dependencyScores">;
    }): Promise<{ id: string }>;
  };
  dependencyScore: {
    deleteMany(args: { where: { analysisResultId: string } }): Promise<unknown>;
    createMany(args: { data: DependencyScoreCreateData[] }): Promise<unknown>;
    upsert(args: any): Promise<unknown>;
  };
  dependencyRelationship?: {
    deleteMany(args: { where: { analysisId: string } }): Promise<unknown>;
    upsert(args: any): Promise<unknown>;
  };
  dependencyRelationshipCache?: any;
  leaderboardRepository?: {
    updateMany(args: any): Promise<unknown>;
  };
  dependencyAnalysisCache?: any;
};

type ProcessorOptions = {
  prisma: AnalysisRepository;
  runAnalysis?: (
    data: AnalysisJobData & { dependencies: EnrichedDependencyInput[] }
  ) => Promise<AnalysisResultData>;
  runGitHubMiner?: (
    data: GitHubMinerInput
  ) => Promise<GitHubMinerOutput>;
  runIssuesMining?: (
    owner: string,
    repo: string,
    sinceDate: string
  ) => Promise<IssuesMiningResult>;
  logger?: Pick<Console, "log" | "error">;
  cacheManager?: DependencyAnalysisCacheManager | null;
};

const DEFAULT_GITHUB_MINER_TIMEOUT_MS = 20000;
const DEFAULT_ISSUES_MINING_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_ISSUES_MINING_LOOKBACK_DAYS = 60;
const DEFAULT_RELATIONSHIP_ISSUES_MAX_ISSUES = 80;
const DEFAULT_RELATIONSHIP_DEEP_MIN_SCORE_SAMPLE_ISSUES = 30;
const DEFAULT_RELATIONSHIP_ISSUES_TIMEOUT_MS = 5 * 60 * 1000;
let dependencyCacheLockClient: Redis | null | undefined;

export async function processAnalysisJob(
  job: Pick<Job<AnalysisJobData>, "id" | "data" | "attemptsMade">,
  options: ProcessorOptions
) {
  const {
    prisma,
    runAnalysis = defaultRunAnalysis,
    runGitHubMiner = defaultRunGitHubMiner,
    runIssuesMining = defaultRunIssuesMining,
    logger = console,
    cacheManager = createDefaultCacheManager(prisma, logger),
  } = options;
  const { analysisId, email } = job.data;

  logger.log(
    `[worker] Job received: jobId=${job.id ?? analysisId}, analysisId=${analysisId}, attemptsMade=${job.attemptsMade}`
  );

  logger.log(`[worker] Loading analysis: analysisId=${analysisId}, email=${email ?? "none"}`);

  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      dependencies: true,
    },
  });

  if (!analysis) {
    logger.error(`[worker] Analysis not found: analysisId=${analysisId}`);
    throw new Error(`Analysis ${analysisId} was not found`);
  }

  logger.log(`[worker] Updating analysis to PROCESSING: analysisId=${analysisId}`);

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: AnalysisStatus.PROCESSING,
      errorMessage: null,
    },
  });
  logger.log(`[worker] Analysis status updated: analysisId=${analysisId}, status=PROCESSING`);

  try {
    logger.log(`[worker] Analysis processing started: analysisId=${analysisId}`);
    logger.log(
      `[worker] Analysis dependencies loaded: analysisId=${analysisId}, dependencies=${analysis.dependencies.length}`
    );

    const processingResult = await prisma.analysisResult.upsert({
      where: { analysisId },
      create: {
        analysisId,
        globalScore: 0,
        riskLevel: "HIGH",
        summary: `Analysis in progress. Scored 0 of ${analysis.dependencies.length} dependencies.`,
      },
      update: {
        globalScore: 0,
        riskLevel: "HIGH",
        summary: `Analysis in progress. Scored 0 of ${analysis.dependencies.length} dependencies.`,
      },
    });

    await prisma.dependencyScore.deleteMany({
      where: {
        analysisResultId: processingResult.id,
      },
    });

    let processedDependencyCount = 0;

    const dependencies = await enrichDependencies({
      dependencies: analysis.dependencies,
      runGitHubMiner,
      runIssuesMining,
      logger,
      analysisId,
      cacheManager,
      onDependencyEnriched: async (enrichedDependency) => {
        processedDependencyCount += 1;
        const dependencyScore = scoreDependency(enrichedDependency);

        await upsertDependencyScore({
          prisma,
          analysisResultId: processingResult.id,
          dependencyScore,
          enrichedDependency,
        });

        await prisma.analysisResult.upsert({
          where: { analysisId },
          create: {
            analysisId,
            globalScore: 0,
            riskLevel: "HIGH",
            summary: `Analysis in progress. Scored ${processedDependencyCount} of ${analysis.dependencies.length} dependencies.`,
          },
          update: {
            globalScore: 0,
            riskLevel: "HIGH",
            summary: `Analysis in progress. Scored ${processedDependencyCount} of ${analysis.dependencies.length} dependencies.`,
          },
        });

        logger.log(
          `[worker] Dependency score saved: analysisId=${analysisId}, dependencyId=${dependencyScore.dependencyId}, score=${dependencyScore.score}, processed=${processedDependencyCount}/${analysis.dependencies.length}`
        );
      },
    });
    logger.log(
      `[worker] Dependency enrichment complete: analysisId=${analysisId}, enrichedDependencies=${dependencies.length}`
    );

    const runAnalysisPayload: AnalysisJobData & { dependencies: EnrichedDependencyInput[] } = {
      analysisId,
      dependencies,
      ...(email === undefined ? {} : { email }),
    };

    const result = await runAnalysis(runAnalysisPayload);
    logger.log(
      `[worker] Score aggregation complete: analysisId=${analysisId}, dependencyScores=${result.dependencyScores?.length ?? 0}`
    );

    logger.log(
      `[worker] Saving analysis result: analysisId=${analysisId}, globalScore=${result.globalScore}, riskLevel=${result.riskLevel}`
    );

    const { dependencyScores = [], ...analysisResult } = result;

    const savedResult = await prisma.analysisResult.upsert({
      where: { analysisId },
      create: {
        analysisId,
        ...analysisResult,
      },
      update: analysisResult,
    });

    if (dependencyScores.length > 0) {
      await Promise.all(
        dependencyScores.map(async (dependencyScore) => {
          const enrichedDependency = dependencies.find(
            (item) => item.dependency.id === dependencyScore.dependencyId
          );

          if (!enrichedDependency) return;

          await upsertDependencyScore({
            prisma,
            analysisResultId: savedResult.id,
            dependencyScore,
            enrichedDependency,
          });
        })
      );
    }

    logger.log(
      `[worker] Analysis result saved: analysisId=${analysisId}, dependencyScores=${dependencyScores.length}`
    );

    if (analysisId && prisma.leaderboardRepository) {
      await prisma.leaderboardRepository.updateMany({
        where: { analysisId },
        data: {
          analysisScore: result.globalScore,
          analysisStatus: AnalysisStatus.COMPLETED,
          analysisResultToken: analysis?.resultToken ?? undefined,
        },
      });
      logger.log(
        `[worker] Leaderboard rows updated: analysisId=${analysisId}, analysisScore=${result.globalScore}`
      );
    }

    logger.log(`[worker] Updating analysis to COMPLETED: analysisId=${analysisId}`);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: AnalysisStatus.COMPLETED,
        errorMessage: null,
      },
    });
    logger.log(`[worker] Analysis status updated: analysisId=${analysisId}, status=COMPLETED`);

    const dependencyRelationships = await analyzeRelationshipsSafely({
      prisma,
      analysisId,
      dependencies,
      logger,
      runIssuesMining,
    });

    if (dependencyRelationships.length > 0) {
      logger.log(
        `[worker] Dependency relationships saved after completion: analysisId=${analysisId}, relationships=${dependencyRelationships.length}`
      );
    }

    await sendResultEmailSafely({
      email,
      result,
      dependencies,
      dependencyRelationships,
      resultToken: analysis.resultToken ?? "",
      analysisId,
      logger,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";

    logger.error(
      `[worker] Analysis processing failed: analysisId=${analysisId}, error=${message}`
    );
    logger.log(`[worker] Updating analysis to FAILED: analysisId=${analysisId}`);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: AnalysisStatus.FAILED,
        errorMessage: message,
      },
    });

    logger.error(
      `[worker] Analysis status updated: analysisId=${analysisId}, status=FAILED, error=${message}`
    );
    throw error;
  }
}

async function defaultRunAnalysis(
  data: AnalysisJobData & { dependencies: EnrichedDependencyInput[] }
): Promise<AnalysisResultData> {
  return scoreDependencies(data.dependencies);
}

async function defaultRunGitHubMiner(data: GitHubMinerInput): Promise<GitHubMinerOutput> {
  return fetchGitHubMinerData(data);
}

async function defaultRunIssuesMining(
  owner: string,
  repo: string,
  sinceDate: string
): Promise<IssuesMiningResult> {
  return runIssuesMining(owner, repo, sinceDate);
}

async function sendResultEmailSafely(args: {
  email: string | null | undefined;
  result: AnalysisResultData;
  dependencies: EnrichedDependencyInput[];
  dependencyRelationships: DependencyRelationshipResult[];
  resultToken: string;
  analysisId: string;
  logger: Pick<Console, "log" | "error">;
}) {
  args.logger.log(
    `[worker] Sending result email after relationship analysis: analysisId=${args.analysisId}, globalScore=${args.result.globalScore}, relationships=${args.dependencyRelationships.length}, email=${args.email ?? "none"}`
  );

  if (!args.email) {
    args.logger.log(`[worker] No email provided for analysis: analysisId=${args.analysisId}`);
    return;
  }

  try {
    const dependencyScores = args.result.dependencyScores?.map((dependencyScore) => {
      const enrichedDependency = args.dependencies.find(
        (item) => item.dependency.id === dependencyScore.dependencyId
      );

      return {
        ...dependencyScore,
        dependencyName: enrichedDependency?.dependency.name,
      };
    });

    const emailResult: AnalysisResultData = {
      ...args.result,
      ...(dependencyScores ? { dependencyScores } : {}),
    };
    const attachments: Parameters<typeof sendResultEmail>[3] = [];

    try {
      const reportPdf = buildFullStackReportPdf({
        analysisId: args.analysisId,
        resultToken: args.resultToken,
        globalScore: args.result.globalScore,
        riskLevel: args.result.riskLevel,
        summary: args.result.summary,
        dependencies: args.dependencies,
        dependencyScores: args.result.dependencyScores ?? [],
        relationships: args.dependencyRelationships,
      });

      attachments.push({
        filename: `stackiq-full-report-${args.resultToken || args.analysisId}.pdf`,
        content: reportPdf,
        contentType: "application/pdf",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown PDF error";
      args.logger.error(
        `[worker] Failed to build result PDF attachment; sending email without attachment: analysisId=${args.analysisId}, error=${message}`
      );
    }

    await sendResultEmail(emailResult, args.email, args.resultToken, attachments);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    args.logger.error(
      `[worker] Failed to send result email after completion: analysisId=${args.analysisId}, error=${message}`
    );
  }
}

async function enrichDependencies(args: {
  dependencies: DependencyInput[];
  runGitHubMiner: (data: GitHubMinerInput) => Promise<GitHubMinerOutput>;
  runIssuesMining: (owner: string, repo: string, sinceDate: string) => Promise<IssuesMiningResult>;
  logger: Pick<Console, "log" | "error">;
  analysisId: string;
  cacheManager?: DependencyAnalysisCacheManager | null;
  onDependencyEnriched?: (dependency: EnrichedDependencyInput) => Promise<void>;
}): Promise<EnrichedDependencyInput[]> {
  const enrichedDependencies: EnrichedDependencyInput[] = [];
  const issueResultsByRepository = new Map<string, IssuesMiningResult>();

  for (const dependency of args.dependencies) {
    const warnings: string[] = [];
    let gitHubMetrics: GitHubMinerOutput | null = null;
    let issueMetrics: IssuesMiningMetrics | null = null;
    let issueData: IssueSummary[] | null = null;
    let issueResultForCache: IssuesMiningResult | null = null;
    let releaseCacheLock: (() => Promise<void>) | null = null;

    try {
      const cacheLookup = args.cacheManager?.buildLookup(dependency);
      const cached = cacheLookup && args.cacheManager
        ? await findCacheSafely(args.cacheManager, cacheLookup, args.logger, dependency.name)
        : null;

      if (cached) {
        args.logger.log(
          `[worker] Dependency cache hit: analysisId=${args.analysisId}, dependency=${dependency.name}, cacheKey=${cached.cacheKey}`
        );
        gitHubMetrics = {
          ...cached.gitHubMetrics,
          dependencyId: dependency.id,
        };
        issueMetrics = cached.issueResult?.metrics ?? null;
        issueData = cached.issueResult?.issueData ?? null;
        issueResultForCache = cached.issueResult;
        warnings.push(...cached.warnings);

        const enrichedDependency = {
          dependency,
          gitHubMetrics,
          issueMetrics,
          issueData,
          warnings,
        };
        enrichedDependencies.push(enrichedDependency);
        await args.onDependencyEnriched?.(enrichedDependency);
        continue;
      }

      if (cacheLookup && args.cacheManager) {
        releaseCacheLock = await acquireCacheLockSafely(
          args.cacheManager,
          cacheLookup,
          args.logger,
          dependency.name
        );

        const cachedAfterLock = releaseCacheLock
          ? await findCacheSafely(args.cacheManager, cacheLookup, args.logger, dependency.name)
          : null;

        if (cachedAfterLock) {
          args.logger.log(
            `[worker] Dependency cache hit after lock: analysisId=${args.analysisId}, dependency=${dependency.name}, cacheKey=${cachedAfterLock.cacheKey}`
          );
          gitHubMetrics = {
            ...cachedAfterLock.gitHubMetrics,
            dependencyId: dependency.id,
          };
          issueMetrics = cachedAfterLock.issueResult?.metrics ?? null;
          issueData = cachedAfterLock.issueResult?.issueData ?? null;
          issueResultForCache = cachedAfterLock.issueResult;
          warnings.push(...cachedAfterLock.warnings);

          const enrichedDependency = {
            dependency,
            gitHubMetrics,
            issueMetrics,
            issueData,
            warnings,
          };
          enrichedDependencies.push(enrichedDependency);
          await releaseCacheLockSafely(releaseCacheLock, args.logger, dependency.name);
          await args.onDependencyEnriched?.(enrichedDependency);
          continue;
        }
      }

      args.logger.log(
        `[worker] Fetching GitHub data for dependency: analysisId=${args.analysisId}, dependency=${dependency.name}, versionRequirement=${dependency.versionRequirement}`
      );

      gitHubMetrics = await withTimeout(
        args.runGitHubMiner({
          fullPackageName: dependency.name,
          versionRequirement: dependency.versionRequirement,
          dependencyId: dependency.id,
        }),
        getConfiguredTimeout("GITHUB_MINER_TIMEOUT_MS", DEFAULT_GITHUB_MINER_TIMEOUT_MS),
        `GitHubMiner timed out for ${dependency.name}`
      );

      args.logger.log(
        `[worker] GitHub data fetched: analysisId=${args.analysisId}, dependency=${dependency.name}, repo=${gitHubMetrics.repository.fullName}`
      );

      if (!gitHubMetrics.repository.owner || !gitHubMetrics.repository.name) {
        args.logger.log(
          `[worker] Skipping issuesMining because no repository was resolved: analysisId=${args.analysisId}, dependency=${dependency.name}`
        );
        const enrichedDependency = {
          dependency,
          gitHubMetrics,
          issueMetrics,
          issueData,
          warnings,
        };
        enrichedDependencies.push(enrichedDependency);
        await saveCacheSafely({
          cacheManager: args.cacheManager,
          dependency,
          enrichedDependency,
          issueResult: issueResultForCache,
          logger: args.logger,
        });
        await releaseCacheLockSafely(releaseCacheLock, args.logger, dependency.name);
        await args.onDependencyEnriched?.(enrichedDependency);
        continue;
      }

      if (!shouldMineIssuesForDependency(dependency)) {
        warnings.push("issuesMining skipped by configuration.");
        args.logger.log(
          `[worker] Skipping issuesMining by configuration: analysisId=${args.analysisId}, dependency=${dependency.name}`
        );
        const enrichedDependency = {
          dependency,
          gitHubMetrics,
          issueMetrics,
          issueData,
          warnings,
        };
        enrichedDependencies.push(enrichedDependency);
        await saveCacheSafely({
          cacheManager: args.cacheManager,
          dependency,
          enrichedDependency,
          issueResult: issueResultForCache,
          logger: args.logger,
        });
        await releaseCacheLockSafely(releaseCacheLock, args.logger, dependency.name);
        await args.onDependencyEnriched?.(enrichedDependency);
        continue;
      }

      const repositoryKey = gitHubMetrics.repository.fullName.toLowerCase();
      let issueResult = issueResultsByRepository.get(repositoryKey);

      if (issueResult) {
        args.logger.log(
          `[worker] Reusing issuesMining result: analysisId=${args.analysisId}, dependency=${dependency.name}, repo=${gitHubMetrics.repository.fullName}`
        );
      } else {
        args.logger.log(
          `[worker] Starting issuesMining: analysisId=${args.analysisId}, dependency=${dependency.name}, repo=${gitHubMetrics.repository.fullName}`
        );

        issueResult = await withTimeout(
          args.runIssuesMining(
            gitHubMetrics.repository.owner,
            gitHubMetrics.repository.name,
            getIssuesSinceDate()
          ),
          getConfiguredTimeout("ISSUES_MINING_TIMEOUT_MS", DEFAULT_ISSUES_MINING_TIMEOUT_MS),
          `issuesMining timed out for ${dependency.name}`
        );
        issueResultsByRepository.set(repositoryKey, issueResult);
      }
      issueResultForCache = issueResult;
      issueMetrics = issueResult.metrics;
      issueData = issueResult.issueData ?? null;

      args.logger.log(
        `[worker] issuesMining finished: analysisId=${args.analysisId}, dependency=${dependency.name}, status=${issueResult.status}, totalIssues=${issueMetrics.totalIssuesAnalyzed}`
      );

      if (issueResult.status !== "SUCCESS") {
        warnings.push(issueResult.error ?? "issuesMining returned incomplete data.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown enrichment error";
      warnings.push(message);
      args.logger.error(
        `[worker] Dependency enrichment failed: analysisId=${args.analysisId}, dependency=${dependency.name}, error=${message}`
      );
    }

    const enrichedDependency = {
      dependency,
      gitHubMetrics,
      issueMetrics,
      issueData,
      warnings,
    };
    enrichedDependencies.push(enrichedDependency);
    await saveCacheSafely({
      cacheManager: args.cacheManager,
      dependency,
      enrichedDependency,
      issueResult: issueResultForCache,
      logger: args.logger,
    });
    await releaseCacheLockSafely(releaseCacheLock, args.logger, dependency.name);
    await args.onDependencyEnriched?.(enrichedDependency);
  }

  return enrichedDependencies;
}

async function analyzeRelationshipsSafely(args: {
  prisma: AnalysisRepository;
  analysisId: string;
  dependencies: EnrichedDependencyInput[];
  logger: Pick<Console, "log" | "error">;
  runIssuesMining: (owner: string, repo: string, sinceDate: string) => Promise<IssuesMiningResult>;
}) {
  if (!args.prisma.dependencyRelationship) {
    args.logger.log("[worker] Dependency relationships unavailable: Prisma delegate not present.");
    return [];
  }

  try {
    const relationshipIssueDataByRepository = new Map<
      string,
      Promise<IssueSummary[] | null | undefined>
    >();
    const relationshipIssueSampleKey = getRelationshipIssueSampleKey();

    args.logger.log(
      `[worker] Dependency relationship analysis started: analysisId=${args.analysisId}, dependencies=${args.dependencies.length}, issueSample=${relationshipIssueSampleKey}`
    );
    const relationships = await analyzeDependencyRelationships({
      analysisId: args.analysisId,
      dependencies: args.dependencies,
      logger: args.logger,
      relationshipCache: args.prisma.dependencyRelationshipCache ?? null,
      issueDataSampleKey: relationshipIssueSampleKey,
      getIssueData: (source) =>
        getRelationshipIssueData({
          source,
          runIssuesMining: args.runIssuesMining,
          logger: args.logger,
          analysisId: args.analysisId,
          cache: relationshipIssueDataByRepository,
        }),
    });
    await saveDependencyRelationships({
      prisma: args.prisma,
      analysisId: args.analysisId,
      relationships,
    });
    args.logger.log(
      `[worker] Dependency relationship analysis finished: analysisId=${args.analysisId}, relationships=${relationships.length}`
    );
    return relationships;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown relationship analysis error";
    args.logger.error(
      `[worker] Dependency relationship analysis failed: analysisId=${args.analysisId}, error=${message}`
    );
    return [];
  }
}

async function getRelationshipIssueData(args: {
  source: EnrichedDependencyInput & {
    gitHubMetrics: NonNullable<EnrichedDependencyInput["gitHubMetrics"]>;
  };
  runIssuesMining: (owner: string, repo: string, sinceDate: string) => Promise<IssuesMiningResult>;
  logger: Pick<Console, "log" | "error">;
  analysisId: string;
  cache: Map<string, Promise<IssueSummary[] | null | undefined>>;
}) {
  if (!shouldRunDeepRelationshipIssueMining(args.source.issueData)) {
    return args.source.issueData ?? null;
  }

  const repository = args.source.gitHubMetrics.repository;
  const repositoryKey = repository.fullName.toLowerCase();
  const cached = args.cache.get(repositoryKey);
  if (cached) return cached;

  const samplePromise = runRelationshipIssuesMining({
    owner: repository.owner,
    repo: repository.name,
    fullName: repository.fullName,
    runIssuesMining: args.runIssuesMining,
    logger: args.logger,
    analysisId: args.analysisId,
    fallbackIssueData: args.source.issueData ?? null,
  });
  args.cache.set(repositoryKey, samplePromise);
  return samplePromise;
}

async function runRelationshipIssuesMining(args: {
  owner: string;
  repo: string;
  fullName: string;
  runIssuesMining: (owner: string, repo: string, sinceDate: string) => Promise<IssuesMiningResult>;
  logger: Pick<Console, "log" | "error">;
  analysisId: string;
  fallbackIssueData: IssueSummary[] | null;
}) {
  const maxIssues = getRelationshipIssuesMaxIssues();
  const sinceDate = getRelationshipIssuesSinceDate();
  const issueLimits = getRelationshipIssueBucketLimits(maxIssues);
  args.logger.log(
    `[worker] Relationship issueMining started: analysisId=${args.analysisId}, repo=${args.fullName}, maxIssues=${maxIssues}, recentOpen=${issueLimits.recentOpen}, recentClosed=${issueLimits.recentClosed}, olderClosed=${issueLimits.olderClosed}, oldOpen=${issueLimits.oldOpen}, sinceDate=${sinceDate}`
  );

  try {
    const result = await withTimeout(
      withTemporaryEnv(
        {
          ISSUES_MINING_MAX_ISSUES: String(maxIssues),
          ISSUES_MINING_MAX_OPEN_ISSUES: String(issueLimits.recentOpen + issueLimits.oldOpen),
          ISSUES_MINING_MAX_CLOSED_ISSUES: String(issueLimits.recentClosed + issueLimits.olderClosed),
          ISSUES_MINING_RECENT_OPEN_LIMIT: String(issueLimits.recentOpen),
          ISSUES_MINING_RECENT_CLOSED_LIMIT: String(issueLimits.recentClosed),
          ISSUES_MINING_OLDER_CLOSED_LIMIT: String(issueLimits.olderClosed),
          ISSUES_MINING_OLD_OPEN_LIMIT: String(issueLimits.oldOpen),
        },
        () => args.runIssuesMining(args.owner, args.repo, sinceDate)
      ),
      getConfiguredTimeout(
        "DEPENDENCY_RELATIONSHIP_ISSUES_TIMEOUT_MS",
        DEFAULT_RELATIONSHIP_ISSUES_TIMEOUT_MS
      ),
      `relationship issueMining timed out for ${args.fullName}`
    );

    const issueData = result.issueData ?? args.fallbackIssueData ?? [];
    args.logger.log(
      `[worker] Relationship issueMining finished: analysisId=${args.analysisId}, repo=${args.fullName}, status=${result.status}, sampledIssues=${issueData.length}, totalIssues=${result.metrics.totalIssuesAnalyzed}`
    );

    if (result.status !== "SUCCESS") {
      args.logger.error(
        `[worker] Relationship issueMining incomplete: analysisId=${args.analysisId}, repo=${args.fullName}, error=${result.error ?? "unknown"}`
      );
    }

    return issueData;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown relationship issueMining error";
    args.logger.error(
      `[worker] Relationship issueMining failed: analysisId=${args.analysisId}, repo=${args.fullName}, error=${message}`
    );
    return args.fallbackIssueData ?? [];
  }
}

async function saveDependencyRelationships(args: {
  prisma: AnalysisRepository;
  analysisId: string;
  relationships: DependencyRelationshipResult[];
}) {
  if (!args.prisma.dependencyRelationship) return;

  await args.prisma.dependencyRelationship.deleteMany({
    where: { analysisId: args.analysisId },
  });
  console.log(
    `[worker] Existing dependency relationships cleared: analysisId=${args.analysisId}`
  );

  await Promise.all(
    args.relationships.map((relationship) =>
      args.prisma.dependencyRelationship!.upsert({
        where: {
          analysisId_sourceDependencyId_targetDependencyId: {
            analysisId: relationship.analysisId,
            sourceDependencyId: relationship.sourceDependencyId,
            targetDependencyId: relationship.targetDependencyId,
          },
        },
        create: {
          analysisId: relationship.analysisId,
          sourceDependencyId: relationship.sourceDependencyId,
          targetDependencyId: relationship.targetDependencyId,
          relationshipType: relationship.relationshipType,
          confidence: relationship.confidence,
          riskAdjustment: relationship.riskAdjustment,
          summary: relationship.summary,
          evidence: relationship.evidence,
        },
        update: {
          relationshipType: relationship.relationshipType,
          confidence: relationship.confidence,
          riskAdjustment: relationship.riskAdjustment,
          summary: relationship.summary,
          evidence: relationship.evidence,
        },
      })
    )
  );
  console.log(
    `[worker] Dependency relationships persisted: analysisId=${args.analysisId}, relationships=${args.relationships.length}`
  );
}

function createDefaultCacheManager(
  prisma: AnalysisRepository,
  logger: Pick<Console, "log" | "error">
) {
  if (!prisma.dependencyAnalysisCache) {
    logger.log("[worker] Dependency cache unavailable: Prisma cache delegate not present.");
    return null;
  }

  return new DependencyAnalysisCacheManager(
    prisma as any,
    () => new Date(),
    getDependencyCacheLockClient(logger)
  );
}

function getDependencyCacheLockClient(logger: Pick<Console, "log" | "error">) {
  if (dependencyCacheLockClient !== undefined) return dependencyCacheLockClient;

  try {
    dependencyCacheLockClient = new Redis(createRedisConnectionOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Redis client error";
    logger.error(`[worker] Dependency cache Redis lock unavailable: error=${message}`);
    dependencyCacheLockClient = null;
  }

  return dependencyCacheLockClient;
}

async function findCacheSafely(
  cacheManager: DependencyAnalysisCacheManager,
  lookup: ReturnType<DependencyAnalysisCacheManager["buildLookup"]>,
  logger: Pick<Console, "log" | "error">,
  dependencyName: string
) {
  try {
    return await cacheManager.findCache(lookup);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cache lookup error";
    logger.error(
      `[worker] Dependency cache lookup failed: dependency=${dependencyName}, error=${message}`
    );
    return null;
  }
}

async function acquireCacheLockSafely(
  cacheManager: DependencyAnalysisCacheManager,
  lookup: ReturnType<DependencyAnalysisCacheManager["buildLookup"]>,
  logger: Pick<Console, "log" | "error">,
  dependencyName: string
) {
  try {
    return await cacheManager.acquireLock(cacheManager.buildCacheKey(lookup));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cache lock error";
    logger.error(
      `[worker] Dependency cache lock failed: dependency=${dependencyName}, error=${message}`
    );
    return null;
  }
}

async function releaseCacheLockSafely(
  release: (() => Promise<void>) | null,
  logger: Pick<Console, "log" | "error">,
  dependencyName: string
) {
  if (!release) return;
  try {
    await release();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cache unlock error";
    logger.error(
      `[worker] Dependency cache unlock failed: dependency=${dependencyName}, error=${message}`
    );
  }
}

async function saveCacheSafely(args: {
  cacheManager?: DependencyAnalysisCacheManager | null | undefined;
  dependency: DependencyInput;
  enrichedDependency: EnrichedDependencyInput;
  issueResult: IssuesMiningResult | null;
  logger: Pick<Console, "log" | "error">;
}) {
  if (!args.cacheManager || !args.enrichedDependency.gitHubMetrics) return;

  try {
    const dependencyScore = scoreDependency(args.enrichedDependency);
    await args.cacheManager.save(
      args.cacheManager.buildLookup(args.dependency),
      args.enrichedDependency,
      dependencyScore,
      args.issueResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cache save error";
    args.logger.error(
      `[worker] Dependency cache save failed: dependency=${args.dependency.name}, error=${message}`
    );
  }
}

async function upsertDependencyScore(args: {
  prisma: AnalysisRepository;
  analysisResultId: string;
  dependencyScore: DependencyScoreData;
  enrichedDependency: EnrichedDependencyInput;
}) {
  const data = buildDependencyScoreCreateData(args);

  await args.prisma.dependencyScore.upsert({
    where: {
      analysisResultId_dependencyId: {
        analysisResultId: args.analysisResultId,
        dependencyId: args.dependencyScore.dependencyId,
      },
    },
    create: data,
    update: {
      score: data.score,
      riskLevel: data.riskLevel,
      popularityScore: data.popularityScore,
      maintenanceScore: data.maintenanceScore,
      resolutionQualityScore: data.resolutionQualityScore,
      normalizedInputs: data.normalizedInputs,
      githubMetrics: data.githubMetrics,
      issueMetrics: data.issueMetrics,
      issueData: data.issueData,
      warnings: data.warnings,
    },
  });
}

function buildDependencyScoreCreateData(args: {
  analysisResultId: string;
  dependencyScore: DependencyScoreData;
  enrichedDependency: EnrichedDependencyInput;
}): DependencyScoreCreateData {
  return {
    analysisResultId: args.analysisResultId,
    dependencyId: args.dependencyScore.dependencyId,
    score: args.dependencyScore.score,
    riskLevel: args.dependencyScore.riskLevel,
    popularityScore: args.dependencyScore.breakdown?.popularityScore ?? null,
    maintenanceScore: args.dependencyScore.breakdown?.maintenanceScore ?? null,
    resolutionQualityScore:
      args.dependencyScore.breakdown?.resolutionQualityScore ?? null,
    normalizedInputs: sanitizeJsonValue(args.dependencyScore.breakdown?.normalizedInputs ?? null),
    githubMetrics: sanitizeJsonValue(args.enrichedDependency.gitHubMetrics ?? null),
    issueMetrics: sanitizeJsonValue(args.enrichedDependency.issueMetrics ?? null),
    issueData: sanitizeJsonValue(
      compactIssueSummariesForStorage(args.enrichedDependency.issueData)
    ),
    warnings: sanitizeJsonValue(args.dependencyScore.warnings ?? []),
  };
}

function getIssuesSinceDate() {
  const date = new Date();
  const lookbackDays = Number(
    process.env.ISSUES_MINING_LOOKBACK_DAYS ?? DEFAULT_ISSUES_MINING_LOOKBACK_DAYS
  );
  date.setDate(
    date.getDate() -
      (Number.isFinite(lookbackDays) && lookbackDays > 0
        ? lookbackDays
        : DEFAULT_ISSUES_MINING_LOOKBACK_DAYS)
  );
  return date.toISOString().split("T")[0]!;
}

function getRelationshipIssuesSinceDate() {
  const date = new Date();
  const lookbackDays = positiveInteger(
    process.env.DEPENDENCY_RELATIONSHIP_ISSUES_LOOKBACK_DAYS ??
      process.env.ISSUES_MINING_LOOKBACK_DAYS,
    DEFAULT_ISSUES_MINING_LOOKBACK_DAYS
  );
  date.setDate(date.getDate() - lookbackDays);
  return date.toISOString().split("T")[0]!;
}

function getRelationshipIssuesMaxIssues() {
  return positiveInteger(
    process.env.DEPENDENCY_RELATIONSHIP_ISSUES_MAX_ISSUES,
    DEFAULT_RELATIONSHIP_ISSUES_MAX_ISSUES
  );
}

function getRelationshipIssueSampleKey() {
  if (getRelationshipDeepIssueMode() === "false") {
    return "score-sample";
  }

  return [
    `relationship-issuemining-${getRelationshipDeepIssueMode()}`,
    `max=${getRelationshipIssuesMaxIssues()}`,
    `minScoreSample=${getRelationshipDeepMinScoreSampleIssues()}`,
    `lookback=${positiveInteger(
      process.env.DEPENDENCY_RELATIONSHIP_ISSUES_LOOKBACK_DAYS ??
        process.env.ISSUES_MINING_LOOKBACK_DAYS,
      DEFAULT_ISSUES_MINING_LOOKBACK_DAYS
    )}`,
  ].join(":");
}

function shouldRunDeepRelationshipIssueMining(issueData: IssueSummary[] | null | undefined) {
  const mode = getRelationshipDeepIssueMode();
  if (mode === "false") return false;
  if (mode === "always") return true;

  const scoreSampleSize = Array.isArray(issueData) ? issueData.length : 0;
  return scoreSampleSize < getRelationshipDeepMinScoreSampleIssues();
}

function getRelationshipDeepIssueMode() {
  const configured = (process.env.DEPENDENCY_RELATIONSHIP_DEEP_ISSUES_ENABLED ?? "auto")
    .trim()
    .toLowerCase();

  if (configured === "false" || configured === "0" || configured === "off") return "false";
  if (configured === "always") return "always";
  return "auto";
}

function getRelationshipDeepMinScoreSampleIssues() {
  return positiveInteger(
    process.env.DEPENDENCY_RELATIONSHIP_DEEP_MIN_SCORE_SAMPLE_ISSUES,
    DEFAULT_RELATIONSHIP_DEEP_MIN_SCORE_SAMPLE_ISSUES
  );
}

function getRelationshipIssueBucketLimits(maxIssues: number) {
  const total = Math.max(1, maxIssues);
  const recentOpen = Math.max(1, Math.floor(total * 0.3));
  const recentClosed = Math.max(1, Math.floor(total * 0.4));
  const olderClosed = Math.max(0, Math.floor(total * 0.2));
  const used = recentOpen + recentClosed + olderClosed;

  return {
    recentOpen,
    recentClosed,
    olderClosed,
    oldOpen: Math.max(0, total - used),
  };
}

function shouldMineIssuesForDependency(dependency: DependencyInput) {
  if (dependency.type !== "DEV_DEPENDENCY") return true;
  return process.env.ISSUES_MINING_INCLUDE_DEV_DEPENDENCIES !== "false";
}

function getConfiguredTimeout(name: string, defaultValue: number) {
  const configured = Number(process.env[name] ?? defaultValue);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultValue;
}

function positiveInteger(value: string | number | undefined, defaultValue: number) {
  const configured = Number(value ?? defaultValue);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : defaultValue;
}

async function withTemporaryEnv<T>(
  updates: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
