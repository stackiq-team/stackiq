import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueAnalysisJobMock, requestMock, setIntervalMock } = vi.hoisted(() => ({
  enqueueAnalysisJobMock: vi.fn(),
  requestMock: vi.fn(),
  setIntervalMock: vi.fn(),
}));

vi.mock("https", () => ({
  request: requestMock,
}));

vi.mock("../queue/analysisQueue.js", () => ({
  enqueueAnalysisJob: enqueueAnalysisJobMock,
}));

import { refreshLeaderboardRepositories } from "../leaderboardSync.js";

function createJsonResponse(payload: unknown, statusCode = 200) {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    on: typeof EventEmitter.prototype.on;
  };

  response.statusCode = statusCode;
  return {
    response,
    body: JSON.stringify(payload),
  };
}

function createRequestMock(resolver: (body: string) => { payload: unknown; statusCode?: number }) {
  return requestMock.mockImplementation(((_url: unknown, _options: unknown) => {
    const request = new EventEmitter() as EventEmitter & {
      write: (chunk: string) => void;
      end: () => void;
      on: typeof EventEmitter.prototype.on;
    };

    let requestBody = "";

    request.write = (chunk: string) => {
      requestBody += chunk;
    };

    request.end = () => {
      const { payload, statusCode } = resolver(requestBody);
      const { response, body } = createJsonResponse(payload, statusCode ?? 200);
      response.on = response.addListener.bind(response);

      process.nextTick(() => {
        request.emit("response", response);
        process.nextTick(() => {
          response.emit("data", body);
          response.emit("end");
        });
      });
    };

    request.on = request.addListener.bind(request);

    return request;
  }) as any);
}

