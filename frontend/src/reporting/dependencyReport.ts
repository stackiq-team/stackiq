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

function percent(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "-";
}

function score(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "-";
}

function weightedContribution(value: number | null | undefined, weight: number) {
  return typeof value === "number" ? `${Math.round(value * weight)} points` : "-";
}

function scoreInputRows(
  category: "package" | "repository" | "issues",
  githubMetrics: Record<string, unknown> | null,
  npmMetrics: Record<string, unknown> | null,
  issueMetrics: Record<string, unknown> | null,
  normalizedInputs: Record<string, unknown> | null
) {
  if (category === "package") {
    return [
      ["Weekly downloads", formatValue(npmMetrics?.weeklyDownloads), score(getNumber(normalizedInputs, "weeklyDownloads"))],
      ["Latest publish age", `${formatValue(npmMetrics?.latestPublishAgeDays)} days`, score(getNumber(normalizedInputs, "latestPublishAge"))],
      ["Package age", `${formatValue(npmMetrics?.packageAgeDays)} days`, score(getNumber(normalizedInputs, "packageAge"))],
      ["Version count", formatValue(npmMetrics?.versionCount), score(getNumber(normalizedInputs, "versionCount"))],
      ["Dependency count", formatValue(npmMetrics?.dependencyCount), score(getNumber(normalizedInputs, "dependencyCount"))],
      ["NPM license", formatValue(npmMetrics?.hasLicense), score(getNumber(normalizedInputs, "npmLicense"))],
      ["Repository metadata", formatValue(npmMetrics?.hasRepository), score(getNumber(normalizedInputs, "npmRepository"))],
      ["README", formatValue(npmMetrics?.hasReadme), score(getNumber(normalizedInputs, "npmReadme"))],
    ];
  }

  if (category === "repository") {
    return [
      ["Stars", formatValue(githubMetrics?.stars), score(getNumber(normalizedInputs, "stars"))],
      ["Forks", formatValue(githubMetrics?.forks), score(getNumber(normalizedInputs, "forks"))],
      ["Watchers", formatValue(githubMetrics?.watchers), score(getNumber(normalizedInputs, "watchers"))],
      ["Contributors", formatValue(githubMetrics?.contributors), score(getNumber(normalizedInputs, "contributors"))],
      ["Project age", `${formatValue(githubMetrics?.projectAgeDays)} days`, score(getNumber(normalizedInputs, "projectAge"))],
      ["Pull requests", formatValue(githubMetrics?.pullRequests), score(getNumber(normalizedInputs, "pullRequests"))],
      ["GitHub license", formatValue(githubMetrics?.license), score(getNumber(normalizedInputs, "githubLicense"))],
    ];
  }

  return [
    ["Resolution time", `${formatValue(issueMetrics?.medianResolutionTimeDays)} days median`, score(getNumber(normalizedInputs, "resolutionTime"))],
    ["Maintainer response time", `${formatValue(issueMetrics?.medianFirstResponseTimeDays)} days median`, score(getNumber(normalizedInputs, "firstResponseTime"))],
    ["Closure rate", percent(issueMetrics?.closureRate), score(getNumber(normalizedInputs, "closureRate"))],
    ["Healthy closure rate", percent(issueMetrics?.healthyClosureRate), score(getNumber(normalizedInputs, "healthyClosureRate"))],
    ["Stale open issue rate", percent(issueMetrics?.staleOpenIssueRate), score(getNumber(normalizedInputs, "staleOpenIssueRate"))],
    ["Post-close activity", percent(issueMetrics?.postCloseActivityRate), score(getNumber(normalizedInputs, "postCloseActivityRate"))],
    ["Sample coverage", formatValue(issueMetrics?.totalIssuesAnalyzed), score(getNumber(normalizedInputs, "sampleCoverage"))],
    ["Code-linked closure rate", percent(issueMetrics?.codeResolutionRate), score(getNumber(normalizedInputs, "codeResolutionRate"))],
    ["Closed by PR rate", percent(issueMetrics?.closedByPrRate ?? issueMetrics?.closedByPRRate), score(getNumber(normalizedInputs, "closedByPrRate"))],
  ];
}

function issueRows(issueData: unknown) {
  if (!Array.isArray(issueData)) return [];

  return issueData.slice(0, 25).flatMap((issue) => {
    const record = getRecord(issue);
    if (!record) return [];
    const closer = getRecord(record.closer);

    return [[
      formatValue(record.number),
      formatDate(record.publishedAt),
      formatDate(record.closedAt),
      formatValue(closer?.stateReason ?? (record.closed === true ? "UNKNOWN" : "OPEN")),
      formatValue(closer?.type),
      formatValue(record.sampleBucket),
    ]];
  });
}

