import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueAnalysisJobMock } = vi.hoisted(() => ({
  prismaMock: {
    analysis: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  enqueueAnalysisJobMock: vi.fn(),
}));

vi.mock("../../db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("../../redis/client", () => ({
  redis: {
    ping: vi.fn(),
  },
}));

vi.mock("../../queue/analysisQueue", () => ({
  enqueueAnalysisJob: enqueueAnalysisJobMock,
}));

vi.mock("https");

import { app } from "../../app";
import https from "https";

type GitHubPayload = { query: string; variables: Record<string, any> };

function mockHttpsRequest(handler: (payload: GitHubPayload) => { statusCode: number; body: unknown }) {
  vi.mocked(https.request).mockImplementation((_, __, callback: any) => {
    const listeners: Record<string, (...args: any[]) => void> = {};
    let body = "";

    const req = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners[event] = listener;
        return req;
      }),
      write: vi.fn((chunk: string | Buffer) => {
        body += chunk.toString();
      }),
      end: vi.fn(() => {
        const resListeners: Record<string, (...args: any[]) => void> = {};
        const res: any = {
          statusCode: 200,
          on: vi.fn((event: string, listener: (...args: any[]) => void) => {
            resListeners[event] = listener;
            return res;
          }),
        };

        callback(res);

        process.nextTick(() => {
          try {
            const payload = JSON.parse(body) as GitHubPayload;
            const response = handler(payload);
            res.statusCode = response.statusCode;
            resListeners.data?.(
              typeof response.body === "string"
                ? response.body
                : JSON.stringify(response.body)
            );
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

describe("POST /analyses/repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_API_TOKEN = "test-token";
    prismaMock.analysis.create.mockResolvedValue({
      id: "analysis-1",
      email: "dev@example.com",
      status: "PENDING",
      resultToken: "token-1",
      dependencies: [
        {
          id: "dep-1",
          name: "react",
          versionRequirement: "^19.0.0",
          type: "DEPENDENCY",
        },
      ],
    });
    enqueueAnalysisJobMock.mockResolvedValue({ id: "job-1" });
  });

  afterEach(() => {
    delete process.env.GITHUB_API_TOKEN;
  });

  it("returns 400 when owner or repo is missing", async () => {
    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "", repo: "react" });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Owner and repo are required.");
  });

  it("creates a repository analysis and enqueues it", async () => {
    mockHttpsRequest(() => ({
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
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react", email: "dev@example.com" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Success");
    expect(prismaMock.analysis.create).toHaveBeenCalledWith({
      data: {
        email: "dev@example.com",
        status: "PENDING",
        dependencies: {
          create: [
            {
              name: "react",
              versionRequirement: "^19.0.0",
              type: "DEPENDENCY",
            },
            {
              name: "vitest",
              versionRequirement: "4",
              type: "DEV_DEPENDENCY",
            },
          ],
        },
      },
      include: {
        dependencies: true,
      },
    });
    expect(enqueueAnalysisJobMock).toHaveBeenCalledWith({
      analysisId: "analysis-1",
      email: "dev@example.com",
      owner: "facebook",
      repo: "react",
      source: "USER_REPOSITORY",
    });
  });

  it("returns 400 when repository package has no dependencies", async () => {
    mockHttpsRequest(() => ({
      statusCode: 200,
      body: {
        data: {
          repository: {
            object: {
              text: JSON.stringify({ name: "empty" }),
            },
          },
        },
      },
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "owner", repo: "repo" });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "package.json must contain dependencies or devDependencies."
    );
    expect(prismaMock.analysis.create).not.toHaveBeenCalled();
  });

  it("returns 500 when GitHub token is missing", async () => {
    delete process.env.GITHUB_API_TOKEN;

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toBe(
      "GITHUB_API_TOKEN is required to fetch repository package.json."
    );
  });

  it("returns 500 when GitHub request fails", async () => {
    mockHttpsRequest(() => ({
      statusCode: 500,
      body: "github exploded",
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toContain("GitHub request failed 500");
  });

  it("returns 500 when GitHub payload includes graphql errors", async () => {
    mockHttpsRequest(() => ({
      statusCode: 200,
      body: {
        errors: [{ message: "query denied" }],
      },
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toBe("query denied");
  });

  it("returns 500 when GitHub response is invalid json", async () => {
    mockHttpsRequest(() => ({
      statusCode: 200,
      body: "not-json",
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toMatch(/Unexpected token|not valid JSON|Expected/i);
  });

  it("returns 500 when repository package.json is missing", async () => {
    mockHttpsRequest(() => ({
      statusCode: 200,
      body: {
        data: {
          repository: {
            object: null,
          },
        },
      },
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toBe("package.json not found in repository root.");
  });

  it("returns 500 when package.json is invalid", async () => {
    mockHttpsRequest(() => ({
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
    }));

    const response = await request(app)
      .post("/analyses/repository")
      .send({ owner: "facebook", repo: "react" });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toContain("Expected property name");
  });
});
