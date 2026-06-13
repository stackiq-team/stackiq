import { analyzeIssues } from '../issuesMining/run_all.js';
import type { IssuesMiningResult, IssuesMiningMetrics } from '../types/issuesMining.types.js';

const nullMetrics: IssuesMiningMetrics = {
  totalIssuesAnalyzed: null,
  averageResolutionTimeHours: null,
  closeRateByPR: null,
  codeResolutionRate: null,
  openToAssignedTimeHours: null,
  mergedPRRate: null,
  uncodedCloseRate: null,
};

/*const metrics: IssuesMiningMetrics = {
  totalIssuesAnalyzed: result.classifications?.total ?? null,
  averageResolutionTimeHours: null,
  closeRateByPR: null,
  codeResolutionRate: result.classifications?.stats
    ? result.classifications.stats.fixed_by_devs / result.classifications.total
    : null,
  openToAssignedTimeHours: null,
  mergedPRRate: null,
  uncodedCloseRate: null,
};*/

export async function runIssuesMining(
  owner: string,
  repo: string,
  sinceDate: string
): Promise<IssuesMiningResult> {
  try {
    const result = await analyzeIssues(owner, repo, sinceDate);

    return {
      status: 'SUCCESS',
      metrics: nullMetrics,   // replaced with real computation later
      rawData: result.raw,
    };

  } catch (err) {
    return {
      status: 'FAILED',
      metrics: nullMetrics,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}