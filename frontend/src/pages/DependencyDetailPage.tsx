import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import "./DependencyDetailPage.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DetailTab = "signals" | "score" | "relationships" | "issues";
type ScoreEntry = NonNullable<AnalysisLookupResponse["analysis"]["result"]>["dependencyScores"][number];
type RelationshipEntry = AnalysisLookupResponse["analysis"]["dependencyRelationships"][number];

interface DependencyDetail {
  name: string;
  versionRequirement: string;
  type: "DEPENDENCY" | "DEV_DEPENDENCY";
  score: number;
  riskLevel: RiskLevel;
  scoreEntry?: ScoreEntry;
  relationships: RelationshipEntry[];
  analysisStatus: AnalysisLookupResponse["analysis"]["status"];
}

function relationshipAnalysisStatus(
  analysisStatus: AnalysisLookupResponse["analysis"]["status"],
  dependencyName: string,
  dependencyRelationshipCount: number
) {
  if (analysisStatus === "FAILED") {
    return {
      label: "Failed",
      className: "relationship-status-failed",
      message: "Relationship analysis did not complete because the analysis failed.",
    };
  }

  if (analysisStatus !== "COMPLETED") {
    return {
      label: "Running",
      className: "relationship-status-running",
      message: "Relationship analysis is still running. These counts will appear after the relationship pass finishes.",
    };
  }

  if (dependencyRelationshipCount === 0) {
    return {
      label: "Not available",
      className: "relationship-status-waiting",
      message: `${dependencyName} was not checked against other dependencies.`,
    };
  }

  return {
    label: "Completed",
    className: "relationship-status-completed",
    message: `${dependencyName} was checked against ${dependencyRelationshipCount} other ${
      dependencyRelationshipCount === 1 ? "dependency" : "dependencies"
    }.`,
  };
}

function riskClassName(risk: RiskLevel): string {
  if (risk === "LOW") return "risk-low";
  if (risk === "MEDIUM") return "risk-medium";
  return "risk-high";
}

