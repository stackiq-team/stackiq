import https from "https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  analysisCreateMock,
  findUniqueMock,
  updateMock,
  createMock,
  enqueueAnalysisJobMock,
  getLeaderboardsFromDbMock,
} = vi.hoisted(() => ({
  analysisCreateMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
  enqueueAnalysisJobMock: vi.fn(),
  getLeaderboardsFromDbMock: vi.fn(),
}));

vi.mock("https");

vi.mock("../db/client", () => ({
  prisma: {
    analysis: {
      create: analysisCreateMock,
    },
    leaderboardRepository: {
      findUnique: findUniqueMock,
      update: updateMock,
      create: createMock,
    },
  },
}));

vi.mock("../queue/analysisQueue", () => ({
  enqueueAnalysisJob: enqueueAnalysisJobMock,
}));

vi.mock("./leaderboardDbService", () => ({
  getLeaderboardsFromDb: getLeaderboardsFromDbMock,
}));

import { getLeaderboards } from "./leaderboardService";

type GitHubPayload = { query: string; variables: Record<string, any> };
type GitHubResponse = { statusCode: number; body: unknown };

function installGithubMock(handler: (payload: GitHubPayload) => GitHubResponse) {
  vi.mocked(https.request).mockImplementation((_, __, callback: any) => {
    const listeners: Record<string, (...args: any[]) => void> = {};
    let requestBody = "";

    const req = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners[event] = listener;
        return req;
      }),
      write: vi.fn((chunk: Buffer | string) => {
        requestBody += chunk.toString();
      }),
      end: vi.fn(() => {
        const resListeners: Record<string, (...args: any[]) => void> = {};
        const response: any = {
          statusCode: 200,
          on: vi.fn((event: string, listener: (...args: any[]) => void) => {
            resListeners[event] = listener;
            return response;
          }),
        };

        callback(response);

        process.nextTick(() => {
          try {
            const parsed = JSON.parse(requestBody) as GitHubPayload;
            const { statusCode, body } = handler(parsed);
            response.statusCode = statusCode;
            resListeners.data?.(typeof body === "string" ? body : JSON.stringify(body));
            resListeners.end?.();
          } catch (error) {
            listeners.error?.(error);
          }
        });
      }),
    };

    return req as any;
  });
}

