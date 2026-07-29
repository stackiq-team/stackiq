import * as JsPdfModule from "jspdf";
import * as AutoTableModule from "jspdf-autotable";
import type { jsPDF as JsPdfDocument } from "jspdf";
import type {
  EnrichedDependencyInput,
  NormalizedInputs,
  RiskLevel,
  ScoreBreakdown,
} from "../dependencyScore.js";
import type { DependencyRelationshipResult } from "../dependencyRelationships.js";

type FullStackReportInput = {
  analysisId: string;
  resultToken: string;
  globalScore: number;
  riskLevel: string;
  summary: string;
  dependencies: EnrichedDependencyInput[];
  dependencyScores: ReportScoreInput[];
  relationships: DependencyRelationshipResult[];
};

type ReportScoreInput = {
  dependencyId: string;
  score: number;
  riskLevel: RiskLevel;
  breakdown?: ScoreBreakdown;
  warnings?: string[];
};

const pageWidth = 210;
const pageHeight = 297;
const margin = 14;

const JsPdfConstructor = (
  (JsPdfModule as unknown as { jsPDF?: new () => JsPdfDocument }).jsPDF ??
  (JsPdfModule as unknown as { default?: { jsPDF?: new () => JsPdfDocument } }).default?.jsPDF ??
  (JsPdfModule as unknown as { default?: new () => JsPdfDocument }).default
) as new () => JsPdfDocument;

const runAutoTable = (
  (AutoTableModule as unknown as { autoTable?: (doc: JsPdfDocument, options: Record<string, unknown>) => void }).autoTable ??
  (AutoTableModule as unknown as { default?: (doc: JsPdfDocument, options: Record<string, unknown>) => void }).default
) as (doc: JsPdfDocument, options: Record<string, unknown>) => void;

function ensureSpace(doc: JsPdfDocument, y: number, neededHeight: number) {
  if (y + neededHeight <= pageHeight - margin) return y;
  doc.addPage();
  return margin;
}

function sectionTitle(doc: JsPdfDocument, title: string, y: number) {
  const nextY = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, nextY);
  return nextY + 6;
}

function paragraph(doc: JsPdfDocument, text: string, y: number) {
  const nextY = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
  doc.text(lines, margin, nextY);
  return nextY + lines.length * 5 + 4;
}

function keyValueGrid(
  doc: JsPdfDocument,
  rows: Array<[string, string | number]>,
  y: number,
  columns = 2
) {
  let cursorY = ensureSpace(doc, y, 12);
  const columnWidth = (pageWidth - margin * 2) / columns;
  const rowHeight = 11;

  rows.forEach(([label, value], index) => {
    const column = index % columns;
    if (index > 0 && column === 0) cursorY += rowHeight;
    cursorY = ensureSpace(doc, cursorY, rowHeight);

    const x = margin + column * columnWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(label.toUpperCase(), x, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), x, cursorY + 5, { maxWidth: columnWidth - 6 });
  });

  return cursorY + rowHeight + 3;
}