function riskLabel(risk: RiskLevel): string {
  if (risk === "LOW") return "Low";
  if (risk === "MEDIUM") return "Medium";
  return "High";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function formatDate(value: unknown) {
  const rawValue = getStringValue(value);
  if (!rawValue) return "-";

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return rawValue;

  return parsedDate.toLocaleDateString();
}

function formatBoolean(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatScoreValue(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "Not available";
}

function weightedContribution(value: number | null | undefined, weight: number) {
  return typeof value === "number" ? Math.round(value * weight) : null;
}

function getNumberValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function formatPercentValue(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "-";
}

function scoreSignalLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "Not available";
  if (value >= 80) return "Strong";
  if (value >= 60) return "Good";
  if (value >= 40) return "Weak";
  return "Poor";
}

function scoreSignalClassName(value: number | null | undefined) {
  if (typeof value !== "number") return "score-input-missing";
  if (value >= 80) return "score-input-strong";
  if (value >= 60) return "score-input-good";
  if (value >= 40) return "score-input-weak";
  return "score-input-poor";
}

function relationshipLabel(type: RelationshipEntry["relationshipType"]) {
  if (type === "KNOWN_INCOMPATIBILITY") return "Known Incompatibility";
  if (type === "POSSIBLE_CONFLICT") return "Possible Conflict";
  if (type === "INTEGRATION_MENTION") return "Integration Mention";
  return "Unknown";
}

function relationshipClassName(type: RelationshipEntry["relationshipType"]) {
  if (type === "KNOWN_INCOMPATIBILITY") return "relationship-critical";
  if (type === "POSSIBLE_CONFLICT") return "relationship-warning";
  if (type === "INTEGRATION_MENTION") return "relationship-info";
  return "relationship-muted";
}

function getRelationshipIssues(evidence: unknown) {
  const record = getRecord(evidence);
  const issues = record?.issues;
  if (!Array.isArray(issues)) return [];

  return issues.flatMap((issue) => {
    const item = getRecord(issue);
    if (!item) return [];
    const issueNumber = typeof item.issueNumber === "number" ? item.issueNumber : null;
    const title = getStringValue(item.title);
    const url = getStringValue(item.url);
    const matchedTerms = toStringArray(item.matchedTerms);

    if (!issueNumber || !title || !url) return [];

    return [
      {
        issueNumber,
        title,
        url,
        matchedTerms,
      },
    ];
  });
}

function getRepositoryUrl(score?: ScoreEntry) {
  const metrics = getRecord(score?.githubMetrics);
  const repository = getRecord(metrics?.repository);

  const url = repository?.url;
  if (typeof url === "string" && url.trim() !== "") {
    return url;
  }

  const fullName = repository?.fullName;
  if (typeof fullName === "string" && fullName.trim() !== "") {
    return `https://github.com/${fullName}`;
  }

  const owner = repository?.owner;
  const name = repository?.name;
  if (
    typeof owner === "string" &&
    owner.trim() !== "" &&
    typeof name === "string" &&
    name.trim() !== ""
  ) {
    return `https://github.com/${owner}/${name}`;
  }

  return null;
}

function getIssueSummary(value: unknown) {
  const record = getRecord(value);
  if (!record) return null;

  const closer = getRecord(record.closer) ?? {};

  const rawStateReason = getStringValue(closer.stateReason);
  const rawCloserType = getStringValue(closer.type);
  const closedAt = getStringValue(record.closedAt);

  const closerType = rawCloserType ?? (rawStateReason ? "Comment" : null);
  const stateReason = rawStateReason ?? (closedAt ? "UNKNOWN" : null);

  return {
    number: typeof record.number === "number" ? record.number : null,
    publishedAt: getStringValue(record.publishedAt),
    closedAt,
    closed: record.closed === true,
    assigneesCount: typeof record.assigneesCount === "number" ? record.assigneesCount : null,
    firstAssignedAt: getStringValue(record.firstAssignedAt),
    stateReason,
    closerType,
    merged: closer.merged === true ? true : closer.merged === false ? false : null,
    closedByBot: closer.closedByBot === true ? true : closer.closedByBot === false ? false : null,
    closedByLogin: getStringValue(closer.closedByLogin),
    wasReclassified: closer.wasReclassified === true,
    hasConnectedEvent: record.hasConnectedEvent === true,
    hasPostCloseActivity: record.hasPostCloseActivity === true,
    tooManyTimelineItems: record.tooManyTimelineItems === true,
    timelineTotalCount: typeof record.timelineTotalCount === "number" ? record.timelineTotalCount : null,
    timelineCapturedCount: typeof record.timelineCapturedCount === "number" ? record.timelineCapturedCount : null,
  };
}

type IssueSummary = NonNullable<ReturnType<typeof getIssueSummary>>;

function getWeekStart(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  return monday.toISOString().split("T")[0];
}

function buildIssueActivityChartData(summaries: IssueSummary[]) {
  const openedByWeek = new Map<string, number>();
  const closedByWeek = new Map<string, number>();

  summaries.forEach((s) => {
    const openedWeek = getWeekStart(s.publishedAt);
    if (openedWeek) openedByWeek.set(openedWeek, (openedByWeek.get(openedWeek) ?? 0) + 1);

    const closedWeek = getWeekStart(s.closedAt);
    if (closedWeek) closedByWeek.set(closedWeek, (closedByWeek.get(closedWeek) ?? 0) + 1);
  });

  const minDate = new Date();
  minDate.setMonth(minDate.getMonth() - 12);
  const startWeek = getWeekStart(minDate.toISOString());
  const endWeek = getWeekStart(new Date().toISOString());

  if (!startWeek || !endWeek) return [];

  const weeks: string[] = [];
  const cursor = new Date(startWeek);
  const end = new Date(endWeek);

  while (cursor <= end) {
    weeks.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks.map((week) => ({
    week,
    opened: openedByWeek.get(week) ?? 0,
    closed: closedByWeek.get(week) ?? 0,
  }));
}

const PIE_COLORS = ["#2563eb", "#f59e0b", "#22c55e", "#ef4444", "#a855f7"];

function buildCloserBreakdownData(summaries: IssueSummary[]) {
  const counts = new Map<string, number>();

  summaries
    .filter((s) => s.closed)
    .forEach((s) => {
      const category = s.closedByBot ? "Bot" : s.closerType ?? "Unknown";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });

  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

const ACTIVITY_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: "0-3", min: 0, max: 3 },
  { label: "3-6", min: 3, max: 6 },
  { label: "6-20", min: 6, max: 20 },
  { label: "20-50", min: 20, max: 50 },
  { label: "50-100", min: 50, max: 100 },
  { label: "100+", min: 100, max: null },
];

function getActivityBucket(count: number | null): string | null {
  if (count === null) return null;
  const bucket = ACTIVITY_BUCKETS.find((b) => count >= b.min && (b.max === null || count < b.max));
  return bucket ? bucket.label : null;
}

function buildActivityBucketData(summaries: IssueSummary[]) {
  const counts = new Map<string, number>();
  ACTIVITY_BUCKETS.forEach((b) => counts.set(b.label, 0));

  summaries.forEach((s) => {
    const bucket = getActivityBucket(s.timelineTotalCount);
    if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  });

  return ACTIVITY_BUCKETS.map((b) => ({ bucket: b.label, count: counts.get(b.label) ?? 0 }));
}

function computeTimeToCloseStats(summaries: IssueSummary[]) {
  const days = summaries
    .filter((s) => s.closed && s.publishedAt && s.closedAt)
    .map((s) => {
      const opened = new Date(s.publishedAt as string).getTime();
      const closed = new Date(s.closedAt as string).getTime();
      return (closed - opened) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0);

  if (days.length === 0) return { median: null, average: null };

  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const average = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;

  return { median: Math.round(median * 10) / 10, average: Math.round(average * 10) / 10 };
}

function buildCloseReasonData(summaries: IssueSummary[]) {
  const counts = new Map<string, number>();

  summaries
    .filter((s) => s.closed)
    .forEach((s) => {
      const reason = s.stateReason ?? "Unknown";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });

  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

function buildPostCloseActivityData(summaries: IssueSummary[]) {
  const closedSummaries = summaries.filter((s) => s.closed);
  const withActivity = closedSummaries.filter((s) => s.hasPostCloseActivity).length;
  const withoutActivity = closedSummaries.length - withActivity;

  return [
    { name: "Had post-close activity", value: withActivity },
    { name: "No post-close activity", value: withoutActivity },
  ];
}

function computeTriageSpeedStats(summaries: IssueSummary[]) {
  const days = summaries
    .filter((s) => s.publishedAt && s.firstAssignedAt)
    .map((s) => {
      const opened = new Date(s.publishedAt as string).getTime();
      const assigned = new Date(s.firstAssignedAt as string).getTime();
      return (assigned - opened) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0);

  if (days.length === 0) return { median: null, average: null };

  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const average = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;

  return { median: Math.round(median * 10) / 10, average: Math.round(average * 10) / 10 };
}

export default function DependencyDetailPage() {
  const { resultToken, dependencyName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dependency, setDependency] = useState<DependencyDetail | null>(null);
  const [riskInfoOpen, setRiskInfoOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedCloserCategory, setSelectedCloserCategory] = useState<string | null>(null);
  const [selectedActivityBucket, setSelectedActivityBucket] = useState<string | null>(null);
  const [selectedCloseReason, setSelectedCloseReason] = useState<string | null>(null);
  const [selectedPostCloseActivity, setSelectedPostCloseActivity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("signals");

  const load = async () => {
    if (!resultToken || !dependencyName) {
      setError("Missing result token or dependency name in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetchAnalysisByResultToken(resultToken);

      if (!response.success || !response.data?.analysis?.result) {
        setError(response.message || "Unable to load analysis.");
        setLoading(false);
        return;
      }

      const decodedName = decodeURIComponent(dependencyName);
      const analysisResult = response.data.analysis.result;
      const depScore = analysisResult.dependencyScores.find(
        (ds) => ds.dependency.name === decodedName
      );

      if (!depScore) {
        setError("Dependency not found in analysis results.");
        setLoading(false);
        return;
      }

      setDependency({
        name: depScore.dependency.name,
        versionRequirement: depScore.dependency.versionRequirement,
        type: depScore.dependency.type,
        score: depScore.score,
        riskLevel: depScore.riskLevel,
        scoreEntry: depScore,
        relationships: response.data.analysis.dependencyRelationships.filter(
          (relationship) => relationship.sourceDependencyId === depScore.dependency.id
        ),
        analysisStatus: response.data.analysis.status,
      });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [resultToken, dependencyName]);

  useEffect(() => {
    if (!riskInfoOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRiskInfoOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [riskInfoOpen]);

  useEffect(() => {
    if (!riskInfoOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [riskInfoOpen]);

  if (loading) {
    return (
      <section className="dependency-detail-page">
        <h1>Dependency Details</h1>
        <p>Loading information...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dependency-detail-page">
        <h1>Dependency Details</h1>
        <p className="error-text">{error}</p>
        <div className="detail-actions">
          <button className="button" onClick={() => void load()}>
            Retry
          </button>
          <Link className="button button-secondary" to={`/results/${resultToken}`}>
            Back to results
          </Link>
        </div>
      </section>
    );
  }

  if (!dependency) {
    return (
      <section className="dependency-detail-page">
        <h1>Dependency Details</h1>
        <p>No dependency found.</p>
      </section>
    );
  }

  const githubMetrics = getRecord(dependency.scoreEntry?.githubMetrics);
  const repository = getRecord(githubMetrics?.repository);
  const npmMetrics = getRecord(githubMetrics?.npm);
  const issueMetrics = getRecord(dependency.scoreEntry?.issueMetrics);
  const normalizedInputs = getRecord(dependency.scoreEntry?.normalizedInputs);
  const topics = toStringArray(githubMetrics?.topics);
  const languages = toStringArray(githubMetrics?.languages);
  const warnings = Array.isArray(dependency.scoreEntry?.warnings)
    ? dependency.scoreEntry.warnings
    : [];
  const issueData = Array.isArray(dependency.scoreEntry?.issueData)
    ? (dependency.scoreEntry.issueData as unknown[])
    : [];
  const issueSummaries = issueData.map(getIssueSummary).filter((s): s is IssueSummary => s !== null);
  const issueChartData = buildIssueActivityChartData(issueSummaries);
  const closerBreakdownData = buildCloserBreakdownData(issueSummaries);
  const activityBucketData = buildActivityBucketData(issueSummaries);
  const closeReasonData = buildCloseReasonData(issueSummaries);
  const postCloseActivityData = buildPostCloseActivityData(issueSummaries);
  const filteredIssueSummaries = issueSummaries.filter((summary) => {
    const weekMatch =
      !selectedWeek ||
      getWeekStart(summary.publishedAt) === selectedWeek ||
      getWeekStart(summary.closedAt) === selectedWeek;

    const category = summary.closed ? (summary.closedByBot ? "Bot" : summary.closerType ?? "Unknown") : null;
    const categoryMatch = !selectedCloserCategory || category === selectedCloserCategory;

    const bucketMatch =
      !selectedActivityBucket || getActivityBucket(summary.timelineTotalCount) === selectedActivityBucket;

    const reason = summary.closed ? summary.stateReason ?? "Unknown" : null;
    const reasonMatch = !selectedCloseReason || reason === selectedCloseReason;
    const postCloseMatch =
      !selectedPostCloseActivity ||
      (selectedPostCloseActivity === "Had post-close activity" ? summary.hasPostCloseActivity : summary.closed && !summary.hasPostCloseActivity);

    return weekMatch && categoryMatch && bucketMatch && reasonMatch && postCloseMatch;
  });

  const timeToCloseStats = computeTimeToCloseStats(filteredIssueSummaries);
  const triageSpeedStats = computeTriageSpeedStats(filteredIssueSummaries);
  const visibleRelationships = dependency.relationships.filter(
    (relationship) => relationship.relationshipType !== "UNKNOWN"
  );
  const unknownRelationshipCount = dependency.relationships.length - visibleRelationships.length;
  const relationshipAnalysisPending = dependency.analysisStatus !== "COMPLETED";
  const relationshipChecksAvailable = dependency.relationships.length > 0;
  const relationshipStatus = relationshipAnalysisStatus(
    dependency.analysisStatus,
    dependency.name,
    dependency.relationships.length
  );
  const showRelationshipCounts = !relationshipAnalysisPending && relationshipChecksAvailable;
  const relationshipCounts = visibleRelationships.reduce(
    (counts, relationship) => {
      if (relationship.relationshipType === "KNOWN_INCOMPATIBILITY") counts.known += 1;
      if (relationship.relationshipType === "POSSIBLE_CONFLICT") counts.possible += 1;
      if (relationship.relationshipType === "INTEGRATION_MENTION") counts.mentions += 1;
      return counts;
    },
    { known: 0, possible: 0, mentions: 0 }
  );
  const scoreBreakdown = [
    {
      label: "Package health",
      score: dependency.scoreEntry?.popularityScore ?? null,
      weight: 0.5,
      description: "NPM signals: downloads, release age, package age, versions, dependency count, license, repository, README.",
      inputs: [
        { label: "Weekly downloads", key: "weeklyDownloads", raw: formatMetric(typeof npmMetrics?.weeklyDownloads === "number" ? npmMetrics.weeklyDownloads : null) },
        { label: "Latest publish age", key: "latestPublishAge", raw: `${formatMetric(typeof npmMetrics?.latestPublishAgeDays === "number" ? npmMetrics.latestPublishAgeDays : null)} days` },
        { label: "Package age", key: "packageAge", raw: `${formatMetric(typeof npmMetrics?.packageAgeDays === "number" ? npmMetrics.packageAgeDays : null)} days` },
        { label: "Version count", key: "versionCount", raw: formatMetric(typeof npmMetrics?.versionCount === "number" ? npmMetrics.versionCount : null) },
        { label: "Dependency count", key: "dependencyCount", raw: formatMetric(typeof npmMetrics?.dependencyCount === "number" ? npmMetrics.dependencyCount : null) },
        { label: "NPM license", key: "npmLicense", raw: formatBoolean(npmMetrics?.hasLicense) },
        { label: "Repository metadata", key: "npmRepository", raw: formatBoolean(npmMetrics?.hasRepository) },
        { label: "README", key: "npmReadme", raw: formatBoolean(npmMetrics?.hasReadme) },
      ],
    },
    {
      label: "Repository health",
      score: dependency.scoreEntry?.maintenanceScore ?? null,
      weight: 0.3,
      description: "GitHub signals: stars, forks, watchers, contributors, project age, pull requests, and repository license.",
      inputs: [
        { label: "Stars", key: "stars", raw: formatMetric(typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null) },
        { label: "Forks", key: "forks", raw: formatMetric(typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null) },
        { label: "Watchers", key: "watchers", raw: formatMetric(typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null) },
        { label: "Contributors", key: "contributors", raw: formatMetric(typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null) },
        { label: "Project age", key: "projectAge", raw: `${formatMetric(typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null)} days` },
        { label: "Pull requests", key: "pullRequests", raw: formatMetric(typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null) },
        { label: "GitHub license", key: "githubLicense", raw: getStringValue(githubMetrics?.license) ?? "-" },
      ],
    },
    {
      label: "Issue resolution",
      score: dependency.scoreEntry?.resolutionQualityScore ?? null,
      weight: 0.2,
      description: "Balanced issue-mining signals: median resolution, maintainer response, closure health, stale backlog, and sample coverage.",
      inputs: [
        { label: "Resolution time", key: "resolutionTime", raw: `${formatMetric(typeof issueMetrics?.medianResolutionTimeDays === "number" ? issueMetrics.medianResolutionTimeDays : typeof issueMetrics?.averageResolutionTimeDays === "number" ? issueMetrics.averageResolutionTimeDays : null)} days median` },
        { label: "Maintainer response time", key: "firstResponseTime", raw: `${formatMetric(typeof issueMetrics?.medianFirstResponseTimeDays === "number" ? issueMetrics.medianFirstResponseTimeDays : typeof issueMetrics?.averageFirstResponseTimeDays === "number" ? issueMetrics.averageFirstResponseTimeDays : null)} days median` },
        { label: "Closure rate", key: "closureRate", raw: formatPercentValue(issueMetrics?.closureRate) },
        { label: "Healthy closure rate", key: "healthyClosureRate", raw: formatPercentValue(issueMetrics?.healthyClosureRate) },
        { label: "Stale open issue rate", key: "staleOpenIssueRate", raw: formatPercentValue(issueMetrics?.staleOpenIssueRate) },
        { label: "Post-close activity", key: "postCloseActivityRate", raw: formatPercentValue(issueMetrics?.postCloseActivityRate) },
        { label: "Sample coverage", key: "sampleSize", raw: formatMetric(typeof issueMetrics?.totalIssuesAnalyzed === "number" ? issueMetrics.totalIssuesAnalyzed : null) },
        { label: "Code-linked closure rate", key: "codeResolutionRate", raw: formatPercentValue(issueMetrics?.codeResolutionRate) },
        { label: "Closed by PR rate", key: "closedByPrRate", raw: formatPercentValue(issueMetrics?.closedByPrRate ?? issueMetrics?.closedByPRRate) },
      ],
    },
  ];
  const relationshipSignalCount =
    relationshipCounts.known + relationshipCounts.possible + relationshipCounts.mentions;

  return (
    <section className="dependency-detail-page">
      <header className="detail-header">
        <div className="header-content">
          <h1>{dependency.name}</h1>
          <span className={`type-badge type-${dependency.type.toLowerCase()}`}>
            {dependency.type === "DEPENDENCY" ? "Dependency" : "Dev Dependency"}
          </span>
        </div>
        <button 
          className="button button-back"
          onClick={() => navigate(`/results/${resultToken}`)}
        >
          ← Back
        </button>
      </header>

      <article className="info-section">
        <h2>General Information</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Required Version</span>
            <span className="info-value">{dependency.versionRequirement}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Type</span>
            <span className="info-value">
              {dependency.type === "DEPENDENCY" ? "Dependency" : "Dev Dependency"}
            </span>
          </div>
        </div>
      </article>

      <article className="metrics-section">
        <h2>Score and Risk Level</h2>
        <div className="metrics-grid">
          <div className="metric-card score-card">
            <h3>Dependency Score</h3>
            <div className="score-display">
              <span className="score-value">{dependency.score}</span>
              <span className="score-max">/100</span>
            </div>
            <div className="score-bar">
              <div 
                className={`score-fill ${
                  dependency.score >= 80 ? 'score-low' :
                  dependency.score >= 60 ? 'score-medium' :
                  'score-high'
                }`}
                style={{ width: `${dependency.score}%` }}
              ></div>
            </div>
          </div>

          <div className="metric-card risk-card">
            <div className="metric-card-header">
              <h3>Risk Level</h3>
              <button
                type="button"
                className="risk-info-button"
                onClick={() => setRiskInfoOpen(true)}
                aria-label="Open risk level explanation"
                title="How the risk level is determined"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
              </button>
            </div>
            <p className={`risk-level ${riskClassName(dependency.riskLevel)}`}>
              {riskLabel(dependency.riskLevel)}
            </p>
            <div className="risk-description">
              {dependency.riskLevel === "LOW" && (
                <p>This dependency presents a low risk for your project.</p>
              )}
              {dependency.riskLevel === "MEDIUM" && (
                <p>This dependency presents a medium risk. Check for available updates.</p>
              )}
              {dependency.riskLevel === "HIGH" && (
                <p>This dependency presents a high risk. Consider updating or replacing it.</p>
              )}
            </div>
          </div>
        </div>
      </article>

      {riskInfoOpen && (
        <div className="risk-modal-overlay" role="presentation" onClick={() => setRiskInfoOpen(false)}>
          <div
            className="risk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="risk-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="risk-modal-header">
              <div>
                <p className="risk-modal-kicker">Risk Level Guide</p>
                <h3 id="risk-modal-title">How the risk level is determined</h3>
              </div>
              <button
                type="button"
                className="risk-modal-close"
                onClick={() => setRiskInfoOpen(false)}
                aria-label="Close risk level explanation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="risk-modal-body">
              <p>
                The risk level is based on the computed dependency score. Higher scores mean lower risk,
                and lower scores mean higher risk.
              </p>

              <div className="risk-modal-grid">
                <article className="risk-modal-card">
                  <h4>Low Risk</h4>
                  <p>Score: 80 to 100</p>
                  <p>Usually indicates a healthy package with good GitHub and NPM signals.</p>
                  <p>Solution: keep it updated, monitor releases, and continue normal usage.</p>
                </article>

                <article className="risk-modal-card">
                  <h4>Medium Risk</h4>
                  <p>Score: 60 to 79</p>
                  <p>Signals are mixed, so the dependency deserves review before relying on it heavily.</p>
                  <p>Solution: check for newer versions, review the repository health, and test upgrades.</p>
                </article>

                <article className="risk-modal-card">
                  <h4>High Risk</h4>
                  <p>Score: below 60</p>
                  <p>The package looks weak or under-maintained and may be unsafe for long-term use.</p>
                  <p>Solution: replace it if possible, pin versions carefully, or isolate its usage.</p>
                </article>
              </div>

              <div className="risk-modal-notes">
                <h4>What influences the score</h4>
                <ul>
                  <li>NPM metadata such as README, license, repository presence, downloads, and release age.</li>
                  <li>GitHub repository signals such as stars, forks, watchers, contributors, and age.</li>
                  <li>Issue metrics such as open issues, closed issues, and warning flags.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="detail-tabs" role="tablist" aria-label="Dependency detail views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "signals"}
          className={`detail-tab ${activeTab === "signals" ? "is-active" : ""}`}
          onClick={() => setActiveTab("signals")}
        >
          Signals
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "score"}
          className={`detail-tab ${activeTab === "score" ? "is-active" : ""}`}
          onClick={() => setActiveTab("score")}
        >
          Score Breakdown
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "relationships"}
          className={`detail-tab ${activeTab === "relationships" ? "is-active" : ""}`}
          onClick={() => setActiveTab("relationships")}
        >
          Relationships
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "issues"}
          className={`detail-tab ${activeTab === "issues" ? "is-active" : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          Issues
        </button>
      </div>

      {activeTab === "relationships" && (
      <article className="github-section">
        <div className="relationship-section-heading">
          <div>
            <h2>Dependency Relationships</h2>
            <p>{relationshipStatus.message}</p>
          </div>
          <span className={`relationship-status-badge ${relationshipStatus.className}`}>
            {relationshipStatus.label}
          </span>
        </div>
        <div className="relationship-summary-grid">
          <div className="relationship-summary-card relationship-summary-critical">
            <span>Known incompatibilities</span>
            <strong>{showRelationshipCounts ? relationshipCounts.known : "-"}</strong>
          </div>
          <div className="relationship-summary-card relationship-summary-warning">
            <span>Possible conflicts</span>
            <strong>{showRelationshipCounts ? relationshipCounts.possible : "-"}</strong>
          </div>
          <div className="relationship-summary-card relationship-summary-info">
            <span>Integration mentions</span>
            <strong>{showRelationshipCounts ? relationshipCounts.mentions : "-"}</strong>
          </div>
          <div className="relationship-summary-card">
            <span>No evidence found</span>
            <strong>{showRelationshipCounts ? unknownRelationshipCount : "-"}</strong>
          </div>
        </div>
        {relationshipAnalysisPending && (
          <p className="relationship-status-note">
            Relationship results for this dependency are not ready yet.
          </p>
        )}
        {!relationshipAnalysisPending && !relationshipChecksAvailable && (
          <p className="relationship-status-note">
            No dependency-specific relationship checks were saved. This usually means this dependency had no repository data available for relationship scanning.
          </p>
        )}
        {showRelationshipCounts && unknownRelationshipCount > 0 && (
          <p className="relationship-muted-note">
            {unknownRelationshipCount} checked dependencies had no issue evidence for this package.
          </p>
        )}
        {visibleRelationships.length > 0 ? (
          <div className="relationship-list">
            {visibleRelationships.map((relationship) => {
              const issues = getRelationshipIssues(relationship.evidence);

              return (
                <div className="relationship-item" key={relationship.id}>
                  <div className="relationship-header">
                    <div>
                      <p className="relationship-target">{relationship.targetDependency.name}</p>
                      <p className="relationship-summary">{relationship.summary}</p>
                    </div>
                    <span className={`relationship-badge ${relationshipClassName(relationship.relationshipType)}`}>
                      {relationshipLabel(relationship.relationshipType)}
                    </span>
                  </div>

                  {issues.length > 0 ? (
                    <ul className="relationship-evidence">
                      {issues.slice(0, 3).map((issue) => (
                        <li key={issue.url}>
                          <a href={issue.url} target="_blank" rel="noreferrer">
                            #{issue.issueNumber} {issue.title}
                          </a>
                          {issue.matchedTerms.length > 0 && (
                            <span> Terms: {issue.matchedTerms.join(", ")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="github-metric-value">No issue evidence links found.</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="github-metric-value">
            {relationshipAnalysisPending
              ? "Relationship results are not ready for this dependency yet."
              : relationshipChecksAvailable
                ? "No relationship risks or integration mentions were found for this dependency."
                : "No relationship checks are available for this dependency."}
          </div>
        )}
      </article>
      )}

      {activeTab === "signals" && (
      <article className="github-section">
        <div className="section-heading">
          <div>
            <h2>Dependency Signals</h2>
            <p>Repository, package, and issue signals used to understand this dependency.</p>
          </div>
        </div>

        <div className="signal-stat-grid">
          <div className="signal-stat-card">
            <span>Weekly downloads</span>
            <strong>{formatMetric(typeof npmMetrics?.weeklyDownloads === "number" ? npmMetrics.weeklyDownloads : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>Stars</span>
            <strong>{formatMetric(typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>Repository issues</span>
            <strong>{formatMetric(typeof githubMetrics?.issues === "number" ? githubMetrics.issues : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>Latest publish age</span>
            <strong>{formatMetric(typeof npmMetrics?.latestPublishAgeDays === "number" ? npmMetrics.latestPublishAgeDays : null)} days</strong>
          </div>
        </div>

        <div className="signals-layout">
          <div className="signal-panel signal-panel-wide">
            <div className="signal-panel-header">
              <p>Repository</p>
              {getRepositoryUrl(dependency.scoreEntry) && (
                <a href={getRepositoryUrl(dependency.scoreEntry) ?? "#"} target="_blank" rel="noreferrer">
                  Open repo
                </a>
              )}
            </div>
            <div className="repository-identity">
              <strong>{getStringValue(repository?.fullName) ?? getStringValue(repository?.name) ?? "-"}</strong>
              <span>{getStringValue(githubMetrics?.primaryLanguage) ?? "Unknown language"}</span>
            </div>
            <p className="signal-description">{getStringValue(repository?.description) ?? "No repository description available."}</p>
            <dl className="signal-definition-grid">
              <div>
                <dt>Owner</dt>
                <dd>{getStringValue(repository?.owner) ?? "-"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(repository?.createdAt)}</dd>
              </div>
              <div>
                <dt>Project age</dt>
                <dd>{formatMetric(typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null)} days</dd>
              </div>
            </dl>
            <div className="signal-mini-metrics">
              <div><span>Watchers</span><strong>{formatMetric(typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null)}</strong></div>
              <div><span>Forks</span><strong>{formatMetric(typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null)}</strong></div>
              <div><span>Pull requests</span><strong>{formatMetric(typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null)}</strong></div>
              <div><span>Contributors</span><strong>{formatMetric(typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null)}</strong></div>
            </div>
          </div>

          <div className="signal-panel signal-panel-side">
            <div className="signal-panel-header">
              <p>Package health</p>
            </div>
            <dl className="signal-list">
              <div><dt>README</dt><dd>{formatBoolean(npmMetrics?.hasReadme)}</dd></div>
              <div><dt>License</dt><dd>{getStringValue(githubMetrics?.license) ?? formatBoolean(npmMetrics?.hasLicense)}</dd></div>
              <div><dt>Repository field</dt><dd>{formatBoolean(npmMetrics?.hasRepository)}</dd></div>
              <div><dt>Versions</dt><dd>{formatMetric(typeof npmMetrics?.versionCount === "number" ? npmMetrics.versionCount : null)}</dd></div>
              <div><dt>Package age</dt><dd>{formatMetric(typeof npmMetrics?.packageAgeDays === "number" ? npmMetrics.packageAgeDays : null)} days</dd></div>
              <div><dt>Dependencies</dt><dd>{formatMetric(typeof npmMetrics?.dependencyCount === "number" ? npmMetrics.dependencyCount : null)}</dd></div>
              <div><dt>Dev dependencies</dt><dd>{formatMetric(typeof npmMetrics?.devDependencyCount === "number" ? npmMetrics.devDependencyCount : null)}</dd></div>
            </dl>
          </div>

          <div className="signal-panel signal-panel-tags">
            <div className="signal-panel-header">
              <p>Ecosystem tags</p>
            </div>
            <div className="signal-chip-group-label">Topics</div>
            <div className="signal-chip-list">
              {topics.length > 0 ? topics.map((topic) => (
                <span className="signal-chip" key={topic}>{topic}</span>
              )) : <span className="signal-empty">No topics found</span>}
            </div>
            <div className="signal-chip-group-label">Languages</div>
            <div className="signal-chip-list">
              {languages.length > 0 ? languages.map((language) => (
                <span className="signal-chip" key={language}>{language}</span>
              )) : <span className="signal-empty">No languages found</span>}
            </div>
          </div>

          <div className="signal-panel signal-panel-issue">
            <div className="signal-panel-header">
              <p>Sampled issue window</p>
            </div>
            <p className="signal-description">
              These numbers come from the issue-mining sample, not the repository lifetime totals.
              The miner uses a balanced sample of recent open, recent closed, older closed, and old open issues.
            </p>
            <dl className="signal-list">
              <div><dt>Sampled open issues</dt><dd>{formatMetric(typeof issueMetrics?.openIssues === "number" ? issueMetrics.openIssues : null)}</dd></div>
              <div><dt>Sampled closed issues</dt><dd>{formatMetric(typeof issueMetrics?.closedIssues === "number" ? issueMetrics.closedIssues : null)}</dd></div>
              <div><dt>Recent open sample</dt><dd>{formatMetric(typeof issueMetrics?.sampleRecentOpenIssues === "number" ? issueMetrics.sampleRecentOpenIssues : null)}</dd></div>
              <div><dt>Recent closed sample</dt><dd>{formatMetric(typeof issueMetrics?.sampleRecentClosedIssues === "number" ? issueMetrics.sampleRecentClosedIssues : null)}</dd></div>
              <div><dt>Older closed sample</dt><dd>{formatMetric(typeof issueMetrics?.sampleOlderClosedIssues === "number" ? issueMetrics.sampleOlderClosedIssues : null)}</dd></div>
              <div><dt>Old open sample</dt><dd>{formatMetric(typeof issueMetrics?.sampleOldOpenIssues === "number" ? issueMetrics.sampleOldOpenIssues : null)}</dd></div>
              <div><dt>Warnings</dt><dd>{warnings.length}</dd></div>
            </dl>
            {warnings.length > 0 ? (
              <ul className="signal-warning-list">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="signal-empty">No warnings reported</p>
            )}
          </div>
        </div>
      </article>
      )}

      {activeTab === "score" && (
      <article className="github-section">
        <div className="section-heading">
          <div>
            <h2>Score Breakdown</h2>
            <p>How this dependency score is built from package, repository, and sampled issue signals.</p>
          </div>
        </div>

        <div className="score-breakdown-hero">
          <div>
            <span>Overall dependency score</span>
            <strong>{dependency.score}/100</strong>
          </div>
          <div>
            <span>Risk level</span>
            <strong className={riskClassName(dependency.riskLevel)}>{riskLabel(dependency.riskLevel)}</strong>
          </div>
        </div>

        <div className="score-breakdown-list">
          {scoreBreakdown.map((item) => {
            const contribution = weightedContribution(item.score, item.weight);
            const barWidth = typeof item.score === "number" ? item.score : 0;

            return (
              <article className="score-breakdown-item" key={item.label}>
                <div className="score-breakdown-header">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.description}</p>
                  </div>
                  <div className="score-breakdown-value">
                    <strong>{formatScoreValue(item.score)}</strong>
                    <span>{Math.round(item.weight * 100)}% weight</span>
                  </div>
                </div>
                <div className="score-breakdown-bar" aria-hidden="true">
                  <div style={{ width: `${barWidth}%` }}></div>
                </div>
                <div className="score-breakdown-footer">
                  <span>Contribution: {contribution ?? "-"} points</span>
                </div>
                <details className="score-input-details">
                  <summary>Show scoring inputs</summary>
                  <div className="score-input-grid">
                    {item.inputs.map((input) => {
                      const normalizedValue = getNumberValue(normalizedInputs, input.key);

                      return (
                        <div className="score-input-row" key={input.key}>
                          <div>
                            <strong>{input.label}</strong>
                            <span>{input.raw}</span>
                          </div>
                          <span className={`score-input-signal ${scoreSignalClassName(normalizedValue)}`}>
                            {scoreSignalLabel(normalizedValue)}
                          </span>
                          <span className="score-input-score">
                            {typeof normalizedValue === "number" ? `${normalizedValue}/100` : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </article>
            );
          })}
        </div>

        <article className="score-relationship-note">
          <div>
            <h3>Relationship signals</h3>
            <p>
              Relationship analysis is shown separately. It is not currently included in the computed dependency score.
            </p>
          </div>
          <div className="score-relationship-counts">
            <span>{relationshipCounts.known} known</span>
            <span>{relationshipCounts.possible} possible</span>
            <span>{relationshipCounts.mentions} mentions</span>
            <span>{relationshipSignalCount} total</span>
          </div>
        </article>
      </article>
      )}

      {activeTab === "issues" && (
      <article className="github-section">
        <h2>
          Issue Activity <a href="#issue-activity-note" className="footnote-link">*</a>
          {selectedWeek && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedWeek(null)}>
                  Clear week filter ({selectedWeek})
                </button>
              )}
              {selectedCloserCategory && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedCloserCategory(null)}>
                  Clear closer filter ({selectedCloserCategory})
                </button>
              )}
              {selectedActivityBucket && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedActivityBucket(null)}>
                  Clear activity filter ({selectedActivityBucket})
                </button>
              )}
              {selectedCloseReason && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedCloseReason(null)}>
                  Clear reason filter ({selectedCloseReason})
                </button>
              )}
              {selectedPostCloseActivity && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedPostCloseActivity(null)}>
                  Clear activity filter ({selectedPostCloseActivity})
                </button>
              )}
        </h2>
        <div className="github-metrics">


          <div className="metric-placeholder metric-placeholder-wide">
            <div className="chart-grid">
              <div className="metric-placeholder">
                <p>Closed By</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={closerBreakdownData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                        onClick={(data) => setSelectedCloserCategory(data.name as string)}
                      >
                        {closerBreakdownData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>Timeline Activity Level</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityBucketData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#2563eb"
                        onClick={(data: any) => setSelectedActivityBucket(data.bucket as string)}
                        cursor="pointer"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>Close Reasons</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={closeReasonData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                        onClick={(data: any) => setSelectedCloseReason(data.name as string)}
                        cursor="pointer"
                      >
                        {closeReasonData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>Post-Close Activity</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={postCloseActivityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                        onClick={(data: any) => setSelectedPostCloseActivity(data.name as string)}
                        cursor="pointer"
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>Time to Close</p>
                <div className="stat-card-body">
                  <div className="stat-value-group">
                    <div className="stat-value-label">Median</div>
                    <div className="stat-value-number">
                      {timeToCloseStats.median !== null ? `${timeToCloseStats.median} days` : "-"}
                    </div>
                  </div>
                  <div className="stat-value-group">
                    <div className="stat-value-label">Average</div>
                    <div className="stat-value-number">
                      {timeToCloseStats.average !== null ? `${timeToCloseStats.average} days` : "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>Triage Speed</p>
                <div className="stat-card-body">
                  <div className="stat-value-group">
                    <div className="stat-value-label">Median</div>
                    <div className="stat-value-number">
                      {triageSpeedStats.median !== null ? `${triageSpeedStats.median} days` : "-"}
                    </div>
                  </div>
                  <div className="stat-value-group">
                    <div className="stat-value-label">Average</div>
                    <div className="stat-value-number">
                      {triageSpeedStats.average !== null ? `${triageSpeedStats.average} days` : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="metric-placeholder metric-placeholder-wide">
            <p>Issues Opened vs Closed (by week)</p>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={issueChartData}
                  onClick={(state) => {
                    if (state && state.activeLabel) {
                      setSelectedWeek(state.activeLabel as string);
                    }
                  }}
                >
                  
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="opened" name="Opened" stroke="#2563eb" />
                  <Line type="monotone" dataKey="closed" name="Closed" stroke="#ef4444" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="metric-placeholder metric-placeholder-wide">
            <p>Issue Details</p>
            <div className="issues-table-wrapper">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Published</th>
                    <th>Closed At</th>
                    <th>Close Reason</th>
                    <th>Closer Type</th>
                    <th>Closed By Bot</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredIssueSummaries]
                    .sort((a, b) => {
                      const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                      const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                      return bDate - aDate;
                    })
                    .map((summary, index) => (
                      <tr key={summary.number ?? index}>
                        <td>
                          {summary.number && getRepositoryUrl(dependency.scoreEntry) ? (
                            <a
                              href={`${getRepositoryUrl(dependency.scoreEntry)}/issues/${summary.number}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {summary.number}
                            </a>
                          ) : (
                            summary.number ?? "-"
                          )}
                        </td>
                        <td>{formatDate(summary.publishedAt)}</td>
                        <td>{formatDate(summary.closedAt)}</td>
                        <td>{summary.stateReason ?? "-"}</td>
                        <td>{summary.closerType ?? "-"}</td>
                        <td>{formatBoolean(summary.closedByBot)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="metric-placeholder metric-placeholder-wide" id="issue-activity-note">
            <p>* Issue activity analysis uses a balanced sample of recent open, recent closed, older closed, and old open issues.</p>
          </div>

        </div>
      </article>
      )}

    </section>
  );
}
