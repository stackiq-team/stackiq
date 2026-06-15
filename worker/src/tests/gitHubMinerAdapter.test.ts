import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubMinerData, parseGitHubMinerData, runGitHubMiner } from "../adapters/githubMinerAdapter.js";
import * as fs from 'fs/promises';
import { writeFile } from "fs/promises";
import * as githubMinerAdapter from "../adapters/githubMinerAdapter.js";



describe("runGitHubMiner", () => {
  //empty data folder before and after each test
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm("data/", { recursive: true, force: true });
    await fs.mkdir("data/", { recursive: true });
  });

  it("Validate gitHubMiner command is running", async () => {
    const response = await runGitHubMiner({
        fullPackageName: "react-bootstrap-country-select",
        versionRequirement: "^17.0.0",
        dependencyId: "testDependencyId",
      });

    expect(response).toEqual({
      success: true,
      message: 'GitHub Miner executed successfully',
      data: null
    });
  });

  it("parse gitHubMiner raw data", async () => {
    const filePath = "data/testDependency-1.0.0.json";
    const testData = [{
      "name": "testDependency",
      "owner": "testOwner",
      "description": "testDescription",
      "url": "https://test.com/dependency/url",
      "createdAt": "2018-05-09",
      "users": 1,
      "watchers": 1,
      "stars": 7,
      "forks": 1,
      "issues": 1,
      "pullRequests": 0,
      "diskUsage": 55,
      "license": "MIT",
      "languages": [
        "JavaScript"
      ],
      "primaryLanguage": "JavaScript",
      "environments": [],
      "submodules": [],
      "topics": [
        "react",
        "react-select",
      ],
      "extra": [
        "styles",
      ]
    }];

    // 1. Create and write the JSON file
    await writeFile(filePath, JSON.stringify(testData, null, 2), 'utf-8');

    const response = await parseGitHubMinerData({
        fullPackageName: "testDependency",
        versionRequirement: "1.0.0",
        dependencyId: "testDependencyId",
      });

    expect(response).toEqual([{
      dependencyId: "testDependencyId",
      packageName: "testDependency",
      repository: {
        name: "testDependency",
        owner: "testOwner",
        description: "testDescription",
        fullName: "testOwner/testDependency",
        url: "https://test.com/dependency/url",
        createdAt: "2018-05-09"
      },
      stars: 7,
      forks: 1,
      watchers: 1,
      contributors: 1,
      pullRequests: 0,
      issues: 1,
      license: "MIT",
      languages: ["JavaScript"],
      primaryLanguage: "JavaScript",
      topics: ["react", "react-select"],
      created_at: "2018-05-09"
    }]);
  });

  it("run gitHubMiner service", async () => {
    vi.spyOn(githubMinerAdapter, "runGitHubMiner").mockResolvedValue({
      success: true,
      message: "GitHub Miner executed successfully",
      data: null,
    });

    const response = await fetchGitHubMinerData({
        fullPackageName: "testDependency",
        versionRequirement: "1.0.0",
        dependencyId: "testDependencyId",
      });

    expect(response).toEqual({
      dependencyId: "testDependencyId",
      packageName: "testDependency",
      repository: {
        name: "testDependency",
        owner: "testOwner",
        description: "testDescription",
        fullName: "testOwner/testDependency",
        url: "https://test.com/dependency/url",
        createdAt: "2018-05-09"
      },
      stars: 7,
      forks: 1,
      watchers: 1,
      contributors: 1,
      pullRequests: 0,
      issues: 1,
      license: "MIT",
      languages: ["JavaScript"],
      primaryLanguage: "JavaScript",
      topics: ["react", "react-select"],
      created_at: "2018-05-09"
    });
  });




},30000);