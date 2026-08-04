import { describe, expect, it } from "vitest";
import { compactIssuesMiningResultForStorage } from "../utils/issueDataPersistence.js";
import { sanitizeJsonValue } from "../utils/jsonSanitizer.js";

describe("sanitizeJsonValue", () => {
  it("removes values that Postgres JSON cannot store", () => {
    const value = sanitizeJsonValue({
      safe: "ok",
      nan: Number.NaN,
      infinity: Number.POSITIVE_INFINITY,
      missing: undefined,
      nested: ["text\u0000with-null", new Date("2026-07-26T00:00:00.000Z")],
      escapedNull: "text\\u0000with-escaped-null",
    });

    expect(value).toEqual({
      safe: "ok",
      nan: null,
      infinity: null,
      nested: ["textwith-null", "2026-07-26T00:00:00.000Z"],
      escapedNull: "textwith-escaped-null",
    });
  });

  it("removes issue body previews before persistence", () => {
    const value = compactIssuesMiningResultForStorage({
      status: "SUCCESS",
      metrics: {
        totalIssuesAnalyzed: 1,
        openIssues: 1,
        closedIssues: 0,
        closedIssuesAnalyzed: 0,
        recentActivityCount: 1,
        averageResolutionTimeHours: null,
        averageResolutionTimeDays: null,
        medianResolutionTimeDays: null,
        averageFirstResponseTimeDays: null,
        medianFirstResponseTimeDays: null,
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
        healthyClosureRate: null,
        staleOpenIssueRate: null,
        sampleRecentOpenIssues: null,
        sampleRecentClosedIssues: null,
        sampleOlderClosedIssues: null,
        sampleOldOpenIssues: null,
      },
      issueData: [
        {
          number: 1,
          title: "Issue title",
          url: "https://github.com/example/repo/issues/1",
          bodyPreview: "raw issue body \\u0000",
          labels: ["bug"],
          publishedAt: "2026-07-26T00:00:00.000Z",
          closedAt: null,
          closed: false,
          assigneesCount: 0,
          firstAssignedAt: null,
          closer: {
            stateReason: null,
            type: null,
            merged: null,
            closedByBot: null,
            closedByLogin: null,
            wasReclassified: false,
          },
          hasConnectedEvent: false,
          hasPostCloseActivity: false,
          tooManyTimelineItems: false,
          timelineTotalCount: 0,
          timelineCapturedCount: 0,
        },
      ],
    });

    expect(value?.issueData?.[0]).not.toHaveProperty("bodyPreview");
    expect(value?.issueData?.[0]?.title).toBe("Issue title");
  });

  it("returns null for unsupported primitive values", () => {
    expect(sanitizeJsonValue(Symbol("bad"))).toBeNull();
  });

  it("returns null when compacting missing issue summaries", () => {
    expect(compactIssuesMiningResultForStorage(null)).toBeNull();
    expect(
      compactIssuesMiningResultForStorage({
        status: "FAILED",
        metrics: {
          totalIssuesAnalyzed: null,
          openIssues: null,
          closedIssues: null,
          closedIssuesAnalyzed: null,
          recentActivityCount: null,
          averageResolutionTimeHours: null,
          averageResolutionTimeDays: null,
          medianResolutionTimeDays: null,
          averageFirstResponseTimeDays: null,
          medianFirstResponseTimeDays: null,
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
          healthyClosureRate: null,
          staleOpenIssueRate: null,
          sampleRecentOpenIssues: null,
          sampleRecentClosedIssues: null,
          sampleOlderClosedIssues: null,
          sampleOldOpenIssues: null,
        },
      } as any)
    ).toEqual({
      status: "FAILED",
      metrics: {
        totalIssuesAnalyzed: null,
        openIssues: null,
        closedIssues: null,
        closedIssuesAnalyzed: null,
        recentActivityCount: null,
        averageResolutionTimeHours: null,
        averageResolutionTimeDays: null,
        medianResolutionTimeDays: null,
        averageFirstResponseTimeDays: null,
        medianFirstResponseTimeDays: null,
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
        healthyClosureRate: null,
        staleOpenIssueRate: null,
        sampleRecentOpenIssues: null,
        sampleRecentClosedIssues: null,
        sampleOlderClosedIssues: null,
        sampleOldOpenIssues: null,
      },
    });
  });
});