function repositoryNode(fullName: string, overrides: Record<string, unknown> = {}) {
  return {
    nameWithOwner: fullName,
    description: `${fullName} description`,
    url: `https://github.com/${fullName}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    pushedAt: "2026-07-01T00:00:00.000Z",
    stargazerCount: 1200,
    forkCount: 500,
    watchers: { totalCount: 300 },
    issues: { totalCount: 80 },
    pullRequests: { totalCount: 25 },
    licenseInfo: { spdxId: "MIT" },
    primaryLanguage: { name: "TypeScript" },
    repositoryTopics: {
      edges: [{ node: { topic: { name: "tooling" } } }],
    },
    ...overrides,
  };
}

describe("getLeaderboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_API_TOKEN = "test-token";
    delete process.env.EXPLORE_TOP_LIMIT;
    delete process.env.LEADERBOARD_TOP_LIMIT;
  });

  it("returns cached leaderboard data when refresh is not required", async () => {
    const cached = {
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: {
        popular: [{ fullName: "facebook/react" }],
        active: [],
        bestRanked: [],
      },
    } as any;

    getLeaderboardsFromDbMock.mockResolvedValueOnce(cached);

    const result = await getLeaderboards(false, 8);

    expect(result).toBe(cached);
    expect(getLeaderboardsFromDbMock).toHaveBeenCalledWith(8);
    expect(https.request).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("uses configured default popular limit when argument is omitted", async () => {
    process.env.EXPLORE_TOP_LIMIT = "7.9";
    const cached = {
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: {
        popular: [{ fullName: "facebook/react" }],
        active: [],
        bestRanked: [],
      },
    } as any;
    getLeaderboardsFromDbMock.mockResolvedValueOnce(cached);

    await getLeaderboards(false);

    expect(getLeaderboardsFromDbMock).toHaveBeenCalledWith(7);
  });

  it("sanitizes invalid explicit popular limit values", async () => {
    const cached = {
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: {
        popular: [{ fullName: "facebook/react" }],
        active: [],
        bestRanked: [],
      },
    } as any;
    getLeaderboardsFromDbMock.mockResolvedValueOnce(cached);

    await getLeaderboards(false, -10);

    expect(getLeaderboardsFromDbMock).toHaveBeenCalledWith(3);
  });

  it("refreshes leaderboards, upserts rows, and reuses analysis cache per repository", async () => {
    getLeaderboardsFromDbMock
      .mockResolvedValueOnce({
        lastUpdatedAt: "2026-08-01T00:00:00.000Z",
        leaderboards: { popular: [], active: [], bestRanked: [] },
      })
      .mockResolvedValueOnce({
        lastUpdatedAt: "2026-08-03T00:00:00.000Z",
        leaderboards: {
          popular: [{ fullName: "owner1/repoA" }],
          active: [{ fullName: "owner3/repoC" }],
          bestRanked: [{ fullName: "owner6/repoF" }],
        },
      });

    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "existing-row",
        analysisId: "analysis-existing",
        analysisResultToken: "token-existing",
        analysisStatus: "COMPLETED",
        packageJsonPresent: true,
        analysisScore: 90,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    analysisCreateMock
      .mockResolvedValueOnce({ id: "analysis-a", resultToken: "token-a" })
      .mockResolvedValueOnce({ id: "analysis-f", resultToken: "token-f" });
    enqueueAnalysisJobMock.mockResolvedValue({ id: "job-1" });
    updateMock.mockResolvedValue({ id: "existing-row" });
    createMock.mockResolvedValue({ id: "created-row" });

    installGithubMock(({ query, variables }) => {
      if (query.includes("SearchRepositories") && String(variables.searchQuery).includes("stars:>1000")) {
        return {
          statusCode: 200,
          body: {
            data: {
              search: {
                nodes: [
                  repositoryNode("owner1/repoA"),
                  repositoryNode("owner2/repoB", {
                    licenseInfo: null,
                    primaryLanguage: null,
                  }),
                ],
              },
            },
          },
        };
      }

      if (query.includes("SearchRepositories") && String(variables.searchQuery).includes("pushed:>=")) {
        return {
          statusCode: 200,
          body: {
            data: {
              search: {
                nodes: [
                  repositoryNode("owner1/repoA"),
                  repositoryNode("owner3/repoC"),
                  repositoryNode("owner4/repoD", { pushedAt: "invalid-date" }),
                ],
              },
            },
          },
        };
      }

      if (query.includes("SearchRepositories") && String(variables.searchQuery).includes("stars:>500")) {
        return {
          statusCode: 200,
          body: {
            data: {
              search: {
                nodes: [
                  repositoryNode("owner1/repoA", { stargazerCount: 2000 }),
                  repositoryNode("owner5/repoE", { stargazerCount: 1900 }),
                  repositoryNode("owner6/repoF", { stargazerCount: 1800 }),
                ],
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson") && variables.owner === "owner1") {
        return {
          statusCode: 200,
          body: {
            data: {
              repository: {
                object: {
                  text: JSON.stringify({
                    dependencies: { react: "^19.0.0" },
                    devDependencies: { vitest: 4 },
                  }),
                },
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson") && variables.owner === "owner3") {
        return {
          statusCode: 200,
          body: {
            data: {
              repository: {
                object: null,
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson") && variables.owner === "owner4") {
        return {
          statusCode: 200,
          body: {
            data: {
              repository: {
                object: {
                  text: "{not-json",
                },
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson") && variables.owner === "owner5") {
        return {
          statusCode: 200,
          body: {
            data: {
              repository: {
                object: {
                  text: JSON.stringify({ name: "repoE" }),
                },
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson") && variables.owner === "owner6") {
        return {
          statusCode: 200,
          body: {
            data: {
              repository: {
                object: {
                  text: JSON.stringify({
                    dependencies: { express: "~5.0.0" },
                  }),
                },
              },
            },
          },
        };
      }

      return { statusCode: 200, body: { data: { search: { nodes: [] } } } };
    });

    const result = await getLeaderboards(true, 2);

    expect(result.leaderboards.popular[0].fullName).toBe("owner1/repoA");
    expect(getLeaderboardsFromDbMock).toHaveBeenNthCalledWith(1, 2);
    expect(getLeaderboardsFromDbMock).toHaveBeenNthCalledWith(2, 2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(7);
    expect(analysisCreateMock).toHaveBeenCalledTimes(2);
    expect(enqueueAnalysisJobMock).toHaveBeenCalledTimes(2);
  });

  it("throws a wrapped error when token is missing", async () => {
    delete process.env.GITHUB_API_TOKEN;
    getLeaderboardsFromDbMock.mockResolvedValueOnce({
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: { popular: [], active: [], bestRanked: [] },
    });

    await expect(getLeaderboards(true, 1)).rejects.toThrow(
      "Failed to load leaderboards: GITHUB_API_TOKEN is required to query GitHub."
    );
  });

  it("throws a wrapped error when GitHub returns non-success status", async () => {
    getLeaderboardsFromDbMock.mockResolvedValueOnce({
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: { popular: [], active: [], bestRanked: [] },
    });

    installGithubMock(() => ({
      statusCode: 500,
      body: "boom",
    }));

    await expect(getLeaderboards(true, 1)).rejects.toThrow(
      "Failed to load leaderboards: GitHub request failed 500: boom"
    );
  });

  it("throws a wrapped error when GitHub returns graphql errors", async () => {
    getLeaderboardsFromDbMock.mockResolvedValueOnce({
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: { popular: [], active: [], bestRanked: [] },
    });

    installGithubMock(() => ({
      statusCode: 200,
      body: {
        errors: [{ message: "rate limited" }],
      },
    }));

    await expect(getLeaderboards(true, 1)).rejects.toThrow(
      "Failed to load leaderboards: rate limited"
    );
  });

  it("throws a wrapped error when GitHub payload has no data", async () => {
    getLeaderboardsFromDbMock.mockResolvedValueOnce({
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: { popular: [], active: [], bestRanked: [] },
    });

    installGithubMock(() => ({
      statusCode: 200,
      body: {},
    }));

    await expect(getLeaderboards(true, 1)).rejects.toThrow(
      "Failed to load leaderboards: GitHub did not return data."
    );
  });

  it("throws a wrapped error when GitHub returns invalid JSON", async () => {
    getLeaderboardsFromDbMock.mockResolvedValueOnce({
      lastUpdatedAt: "2026-08-01T00:00:00.000Z",
      leaderboards: { popular: [], active: [], bestRanked: [] },
    });

    installGithubMock(() => ({
      statusCode: 200,
      body: "{invalid-json",
    }));

    await expect(getLeaderboards(true, 1)).rejects.toThrow(
      /Failed to load leaderboards:|JSON|Unexpected token|Expected/
    );
  });

  it("returns leaderboards when repository package fetch fails and is swallowed", async () => {
    getLeaderboardsFromDbMock
      .mockResolvedValueOnce({
        lastUpdatedAt: "2026-08-01T00:00:00.000Z",
        leaderboards: { popular: [], active: [], bestRanked: [] },
      })
      .mockResolvedValueOnce({
        lastUpdatedAt: "2026-08-03T00:00:00.000Z",
        leaderboards: {
          popular: [{ fullName: "owner1/repoA" }],
          active: [{ fullName: "owner1/repoA" }],
          bestRanked: [{ fullName: "owner1/repoA" }],
        },
      });

    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: "created-row" });

    installGithubMock(({ query }) => {
      if (query.includes("SearchRepositories")) {
        return {
          statusCode: 200,
          body: {
            data: {
              search: {
                nodes: [repositoryNode("owner1/repoA")],
              },
            },
          },
        };
      }

      if (query.includes("RepositoryPackageJson")) {
        return {
          statusCode: 500,
          body: "github down",
        };
      }

      return { statusCode: 200, body: { data: { search: { nodes: [] } } } };
    });

    const result = await getLeaderboards(true, 1);

    expect(result.leaderboards.popular[0].fullName).toBe("owner1/repoA");
    expect(analysisCreateMock).not.toHaveBeenCalled();
    expect(enqueueAnalysisJobMock).not.toHaveBeenCalled();
  });
});
