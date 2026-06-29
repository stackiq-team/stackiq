import type { GitHubMinerRawData, NpmPackageMetrics } from "../types/githubMinerType.js";

type RepositoryNode = {
  nameWithOwner: string;
  description: string | null;
  url: string;
  createdAt: string;
  assignableUsers: { totalCount: number };
  watchers: { totalCount: number };
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  diskUsage: number;
  licenseInfo: { spdxId: string } | null;
  languages: { edges: Array<{ node: { name: string } }> };
  primaryLanguage: { name: string } | null;
  repositoryTopics: { edges: Array<{ node: { topic: { name: string } } }> };
};

type SearchResponse = {
  search: {
    nodes: RepositoryNode[];
  };
};

type RepositoryResponse = {
  repository: RepositoryNode | null;
};

type NpmPackageMetadata = {
  repository?: string | { type?: string; url?: string; directory?: string };
  bugs?: { url?: string } | string;
  homepage?: string;
  license?: string;
  readme?: string;
  time?: Record<string, string>;
  versions?: Record<string, {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>;
  "dist-tags"?: { latest?: string };
};

type NpmDownloadsResponse = {
  downloads?: number;
};

type ResolvedRepository = {
  owner: string;
  name: string;
  source: "PACKAGE_OVERRIDE" | "NPM_REGISTRY" | "GITHUB_SEARCH";
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

const packageRepositoryOverrides: Record<string, `${string}/${string}`> = {
  "@emotion/react": "emotion-js/emotion",
  "@emotion/styled": "emotion-js/emotion",
  "@eslint/js": "eslint/eslint",
  "@mui/material": "mui/material-ui",
  "@testing-library/jest-dom": "testing-library/jest-dom",
  "@testing-library/react": "testing-library/react-testing-library",
  "@types/node": "DefinitelyTyped/DefinitelyTyped",
  "@types/react": "DefinitelyTyped/DefinitelyTyped",
  "@types/react-dom": "DefinitelyTyped/DefinitelyTyped",
  "@vitejs/plugin-react": "vitejs/vite-plugin-react",
  "@vitest/coverage-v8": "vitest-dev/vitest",
  "eslint-plugin-react-hooks": "facebook/react",
  "eslint-plugin-react-refresh": "ArnaudBarre/eslint-plugin-react-refresh",
  "globals": "sindresorhus/globals",
  "jsdom": "jsdom/jsdom",
  "react": "facebook/react",
  "react-dom": "facebook/react",
  "react-router-dom": "remix-run/react-router",
  "typescript": "microsoft/TypeScript",
  "typescript-eslint": "typescript-eslint/typescript-eslint",
  "vite": "vitejs/vite",
  "vitest": "vitest-dev/vitest",
};

const repositoryFields = `
  nameWithOwner
  description
  url
  createdAt
  assignableUsers {
    totalCount
  }
  watchers {
    totalCount
  }
  stargazerCount
  forkCount
  issues(states: [OPEN, CLOSED]) {
    totalCount
  }
  pullRequests {
    totalCount
  }
  diskUsage
  licenseInfo {
    spdxId
  }
  languages(first: 10) {
    edges {
      node {
        name
      }
    }
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
  query RepositorySearch($searchQuery: String!, $first: Int!) {
    search(query: $searchQuery, type: REPOSITORY, first: $first) {
      nodes {
        ... on Repository {
          ${repositoryFields}
        }
      }
    }
  }
`;

const repositoryByNameQuery = `
  query RepositoryByName($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      ${repositoryFields}
    }
  }
`;

function getToken() {
  const token = process.env.GITHUB_API_TOKEN?.split(",").map((value) => value.trim()).find(Boolean);
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is required to run GitHubMiner");
  }
  return token;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${url}`);
  }

  return await response.json() as T;
}

async function requestGitHub<T>(query: string, variables: Record<string, unknown>) {
  const payload = await fetchJson<{ data?: T; errors?: Array<{ message: string }> }>(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  if (!payload.data) {
    throw new Error("GitHubMiner returned no data");
  }

  return payload.data;
}

function packageNameFromSpecifier(packageSpecifier: string) {
  if (packageSpecifier.startsWith("@")) {
    const parts = packageSpecifier.split("@");
    return `@${parts[1] ?? packageSpecifier}`;
  }

  return packageSpecifier.split("@")[0] ?? packageSpecifier;
}

function searchQueryForPackage(packageName: string) {
  if (!packageName.startsWith("@")) {
    return `${packageName} in:name,description sort:stars-desc`;
  }

  const [scope = "", name = packageName] = packageName.slice(1).split("/");
  return `${name} ${scope} in:name,description sort:stars-desc`;
}

function parseGitHubRepositoryUrl(value: string | null | undefined): { owner: string; name: string } | null {
  if (!value) return null;

  const normalizedValue = value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git(#.*)?$/, "")
    .replace(/#.*$/, "");

  const sshMatch = normalizedValue.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (sshMatch) {
    return {
      owner: sshMatch[1]!,
      name: sshMatch[2]!,
    };
  }

  const urlMatch = normalizedValue.match(/github\.com[:/]([^/]+)\/([^/#?]+)/i);
  if (!urlMatch) return null;

  return {
    owner: urlMatch[1]!,
    name: urlMatch[2]!,
  };
}

function splitRepositoryFullName(fullName: string): { owner: string; name: string } {
  const [owner = "", name = ""] = fullName.split("/");
  return { owner, name };
}

function npmPackageUrl(packageName: string) {
  return `https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/^%40/, "@")}`;
}

function npmDownloadsUrl(packageName: string) {
  return `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName).replace(/^%40/, "@")}`;
}

function ageInDays(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

async function fetchNpmMetadata(packageName: string): Promise<NpmPackageMetadata | null> {
  try {
    return await fetchJson<NpmPackageMetadata>(npmPackageUrl(packageName));
  } catch {
    return null;
  }
}

async function fetchWeeklyDownloads(packageName: string) {
  try {
    const response = await fetchJson<NpmDownloadsResponse>(npmDownloadsUrl(packageName));
    return typeof response.downloads === "number" ? response.downloads : null;
  } catch {
    return null;
  }
}

async function collectNpmMetrics(
  packageName: string,
  metadata: NpmPackageMetadata | null
): Promise<NpmPackageMetrics> {
  const latestVersion = metadata?.["dist-tags"]?.latest;
  const latestPackage = latestVersion ? metadata?.versions?.[latestVersion] : undefined;

  return {
    weeklyDownloads: await fetchWeeklyDownloads(packageName),
    packageAgeDays: ageInDays(metadata?.time?.created),
    latestPublishAgeDays: ageInDays(
      latestVersion ? metadata?.time?.[latestVersion] : metadata?.time?.modified
    ),
    versionCount: metadata?.versions ? Object.keys(metadata.versions).length : null,
    dependencyCount: latestPackage?.dependencies
      ? Object.keys(latestPackage.dependencies).length
      : 0,
    devDependencyCount: latestPackage?.devDependencies
      ? Object.keys(latestPackage.devDependencies).length
      : 0,
    hasLicense: metadata?.license ? true : false,
    hasRepository: metadata?.repository ? true : false,
    hasReadme: metadata?.readme ? metadata.readme.trim().length > 0 : false,
  };
}

async function resolveNpmRepository(packageName: string): Promise<ResolvedRepository | null> {
  const override = packageRepositoryOverrides[packageName];
  if (override) {
    return {
      ...splitRepositoryFullName(override),
      source: "PACKAGE_OVERRIDE",
      confidence: "HIGH",
    };
  }

  try {
    const metadata = await fetchNpmMetadata(packageName);
    if (!metadata) return null;

    const repositoryUrl =
      typeof metadata.repository === "string"
        ? metadata.repository
        : metadata.repository?.url;
    const bugsUrl = typeof metadata.bugs === "string" ? metadata.bugs : metadata.bugs?.url;

    const parsed =
      parseGitHubRepositoryUrl(repositoryUrl) ??
      parseGitHubRepositoryUrl(bugsUrl) ??
      parseGitHubRepositoryUrl(metadata.homepage);

    if (!parsed) return null;

    return {
      ...parsed,
      source: "NPM_REGISTRY",
      confidence: "HIGH",
    };
  } catch {
    return null;
  }
}

function toRawData(
  node: RepositoryNode,
  source: ResolvedRepository["source"],
  confidence: ResolvedRepository["confidence"],
  npm: NpmPackageMetrics | null
): GitHubMinerRawData {
  const [owner = "", name = ""] = node.nameWithOwner.split("/");

  return {
    name,
    owner,
    description: node.description ?? "",
    url: node.url,
    createdAt: node.createdAt.split("T")[0] ?? node.createdAt,
    users: node.assignableUsers.totalCount,
    watchers: node.watchers.totalCount,
    stars: node.stargazerCount,
    forks: node.forkCount,
    issues: node.issues.totalCount,
    pullRequests: node.pullRequests.totalCount,
    diskUsage: node.diskUsage,
    license: node.licenseInfo?.spdxId ?? "",
    languages: node.languages.edges.map((edge) => edge.node.name),
    primaryLanguage: node.primaryLanguage?.name ?? "",
    environments: [],
    submodules: [],
    topics: node.repositoryTopics.edges.map((edge) => edge.node.topic.name),
    extra: [],
    repositoryMatchSource: source,
    repositoryMatchConfidence: confidence,
    ...(npm ? { npm } : {}),
  };
}

function toNpmOnlyRawData(packageName: string, npm: NpmPackageMetrics): GitHubMinerRawData {
  return {
    name: packageName,
    owner: "",
    description: "",
    url: "",
    createdAt: "",
    users: 0,
    watchers: 0,
    stars: 0,
    forks: 0,
    issues: 0,
    pullRequests: 0,
    diskUsage: 0,
    license: "",
    languages: [],
    primaryLanguage: "",
    environments: [],
    submodules: [],
    topics: [],
    extra: [],
    repositoryMatchSource: "NPM_REGISTRY",
    repositoryMatchConfidence: "MEDIUM",
    npm,
  };
}

export async function runGitHubMinerCommand(
  packageSpecifier: string,
  batchSize = 10
): Promise<{ raw: GitHubMinerRawData[] }> {
  const packageName = packageNameFromSpecifier(packageSpecifier);
  const npmMetadata = await fetchNpmMetadata(packageName);
  const npmMetrics = await collectNpmMetrics(packageName, npmMetadata);
  const resolvedRepository = await resolveNpmRepository(packageName);

  try {
    if (resolvedRepository?.owner && resolvedRepository.name) {
      const data = await requestGitHub<RepositoryResponse>(repositoryByNameQuery, {
        owner: resolvedRepository.owner,
        name: resolvedRepository.name,
      });

      if (data.repository) {
        return {
          raw: [
            toRawData(
              data.repository,
              resolvedRepository.source,
              resolvedRepository.confidence,
              npmMetrics
            ),
          ],
        };
      }
    }

    const data = await requestGitHub<SearchResponse>(repositorySearchQuery, {
      searchQuery: searchQueryForPackage(packageName),
      first: Math.max(1, Math.min(batchSize, 100)),
    });

    return {
      raw: data.search.nodes.map((node) => toRawData(node, "GITHUB_SEARCH", "LOW", npmMetrics)),
    };
  } catch {
    return {
      raw: [toNpmOnlyRawData(packageName, npmMetrics)],
    };
  }
}
