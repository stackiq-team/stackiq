export type GitHubMinerInput = {
  dependencyId: string;
  fullPackageName: string;
  versionRequirement: string;
};

export type GitHubMinerOutput = {
  dependencyId: string;
  packageName: string;
  repository: GitHubMinerRepository;
  repositoryMatchSource?: "PACKAGE_OVERRIDE" | "NPM_REGISTRY" | "GITHUB_SEARCH";
  repositoryMatchConfidence?: "HIGH" | "MEDIUM" | "LOW";
  stars: number;
  forks: number;
  watchers: number;
  contributors: number;
  createdAt: string;
  projectAgeDays: number | null;
  pullRequests: number;
  issues: number;
  license: string;
  languages: string[];
  primaryLanguage: string;
  topics: string[];
  created_at: string;
  npm?: NpmPackageMetrics;
};

export type GitHubMinerRawData = {
    "name": string;
    "owner": string;
    "description": string;
    "url": string;
    "createdAt": string;
    "users": number;
    "watchers": number;
    "stars": number;
    "forks": number;
    "issues": number;
    "pullRequests": number;
    "diskUsage": number;
    "license": string;
    "languages": string[];
    "primaryLanguage": string;
    "environments": string[];
    "submodules": string[];
    "topics": string[];
    "extra": string[];
    "repositoryMatchSource"?: "PACKAGE_OVERRIDE" | "NPM_REGISTRY" | "GITHUB_SEARCH";
    "repositoryMatchConfidence"?: "HIGH" | "MEDIUM" | "LOW";
    "npm"?: NpmPackageMetrics;
}

export type GitHubMinerRepository = {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  url: string;
  createdAt: string;
}

export type NpmPackageMetrics = {
  weeklyDownloads: number | null;
  packageAgeDays: number | null;
  latestPublishAgeDays: number | null;
  versionCount: number | null;
  dependencyCount: number | null;
  devDependencyCount: number | null;
  hasLicense: boolean | null;
  hasRepository: boolean | null;
  hasReadme: boolean | null;
};
