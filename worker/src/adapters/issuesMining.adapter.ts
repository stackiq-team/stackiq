import { analyzeIssues } from '../issuesMining/run_all.js';
import type { IssuesMiningResult, IssuesMiningMetrics } from '../types/issuesMining.types.js';

const nullMetrics: IssuesMiningMetrics = {
  totalIssuesAnalyzed: null,
  openIssues: null,
  closedIssues: null,
  recentActivityCount: null,
  averageResolutionTimeHours: null,
  closeRateByPR: null,
  codeResolutionRate: null,
  openToAssignedTimeHours: null,
  mergedPRRate: null,
  uncodedCloseRate: null,
};

/*Eample code

const metrics: IssuesMiningMetrics = {
totalIssuesAnalyzed: result.classifications?.total ?? null,
openIssues: result.classifications?.stats?.open ?? null,
closedIssues: result.classifications?.stats?.closed ?? null,
recentActivityCount: result.classifications?.stats?.recent_activity ?? null,
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