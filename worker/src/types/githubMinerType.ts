export type GitHubMinerInput = {
  dependencyId: string;
  fullPackageName: string;
  versionRequirement: string;
};

export type GitHubMinerOutput = {
  dependencyId: string;
  packageName: string;
  repository: GitHubMinerRepository;
  stars: number;
  forks: number;
  watchers: number;
  contributors: number;
  pullRequests: number;
  issues: number;
  license: string;
  languages: string[];
  primaryLanguage: string;
  topics: string[];
  created_at: string;
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
}

export type GitHubMinerRepository = {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  url: string;
  createdAt: string;
}