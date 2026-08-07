import type { AnalysisLookupResponse } from "../service/ApiService";
import {
  addKeyValueGrid,
  addParagraph,
  addSectionTitle,
  addTable,
  createReport,
  formatDate,
  formatValue,
  getNumber,
  getRecord,
  getString,
  safeFilePart,
  saveReport,
} from "./reportUtils";
import { defaultLanguage, translate, type Language } from "../i18n/translations";

type Analysis = AnalysisLookupResponse["analysis"];
type ScoreEntry = NonNullable<Analysis["result"]>["dependencyScores"][number];
type RelationshipEntry = Analysis["dependencyRelationships"][number];

function getRepositoryUrl(score?: ScoreEntry) {
  const metrics = getRecord(score?.githubMetrics);
  const repository = getRecord(metrics?.repository);
  const url = getString(repository?.url);
  if (url) return url;

  const fullName = getString(repository?.fullName);
  if (fullName) return `https://github.com/${fullName}`;

  const owner = getString(repository?.owner);
  const name = getString(repository?.name);
  return owner && name ? `https://github.com/${owner}/${name}` : "-";
}

function countRisks(scores: ScoreEntry[]) {
  return {
    high: scores.filter((score) => score.riskLevel === "HIGH").length,
    medium: scores.filter((score) => score.riskLevel === "MEDIUM").length,
    low: scores.filter((score) => score.riskLevel === "LOW").length,
  };
}

function countRelationships(relationships: RelationshipEntry[]) {
  return {
    known: relationships.filter((item) => item.relationshipType === "KNOWN_INCOMPATIBILITY").length,
    possible: relationships.filter((item) => item.relationshipType === "POSSIBLE_CONFLICT").length,
    mentions: relationships.filter((item) => item.relationshipType === "INTEGRATION_MENTION").length,
    unknown: relationships.filter((item) => item.relationshipType === "UNKNOWN").length,
  };
}

