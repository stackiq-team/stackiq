import { describe, expect, it } from "vitest";
import { DependencyType } from "../generated/prisma/enums";
import { scoreDependencies, scoreDependency } from "./dependencyScore";

describe("dependency scoring", () => {
  it("scores strict dependencies as low risk", () => {
    const scored = scoreDependency({
      name: "react",
      versionRequirement: "19.1.0",
      type: DependencyType.DEPENDENCY,
    });

    expect(scored.score).toBe(100);
    expect(scored.riskLevel).toBe("LOW");
  });

  it("applies penalties for broad, prerelease, and range requirements", () => {
    const scored = scoreDependency({
      name: "experimental-lib",
      versionRequirement: "^0.2.0-beta || >0.1.0",
      type: DependencyType.DEV_DEPENDENCY,
    });

    expect(scored.score).toBe(40);
    expect(scored.riskLevel).toBe("HIGH");
  });

  it("penalizes wildcard requirements", () => {
    const scored = scoreDependency({
      name: "loose-lib",
      versionRequirement: " latest ",
      type: DependencyType.DEPENDENCY,
    });

    expect(scored.score).toBe(65);
    expect(scored.riskLevel).toBe("MEDIUM");
  });

  it("returns a perfect summary when list is empty", () => {
    const result = scoreDependencies([]);

    expect(result).toMatchObject({
      globalScore: 100,
      riskLevel: "LOW",
      summary: "No dependencies were found in the submitted package file.",
      dependencyScores: [],
    });
  });

  it("computes global score and summary for mixed dependencies", () => {
    const result = scoreDependencies([
      {
        name: "react",
        versionRequirement: "19.1.0",
        type: DependencyType.DEPENDENCY,
      },
      {
        name: "tool",
        versionRequirement: "^1.2.3",
        type: DependencyType.DEV_DEPENDENCY,
      },
      {
        name: "unstable",
        versionRequirement: "0.1.0-alpha",
        type: DependencyType.DEPENDENCY,
      },
    ]);

    expect(result.globalScore).toBe(85);
    expect(result.riskLevel).toBe("LOW");
    expect(result.summary).toBe("Scored 3 dependencies.");
    expect(result.dependencyScores).toHaveLength(3);
  });
});
