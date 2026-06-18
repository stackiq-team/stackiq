import type { GitHubMinerInput, GitHubMinerOutput, GitHubMinerRawData } from "../types/githubMinerType.js";
import {runGitHubMinerCommand} from '../gitHubMiner/index.js';

export async function runGitHubMiner(
  dependency: GitHubMinerInput
): Promise<string> {
  try {
    console.log(`[githubMinerAdapter] Running GitHub miner for ${dependency.fullPackageName}@${dependency.versionRequirement}`);
    const data = await runGitHubMinerCommand(
      dependency.fullPackageName + "@" + dependency.versionRequirement,
      10 // batch size
    );
    return JSON.stringify(data.raw);
  } catch (error: any) {
    console.error(`[githubMinerAdapter] Error executing command: ${error.message || error}`);
    // let caller handle absence of data; do not return a value
    return "";
  }
}

export async function parseGitHubMinerData(
  dependency: GitHubMinerInput,
    rawData: string
  ): Promise<GitHubMinerOutput[]> {
  try {
    console.log(`[githubMinerAdapter] Raw data to parse: ${rawData[0]}`);
    const rawDataParsed = JSON.parse(rawData) as GitHubMinerRawData[];

    const dependencyOutputs = rawDataParsed.map((dependencyData) => ({
      dependencyId: dependency.dependencyId,
      packageName: dependency.fullPackageName,
      repository: {
        owner: dependencyData.owner,
        name: dependencyData.name,
        description: dependencyData.description,
        fullName: `${dependencyData.owner}/${dependencyData.name}`,
        url: dependencyData.url,
        createdAt: dependencyData.createdAt,
      },
      stars: dependencyData.stars,
      forks: dependencyData.forks,
      watchers: dependencyData.watchers,
      contributors: dependencyData.users,
      pullRequests: dependencyData.pullRequests,
      issues: dependencyData.issues,
      license: dependencyData.license,
      languages: dependencyData.languages,
      primaryLanguage: dependencyData.primaryLanguage,
      topics: dependencyData.topics,
      created_at: dependencyData.createdAt,
    }));
    return dependencyOutputs;
  } catch (error) {
    console.error('Failed to read or parse JSON:', error);
    throw error;
  }
}

export async function fetchGitHubMinerData(dependency: GitHubMinerInput) : Promise<GitHubMinerOutput> {
  const data = await runGitHubMiner(dependency);

  const gitHubMinerData = await parseGitHubMinerData(dependency, data);

  if (gitHubMinerData.length === 0) {
    throw new Error(
      `No GitHub miner results found for ${dependency.fullPackageName}@${dependency.versionRequirement}`
    );
  }

  let bestMatch = gitHubMinerData[0]!; // default to the first result if no better match is found
  gitHubMinerData.forEach((data) => {
    // name has an exact match we found the right package
    if (data.repository.fullName === dependency.fullPackageName) {
      bestMatch = data;
      return;
    }
    // if no exact match we take the one with the most stars
    if (data.stars > bestMatch.stars) {
      bestMatch = data;
    }
  });

  return bestMatch;
}