describe("leaderboardSync", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    enqueueAnalysisJobMock.mockReset();
    requestMock.mockReset();
    setIntervalMock.mockReset();
    vi.stubGlobal("setInterval", setIntervalMock);
    setIntervalMock.mockReturnValue({ unref: vi.fn() });
    process.env.GITHUB_API_TOKEN = "token-123";
    process.env.EXPLORE_TOP_LIMIT = "2";
    process.env.EXPLORE_REFRESH_INTERVAL_MS = "1000";
    process.env.EXPLORE_RUN_ON_START = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...envBackup };
  });

  it("runs the explore refresh, creates analyses, and reuses cached package analyses", async () => {
    const searchNodes = [
      {
        nameWithOwner: "facebook/react",
        name: "react",
        owner: { login: "facebook" },
        description: "React",
        url: "https://github.com/facebook/react",
        createdAt: "2013-05-24T00:00:00.000Z",
        pushedAt: "2026-07-01T00:00:00.000Z",
        stargazerCount: 100000,
        forkCount: 20000,
        watchers: { totalCount: 5000 },
        issues: { totalCount: 1000 },
        pullRequests: { totalCount: 10000 },
        licenseInfo: { spdxId: "MIT" },
        primaryLanguage: { name: "TypeScript" },
        repositoryTopics: { edges: [{ node: { topic: { name: "ui" } } }] },
        assignableUsers: { totalCount: 3 },
        diskUsage: 100,
        languages: { edges: [] },
      },
      {
        nameWithOwner: "vitejs/vite",
        name: "vite",
        owner: { login: "vitejs" },
        description: "Vite",
        url: "https://github.com/vitejs/vite",
        createdAt: "2019-04-01T00:00:00.000Z",
        pushedAt: "2026-07-15T00:00:00.000Z",
        stargazerCount: 70000,
        forkCount: 7000,
        watchers: { totalCount: 2000 },
        issues: { totalCount: 300 },
        pullRequests: { totalCount: 1000 },
        licenseInfo: { spdxId: "MIT" },
        primaryLanguage: { name: "TypeScript" },
        repositoryTopics: { edges: [{ node: { topic: { name: "build" } } }] },
        assignableUsers: { totalCount: 2 },
        diskUsage: 50,
        languages: { edges: [] },
      },
    ];

    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string; variables?: { owner?: string; name?: string } };

      if (payload.query.includes("SearchRepositories")) {
        return {
          payload: {
            data: {
              search: {
                nodes: searchNodes,
              },
            },
          },
        };
      }

      if (payload.query.includes("PackageJson")) {
        const repoKey = `${payload.variables?.owner}/${payload.variables?.name}`;
        const packageJson = repoKey === "facebook/react"
          ? {
              dependencies: { scheduler: "^0.23.0" },
              devDependencies: { vitest: "^4.0.0" },
            }
          : {
              dependencies: { react: "^18.0.0" },
              devDependencies: { typescript: "^5.0.0" },
            };

        return {
          payload: {
            data: {
              repository: {
                object: {
                  text: JSON.stringify(packageJson),
                },
              },
            },
          },
        };
      }

      return { payload: { data: {} } };
    });

    const analysisCreateMock = vi.fn().mockImplementation(async (args: any) => {
      const dependencyName = args.data.dependencies.create[0]?.name ?? "analysis";
      return {
        id: `${dependencyName}-analysis`,
        resultToken: `${dependencyName}-token`,
      };
    });

    const leaderboardRepository = {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (
          where.fullName_category.fullName === "facebook/react" &&
          where.fullName_category.category === "popular"
        ) {
          return {
            id: "existing-react-popular",
            analysisScore: 90,
            analysisStatus: "COMPLETED",
            analysisResultToken: "react-token",
            analysisId: "react-analysis",
          };
        }

        return null;
      }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    };

    const prisma = {
      analysis: {
        create: analysisCreateMock,
      },
      leaderboardRepository,
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(analysisCreateMock).toHaveBeenCalledTimes(2);
    expect(enqueueAnalysisJobMock).toHaveBeenCalledTimes(2);
    expect(leaderboardRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-react-popular" },
        data: expect.objectContaining({
          fullName: "facebook/react",
          category: "popular",
        }),
      })
    );
    expect(leaderboardRepository.create).toHaveBeenCalled();
    expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it("falls back to default scheduler values when env values are invalid", async () => {
    process.env.EXPLORE_TOP_LIMIT = "0";
    process.env.EXPLORE_REFRESH_INTERVAL_MS = "not-a-number";
    process.env.EXPLORE_RUN_ON_START = "false";

    const prisma = {
      analysis: {
        create: vi.fn(),
      },
      leaderboardRepository: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 7 * 24 * 60 * 60 * 1000);
    expect(enqueueAnalysisJobMock).not.toHaveBeenCalled();
  });

  it("logs refresh failure when token is missing", async () => {
    delete process.env.GITHUB_API_TOKEN;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const prisma = {
      analysis: { create: vi.fn() },
      leaderboardRepository: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    const scheduledRun = setIntervalMock.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(scheduledRun).toEqual(expect.any(Function));
    await scheduledRun?.();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[worker] Explore refresh failed:")
    );
    errorSpy.mockRestore();
  });

  it("handles github search response errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string };
      if (payload.query.includes("SearchRepositories")) {
        return { payload: "boom", statusCode: 500 };
      }
      return { payload: { data: {} } };
    });

    const prisma = {
      analysis: { create: vi.fn() },
      leaderboardRepository: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[worker] Explore refresh failed:")
    );
    errorSpy.mockRestore();
  });

  it("handles github search GraphQL errors payload", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string };
      if (payload.query.includes("SearchRepositories")) {
        return {
          payload: {
            errors: [{ message: "rate limited" }],
          },
        };
      }
      return { payload: { data: {} } };
    });

    const prisma = {
      analysis: { create: vi.fn() },
      leaderboardRepository: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[worker] Explore refresh failed:")
    );
    errorSpy.mockRestore();
  });

  it("handles package fetch without token and skips analysis creation", async () => {
    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string };

      if (payload.query.includes("SearchRepositories")) {
        delete process.env.GITHUB_API_TOKEN;
        return {
          payload: {
            data: {
              search: {
                nodes: [
                  {
                    fullName: "owner/repo",
                    name: "repo",
                    owner: "owner",
                    description: "desc",
                    url: "https://github.com/owner/repo",
                    createdAt: "2020-01-01T00:00:00.000Z",
                    pushedAt: null,
                    stargazerCount: 0,
                    forkCount: 0,
                    watchers: { totalCount: 0 },
                    issues: { totalCount: 0 },
                    pullRequests: { totalCount: 0 },
                    license: null,
                    primaryLanguage: null,
                    topics: [],
                    repositoryTopics: { edges: [] },
                  },
                ],
              },
            },
          },
        };
      }

      return { payload: { data: {} } };
    });

    const analysisCreateMock = vi.fn();
    const prisma = {
      analysis: { create: analysisCreateMock },
      leaderboardRepository: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(analysisCreateMock).not.toHaveBeenCalled();
  });

  it("skips analysis creation when package json has no dependencies", async () => {
    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string };

      if (payload.query.includes("SearchRepositories")) {
        return {
          payload: {
            data: {
              search: {
                nodes: [
                  {
                    nameWithOwner: "owner/repo",
                    name: "repo",
                    owner: { login: "owner" },
                    description: "desc",
                    url: "https://github.com/owner/repo",
                    createdAt: "invalid-date",
                    pushedAt: "invalid-date",
                    stargazerCount: 10,
                    forkCount: 1,
                    watchers: { totalCount: 1 },
                    issues: { totalCount: 1 },
                    pullRequests: { totalCount: 1 },
                    licenseInfo: null,
                    primaryLanguage: null,
                    repositoryTopics: { edges: [] },
                  },
                ],
              },
            },
          },
        };
      }

      if (payload.query.includes("PackageJson")) {
        return {
          payload: {
            data: {
              repository: {
                object: {
                  text: JSON.stringify({ name: "repo" }),
                },
              },
            },
          },
        };
      }

      return { payload: { data: {} } };
    });

    const analysisCreateMock = vi.fn();
    const prisma = {
      analysis: { create: analysisCreateMock },
      leaderboardRepository: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(analysisCreateMock).not.toHaveBeenCalled();
  });

  it("handles invalid package json without creating analysis", async () => {
    createRequestMock((body) => {
      const payload = JSON.parse(body) as { query: string; variables?: { owner?: string; name?: string } };

      if (payload.query.includes("SearchRepositories")) {
        return {
          payload: {
            data: {
              search: {
                nodes: [
                  {
                    nameWithOwner: "owner/repo",
                    name: "repo",
                    owner: { login: "owner" },
                    description: "repo",
                    url: "https://github.com/owner/repo",
                    createdAt: "2020-01-01T00:00:00.000Z",
                    pushedAt: "2026-07-01T00:00:00.000Z",
                    stargazerCount: 1,
                    forkCount: 1,
                    watchers: { totalCount: 1 },
                    issues: { totalCount: 1 },
                    pullRequests: { totalCount: 1 },
                    licenseInfo: null,
                    primaryLanguage: null,
                    repositoryTopics: { edges: [] },
                  },
                ],
              },
            },
          },
        };
      }

      if (payload.query.includes("PackageJson")) {
        return {
          payload: {
            data: {
              repository: {
                object: {
                  text: "{bad-json",
                },
              },
            },
          },
        };
      }

      return { payload: { data: {} } };
    });

    const analysisCreateMock = vi.fn();
    const prisma = {
      analysis: { create: analysisCreateMock },
      leaderboardRepository: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await refreshLeaderboardRepositories(prisma);

    expect(analysisCreateMock).not.toHaveBeenCalled();
  });
});