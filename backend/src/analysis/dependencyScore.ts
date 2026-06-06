import { DependencyType } from "../generated/prisma/enums";

export type DependencyInput = {
  name: string;
  versionRequirement: string;
  type: DependencyType;
};

export type DependencyScoreResult = {
  globalScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  dependencyScores: DependencyScoreInput[];
};

export type DependencyScoreInput = DependencyInput & {
  score: number;
  riskLevel: DependencyScoreResult["riskLevel"];
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function getRiskLevel(score: number): DependencyScoreResult["riskLevel"] {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MEDIUM";
  return "HIGH";
}

export function scoreDependency(dependency: DependencyInput): DependencyScoreInput {
  const requirement = dependency.versionRequirement.trim();
  const normalizedRequirement = requirement.toLowerCase();
  let score = dependency.type === DependencyType.DEV_DEPENDENCY ? 95 : 100;

  if (!requirement || ["*", "x", "latest"].includes(normalizedRequirement)) {
    score -= 35;
  }

  if (/[\^~]/.test(requirement)) {
    score -= 8;
  }

  if (/[<>]|\|\|/.test(requirement)) {
    score -= 15;
  }

  if (/\b(alpha|beta|rc|next|canary|snapshot)\b/i.test(requirement)) {
    score -= 20;
  }

  if (/^[\^~]?0\./.test(requirement)) {
    score -= 12;
  }

  const finalScore = clampScore(score);

  return {
    ...dependency,
    score: finalScore,
    riskLevel: getRiskLevel(finalScore),
  };
}

export function scoreDependencies(
  dependencies: DependencyInput[]
): DependencyScoreResult {
  const dependencyScores = dependencies.map(scoreDependency);
  const scores = dependencyScores.map(({ score }) => score);
  const globalScore =
    scores.length === 0
      ? 100
      : Math.round(
          scores.reduce((total, score) => total + score, 0) / scores.length
        );

  return {
    globalScore,
    riskLevel: getRiskLevel(globalScore),
    summary:
      scores.length === 0
        ? "No dependencies were found in the submitted package file."
        : `Scored ${scores.length} dependencies.`,
    dependencyScores,
  };
}
