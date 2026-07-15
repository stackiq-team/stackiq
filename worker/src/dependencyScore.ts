import { DependencyType } from "@prisma/client";
import type { GitHubMinerOutput } from "./types/githubMinerType.js";
import type { IssuesMiningMetrics, IssueSummary } from "./types/issuesMining.types.js";

const STAR_LOG_CAP = 100000;
const FORK_LOG_CAP = 20000;
const WATCHER_LOG_CAP = 5000;
const DOWNLOAD_LOG_CAP = 10000000;
const VERSION_COUNT_CAP = 100;
const DEPENDENCY_COUNT_POOR = 30;
const CONTRIBUTOR_CAP = 100;
const PROJECT_AGE_CAP_DAYS = 365 * 5;
const UNKNOWN_BASELINE_SCORE = 50;

export type DependencyInput = {
  id: string;
  name: string;
  versionRequirement: string;
  type: DependencyType;
};

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type NormalizedInputs = {
  weeklyDownloads: number | null;
  latestPublishAge: number | null;
  packageAge: number | null;
  versionCount: number | null;
  dependencyCount: number | null;
  npmLicense: number | null;
  npmRepository: number | null;
  npmReadme: number | null;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  contributors: number | null;
  projectAge: number | null;
  pullRequests: number | null;
  githubLicense: number | null;
  resolutionTime: number | null;
  firstResponseTime: number | null;
  closureRate: number | null;
  noResponseRate: number | null;
  closedByPrRate: number | null;
  codeResolutionRate: number | null;
  postCloseActivityRate: number | null;
};

export type ScoreBreakdown = {
  popularityScore: number | null;
  maintenanceScore: number | null;
  resolutionQualityScore: number | null;
  normalizedInputs: NormalizedInputs;
};

export type DependencyScoreInput = {
  dependencyId: string;
  score: number;
  riskLevel: RiskLevel;
  breakdown: ScoreBreakdown;
  warnings: string[];
};

export type EnrichedDependencyInput = {
  dependency: DependencyInput;
  gitHubMetrics?: GitHubMinerOutput | null;
  issueMetrics?: IssuesMiningMetrics | null;
  issueData?: IssueSummary[] | null;
  warnings?: string[];
};