function table(
  doc: JsPdfDocument,
  head: string[],
  body: Array<Array<string | number>>,
  y: number,
  fontSize = 7
) {
  runAutoTable(doc, {
    startY: ensureSpace(doc, y, 20),
    head: [head],
    body,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize,
      cellPadding: 2,
      overflow: "linebreak",
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const finalY = (doc as JsPdfDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return finalY ? finalY + 8 : y + 8;
}

function value(input: unknown) {
  if (input === null || input === undefined || input === "") return "-";
  if (typeof input === "number") return input.toLocaleString();
  if (typeof input === "boolean") return input ? "Yes" : "No";
  return String(input);
}

function score(input: number | null | undefined) {
  return typeof input === "number" ? `${input}/100` : "-";
}

function percent(input: number | null | undefined) {
  return typeof input === "number" ? `${Math.round(input * 100)}%` : "-";
}

function contribution(input: number | null | undefined, weight: number) {
  return typeof input === "number" ? Math.round(input * weight) : "-";
}

function normalized(input: NormalizedInputs | undefined, key: keyof NormalizedInputs) {
  return score(input?.[key] ?? null);
}

function dependencyNameById(dependencies: EnrichedDependencyInput[]) {
  return new Map(dependencies.map((item) => [item.dependency.id, item.dependency.name]));
}

function enrichedById(dependencies: EnrichedDependencyInput[]) {
  return new Map(dependencies.map((item) => [item.dependency.id, item]));
}

function riskCounts(scores: ReportScoreInput[]) {
  return {
    high: scores.filter((entry) => entry.riskLevel === "HIGH").length,
    medium: scores.filter((entry) => entry.riskLevel === "MEDIUM").length,
    low: scores.filter((entry) => entry.riskLevel === "LOW").length,
  };
}

function relationshipCounts(relationships: DependencyRelationshipResult[]) {
  return {
    known: relationships.filter((item) => item.relationshipType === "KNOWN_INCOMPATIBILITY").length,
    possible: relationships.filter((item) => item.relationshipType === "POSSIBLE_CONFLICT").length,
    mentions: relationships.filter((item) => item.relationshipType === "INTEGRATION_MENTION").length,
    unknown: relationships.filter((item) => item.relationshipType === "UNKNOWN").length,
  };
}

function scoreInputRows(scoreEntry: ReportScoreInput, enriched?: EnrichedDependencyInput) {
  const github = enriched?.gitHubMetrics;
  const npm = github?.npm;
  const issues = enriched?.issueMetrics;
  const normalizedInputs = scoreEntry.breakdown?.normalizedInputs;

  return [
    ["Package health", "Weekly downloads", value(npm?.weeklyDownloads), normalized(normalizedInputs, "weeklyDownloads")],
    ["Package health", "Latest publish age", `${value(npm?.latestPublishAgeDays)} days`, normalized(normalizedInputs, "latestPublishAge")],
    ["Package health", "Package age", `${value(npm?.packageAgeDays)} days`, normalized(normalizedInputs, "packageAge")],
    ["Package health", "Version count", value(npm?.versionCount), normalized(normalizedInputs, "versionCount")],
    ["Package health", "Dependency count", value(npm?.dependencyCount), normalized(normalizedInputs, "dependencyCount")],
    ["Package health", "NPM license", value(npm?.hasLicense), normalized(normalizedInputs, "npmLicense")],
    ["Package health", "Repository metadata", value(npm?.hasRepository), normalized(normalizedInputs, "npmRepository")],
    ["Package health", "README", value(npm?.hasReadme), normalized(normalizedInputs, "npmReadme")],
    ["Repository health", "Stars", value(github?.stars), normalized(normalizedInputs, "stars")],
    ["Repository health", "Forks", value(github?.forks), normalized(normalizedInputs, "forks")],
    ["Repository health", "Watchers", value(github?.watchers), normalized(normalizedInputs, "watchers")],
    ["Repository health", "Contributors", value(github?.contributors), normalized(normalizedInputs, "contributors")],
    ["Repository health", "Project age", `${value(github?.projectAgeDays)} days`, normalized(normalizedInputs, "projectAge")],
    ["Repository health", "Pull requests", value(github?.pullRequests), normalized(normalizedInputs, "pullRequests")],
    ["Issue resolution", "Resolution time", `${value(issues?.medianResolutionTimeDays)} days median`, normalized(normalizedInputs, "resolutionTime")],
    ["Issue resolution", "Maintainer response time", `${value(issues?.medianFirstResponseTimeDays)} days median`, normalized(normalizedInputs, "firstResponseTime")],
    ["Issue resolution", "Closure rate", percent(issues?.closureRate), normalized(normalizedInputs, "closureRate")],
    ["Issue resolution", "Healthy closure rate", percent(issues?.healthyClosureRate), normalized(normalizedInputs, "healthyClosureRate")],
    ["Issue resolution", "Stale open issue rate", percent(issues?.staleOpenIssueRate), normalized(normalizedInputs, "staleOpenIssueRate")],
    ["Issue resolution", "Sample coverage", value(issues?.totalIssuesAnalyzed), normalized(normalizedInputs, "sampleSize")],
    ["Issue resolution", "Code-linked closure rate", percent(issues?.codeResolutionRate), normalized(normalizedInputs, "codeResolutionRate")],
    ["Issue resolution", "Closed by PR rate", percent(issues?.closedByPrRate ?? issues?.closedByPRRate), normalized(normalizedInputs, "closedByPrRate")],
  ];
}

function addFooter(doc: JsPdfDocument) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated by StackIQ - Page ${page} of ${pageCount}`, margin, pageHeight - 8);
  }
}

export function buildFullStackReportPdf(input: FullStackReportInput): Buffer {
  const doc = new JsPdfConstructor();
  const names = dependencyNameById(input.dependencies);
  const byId = enrichedById(input.dependencies);
  const risks = riskCounts(input.dependencyScores);
  const relationships = relationshipCounts(input.relationships);
  let y = 36;

  doc.setProperties({
    title: "StackIQ Full Stack Report",
    subject: `Result token: ${input.resultToken}`,
    creator: "StackIQ",
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("StackIQ Full Stack Report", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Result token: ${input.resultToken}`, margin, 19);

  y = sectionTitle(doc, "Analysis Summary", y);
  y = keyValueGrid(doc, [
    ["Global score", `${input.globalScore}/100`],
    ["Risk level", input.riskLevel],
    ["Dependencies scored", input.dependencyScores.length],
    ["High risk", risks.high],
    ["Medium risk", risks.medium],
    ["Low risk", risks.low],
    ["Relationship checks", input.relationships.length],
    ["Analysis id", input.analysisId],
  ], y, 4);
  y = paragraph(doc, input.summary, y);

  y = sectionTitle(doc, "Dependency Scores", y);
  y = table(
    doc,
    ["Package", "Final", "Risk", "Package health", "Repo health", "Issue resolution"],
    input.dependencyScores.map((entry) => [
      names.get(entry.dependencyId) ?? entry.dependencyId,
      score(entry.score),
      entry.riskLevel,
      score(entry.breakdown?.popularityScore),
      score(entry.breakdown?.maintenanceScore),
      score(entry.breakdown?.resolutionQualityScore),
    ]),
    y
  );

  y = sectionTitle(doc, "Relationship Summary", y);
  y = keyValueGrid(doc, [
    ["Known incompatibilities", relationships.known],
    ["Possible conflicts", relationships.possible],
    ["Integration mentions", relationships.mentions],
    ["No evidence found", relationships.unknown],
  ], y, 4);

  const relationshipRows = input.relationships
    .filter((entry) => entry.relationshipType !== "UNKNOWN")
    .slice(0, 25)
    .map((entry) => [
      entry.sourceDependencyName,
      entry.targetDependencyName,
      entry.relationshipType,
      entry.summary,
    ]);

  if (relationshipRows.length > 0) {
    y = table(doc, ["Package", "Compared with", "Signal", "Summary"], relationshipRows, y, 7);
  } else {
    y = paragraph(doc, "No relationship risks or integration mentions were found in this analysis.", y);
  }

  y = sectionTitle(doc, "Per-Package Score Details", y);
  y = paragraph(
    doc,
    "Each package shows the same score breakdown used in StackIQ: package health contributes 50%, repository health contributes 30%, and issue resolution contributes 20%.",
    y
  );

  input.dependencyScores.forEach((entry) => {
    const enriched = byId.get(entry.dependencyId);
    y = sectionTitle(doc, names.get(entry.dependencyId) ?? entry.dependencyId, y);
    y = keyValueGrid(doc, [
      ["Overall dependency score", score(entry.score)],
      ["Risk level", entry.riskLevel],
      ["Required version", enriched?.dependency.versionRequirement ?? "-"],
      ["Type", enriched?.dependency.type ?? "-"],
    ], y, 4);
    y = table(
      doc,
      ["Category", "Score", "Weight", "Contribution"],
      [
        ["Package health", score(entry.breakdown?.popularityScore), "50%", value(contribution(entry.breakdown?.popularityScore, 0.5))],
        ["Repository health", score(entry.breakdown?.maintenanceScore), "30%", value(contribution(entry.breakdown?.maintenanceScore, 0.3))],
        ["Issue resolution", score(entry.breakdown?.resolutionQualityScore), "20%", value(contribution(entry.breakdown?.resolutionQualityScore, 0.2))],
      ],
      y,
      7
    );
    y = table(doc, ["Category", "Input", "Raw value", "Normalized score"], scoreInputRows(entry, enriched), y, 6);
  });

  y = sectionTitle(doc, "Notes", y);
  paragraph(
    doc,
    "Scores are evidence-based indicators, not guarantees. Issue mining uses sampled GitHub issue data, and relationship analysis checks package pairs for issue evidence of conflicts, incompatibilities, or integration mentions.",
    y
  );

  addFooter(doc);
  return Buffer.from(doc.output("arraybuffer"));
}