function average(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (numbers.length === 0) return "-";
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function score(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "-";
}

function percent(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "-";
}

function weightedContribution(value: number | null | undefined, weight: number) {
  return typeof value === "number" ? Math.round(value * weight) : "-";
}

function getNpmMetric(score: ScoreEntry, key: string) {
  return getNumber(getRecord(getRecord(score.githubMetrics)?.npm), key);
}

function scoreInputRows(scoreEntry: ScoreEntry) {
  const githubMetrics = getRecord(scoreEntry.githubMetrics);
  const npmMetrics = getRecord(githubMetrics?.npm);
  const issueMetrics = getRecord(scoreEntry.issueMetrics);
  const normalizedInputs = getRecord(scoreEntry.normalizedInputs);

  return [
    ["Package health", "Weekly downloads", formatValue(npmMetrics?.weeklyDownloads), score(getNumber(normalizedInputs, "weeklyDownloads"))],
    ["Package health", "Latest publish age", `${formatValue(npmMetrics?.latestPublishAgeDays)} days`, score(getNumber(normalizedInputs, "latestPublishAge"))],
    ["Package health", "Package age", `${formatValue(npmMetrics?.packageAgeDays)} days`, score(getNumber(normalizedInputs, "packageAge"))],
    ["Package health", "Version count", formatValue(npmMetrics?.versionCount), score(getNumber(normalizedInputs, "versionCount"))],
    ["Package health", "Dependency count", formatValue(npmMetrics?.dependencyCount), score(getNumber(normalizedInputs, "dependencyCount"))],
    ["Package health", "NPM license", formatValue(npmMetrics?.hasLicense), score(getNumber(normalizedInputs, "npmLicense"))],
    ["Package health", "Repository metadata", formatValue(npmMetrics?.hasRepository), score(getNumber(normalizedInputs, "npmRepository"))],
    ["Package health", "README", formatValue(npmMetrics?.hasReadme), score(getNumber(normalizedInputs, "npmReadme"))],
    ["Repository health", "Stars", formatValue(githubMetrics?.stars), score(getNumber(normalizedInputs, "stars"))],
    ["Repository health", "Forks", formatValue(githubMetrics?.forks), score(getNumber(normalizedInputs, "forks"))],
    ["Repository health", "Watchers", formatValue(githubMetrics?.watchers), score(getNumber(normalizedInputs, "watchers"))],
    ["Repository health", "Contributors", formatValue(githubMetrics?.contributors), score(getNumber(normalizedInputs, "contributors"))],
    ["Repository health", "Project age", `${formatValue(githubMetrics?.projectAgeDays)} days`, score(getNumber(normalizedInputs, "projectAge"))],
    ["Repository health", "Pull requests", formatValue(githubMetrics?.pullRequests), score(getNumber(normalizedInputs, "pullRequests"))],
    ["Issue resolution", "Resolution time", `${formatValue(issueMetrics?.medianResolutionTimeDays)} days median`, score(getNumber(normalizedInputs, "resolutionTime"))],
    ["Issue resolution", "Maintainer response time", `${formatValue(issueMetrics?.medianFirstResponseTimeDays)} days median`, score(getNumber(normalizedInputs, "firstResponseTime"))],
    ["Issue resolution", "Closure rate", percent(issueMetrics?.closureRate), score(getNumber(normalizedInputs, "closureRate"))],
    ["Issue resolution", "Healthy closure rate", percent(issueMetrics?.healthyClosureRate), score(getNumber(normalizedInputs, "healthyClosureRate"))],
    ["Issue resolution", "Stale open issue rate", percent(issueMetrics?.staleOpenIssueRate), score(getNumber(normalizedInputs, "staleOpenIssueRate"))],
    ["Issue resolution", "Sample coverage", formatValue(issueMetrics?.totalIssuesAnalyzed), score(getNumber(normalizedInputs, "sampleCoverage"))],
    ["Issue resolution", "Code-linked closure rate", percent(issueMetrics?.codeResolutionRate), score(getNumber(normalizedInputs, "codeResolutionRate"))],
    ["Issue resolution", "Closed by PR rate", percent(issueMetrics?.closedByPrRate ?? issueMetrics?.closedByPRRate), score(getNumber(normalizedInputs, "closedByPrRate"))],
  ];
}

function topLowestScores(scores: ScoreEntry[]) {
  return [...scores].sort((a, b) => a.score - b.score).slice(0, 8);
}

function missingDataRows(analysis: Analysis, scoresByDependencyId: Map<string, ScoreEntry>) {
  return analysis.dependencies.flatMap((dependency) => {
    const score = scoresByDependencyId.get(dependency.id);
    if (score && getRepositoryUrl(score) !== "-") return [];

    return [[
      dependency.name,
      dependency.versionRequirement,
      dependency.type,
      score ? "Repository unavailable" : "Not scored",
    ]];
  });
}

export function exportFullStackReport(analysis: Analysis, language: Language = defaultLanguage) {
  const tr = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate(language, key, params);
  const result = analysis.result;
  const doc = createReport(
    "StackIQ Full Stack Report",
    tr("result.token", { token: analysis.resultToken })
  );

  let y = 36;

  if (!result) {
    y = addSectionTitle(doc, tr("common.status"), y);
    y = addKeyValueGrid(doc, [
      [tr("common.status"), analysis.status],
      [tr("common.created"), formatDate(analysis.createdAt)],
      [tr("common.updated"), formatDate(analysis.updatedAt)],
      [tr("common.dependencies"), analysis.dependencies.length],
    ], y);
    y = addParagraph(doc, analysis.errorMessage ?? tr("result.notReady"), y);
    saveReport(doc, `stackiq-analysis-${safeFilePart(analysis.resultToken)}.pdf`, language);
    return;
  }

  const scores = result.dependencyScores;
  const risks = countRisks(scores);
  const relationshipCounts = countRelationships(analysis.dependencyRelationships);
  const scoresByDependencyId = new Map(scores.map((score) => [score.dependency.id, score]));

  y = addSectionTitle(doc, tr("result.summary"), y);
  y = addKeyValueGrid(doc, [
    [tr("result.globalScore"), `${result.globalScore}/100`],
    [tr("result.riskLevel"), result.riskLevel],
    [tr("result.dependencyScores"), scores.length],
    [tr("common.created"), formatDate(analysis.createdAt)],
    [tr("risk.high"), risks.high],
    [tr("risk.medium"), risks.medium],
    [tr("risk.low"), risks.low],
    [tr("detail.relationships"), analysis.dependencyRelationships.length],
  ], y, 4);
  y = addParagraph(doc, result.summary, y);

  y = addSectionTitle(doc, tr("result.dependencyScores"), y);
  y = addTable(
    doc,
    ["Package", tr("result.version"), tr("result.type"), tr("detail.repository"), tr("result.score"), tr("result.risk")],
    scores.map((score) => [
      score.dependency.name,
      score.dependency.versionRequirement,
      score.dependency.type,
      getRepositoryUrl(score),
      score.score,
      score.riskLevel,
    ]),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Top Risks", y);
  y = addTable(
    doc,
    ["Package", tr("result.version"), tr("result.score"), tr("result.risk"), tr("detail.repository")],
    topLowestScores(scores).map((score) => [
      score.dependency.name,
      score.dependency.versionRequirement,
      score.score,
      score.riskLevel,
      getRepositoryUrl(score),
    ]),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, tr("result.relationshipSignals"), y);
  y = addKeyValueGrid(doc, [
    [tr("detail.knownIncompatibilities"), relationshipCounts.known],
    [tr("detail.possibleConflicts"), relationshipCounts.possible],
    [tr("detail.integrationMentions"), relationshipCounts.mentions],
    [tr("detail.noEvidenceFound"), relationshipCounts.unknown],
  ], y, 4);

  const relationshipRows = analysis.dependencyRelationships
    .filter((relationship) => relationship.relationshipType !== "UNKNOWN")
    .slice(0, 20)
    .map((relationship) => [
      relationship.sourceDependency.name,
      relationship.targetDependency.name,
      relationship.relationshipType,
      relationship.summary,
    ]);

  if (relationshipRows.length > 0) {
    y = addTable(doc, ["Package", "Compared with", "Signal", tr("result.summary")], relationshipRows, y, { fontSize: 7 });
  } else {
    y = addParagraph(doc, tr("detail.noRelationshipRisks"), y);
  }

  y = addSectionTitle(doc, "Score Category Averages", y);
  y = addKeyValueGrid(doc, [
    ["Package health", average(scores.map((score) => score.popularityScore))],
    ["Repository health", average(scores.map((score) => score.maintenanceScore))],
    ["Issue resolution", average(scores.map((score) => score.resolutionQualityScore))],
    ["Weekly downloads avg", average(scores.map((score) => getNpmMetric(score, "weeklyDownloads")))],
  ], y, 4);

  y = addSectionTitle(doc, "Dependency Score Breakdown", y);
  y = addParagraph(
    doc,
    "Each dependency score is built from package health, repository health, and issue resolution. Contributions show how many points each category adds to the final score using the 50 / 30 / 20 score model.",
    y
  );
  y = addTable(
    doc,
    ["Package", "Final", "Package health", "Repo health", "Issue resolution", "Contribution"],
    scores.map((scoreEntry) => [
      scoreEntry.dependency.name,
      score(scoreEntry.score),
      score(scoreEntry.popularityScore),
      score(scoreEntry.maintenanceScore),
      score(scoreEntry.resolutionQualityScore),
      `${formatValue(weightedContribution(scoreEntry.popularityScore, 0.5))} + ${formatValue(weightedContribution(scoreEntry.maintenanceScore, 0.3))} + ${formatValue(weightedContribution(scoreEntry.resolutionQualityScore, 0.2))}`,
    ]),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Per-Package Score Details", y);
  y = addParagraph(
    doc,
    "This section expands each package with the same score inputs shown in the dependency detail page.",
    y
  );

  scores.forEach((scoreEntry) => {
    y = addSectionTitle(doc, scoreEntry.dependency.name, y);
    y = addKeyValueGrid(doc, [
      ["Overall dependency score", score(scoreEntry.score)],
      ["Risk level", scoreEntry.riskLevel],
      ["Required version", scoreEntry.dependency.versionRequirement],
      ["Type", scoreEntry.dependency.type],
    ], y, 4);
    y = addTable(
      doc,
      ["Category", "Score", "Weight", "Contribution"],
      [
        ["Package health", score(scoreEntry.popularityScore), "50%", formatValue(weightedContribution(scoreEntry.popularityScore, 0.5))],
        ["Repository health", score(scoreEntry.maintenanceScore), "30%", formatValue(weightedContribution(scoreEntry.maintenanceScore, 0.3))],
        ["Issue resolution", score(scoreEntry.resolutionQualityScore), "20%", formatValue(weightedContribution(scoreEntry.resolutionQualityScore, 0.2))],
      ],
      y,
      { fontSize: 7 }
    );
    y = addTable(
      doc,
      ["Category", "Input", "Raw value", "Normalized score"],
      scoreInputRows(scoreEntry),
      y,
      { fontSize: 6 }
    );
  });

  const missingRows = missingDataRows(analysis, scoresByDependencyId);
  if (missingRows.length > 0) {
    y = addSectionTitle(doc, "Missing or Partial Data", y);
    y = addTable(doc, ["Package", "Version", "Type", "Reason"], missingRows, y, { fontSize: 7 });
  }

  y = addSectionTitle(doc, "Notes", y);
  addParagraph(
    doc,
    "Scores are evidence-based indicators, not guarantees. Issue mining uses sampled GitHub issue data, and relationship analysis checks package pairs for issue evidence of conflicts, incompatibilities, or integration mentions.",
    y
  );

  saveReport(doc, `stackiq-full-report-${safeFilePart(analysis.resultToken)}.pdf`, language);
}
