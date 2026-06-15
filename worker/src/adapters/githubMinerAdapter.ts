import type { GitHubMinerInput, GitHubMinerOutput, GitHubMinerRawData } from "../types/githubMinerType.js";
import { exec } from 'child_process';
import { mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);


export async function runGitHubMiner(
  dependency: GitHubMinerInput
): Promise<{ success: boolean; message: string; data: any | null }> {
  
  //**-------------- ***/
  //TODO: fix miner path with env variable in docker
  const minerPath = 'D:/Ecole/gitHubMiner/index.js';
  //**-------------- ***/
  const outputDir = 'data';
  const outputFile = `${outputDir}/${dependency.fullPackageName}-${dependency.versionRequirement}`;

  mkdirSync(outputDir, { recursive: true });

  const command = `node ${minerPath} --query "${dependency.fullPackageName}" --batchsize 10 --filename "${outputFile}"`;

  console.log(`[githubMinerAdapter] Executing command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.error(`Command error output: ${stderr}`);
    }

    return {
      success: true,
      message: 'GitHub Miner executed successfully',
      data: null,
    };
  } catch (error: any) {
    console.error(`[githubMinerAdapter] Error executing command: ${error.message || error}`);
    return {
      success: false,
      message: `Error executing GitHub Miner: ${error.message || error}`,
      data: null,
    };
  }
}

export async function parseGitHubMinerData(
    dependency: GitHubMinerInput
  ): Promise<GitHubMinerOutput[]> {
  const outputFilePath = `data/${dependency.fullPackageName}-${dependency.versionRequirement}.json`;
  try {
    const rawDataFromFile = await readFile(outputFilePath, "utf-8");
    const rawDataParsed = JSON.parse(rawDataFromFile) as GitHubMinerRawData[];

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
  await runGitHubMiner(dependency);

  const gitHubMinerData = await parseGitHubMinerData(dependency);

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