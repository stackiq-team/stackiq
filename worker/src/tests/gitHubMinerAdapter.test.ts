import { describe, expect, it, vi } from "vitest";

const { runGitHubMinerCommandMock } = vi.hoisted(() => ({
  runGitHubMinerCommandMock: vi.fn(),
}));

vi.mock("../gitHubMiner/index.js", () => ({
  runGitHubMinerCommand: runGitHubMinerCommandMock,
}));

import { fetchGitHubMinerData, parseGitHubMinerData, runGitHubMiner } from "../adapters/githubMinerAdapter.js";

const rawRepository = {
  name: "testDependency",
  owner: "testOwner",
  description: "testDescription",
  url: "https://test.com/dependency/url",
  createdAt: "2018-05-09",
  users: 10,
  watchers: 3,
  stars: 70,
  forks: 12,
  issues: 5,
  pullRequests: 4,
  diskUsage: 55,
  license: "MIT",
  languages: ["JavaScript"],
  primaryLanguage: "JavaScript",
  environments: [],
  submodules: [],
  topics: ["react", "react-select"],
  extra: [],
};

describe("GitHubMiner adapter", () => {
  it("runs the GitHub miner command and returns raw repositories as JSON", async () => {
    runGitHubMinerCommandMock.mockResolvedValue({ raw: [rawRepository] });

    const response = await runGitHubMiner({
      fullPackageName: "testDependency",
      versionRequirement: "^17.0.0",
      dependencyId: "testDependencyId",
    });

    expect(JSON.parse(response)).toEqual([rawRepository]);
    expect(runGitHubMinerCommandMock).toHaveBeenCalledWith("testDependency@^17.0.0", 10);
  });

  it("normalizes GitHubMiner raw data", async () => {
    const response = await parseGitHubMinerData(
      {
        fullPackageName: "testDependency",
        versionRequirement: "1.0.0",
        dependencyId: "testDependencyId",
      },
      JSON.stringify([rawRepository])
    );

    expect(response[0]).toMatchObject({
      dependencyId: "testDependencyId",
      packageName: "testDependency",
      repository: {
        name: "testDependency",
        owner: "testOwner",
        description: "testDescription",
        fullName: "testOwner/testDependency",
        url: "https://test.com/dependency/url",
        createdAt: "2018-05-09",
      },
      stars: 70,
      forks: 12,
      watchers: 3,
      contributors: 10,
      createdAt: "2018-05-09",
      pullRequests: 4,
      issues: 5,
      license: "MIT",
      languages: ["JavaScript"],
      primaryLanguage: "JavaScript",
      topics: ["react", "react-select"],
      created_at: "2018-05-09",
    });
    expect(response[0]?.projectAgeDays).toEqual(expect.any(Number));
  });

  it("selects the most popular repository when there is no exact match", async () => {
    runGitHubMinerCommandMock.mockResolvedValue({
      raw: [
        { ...rawRepository, name: "low", stars: 1 },
        { ...rawRepository, name: "high", stars: 99 },
      ],
    });

    const response = await fetchGitHubMinerData({
      fullPackageName: "testDependency",
      versionRequirement: "12.0.3",
      dependencyId: "testDependencyId",
    });

    expect(response.repository.name).toBe("high");
    expect(response.stars).toBe(99);
  });

  it("throws when no repository is returned", async () => {
    runGitHubMinerCommandMock.mockResolvedValue({ raw: [] });

    await expect(
      fetchGitHubMinerData({
        fullPackageName: "missing",
        versionRequirement: "1.0.0",
        dependencyId: "dependency-1",
      })
    ).rejects.toThrow("No GitHub miner results found for missing@1.0.0");
  });

  it("returns an empty payload string when miner command fails", async () => {
    runGitHubMinerCommandMock.mockRejectedValueOnce(new Error("miner failed"));

    const response = await runGitHubMiner({
      fullPackageName: "broken",
      versionRequirement: "1.0.0",
      dependencyId: "dep-1",
    });

    expect(response).toBe("");
  });

  it("throws when raw json is invalid", async () => {
    await expect(
      parseGitHubMinerData(
        {
          fullPackageName: "broken",
          versionRequirement: "1.0.0",
          dependencyId: "dep-1",
        },
        "{invalid-json"
      )
    ).rejects.toThrow();
  });

  it("returns high-confidence match before star-based fallback", async () => {
    runGitHubMinerCommandMock.mockResolvedValue({
      raw: [
        {
          ...rawRepository,
          name: "stars-winner",
          stars: 999,
          repositoryMatchConfidence: "LOW",
        },
        {
          ...rawRepository,
          name: "confidence-winner",
          stars: 10,
          repositoryMatchConfidence: "HIGH",
        },
      ],
    });

    const response = await fetchGitHubMinerData({
      fullPackageName: "testDependency",
      versionRequirement: "2.0.0",
      dependencyId: "testDependencyId",
    });

    expect(response.repository.name).toBe("confidence-winner");
    expect(response.repositoryMatchConfidence).toBe("HIGH");
  });

  it("maps optional repository match source and npm metadata", async () => {
    const response = await parseGitHubMinerData(
      {
        fullPackageName: "testDependency",
        versionRequirement: "1.0.0",
        dependencyId: "testDependencyId",
      },
      JSON.stringify([
        {
          ...rawRepository,
          repositoryMatchSource: "NPM_HOMEPAGE",
          npm: {
            name: "testDependency",
            homepage: "https://npmjs.com/package/testDependency",
          },
        },
      ])
    );

    expect(response[0]?.repositoryMatchSource).toBe("NPM_HOMEPAGE");
    expect(response[0]?.npm).toEqual({
      name: "testDependency",
      homepage: "https://npmjs.com/package/testDependency",
    });
  });

  it("prefers exact full name match when confidence is not high", async () => {
    runGitHubMinerCommandMock.mockResolvedValue({
      raw: [
        {
          ...rawRepository,
          owner: "some-org",
          name: "some-repo",
          stars: 999,
        },
        {
          ...rawRepository,
          owner: "",
          name: "",
          stars: 1,
        },
      ],
    });

    const response = await fetchGitHubMinerData({
      fullPackageName: "/",
      versionRequirement: "1.2.3",
      dependencyId: "dep-exact",
    });

    expect(response.repository.fullName).toBe("/");
    expect(response.stars).toBe(1);
  });
});
