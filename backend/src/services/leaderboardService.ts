import https from "https";
import type {
  LeaderboardCachePayload,
  LeaderboardLists,
  RepoLeaderboardItem,
} from "./leaderboardTypes";
import { prisma } from "../db/client";
import { enqueueAnalysisJob } from "../queue/analysisQueue";
import { AnalysisStatus, DependencyType } from "../generated/prisma/enums";
import { getLeaderboardsFromDb } from "./leaderboardDbService";

const GITHUB_API_URL = "https://api.github.com/graphql";

type RepositoryNode = {
  nameWithOwner: string;
  description: string | null;
  url: string;
  createdAt: string;
  pushedAt: string;
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  licenseInfo: { spdxId: string } | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { edges: Array<{ node: { topic: { name: string } } }> };
};

type SearchResponse = {
  search: {
    nodes: RepositoryNode[];
  };
};

const repositoryFields = `
  nameWithOwner
  description
  url
  createdAt
  pushedAt
  stargazerCount
  forkCount
  watchers {
    totalCount
  }
  issues(states: [OPEN, CLOSED]) {
    totalCount
  }
  pullRequests(states: [OPEN, CLOSED]) {
    totalCount
  }
  licenseInfo {
    spdxId
  }
  primaryLanguage {
    name
  }
  repositoryTopics(first: 10) {
    edges {
      node {
        topic {
          name
        }
      }
    }
  }
`;

const repositorySearchQuery = `
  query SearchRepositories($searchQuery: String!, $first: Int!) {
    search(query: $searchQuery, type: REPOSITORY, first: $first) {
      nodes {
        ... on Repository {
          ${repositoryFields}
        }
      }
    }
  }
`;

const repositoryPackageJsonQuery = `
  query RepositoryPackageJson($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: "HEAD:package.json") {
        ... on Blob {
          text
        }
      }
    }
  }
`;

function getToken(): string {
  const token = process.env.GITHUB_API_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is required to query GitHub.");
  }
  return token;
}

async function fetchGitHub<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const requestBody = JSON.stringify({ query, variables });
  const token = getToken();

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      GITHUB_API_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          "User-Agent": "stackiq-backend",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode == null || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub request failed ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const payload = JSON.parse(body) as { data?: T; errors?: Array<{ message: string }> };
            if (payload.errors?.length) {
              reject(new Error(payload.errors.map((error) => error.message).join("; ")));
              return;
            }
            if (!payload.data) {
              reject(new Error("GitHub did not return data."));
              return;
            }
            resolve(payload.data);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
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

function parseRepositoryNode(node: RepositoryNode): RepoLeaderboardItem {
  const topics = node.repositoryTopics.edges.map((edge) => edge.node.topic.name);
  const pushedAt = node.pushedAt ?? node.createdAt;
  const lastPushDays = ageInDays(pushedAt);

  const popularityScore = Math.round(
    normalizeLog(node.stargazerCount, 200000) * 0.5 +
      normalizeLog(node.forkCount, 50000) * 0.3 +
      normalizeLog(node.watchers.totalCount, 20000) * 0.2
  );

  const activityScore = Math.round(
    normalizeInverseDays(lastPushDays, 0, 365) * 0.6 +
      normalizeLog(node.pullRequests.totalCount, 2000) * 0.2 +
      normalizeLog(node.issues.totalCount, 10000) * 0.2
  );

  const compatibilityScore = Math.round(
    normalizeCappedMetric(topics.length, 10) * 0.4 +
      (node.primaryLanguage ? 100 : 30) * 0.6
  );

  const [owner, name] = node.nameWithOwner.split("/");

  return {
    owner: owner ?? "",
    name: name ?? node.nameWithOwner,
    fullName: node.nameWithOwner,
    description: node.description,
    url: node.url,
    stars: node.stargazerCount,
    forks: node.forkCount,
    watchers: node.watchers.totalCount,
    issues: node.issues.totalCount,
    pullRequests: node.pullRequests.totalCount,
    license: node.licenseInfo?.spdxId ?? null,
    primaryLanguage: node.primaryLanguage?.name ?? null,
    topics,
    createdAt: node.createdAt,
    pushedAt,
    popularityScore,
    activityScore,
    compatibilityScore,
    analysisScore: null,
    analysisStatus: null,
    analysisResultToken: null,
    packageJsonPresent: false,
  };
}