function relationshipIssueRows(relationships: RelationshipEntry[]) {
  return relationships
    .filter((relationship) => relationship.relationshipType !== "UNKNOWN")
    .slice(0, 20)
    .map((relationship) => [
      relationship.targetDependency.name,
      relationship.relationshipType,
      relationship.summary,
    ]);
}

function warningRows(warnings: string[] | null | undefined) {
  return (warnings ?? []).map((warning) => [warning]);
}

function findScore(analysis: Analysis, dependencyName: string) {
  return analysis.result?.dependencyScores.find(
    (entry) => entry.dependency.name === dependencyName
  ) ?? null;
}

export function exportDependencyReport(analysis: Analysis, dependencyName: string) {
  const scoreEntry = findScore(analysis, dependencyName);

  if (!scoreEntry) {
    const doc = createReport(
      "StackIQ Dependency Report",
      `${dependencyName} - Result token: ${analysis.resultToken}`
    );
    let y = 36;
    y = addSectionTitle(doc, "Dependency Not Scored", y);
    addParagraph(doc, `${dependencyName} was not found in the completed dependency scores for this analysis.`, y);
    saveReport(doc, `stackiq-${safeFilePart(dependencyName)}-${safeFilePart(analysis.resultToken)}.pdf`);
    return;
  }

  const githubMetrics = getRecord(scoreEntry.githubMetrics);
  const repository = getRecord(githubMetrics?.repository);
  const npmMetrics = getRecord(githubMetrics?.npm);
  const issueMetrics = getRecord(scoreEntry.issueMetrics);
  const normalizedInputs = getRecord(scoreEntry.normalizedInputs);
  const relationships = analysis.dependencyRelationships.filter(
    (relationship) => relationship.sourceDependencyId === scoreEntry.dependency.id
  );
  const visibleRelationships = relationships.filter(
    (relationship) => relationship.relationshipType !== "UNKNOWN"
  );
  const known = visibleRelationships.filter((relationship) => relationship.relationshipType === "KNOWN_INCOMPATIBILITY").length;
  const possible = visibleRelationships.filter((relationship) => relationship.relationshipType === "POSSIBLE_CONFLICT").length;
  const mentions = visibleRelationships.filter((relationship) => relationship.relationshipType === "INTEGRATION_MENTION").length;

  const doc = createReport(
    "StackIQ Dependency Report",
    `${scoreEntry.dependency.name} - Result token: ${analysis.resultToken}`
  );
  let y = 36;

  y = addSectionTitle(doc, "Package Overview", y);
  y = addKeyValueGrid(doc, [
    ["Package", scoreEntry.dependency.name],
    ["Required version", scoreEntry.dependency.versionRequirement],
    ["Type", scoreEntry.dependency.type],
    ["Repository", getRepositoryUrl(scoreEntry)],
    ["Repository match", formatValue(githubMetrics?.repositoryMatchSource)],
    ["Match confidence", formatValue(githubMetrics?.repositoryMatchConfidence)],
  ], y);

  y = addSectionTitle(doc, "Score Breakdown", y);
  y = addKeyValueGrid(doc, [
    ["Overall dependency score", `${scoreEntry.score}/100`],
    ["Risk level", scoreEntry.riskLevel],
    ["Package health", score(scoreEntry.popularityScore)],
    ["Repository health", score(scoreEntry.maintenanceScore)],
    ["Issue resolution", score(scoreEntry.resolutionQualityScore)],
    ["Relationship signals", known + possible + mentions],
  ], y, 3);

  y = addParagraph(
    doc,
    "The dependency score uses package health at 50%, repository health at 30%, and issue resolution at 20%. Relationship signals are reported separately and do not change the score.",
    y
  );

  y = addTable(
    doc,
    ["Category", "Score", "Weight", "Contribution", "Signals used"],
    [
      [
        "Package health",
        score(scoreEntry.popularityScore),
        "50%",
        weightedContribution(scoreEntry.popularityScore, 0.5),
        "downloads, release age, package age, versions, dependency count, license, repository, README",
      ],
      [
        "Repository health",
        score(scoreEntry.maintenanceScore),
        "30%",
        weightedContribution(scoreEntry.maintenanceScore, 0.3),
        "stars, forks, watchers, contributors, project age, pull requests, repository license",
      ],
      [
        "Issue resolution",
        score(scoreEntry.resolutionQualityScore),
        "20%",
        weightedContribution(scoreEntry.resolutionQualityScore, 0.2),
        "resolution time, maintainer response, closure rate, stale open issues, code-linked closures",
      ],
    ],
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Package Health Inputs", y);
  y = addTable(
    doc,
    ["Input", "Raw value", "Normalized score"],
    scoreInputRows("package", githubMetrics, npmMetrics, issueMetrics, normalizedInputs),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Repository Health Inputs", y);
  y = addTable(
    doc,
    ["Input", "Raw value", "Normalized score"],
    scoreInputRows("repository", githubMetrics, npmMetrics, issueMetrics, normalizedInputs),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Issue Resolution Inputs", y);
  y = addTable(
    doc,
    ["Input", "Raw value", "Normalized score"],
    scoreInputRows("issues", githubMetrics, npmMetrics, issueMetrics, normalizedInputs),
    y,
    { fontSize: 7 }
  );

  y = addSectionTitle(doc, "Repository Signals", y);
  y = addKeyValueGrid(doc, [
    ["Owner", formatValue(repository?.owner)],
    ["Name", formatValue(repository?.name)],
    ["Full name", formatValue(repository?.fullName)],
    ["Primary language", formatValue(githubMetrics?.primaryLanguage)],
    ["Stars", formatValue(githubMetrics?.stars)],
    ["Watchers", formatValue(githubMetrics?.watchers)],
    ["Forks", formatValue(githubMetrics?.forks)],
    ["Open repo issues", formatValue(githubMetrics?.issues)],
    ["Pull requests", formatValue(githubMetrics?.pullRequests)],
    ["Contributors", formatValue(githubMetrics?.contributors)],
    ["Created", formatDate(githubMetrics?.createdAt)],
    ["Project age", `${formatValue(githubMetrics?.projectAgeDays)} days`],
  ], y, 3);

  y = addSectionTitle(doc, "Package Signals", y);
  y = addKeyValueGrid(doc, [
    ["Weekly downloads", formatValue(npmMetrics?.weeklyDownloads)],
    ["Latest publish age", `${formatValue(npmMetrics?.latestPublishAgeDays)} days`],
    ["Package age", `${formatValue(npmMetrics?.packageAgeDays)} days`],
    ["Version count", formatValue(npmMetrics?.versionCount)],
    ["Dependency count", formatValue(npmMetrics?.dependencyCount)],
    ["Dev dependency count", formatValue(npmMetrics?.devDependencyCount)],
    ["License", formatValue(npmMetrics?.license)],
    ["Has README", formatValue(npmMetrics?.hasReadme)],
  ], y, 4);

  y = addSectionTitle(doc, "Issue Resolution", y);
  y = addKeyValueGrid(doc, [
    ["Sample coverage", formatValue(issueMetrics?.totalIssuesAnalyzed)],
    ["Sampled open", formatValue(issueMetrics?.openIssues)],
    ["Sampled closed", formatValue(issueMetrics?.closedIssues)],
    ["Median resolution", `${formatValue(issueMetrics?.medianResolutionTimeDays)} days`],
    ["Median response", `${formatValue(issueMetrics?.medianFirstResponseTimeDays)} days`],
    ["Closure rate", percent(issueMetrics?.closureRate)],
    ["Healthy closure rate", percent(issueMetrics?.healthyClosureRate)],
    ["Stale open issue rate", percent(issueMetrics?.staleOpenIssueRate)],
    ["Code-linked closure rate", percent(issueMetrics?.codeResolutionRate)],
    ["Closed by PR rate", percent(issueMetrics?.closedByPrRate ?? issueMetrics?.closedByPRRate)],
  ], y, 3);

  y = addSectionTitle(doc, "Relationship Analysis", y);
  y = addKeyValueGrid(doc, [
    ["Checked against", relationships.length],
    ["Known incompatibilities", known],
    ["Possible conflicts", possible],
    ["Integration mentions", mentions],
    ["No evidence found", relationships.length - visibleRelationships.length],
    ["Analysis status", analysis.status],
  ], y, 3);

  const relationshipRows = relationshipIssueRows(relationships);
  if (relationshipRows.length > 0) {
    y = addTable(doc, ["Compared with", "Signal", "Summary"], relationshipRows, y, { fontSize: 7 });
  } else {
    y = addParagraph(doc, "No relationship risks or integration mentions were found for this dependency.", y);
  }

  const issues = issueRows(scoreEntry.issueData);
  if (issues.length > 0) {
    y = addSectionTitle(doc, "Issue Sample Appendix", y);
    y = addTable(doc, ["#", "Published", "Closed", "Reason", "Closer", "Sample"], issues, y, { fontSize: 7 });
  }

  const warnings = warningRows(scoreEntry.warnings);
  if (warnings.length > 0) {
    y = addSectionTitle(doc, "Warnings", y);
    addTable(doc, ["Warning"], warnings, y);
  }

  saveReport(doc, `stackiq-${safeFilePart(scoreEntry.dependency.name)}-${safeFilePart(analysis.resultToken)}.pdf`);
}
