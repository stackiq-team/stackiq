import { AnalysisStatus, DependencyType } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import * as https from "https";
import { enqueueAnalysisJob } from "./queue/analysisQueue.js";

const DEFAULT_EXPLORE_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPLORE_POPULAR_LIMIT = 3;
const DEFAULT_GITHUB_SEARCH_LIMIT = 50;

function getConfiguredExplorePopularLimit() {
  const value = Number(process.env.EXPLORE_TOP_LIMIT ?? process.env.LEADERBOARD_TOP_LIMIT ?? DEFAULT_EXPLORE_POPULAR_LIMIT);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_EXPLORE_POPULAR_LIMIT;
  return Math.floor(value);
}

function getConfiguredExploreRefreshIntervalMs() {
  const value = Number(
    process.env.EXPLORE_REFRESH_INTERVAL_MS ??
      process.env.LEADERBOARD_REFRESH_INTERVAL_MS ??
      DEFAULT_EXPLORE_REFRESH_INTERVAL_MS
  );
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_EXPLORE_REFRESH_INTERVAL_MS;
  return Math.floor(value);
}

function shouldRunExploreRefreshOnStart() {
  return process.env.EXPLORE_RUN_ON_START === "true";
}

function ageInDays(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function normalizeLog(value: number | null | undefined, cap: number): number {
  if (value == null || value <= 0) return 0;
  return Math.round((Math.log10(value + 1) / Math.log10(cap + 1)) * 100);
}

function normalizeInverseDays(value: number | null | undefined, excellent: number, poor: number): number {
  if (value == null) return 0;
  const numericValue = Math.max(0, value);
  if (numericValue <= excellent) return 100;
  if (numericValue >= poor) return 0;
  return Math.round(((poor - numericValue) / (poor - excellent)) * 100);
}

function normalizeCappedMetric(value: number | null | undefined, cap: number): number {
  if (value == null) return 0;
  return Math.round((Math.max(0, value) / cap) * 100);
}

function buildLeaderboardScore(repo: any) {
  const pushedAt = repo.pushedAt ?? repo.repositoryCreatedAt;
  const lastPushDays = ageInDays(pushedAt);

  return {
    popularityScore: Math.round(
      normalizeLog(repo.stargazerCount, 200000) * 0.5 +
        normalizeLog(repo.forkCount, 50000) * 0.3 +
        normalizeLog(repo.watchers.totalCount, 20000) * 0.2
    ),
    activityScore: Math.round(
      normalizeInverseDays(lastPushDays, 0, 365) * 0.6 +
        normalizeLog(repo.pullRequests.totalCount, 2000) * 0.2 +
        normalizeLog(repo.issues.totalCount, 10000) * 0.2
    ),
    compatibilityScore: Math.round(
      normalizeCappedMetric(repo.repositoryTopics.edges.length, 10) * 0.4 +
        (repo.primaryLanguage ? 100 : 30) * 0.6
    ),
  };
}

async function fetchRepositories(query: string, first: number): Promise<any[]> {
  const token = process.env.GITHUB_API_TOKEN?.split(",").map((value) => value.trim()).find(Boolean);
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is required for leaderboard refresh.");
  }

  const requestBody = JSON.stringify({
    query: `query SearchRepositories($searchQuery: String!, $first: Int!) {\n  search(query: $searchQuery, type: REPOSITORY, first: $first) {\n    nodes {\n      ... on Repository {\n        nameWithOwner\n        name\n        owner { login }\n        description\n        url\n        createdAt\n        pushedAt\n        stargazerCount\n        forkCount\n        watchers { totalCount }\n        issues(states: [OPEN, CLOSED]) { totalCount }\n        pullRequests(states: [OPEN, CLOSED]) { totalCount }\n        licenseInfo { spdxId }\n        primaryLanguage { name }\n        repositoryTopics(first: 10) { edges { node { topic { name } } } }\n      }\n    }\n  }\n}`,
    variables: { searchQuery: query, first },
  });

  return new Promise<any[]>((resolve, reject) => {
    const requestUrl = process.env.GITHUB_API_URL || "https://api.github.com/graphql";
    const req = https.request(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        "User-Agent": "stackiq-worker",
      },
    });

    let data = "";
    req.on("error", reject);
    req.on("response", (res: any) => {
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub request failed: ${res.statusCode}: ${data}`));
          return;
        }

        const payload = JSON.parse(data);
        if (payload.errors?.length) {
          reject(new Error(payload.errors.map((error: any) => error.message).join("; ")));
          return;
        }
        resolve(payload.data.search.nodes);
      });
    });
    req.write(requestBody);
    req.end();
  });
}

async function fetchPackageJson(owner: string, name: string): Promise<string | null> {
  const token = process.env.GITHUB_API_TOKEN?.split(",").map((value) => value.trim()).find(Boolean);
  if (!token) return null;

  const requestBody = JSON.stringify({
    query: `query PackageJson($owner: String!, $name: String!) {\n  repository(owner: $owner, name: $name) {\n    object(expression: "HEAD:package.json") {\n      ... on Blob {\n        text\n      }\n    }\n  }\n}`,
    variables: { owner, name },
  });

  return new Promise<string | null>((resolve) => {
    const req = https.request("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        "User-Agent": "stackiq-worker",
      },
    });

    let data = "";
    req.on("error", () => resolve(null));
    req.on("response", (res: any) => {
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const payload = JSON.parse(data);
          const text = payload?.data?.repository?.object?.text;
          resolve(typeof text === "string" ? text : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.write(requestBody);
    req.end();
  });
}

function parseDependencies(deps: unknown): Record<string, string> {
  return typeof deps === "object" && deps !== null ? (deps as Record<string, string>) : {};
}

type ExploreAnalysisInfo = Awaited<ReturnType<typeof analyzeRepository>>;

async function createOrUpdateLeaderboardItem(
  prisma: PrismaClient,
  repoData: any,
  category: string,
  rank: number,
  analysisCache: Map<string, Promise<ExploreAnalysisInfo>>
) {
  const fullName =
    repoData.fullName ??
    repoData.nameWithOwner ??
    `${repoData.owner?.login ?? ""}/${repoData.name}`;
  const ownerLogin = repoData.owner?.login ?? repoData.owner;

  const existing = await prisma.leaderboardRepository.findUnique({
    where: {
      fullName_category: {
        fullName,
        category,
      },
    },
  });

  const packageJsonText = await fetchPackageJson(ownerLogin, repoData.name);
  const packageJsonPresent = packageJsonText != null;

  const shouldCreateAnalysis =
    packageJsonPresent &&
    packageJsonText != null &&
    !existing?.analysisResultToken &&
    !existing?.analysisId;

  const score = shouldCreateAnalysis
    ? await getOrCreateExploreAnalysis({
        prisma,
        analysisCache,
        fullName,
        owner: ownerLogin,
        repo: repoData.name,
        packageJsonText,
      })
    : null;
  const analysisStatus =
    score?.analysisStatus ??
    existing?.analysisStatus ??
    (packageJsonPresent ? "UNKNOWN" : "UNKNOWN");
  const analysisScore = score?.result?.globalScore ?? null;
  const analysisResultToken = score?.result?.resultToken ?? existing?.analysisResultToken ?? null;
  const analysisId = score?.analysisId ?? existing?.analysisId ?? null;

  const { popularityScore, activityScore, compatibilityScore } = buildLeaderboardScore(repoData);

  const row = {
    owner: ownerLogin,
    name: repoData.name,
    fullName,
    url: repoData.url,
    description: repoData.description,
    stars: repoData.stargazerCount ?? repoData.stars,
    forks: repoData.forkCount ?? repoData.forks,
    watchers: repoData.watchers?.totalCount ?? repoData.watchers,
    issues: repoData.issues?.totalCount ?? repoData.issues,
    pullRequests: repoData.pullRequests?.totalCount ?? repoData.pullRequests,
    license: repoData.licenseInfo?.spdxId ?? repoData.license ?? null,
    primaryLanguage: repoData.primaryLanguage?.name ?? repoData.primaryLanguage ?? null,
    topics: repoData.repositoryTopics?.edges
      ? repoData.repositoryTopics.edges.map((edge: any) => edge.node.topic.name)
      : repoData.topics ?? [],
    repositoryCreatedAt: new Date(repoData.createdAt),
    pushedAt: new Date(repoData.pushedAt),
    githubPopularityScore: popularityScore,
    githubActivityScore: activityScore,
    githubCompatibilityScore: compatibilityScore,
    analysisScore: analysisScore ?? existing?.analysisScore ?? null,
    analysisStatus,
    analysisResultToken,
    analysisId,
    packageJsonPresent,
    category,
    rank,
  };

  if (existing) {
    await prisma.leaderboardRepository.update({
      where: { id: existing.id },
      data: row,
    });
  } else {
    await prisma.leaderboardRepository.create({
      data: row,
    });
  }
}

async function getOrCreateExploreAnalysis(args: {
  prisma: PrismaClient;
  analysisCache: Map<string, Promise<ExploreAnalysisInfo>>;
  fullName: string;
  owner: string;
  repo: string;
  packageJsonText: string;
}) {
  const cacheKey = args.fullName.toLowerCase();
  const cached = args.analysisCache.get(cacheKey);
  if (cached) return cached;

  const analysisPromise = analyzeRepository(
    args.prisma,
    args.owner,
    args.repo,
    args.packageJsonText
  );
  args.analysisCache.set(cacheKey, analysisPromise);
  return analysisPromise;
}

async function analyzeRepository(prisma: PrismaClient, owner: string, name: string, packageJsonText: string) {
  let parsed;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch {
    return null;
  }

  const dependencyRecords = [
    ...Object.entries(parseDependencies(parsed.dependencies)).map(([depName, version]) => ({
      name: depName,
      versionRequirement: version,
      type: DependencyType.DEPENDENCY,
    })),
    ...Object.entries(parseDependencies(parsed.devDependencies)).map(([depName, version]) => ({
      name: depName,
      versionRequirement: version,
      type: DependencyType.DEV_DEPENDENCY,
    })),
  ];

  if (dependencyRecords.length === 0) {
    return null;
  }

  const analysis = await prisma.analysis.create({
    data: {
      status: AnalysisStatus.PENDING,
      dependencies: {
        create: dependencyRecords,
      },
    },
    include: {
      dependencies: true,
    },
  });

  await enqueueAnalysisJob({
    analysisId: analysis.id,
    owner,
    repo: name,
    source: "EXPLORE_REFRESH",
  });

  return {
    analysisId: analysis.id,
    analysisStatus: AnalysisStatus.PENDING,
    result: {
      globalScore: 0,
      riskLevel: "UNKNOWN",
      summary: "Analysis scheduled",
      dependencyScores: [],
      resultToken: analysis.resultToken,
    },
  };
}

export async function refreshLeaderboardRepositories(prisma: PrismaClient) {
  console.log("[worker] Starting explore refresh scheduler");
  if (shouldRunExploreRefreshOnStart()) {
    await runExploreRefresh(prisma);
  }

  const interval = getConfiguredExploreRefreshIntervalMs();
  const timer = setInterval(() => {
    void runExploreRefresh(prisma);
  }, interval);
  timer.unref();
}

async function runExploreRefresh(prisma: PrismaClient) {
  try {
    await refreshOnce(prisma);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Explore refresh failed: ${message}`);
  }
}

