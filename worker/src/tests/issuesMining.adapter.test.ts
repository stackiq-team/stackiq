// stackiq/worker/src/adapters/issuesMining.adapter.test.ts

import { describe, expect, it, vi } from "vitest";
import { runIssuesMining } from "../adapters/issuesMining.adapter.js";

vi.mock("../issuesMining/run_all.js", () => ({
  analyzeIssues: vi.fn(),
}));

import { analyzeIssues } from "../issuesMining/run_all.js";

const mockMetrics = {
  totalIssuesAnalyzed: 100,
  openIssues: 40,
  closedIssues: 60,
  closedIssuesAnalyzed: 60,
  recentActivityCount: 10,
  averageResolutionTimeHours: 48,
  averageResolutionTimeDays: 2,
  averageFirstResponseTimeDays: 1,
  firstResponseTimeHours: 24,
  closureRate: 0.6,
  noResponseRate: null,
  closeRateByPR: 0.5,
  closedByPrRate: 0.5,
  closedByPRRate: 0.5,
  codeResolutionRate: 0.5,
  postCloseActivityRate: null,
  openToAssignedTimeHours: 24,
  mergedPRRate: 1,
  uncodedCloseRate: 0.5,
};

const mockRaw = [{ number: 1, closed: true }];

const mockIssueData = [
  {
    number: 1,
    publishedAt: "2024-12-14T00:00:00Z",
    closedAt: "2024-12-15T00:00:00Z",
    closed: true,
    assigneesCount: 0,
    firstAssignedAt: null,
    closer: {
      stateReason: "COMPLETED",
      type: "PullRequest",
      merged: true,
      closedByBot: false,
      closedByLogin: "someuser",
      wasReclassified: false,
    },
    hasConnectedEvent: true,
    hasPostCloseActivity: false,
    tooManyTimelineItems: false,
    timelineTotalCount: 5,
    timelineCapturedCount: 5,
  },
];

describe("runIssuesMining", () => {
  it("returns SUCCESS with metrics when analyzeIssues resolves", async () => {
    vi.mocked(analyzeIssues).mockResolvedValue({
      classifications: mockMetrics,
      raw: mockRaw,
      issueData: mockIssueData,
    });

    const result = await runIssuesMining("facebook", "react", "2024-12-14");

    expect(result.status).toBe("SUCCESS");
    expect(result.error).toBeUndefined();
    expect(result.metrics).toEqual(mockMetrics);
    expect(result.rawData).toEqual(mockRaw);
    expect(result.issueData).toEqual(mockIssueData);
  });

  it("returns FAILED with nullMetrics when analyzeIssues throws", async () => {
    vi.mocked(analyzeIssues).mockRejectedValue(new Error("GitHub API error"));

    const result = await runIssuesMining("facebook", "react", "2024-12-14");

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("GitHub API error");
    expect(result.metrics).toEqual({
      totalIssuesAnalyzed: null,
      openIssues: null,
      closedIssues: null,
      closedIssuesAnalyzed: null,
      recentActivityCount: null,
      averageResolutionTimeHours: null,
      averageResolutionTimeDays: null,
      averageFirstResponseTimeDays: null,
      firstResponseTimeHours: null,
      closureRate: null,
      noResponseRate: null,
      closeRateByPR: null,
      closedByPrRate: null,
      closedByPRRate: null,
      codeResolutionRate: null,
      postCloseActivityRate: null,
      openToAssignedTimeHours: null,
      mergedPRRate: null,
      uncodedCloseRate: null,
    });
  });

  it("returns FAILED with unknown error message when a non-Error is thrown", async () => {
    vi.mocked(analyzeIssues).mockRejectedValue("something went wrong");

    const result = await runIssuesMining("facebook", "react", "2024-12-14");

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("Unknown error");
  });

  it("returns metrics with null values when analyzeIssues returns partial data", async () => {
    vi.mocked(analyzeIssues).mockResolvedValue({
      classifications: {
        totalIssuesAnalyzed: 10,
        openIssues: null,
        closedIssues: null,
        closedIssuesAnalyzed: null,
        recentActivityCount: null,
        averageResolutionTimeHours: null,
        averageResolutionTimeDays: null,
        averageFirstResponseTimeDays: null,
        firstResponseTimeHours: null,
        closureRate: null,
        noResponseRate: null,
        closeRateByPR: null,
        closedByPrRate: null,
        closedByPRRate: null,
        codeResolutionRate: null,
        postCloseActivityRate: null,
        openToAssignedTimeHours: null,
        mergedPRRate: null,
        uncodedCloseRate: null,
      },
      raw: [],
      issueData: [],
    });

    const result = await runIssuesMining("facebook", "react", "2024-12-14");

    expect(result.status).toBe("SUCCESS");
    expect(result.metrics.totalIssuesAnalyzed).toBe(10);
    expect(result.metrics.openIssues).toBeNull();
    expect(result.issueData).toEqual([]);
  });
});