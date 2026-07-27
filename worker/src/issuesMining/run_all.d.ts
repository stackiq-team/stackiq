import type { IssuesMiningMetrics, IssueSummary } from '../types/issuesMining.types.js';

export function analyzeIssues(owner: string, repo: string, startDate: string): Promise<{
  raw: unknown;
  issueData: IssueSummary[];
  classifications: IssuesMiningMetrics;
}>;
