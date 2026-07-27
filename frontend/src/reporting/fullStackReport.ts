import type { AnalysisLookupResponse } from "../service/ApiService";
import {
  addKeyValueGrid,
  addParagraph,
  addSectionTitle,
  addTable,
  createReport,
  formatDate,
  getNumber,
  getRecord,
  getString,
  safeFilePart,
  saveReport,
} from "./reportUtils";

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

function getNpmMetric(score: ScoreEntry, key: string) {
  return getNumber(getRecord(getRecord(score.githubMetrics)?.npm), key);
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

export function exportFullStackReport(analysis: Analysis) {
  const result = analysis.result;
  const doc = createReport(
    "StackIQ Full Stack Report",
    `Result token: ${analysis.resultToken}`
  );

  let y = 36;

  if (!result) {
    y = addSectionTitle(doc, "Analysis Status", y);
    y = addKeyValueGrid(doc, [
      ["Status", analysis.status],
      ["Created", formatDate(analysis.createdAt)],
      ["Updated", formatDate(analysis.updatedAt)],
      ["Dependencies", analysis.dependencies.length],
    ], y);
    y = addParagraph(doc, analysis.errorMessage ?? "This analysis does not have completed scoring results yet.", y);
    saveReport(doc, `stackiq-analysis-${safeFilePart(analysis.resultToken)}.pdf`);
    return;
  }

  const scores = result.dependencyScores;
  const risks = countRisks(scores);
  const relationshipCounts = countRelationships(analysis.dependencyRelationships);
  const scoresByDependencyId = new Map(scores.map((score) => [score.dependency.id, score]));

  y = addSectionTitle(doc, "Analysis Summary", y);
  y = addKeyValueGrid(doc, [
    ["Global score", `${result.globalScore}/100`],
    ["Risk level", result.riskLevel],
    ["Dependencies scored", scores.length],
    ["Created", formatDate(analysis.createdAt)],
    ["High risk", risks.high],
    ["Medium risk", risks.medium],
    ["Low risk", risks.low],
    ["Relationship checks", analysis.dependencyRelationships.length],
  ], y, 4);
  y = addParagraph(doc, result.summary, y);

  y = addSectionTitle(doc, "Dependency Scores", y);
  y = addTable(
    doc,
    ["Package", "Version", "Type", "Repository", "Score", "Risk"],
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
    ["Package", "Version", "Score", "Risk", "Repository"],
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

  y = addSectionTitle(doc, "Relationship Summary", y);
  y = addKeyValueGrid(doc, [
    ["Known incompatibilities", relationshipCounts.known],
    ["Possible conflicts", relationshipCounts.possible],
    ["Integration mentions", relationshipCounts.mentions],
    ["No evidence found", relationshipCounts.unknown],
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
    y = addTable(doc, ["Package", "Compared with", "Signal", "Summary"], relationshipRows, y, { fontSize: 7 });
  } else {
    y = addParagraph(doc, "No relationship risks or integration mentions were found in this analysis.", y);
  }

  y = addSectionTitle(doc, "Score Category Averages", y);
  y = addKeyValueGrid(doc, [
    ["Package health", average(scores.map((score) => score.popularityScore))],
    ["Repository health", average(scores.map((score) => score.maintenanceScore))],
    ["Issue resolution", average(scores.map((score) => score.resolutionQualityScore))],
    ["Weekly downloads avg", average(scores.map((score) => getNpmMetric(score, "weeklyDownloads")))],
  ], y, 4);

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

  saveReport(doc, `stackiq-full-report-${safeFilePart(analysis.resultToken)}.pdf`);
}