async function refreshOnce(prisma: PrismaClient) {
  console.log("[worker] Running explore refresh job");

  const popularLimit = getConfiguredExplorePopularLimit();

  const popularRepos = await fetchRepositories("stars:>1000 sort:stars-desc", popularLimit);
  const activeRepos = await fetchRepositories(
    `pushed:>=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} sort:updated-desc`,
    DEFAULT_GITHUB_SEARCH_LIMIT
  );
  const bestRankedRepos = popularRepos
    .map((repo) => ({ repo, scores: buildLeaderboardScore(repo) }))
    .sort((a, b) => (b.scores.popularityScore + b.scores.activityScore + b.scores.compatibilityScore) - (a.scores.popularityScore + a.scores.activityScore + a.scores.compatibilityScore))
    .slice(0, DEFAULT_GITHUB_SEARCH_LIMIT)
    .map((entry) => entry.repo);
  const analysisCache = new Map<string, Promise<ExploreAnalysisInfo>>();

  await Promise.all([
    ...popularRepos.slice(0, popularLimit).map((repo, index) => createOrUpdateLeaderboardItem(prisma, repo, "popular", index + 1, analysisCache)),
    ...activeRepos.slice(0, 3).map((repo, index) => createOrUpdateLeaderboardItem(prisma, repo, "active", index + 1, analysisCache)),
    ...bestRankedRepos.slice(0, 3).map((repo, index) => createOrUpdateLeaderboardItem(prisma, repo, "bestRanked", index + 1, analysisCache)),
  ]);

  console.log("[worker] Explore refresh completed");
}
