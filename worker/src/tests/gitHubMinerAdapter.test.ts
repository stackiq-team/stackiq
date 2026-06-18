import { describe, expect, it, vi } from "vitest";
import { fetchGitHubMinerData, parseGitHubMinerData, runGitHubMiner } from "../adapters/githubMinerAdapter.js";
import * as githubMinerAdapter from "../adapters/githubMinerAdapter.js";



describe("runGitHubMiner", () => {
  it("Validate gitHubMiner command is running", async () => {
    const response = await runGitHubMiner({
        fullPackageName: "react-bootstrap-country-select",
        versionRequirement: "^17.0.0",
        dependencyId: "testDependencyId",
      });
    const json = JSON.parse(response);
    expect(json.length).toEqual(1);
  });

  it("parse gitHubMiner raw data", async () => {
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

    const response = await parseGitHubMinerData({
        fullPackageName: "testDependency",
        versionRequirement: "1.0.0",
        dependencyId: "testDependencyId",
      }, JSON.stringify(testData));

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
    vi.spyOn(githubMinerAdapter, "runGitHubMiner").mockResolvedValue(JSON.stringify([{
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
    }]));

    const response = await fetchGitHubMinerData({
        fullPackageName: "testDependency",
        versionRequirement: "12.0.3",
        dependencyId: "testDependencyId",
      });

    expect(response).toEqual({
      dependencyId: "testDependencyId",
      packageName: "testDependency",
      repository: {
        name: "Xunit.Extensions.TestDependency",
        owner: "JDCain",
        description: "Allow for dependent tests within Xunit 2.x",
        fullName: "JDCain/Xunit.Extensions.TestDependency",
        url: "https://github.com/JDCain/Xunit.Extensions.TestDependency",
        createdAt: "2019-11-13"
      },
      stars: 1,
      forks: 0,
      watchers: 1,
      contributors: 1,
      pullRequests: 3,
      issues: 6,
      license: "",
      languages: ["C#"],
      primaryLanguage: "C#",
      topics: [],
      created_at: "2019-11-13"
    });
  });

},30000);