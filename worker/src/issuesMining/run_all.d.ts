import type { IssuesMiningMetrics } from '../types/issuesMining.types.js';

export function analyzeIssues(owner: string, repo: string, startDate: string): Promise<{
  raw: unknown;
  classifications: IssuesMiningMetrics;
}>;