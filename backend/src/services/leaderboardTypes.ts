export type RepoLeaderboardItem = {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  issues: number;
  pullRequests: number;
  license: string | null;
  primaryLanguage: string | null;
  topics: string[];
  createdAt: string;
  pushedAt: string;
  popularityScore: number;
  activityScore: number;
  compatibilityScore: number;
  analysisScore: number | null;
  analysisStatus: string | null;
  analysisResultToken: string | null;
  packageJsonPresent: boolean;
};

export type LeaderboardLists = {
  popular: RepoLeaderboardItem[];
  active: RepoLeaderboardItem[];
  bestRanked: RepoLeaderboardItem[];
};

export type LeaderboardCachePayload = {
  lastUpdatedAt: string;
  leaderboards: LeaderboardLists;
};
