import type { IssuesMiningResult, IssueSummary } from "../types/issuesMining.types.js";

export function compactIssueSummariesForStorage(
  issueData: IssueSummary[] | null | undefined
): IssueSummary[] | null {
  if (!issueData) return null;

  return issueData.map(({ bodyPreview: _bodyPreview, ...issue }) => issue);
}

export function compactIssuesMiningResultForStorage(
  result: IssuesMiningResult | null | undefined
): IssuesMiningResult | null {
  if (!result) return null;

  const issueData = compactIssueSummariesForStorage(result.issueData);
  if (!issueData) {
    const { issueData: _issueData, ...withoutIssueData } = result;
    return withoutIssueData;
  }

  return {
    ...result,
    issueData,
  };
}