function ageInDays(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

async function fetchRepositories(query: string, first: number): Promise<RepoLeaderboardItem[]> {
  const data = await fetchGitHub<SearchResponse>(repositorySearchQuery, {
    searchQuery: query,
    first,
  });
  return data.search.nodes.map(parseRepositoryNode);
}

async function fetchRepositoryPackageJson(owner: string, name: string): Promise<string | null> {
  try {
    const data = await fetchGitHub<{ repository: { object: { text?: string } | null } | null }>(
      repositoryPackageJsonQuery,
      { owner, name }
    );

    return data.repository?.object?.text ?? null;
  } catch {
    return null;
  }
}

function parseDependencies(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((result, [key, item]) => {
    if (typeof key === "string" && (typeof item === "string" || typeof item === "number")) {
      result[key] = String(item);
    }
    return result;
  }, {});
}

function buildDependencyRecords(
  dependencies: unknown,
  devDependencies: unknown
): Array<{ name: string; versionRequirement: string; type: DependencyType }> {
  const parsedDependencies = parseDependencies(dependencies);
  const parsedDevDependencies = parseDependencies(devDependencies);

  return [
    ...Object.entries(parsedDependencies).map(([name, version]) => ({
      name,
      versionRequirement: version,
      type: DependencyType.DEPENDENCY,
    })),
    ...Object.entries(parsedDevDependencies).map(([name, version]) => ({
      name,
      versionRequirement: version,
      type: DependencyType.DEV_DEPENDENCY,
    })),
  ];
}

type RepositoryAnalysisInfo = {
  analysisId: string | null;
  analysisResultToken: string | null;
  analysisStatus: string | null;
  packageJsonPresent: boolean;
};

async function createAnalysisForRepository(owner: string, name: string): Promise<RepositoryAnalysisInfo> {
  const packageJsonText = await fetchRepositoryPackageJson(owner, name);
  if (!packageJsonText) {
    return {
      analysisId: null,
      analysisResultToken: null,
      analysisStatus: null,
      packageJsonPresent: false,
    };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonText);
  } catch {
    return {
      analysisId: null,
      analysisResultToken: null,
      analysisStatus: null,
      packageJsonPresent: true,
    };
  }

  const dependencyRecords = buildDependencyRecords(packageJson.dependencies, packageJson.devDependencies);
  if (dependencyRecords.length === 0) {
    return {
      analysisId: null,
      analysisResultToken: null,
      analysisStatus: null,
      packageJsonPresent: true,
    };
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

  await enqueueAnalysisJob({ analysisId: analysis.id });

  return {
    analysisId: analysis.id,
    analysisResultToken: analysis.resultToken,
    analysisStatus: AnalysisStatus.PENDING,
    packageJsonPresent: true,
  };
}

async function createOrUpdateLeaderboardItem(
  repoData: RepoLeaderboardItem,
  category: string,
  rank: number,
  analysisCache: Map<string, RepositoryAnalysisInfo>
) {
  const fullName = repoData.fullName;
  const existing = await prisma.leaderboardRepository.findUnique({
    where: {
      fullName_category: {
        fullName,
        category,
      },
    },
  });

  let analysisId = existing?.analysisId ?? null;
  let analysisResultToken = existing?.analysisResultToken ?? null;
  let analysisStatus = existing?.analysisStatus ?? null;
  let packageJsonPresent = existing?.packageJsonPresent ?? false;

  if (!analysisResultToken && !packageJsonPresent) {
    const cached = analysisCache.get(fullName);
    if (cached) {
      analysisId = cached.analysisId;
      analysisResultToken = cached.analysisResultToken;
      analysisStatus = cached.analysisStatus;
      packageJsonPresent = cached.packageJsonPresent;
    } else {
      const analysisInfo = await createAnalysisForRepository(repoData.owner, repoData.name);
      analysisId = analysisInfo.analysisId;
      analysisResultToken = analysisInfo.analysisResultToken;
      analysisStatus = analysisInfo.analysisStatus;
      packageJsonPresent = analysisInfo.packageJsonPresent;
      analysisCache.set(fullName, analysisInfo);
    }
  }

  const row = {
    owner: repoData.owner,
    name: repoData.name,
    fullName,
    url: repoData.url,
    description: repoData.description,
    stars: repoData.stars,
    forks: repoData.forks,
    watchers: repoData.watchers,
    issues: repoData.issues,
    pullRequests: repoData.pullRequests,
    license: repoData.license,
    primaryLanguage: repoData.primaryLanguage,
    topics: repoData.topics,
    repositoryCreatedAt: new Date(repoData.createdAt),
    pushedAt: new Date(repoData.pushedAt),
    githubPopularityScore: repoData.popularityScore,
    githubActivityScore: repoData.activityScore,
    githubCompatibilityScore: repoData.compatibilityScore,
    analysisScore: existing?.analysisScore ?? null,
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

async function loadOrRefreshLeaderboards(forceRefresh = false): Promise<LeaderboardCachePayload> {
  const existing = await getLeaderboardsFromDb();
  const hasResults =
    existing.leaderboards.popular.length > 0 ||
    existing.leaderboards.active.length > 0 ||
    existing.leaderboards.bestRanked.length > 0;

  if (!forceRefresh && hasResults) {
    return existing;
  }

  const popular = await fetchRepositories("stars:>1000 sort:stars-desc", 10);
  const days30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const active = await fetchRepositories(`pushed:>=${days30Ago} sort:updated-desc`, 10);
  const bestRankedCandidates = await fetchRepositories("stars:>500 sort:stars-desc", 50);
  const bestRanked = bestRankedCandidates
    .slice()
    .sort((a, b) =>
      (b.popularityScore + b.activityScore + b.compatibilityScore) -
      (a.popularityScore + a.activityScore + a.compatibilityScore)
    )
    .slice(0, 10);

  const analysisCache = new Map<string, RepositoryAnalysisInfo>();
  await Promise.all([
    ...popular.slice(0, 3).map((repo, index) =>
      createOrUpdateLeaderboardItem(repo, "popular", index + 1, analysisCache)
    ),
    ...active.slice(0, 3).map((repo, index) =>
      createOrUpdateLeaderboardItem(repo, "active", index + 1, analysisCache)
    ),
    ...bestRanked.slice(0, 3).map((repo, index) =>
      createOrUpdateLeaderboardItem(repo, "bestRanked", index + 1, analysisCache)
    ),
  ]);

  return await getLeaderboardsFromDb();
}

export async function getLeaderboards(forceRefresh = false): Promise<LeaderboardCachePayload> {
  try {
    return await loadOrRefreshLeaderboards(forceRefresh);
  } catch (error) {
    throw new Error(`Failed to load leaderboards: ${error instanceof Error ? error.message : String(error)}`);
  }
}
