export function analyzeIssues(owner: string, repo: string, startDate: string): Promise<{
  raw: unknown;
  classifications: unknown;
  countResult: unknown;
}>;