import { prisma } from "../db/client";
import type { RepoLeaderboardItem, LeaderboardLists } from "./leaderboardTypes";

function mapLeaderboardRow(row: any): RepoLeaderboardItem {
  return {
    owner: row.owner,
    name: row.name,
    fullName: row.fullName,
    description: row.description,
    url: row.url,
    stars: row.stars,
    forks: row.forks,
    watchers: row.watchers,
    issues: row.issues,
    pullRequests: row.pullRequests,
    license: row.license,
    primaryLanguage: row.primaryLanguage,
    topics: row.topics,
    createdAt: row.repositoryCreatedAt.toISOString(),
    pushedAt: row.pushedAt.toISOString(),
    popularityScore: row.githubPopularityScore,
    activityScore: row.githubActivityScore,
    compatibilityScore: row.githubCompatibilityScore,
    analysisScore: row.analysisScore,
    analysisStatus: row.analysisStatus,
    analysisResultToken: row.analysisResultToken,
    packageJsonPresent: row.packageJsonPresent,
  };
}

export async function getLeaderboardsFromDb(): Promise<{ lastUpdatedAt: string; leaderboards: LeaderboardLists }> {
  const latestUpdatedAt = new Date().toISOString();

  const categories = ["popular", "active", "bestRanked"] as const;

  const results = await Promise.all(
    categories.map(async (category) => {
      const rows = await prisma.leaderboardRepository.findMany({
        where: { category },
        orderBy: [{ rank: "asc" }],
        take: 3,
      });

      return rows.map(mapLeaderboardRow);
    })
  );

  return {
    lastUpdatedAt: latestUpdatedAt,
    leaderboards: {
      popular: results[0],
      active: results[1],
      bestRanked: results[2],
    },
  };
}
