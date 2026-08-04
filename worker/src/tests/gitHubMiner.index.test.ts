import { beforeEach, describe, expect, it, vi } from "vitest";

type MockJsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

function jsonResponse(body: any, status = 200): MockJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function installFetchMock(impl: (url: string, init?: RequestInit) => MockJsonResponse | Promise<MockJsonResponse>) {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return await impl(url, init);
  });

  vi.stubGlobal("fetch", mock as unknown as typeof fetch);
  return mock;
}

describe("runGitHubMinerCommand", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env.GITHUB_API_TOKEN = "token-1";
  });

  it("uses package override and repository-by-name lookup when available", async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url.startsWith("https://registry.npmjs.org/react")) {
        return jsonResponse({
          repository: { url: "https://github.com/example/ignored" },
          readme: "README",
          license: "MIT",
          time: {
            created: "2015-01-01T00:00:00.000Z",
            modified: "2026-01-01T00:00:00.000Z",
            "1.0.0": "2025-12-01T00:00:00.000Z",
          },
          versions: {
            "1.0.0": {
              dependencies: { depA: "1" },
              devDependencies: { devA: "1", devB: "2" },
            },
          },
          "dist-tags": { latest: "1.0.0" },
        });
      }

      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/react")) {
        return jsonResponse({ downloads: 5000 });
      }

      if (url === "https://api.github.com/graphql") {
        const payload = JSON.parse(String(init?.body));
        expect(payload.variables.owner).toBe("facebook");
        expect(payload.variables.name).toBe("react");

        return jsonResponse({
          data: {
            repository: {
              nameWithOwner: "facebook/react",
              description: "React",
              url: "https://github.com/facebook/react",
              createdAt: "2013-05-24T16:15:54Z",
              assignableUsers: { totalCount: 100 },
              watchers: { totalCount: 2000 },
              stargazerCount: 100000,
              forkCount: 20000,
              issues: { totalCount: 1000 },
              pullRequests: { totalCount: 5000 },
              diskUsage: 123456,
              licenseInfo: { spdxId: "MIT" },
              languages: { edges: [{ node: { name: "TypeScript" } }] },
              primaryLanguage: { name: "TypeScript" },
              repositoryTopics: { edges: [{ node: { topic: { name: "ui" } } }] },
            },
          },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("react@19.0.0");

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0]).toMatchObject({
      owner: "facebook",
      name: "react",
      repositoryMatchSource: "PACKAGE_OVERRIDE",
      repositoryMatchConfidence: "HIGH",
      license: "MIT",
      primaryLanguage: "TypeScript",
      npm: expect.objectContaining({
        weeklyDownloads: 5000,
        dependencyCount: 1,
        devDependencyCount: 2,
        hasLicense: true,
        hasReadme: true,
      }),
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to search query when repository-by-name returns null", async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url.startsWith("https://registry.npmjs.org/pkg")) {
        return jsonResponse({
          repository: "git+https://github.com/acme/pkg.git",
          readme: "docs",
          license: "Apache-2.0",
          time: {
            created: "2020-01-01T00:00:00.000Z",
            modified: "2026-01-01T00:00:00.000Z",
          },
          versions: {},
          "dist-tags": {},
        });
      }

      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/pkg")) {
        return jsonResponse({ downloads: 321 });
      }

      if (url === "https://api.github.com/graphql") {
        const payload = JSON.parse(String(init?.body));

        if (String(payload.query).includes("RepositoryByName")) {
          return jsonResponse({ data: { repository: null } });
        }

        expect(String(payload.query)).toContain("RepositorySearch");
        expect(payload.variables.searchQuery).toContain("pkg in:name,description");
        expect(payload.variables.first).toBe(100);

        return jsonResponse({
          data: {
            search: {
              nodes: [
                {
                  nameWithOwner: "acme/pkg",
                  description: "pkg",
                  url: "https://github.com/acme/pkg",
                  createdAt: "2022-01-01T00:00:00Z",
                  assignableUsers: { totalCount: 1 },
                  watchers: { totalCount: 2 },
                  stargazerCount: 3,
                  forkCount: 4,
                  issues: { totalCount: 5 },
                  pullRequests: { totalCount: 6 },
                  diskUsage: 7,
                  licenseInfo: null,
                  languages: { edges: [] },
                  primaryLanguage: null,
                  repositoryTopics: { edges: [] },
                },
              ],
            },
          },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("pkg", 999);

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0]).toMatchObject({
      owner: "acme",
      name: "pkg",
      repositoryMatchSource: "GITHUB_SEARCH",
      repositoryMatchConfidence: "LOW",
      license: "",
      primaryLanguage: "",
      npm: expect.objectContaining({ weeklyDownloads: 321 }),
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("derives scoped package search query and parses ssh repository URLs", async () => {
    installFetchMock((url, init) => {
      if (url.startsWith("https://registry.npmjs.org/@scope%2Flib") || url.startsWith("https://registry.npmjs.org/@scope/lib")) {
        return jsonResponse({
          repository: { url: "git@github.com:scope/lib.git" },
          bugs: { url: "https://github.com/scope/lib/issues" },
          readme: "",
          time: { created: "2021-01-01T00:00:00.000Z" },
          versions: {},
          "dist-tags": {},
        });
      }

      if (url.includes("downloads/point/last-week/@scope/lib")) {
        return jsonResponse({ downloads: 11 });
      }

      if (url === "https://api.github.com/graphql") {
        const payload = JSON.parse(String(init?.body));

        if (String(payload.query).includes("RepositoryByName")) {
          expect(payload.variables.owner).toBe("scope");
          expect(payload.variables.name).toBe("lib");
          return jsonResponse({ data: { repository: null } });
        }

        expect(payload.variables.searchQuery).toContain("lib scope in:name,description");
        return jsonResponse({ data: { search: { nodes: [] } } });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("@scope/lib@^2.0.0", 1);

    expect(result.raw).toEqual([]);
  });

  it("returns npm-only fallback when GitHub request fails", async () => {
    installFetchMock((url) => {
      if (url.startsWith("https://registry.npmjs.org/pkg-fallback")) {
        return jsonResponse({
          repository: "https://github.com/acme/pkg-fallback",
          homepage: "https://github.com/acme/pkg-fallback#readme",
          readme: "readme",
          license: "MIT",
          time: {
            created: "2022-01-01T00:00:00.000Z",
            modified: "2026-01-01T00:00:00.000Z",
          },
          versions: {},
          "dist-tags": {},
        });
      }

      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/pkg-fallback")) {
        return jsonResponse({ downloads: 42 });
      }

      if (url === "https://api.github.com/graphql") {
        return jsonResponse("boom", 500);
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("pkg-fallback@1.2.3");

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0]).toMatchObject({
      name: "pkg-fallback",
      repositoryMatchSource: "NPM_REGISTRY",
      repositoryMatchConfidence: "MEDIUM",
      npm: expect.objectContaining({
        weeklyDownloads: 42,
        hasRepository: true,
      }),
    });
  });

  it("returns npm-only fallback when token is missing", async () => {
    delete process.env.GITHUB_API_TOKEN;

    installFetchMock((url) => {
      if (url.startsWith("https://registry.npmjs.org/no-token")) {
        return jsonResponse({
          readme: "hello",
          versions: {},
          "dist-tags": {},
          time: { created: "2024-01-01T00:00:00.000Z" },
        });
      }

      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/no-token")) {
        return jsonResponse({ downloads: 0 });
      }

      if (url === "https://api.github.com/graphql") {
        return jsonResponse({ data: { repository: null } });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("no-token");

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0]).toMatchObject({
      name: "no-token",
      repositoryMatchSource: "NPM_REGISTRY",
      repositoryMatchConfidence: "MEDIUM",
    });
  });

  it("falls back when GitHub returns errors payload", async () => {
    installFetchMock((url) => {
      if (url.startsWith("https://registry.npmjs.org/error-pkg")) {
        return jsonResponse({
          repository: "https://github.com/acme/error-pkg",
          readme: "x",
          versions: {},
          "dist-tags": {},
          time: { created: "2024-01-01T00:00:00.000Z" },
        });
      }
      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/error-pkg")) {
        return jsonResponse({ downloads: 7 });
      }
      if (url === "https://api.github.com/graphql") {
        return jsonResponse({ errors: [{ message: "bad query" }] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("error-pkg");

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0].name).toBe("error-pkg");
  });

  it("falls back when GitHub response has no data field", async () => {
    installFetchMock((url) => {
      if (url.startsWith("https://registry.npmjs.org/no-data-pkg")) {
        return jsonResponse({
          repository: "https://github.com/acme/no-data-pkg",
          readme: "x",
          versions: {},
          "dist-tags": {},
          time: { created: "2024-01-01T00:00:00.000Z" },
        });
      }
      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/no-data-pkg")) {
        return jsonResponse({ downloads: 5 });
      }
      if (url === "https://api.github.com/graphql") {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("no-data-pkg");

    expect(result.raw).toHaveLength(1);
    expect(result.raw[0].name).toBe("no-data-pkg");
  });

  it("handles invalid npm metadata/date and returns npm fallback", async () => {
    installFetchMock((url) => {
      if (url.startsWith("https://registry.npmjs.org/odd-pkg")) {
        return jsonResponse({
          repository: "https://not-github.example.com/repo",
          homepage: "https://example.com",
          readme: "x",
          time: { created: "not-a-date" },
          versions: {},
          "dist-tags": {},
        });
      }
      if (url.startsWith("https://api.npmjs.org/downloads/point/last-week/odd-pkg")) {
        return jsonResponse({ downloads: "n/a" });
      }
      if (url === "https://api.github.com/graphql") {
        return jsonResponse({ data: { search: { nodes: [] } } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { runGitHubMinerCommand } = await import("../gitHubMiner/index.js");
    const result = await runGitHubMinerCommand("odd-pkg");

    expect(result.raw).toEqual([]);
  });
});