export type DependencyScoreResult = {
  globalScore: number;
  riskLevel: RiskLevel;
  summary: string;
  dependencyScores: DependencyScoreInput[];
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function roundScore(score: number) {
  return Math.round(clampScore(score));
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "LOW";
  if (score >= 60) return "MEDIUM";
  return "HIGH";
}

function missing(value: number | null | undefined) {
  return value == null || Number.isNaN(value);
}

export function normalizeLogMetric(value: number | null | undefined, cap: number) {
  if (missing(value)) return null;
  const numericValue = value as number;
  if (numericValue <= 0) return 0;
  return roundScore((Math.log10(numericValue + 1) / Math.log10(cap + 1)) * 100);
}

export function normalizeCappedMetric(value: number | null | undefined, cap: number) {
  if (missing(value)) return null;
  const numericValue = value as number;
  return roundScore((Math.max(0, numericValue) / cap) * 100);
}

export function normalizeRate(value: number | null | undefined) {
  if (missing(value)) return null;
  const numericValue = value as number;
  return roundScore(numericValue * 100);
}

export function normalizeInverseRate(value: number | null | undefined) {
  if (missing(value)) return null;
  const numericValue = value as number;
  return roundScore((1 - numericValue) * 100);
}

export function normalizeProjectAge(days: number | null | undefined) {
  return normalizeCappedMetric(days, PROJECT_AGE_CAP_DAYS);
}

export function normalizeBoolean(value: boolean | null | undefined) {
  if (value == null) return null;
  return value ? 100 : 0;
}

export function normalizeInverseDays(
  value: number | null | undefined,
  excellentDays: number,
  poorDays: number
) {
  if (missing(value)) return null;
  const numericValue = value as number;
  if (numericValue <= excellentDays) return 100;
  if (numericValue >= poorDays) return 0;
  const progress = (numericValue - excellentDays) / (poorDays - excellentDays);
  return roundScore(100 - progress * 100);
}

function normalizeInputs(
  gitHubMetrics?: GitHubMinerOutput | null,
  issueMetrics?: IssuesMiningMetrics | null
): NormalizedInputs {
  return {
    weeklyDownloads: normalizeLogMetric(gitHubMetrics?.npm?.weeklyDownloads, DOWNLOAD_LOG_CAP),
    latestPublishAge: normalizeInverseDays(gitHubMetrics?.npm?.latestPublishAgeDays, 0, 730),
    packageAge: normalizeProjectAge(gitHubMetrics?.npm?.packageAgeDays),
    versionCount: normalizeCappedMetric(gitHubMetrics?.npm?.versionCount, VERSION_COUNT_CAP),
    dependencyCount: normalizeInverseDays(
      gitHubMetrics?.npm?.dependencyCount,
      0,
      DEPENDENCY_COUNT_POOR
    ),
    npmLicense: normalizeBoolean(gitHubMetrics?.npm?.hasLicense),
    npmRepository: normalizeBoolean(gitHubMetrics?.npm?.hasRepository),
    npmReadme: normalizeBoolean(gitHubMetrics?.npm?.hasReadme),
    stars: normalizeLogMetric(gitHubMetrics?.stars, STAR_LOG_CAP),
    forks: normalizeLogMetric(gitHubMetrics?.forks, FORK_LOG_CAP),
    watchers: normalizeLogMetric(gitHubMetrics?.watchers, WATCHER_LOG_CAP),
    contributors: normalizeCappedMetric(gitHubMetrics?.contributors, CONTRIBUTOR_CAP),
    projectAge: normalizeProjectAge(gitHubMetrics?.projectAgeDays),
    pullRequests: normalizeLogMetric(gitHubMetrics?.pullRequests, FORK_LOG_CAP),
    githubLicense: gitHubMetrics ? normalizeBoolean(Boolean(gitHubMetrics.license)) : null,
    resolutionTime: normalizeInverseDays(
      issueMetrics?.averageResolutionTimeDays ??
        (issueMetrics?.averageResolutionTimeHours == null
          ? null
          : issueMetrics.averageResolutionTimeHours / 24),
      7,
      180
    ),
    firstResponseTime: normalizeInverseDays(
      issueMetrics?.averageFirstResponseTimeDays ??
        (issueMetrics?.firstResponseTimeHours == null
          ? null
          : issueMetrics.firstResponseTimeHours / 24),
      1,
      90
    ),
    closureRate: normalizeRate(issueMetrics?.closureRate),
    noResponseRate: normalizeInverseRate(issueMetrics?.noResponseRate),
    closedByPrRate: normalizeRate(
      issueMetrics?.closedByPrRate ??
        issueMetrics?.closedByPRRate ??
        issueMetrics?.closeRateByPR
    ),
    codeResolutionRate: normalizeRate(issueMetrics?.codeResolutionRate),
    postCloseActivityRate: normalizeInverseRate(issueMetrics?.postCloseActivityRate),
  };
}

function collectWarnings(input: EnrichedDependencyInput) {
  return [...(input.warnings ?? [])];
}

function weightedAverage(
  metrics: Array<{ value: number | null; weight: number }>
) {
  const availableMetrics = metrics.filter((metric): metric is { value: number; weight: number } => {
    return metric.value != null;
  });

  const totalWeight = availableMetrics.reduce((total, metric) => total + metric.weight, 0);
  if (totalWeight === 0) return null;

  return roundScore(
    availableMetrics.reduce((total, metric) => total + metric.value * metric.weight, 0) /
      totalWeight
  );
}

export function scoreDependency(input: EnrichedDependencyInput): DependencyScoreInput {
  const normalizedInputs = normalizeInputs(input.gitHubMetrics, input.issueMetrics);

  const npmHealthScore = weightedAverage(
    [
      { value: normalizedInputs.weeklyDownloads, weight: 0.25 },
      { value: normalizedInputs.latestPublishAge, weight: 0.2 },
      { value: normalizedInputs.packageAge, weight: 0.1 },
      { value: normalizedInputs.versionCount, weight: 0.1 },
      { value: normalizedInputs.dependencyCount, weight: 0.15 },
      { value: normalizedInputs.npmLicense, weight: 0.08 },
      { value: normalizedInputs.npmRepository, weight: 0.07 },
      { value: normalizedInputs.npmReadme, weight: 0.05 },
    ]
  );

  const githubHealthScore = weightedAverage(
    [
      { value: normalizedInputs.stars, weight: 0.25 },
      { value: normalizedInputs.forks, weight: 0.15 },
      { value: normalizedInputs.watchers, weight: 0.1 },
      { value: normalizedInputs.contributors, weight: 0.2 },
      { value: normalizedInputs.projectAge, weight: 0.15 },
      { value: normalizedInputs.pullRequests, weight: 0.1 },
      { value: normalizedInputs.githubLicense, weight: 0.05 },
    ]
  );

  const issueResolutionScore = weightedAverage(
    [
      { value: normalizedInputs.resolutionTime, weight: 0.2 },
      { value: normalizedInputs.firstResponseTime, weight: 0.15 },
      { value: normalizedInputs.closureRate, weight: 0.2 },
      { value: normalizedInputs.noResponseRate, weight: 0.15 },
      { value: normalizedInputs.closedByPrRate, weight: 0.1 },
      { value: normalizedInputs.codeResolutionRate, weight: 0.15 },
      { value: normalizedInputs.postCloseActivityRate, weight: 0.05 },
    ]
  );

  const score = weightedAverage(
    [
      { value: npmHealthScore, weight: 0.5 },
      { value: githubHealthScore, weight: 0.3 },
      { value: issueResolutionScore, weight: 0.2 },
    ]
  ) ?? UNKNOWN_BASELINE_SCORE;

  return {
    dependencyId: input.dependency.id,
    score,
    riskLevel: getRiskLevel(score),
    breakdown: {
      popularityScore: npmHealthScore,
      maintenanceScore: githubHealthScore,
      resolutionQualityScore: issueResolutionScore,
      normalizedInputs,
    },
    warnings: collectWarnings(input),
  };
}

function dependencyWeight(dependency: DependencyInput) {
  return dependency.type === DependencyType.DEV_DEPENDENCY ? 0.5 : 1;
}

export function scoreDependencies(
  dependencies: EnrichedDependencyInput[]
): DependencyScoreResult {
  const dependencyScores = dependencies.map(scoreDependency);
  const totalWeight = dependencies.reduce(
    (total, input) => total + dependencyWeight(input.dependency),
    0
  );

  const globalScore =
    dependencyScores.length === 0 || totalWeight === 0
      ? 100
      : roundScore(
          dependencyScores.reduce((total, dependencyScore, index) => {
            return total + dependencyScore.score * dependencyWeight(dependencies[index]!.dependency);
          }, 0) / totalWeight
        );

  const highRiskCount = dependencyScores.filter((item) => item.riskLevel === "HIGH").length;

  return {
    globalScore,
    riskLevel: getRiskLevel(globalScore),
    summary:
      dependencyScores.length === 0
        ? "No dependencies were found in the submitted package file."
        : `Scored ${dependencyScores.length} dependencies (${highRiskCount} high risk).`,
    dependencyScores,
  };
}
