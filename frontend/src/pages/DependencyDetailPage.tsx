import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import { exportDependencyReport } from "../reporting/dependencyReport";
import "./DependencyDetailPage.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { useTranslation } from "../i18n/LanguageContext";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DetailTab = "signals" | "score" | "relationships" | "issues";
type IssueChartView = "activity" | "insights";
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
  dependencyRelationshipCount: number,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (analysisStatus === "FAILED") {
    return {
      label: t("status.failed"),
      className: "relationship-status-failed",
      message: t("detail.relationshipFailedMessage"),
    };
  }

  if (analysisStatus !== "COMPLETED") {
    return {
      label: t("detail.relationshipRunning"),
      className: "relationship-status-running",
      message: t("detail.relationshipRunningMessage"),
    };
  }

  if (dependencyRelationshipCount === 0) {
    return {
      label: t("detail.relationshipNotAvailable"),
      className: "relationship-status-waiting",
      message: t("detail.relationshipNotChecked", { dependencyName }),
    };
  }

  return {
    label: t("status.completed"),
    className: "relationship-status-completed",
    message: t("detail.relationshipCompletedMessage", {
      dependencyName,
      count: dependencyRelationshipCount,
      label: t("common.dependencies").toLowerCase(),
    }),
  };
}

function riskClassName(risk: RiskLevel): string {
  if (risk === "LOW") return "risk-low";
  if (risk === "MEDIUM") return "risk-medium";
  return "risk-high";
}

function riskLabel(risk: RiskLevel, t: ReturnType<typeof useTranslation>["t"]): string {
  if (risk === "LOW") return t("risk.low");
  if (risk === "MEDIUM") return t("risk.medium");
  return t("risk.high");
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

function formatBoolean(value: unknown, t: ReturnType<typeof useTranslation>["t"]) {
  if (value === true) return t("common.yes");
  if (value === false) return t("common.no");
  return "-";
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatScoreValue(value: number | null | undefined, t: ReturnType<typeof useTranslation>["t"]) {
  return typeof value === "number" ? `${value}/100` : t("common.notAvailable");
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

function scoreSignalLabel(value: number | null | undefined, t: ReturnType<typeof useTranslation>["t"]) {
  if (typeof value !== "number") return t("common.notAvailable");
  if (value >= 80) return t("detail.strong");
  if (value >= 60) return t("detail.good");
  if (value >= 40) return t("detail.weak");
  return t("detail.poor");
}

function scoreSignalClassName(value: number | null | undefined) {
  if (typeof value !== "number") return "score-input-missing";
  if (value >= 80) return "score-input-strong";
  if (value >= 60) return "score-input-good";
  if (value >= 40) return "score-input-weak";
  return "score-input-poor";
}

function relationshipLabel(type: RelationshipEntry["relationshipType"], t: ReturnType<typeof useTranslation>["t"]) {
  if (type === "KNOWN_INCOMPATIBILITY") return t("detail.knownIncompatibility");
  if (type === "POSSIBLE_CONFLICT") return t("detail.possibleConflict");
  if (type === "INTEGRATION_MENTION") return t("detail.integrationMention");
  return t("common.unknown");
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
    firstMaintainerResponseAt: getStringValue(record.firstMaintainerResponseAt),
    sampleBucket: getStringValue(record.sampleBucket),
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
    .filter((s) => s.publishedAt && (s.firstMaintainerResponseAt || s.firstAssignedAt))
    .map((s) => {
      const opened = new Date(s.publishedAt as string).getTime();
      const response = new Date((s.firstMaintainerResponseAt ?? s.firstAssignedAt) as string).getTime();
      return (response - opened) / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0);

  if (days.length === 0) return { median: null, average: null };

  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const average = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;

  return { median: Math.round(median * 10) / 10, average: Math.round(average * 10) / 10 };
}

function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / (1000 * 60 * 60 * 24);
}

function bucketCounts<T extends string>(labels: T[]) {
  return new Map<T, number>(labels.map((label) => [label, 0]));
}

function buildDurationDistributionData(
  summaries: IssueSummary[],
  getDays: (summary: IssueSummary) => number | null
) {
  const labels = ["0-7", "7-30", "30-90", "90+"] as const;
  const counts = bucketCounts([...labels]);

  summaries.forEach((summary) => {
    const days = getDays(summary);
    if (days === null) return;
    if (days < 7) counts.set("0-7", (counts.get("0-7") ?? 0) + 1);
    else if (days < 30) counts.set("7-30", (counts.get("7-30") ?? 0) + 1);
    else if (days < 90) counts.set("30-90", (counts.get("30-90") ?? 0) + 1);
    else counts.set("90+", (counts.get("90+") ?? 0) + 1);
  });

  return labels.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

function isHealthyClosure(summary: IssueSummary) {
  if (!summary.closed) return false;
  if (summary.closerType === "PullRequest" || summary.closerType === "Commit") return true;
  return ["COMPLETED", "DUPLICATE", "NOT_PLANNED"].includes(summary.stateReason ?? "");
}

function buildResolutionFunnelData(summaries: IssueSummary[]) {
  const closed = summaries.filter((summary) => summary.closed);
  const healthy = closed.filter(isHealthyClosure);
  const codeLinked = closed.filter(
    (summary) => summary.closerType === "PullRequest" || summary.closerType === "Commit"
  );

  return [
    { stage: "Sampled", count: summaries.length },
    { stage: "Closed", count: closed.length },
    { stage: "Healthy", count: healthy.length },
    { stage: "Code-linked", count: codeLinked.length },
  ];
}

function buildBacklogHealthData(summaries: IssueSummary[]) {
  const labels = ["Recent open", "Aging open", "Stale open"] as const;
  const counts = bucketCounts([...labels]);
  const now = Date.now();

  summaries
    .filter((summary) => !summary.closed && summary.publishedAt)
    .forEach((summary) => {
      const openedAt = new Date(summary.publishedAt as string).getTime();
      if (Number.isNaN(openedAt)) return;
      const ageDays = (now - openedAt) / (1000 * 60 * 60 * 24);
      if (ageDays < 30) counts.set("Recent open", (counts.get("Recent open") ?? 0) + 1);
      else if (ageDays < 180) counts.set("Aging open", (counts.get("Aging open") ?? 0) + 1);
      else counts.set("Stale open", (counts.get("Stale open") ?? 0) + 1);
    });

  return labels.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}

export default function DependencyDetailPage() {
  const { language, t } = useTranslation();
  const { resultToken, dependencyName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dependency, setDependency] = useState<DependencyDetail | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisLookupResponse["analysis"] | null>(null);
  const [riskInfoOpen, setRiskInfoOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedCloserCategory, setSelectedCloserCategory] = useState<string | null>(null);
  const [selectedActivityBucket, setSelectedActivityBucket] = useState<string | null>(null);
  const [selectedCloseReason, setSelectedCloseReason] = useState<string | null>(null);
  const [selectedPostCloseActivity, setSelectedPostCloseActivity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("signals");
  const [issueChartView, setIssueChartView] = useState<IssueChartView>("activity");
  const [isCompactCharts, setIsCompactCharts] = useState(false);

  const load = async () => {
    if (!resultToken || !dependencyName) {
      setError(t("detail.missingParams"));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetchAnalysisByResultToken(resultToken);

      if (!response.success || !response.data?.analysis?.result) {
        setError(response.message || t("result.unableToLoad"));
        setLoading(false);
        return;
      }

      const decodedName = decodeURIComponent(dependencyName);
      setAnalysis(response.data.analysis);
      const analysisResult = response.data.analysis.result;
      const depScore = analysisResult.dependencyScores.find(
        (ds) => ds.dependency.name === decodedName
      );

      if (!depScore) {
        setError(t("detail.dependencyNotFound"));
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
      setError(err instanceof Error ? err.message : t("detail.unexpectedError"));
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [resultToken, dependencyName, t]);

  useEffect(() => {
    const updateChartMode = () => setIsCompactCharts(window.innerWidth <= 560);

    updateChartMode();
    window.addEventListener("resize", updateChartMode);
    return () => window.removeEventListener("resize", updateChartMode);
  }, []);

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
        <h1>{t("detail.title")}</h1>
        <p>{t("detail.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dependency-detail-page">
        <h1>{t("detail.title")}</h1>
        <p className="error-text">{error}</p>
        <div className="detail-actions">
          <button className="button" onClick={() => void load()}>
            {t("common.retry")}
          </button>
          <Link className="button button-secondary" to={`/results/${resultToken}`}>
            {t("common.backToResults")}
          </Link>
        </div>
      </section>
    );
  }

  if (!dependency) {
    return (
      <section className="dependency-detail-page">
        <h1>{t("detail.title")}</h1>
        <p>{t("detail.noDependency")}</p>
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
  const resolutionFunnelData = buildResolutionFunnelData(issueSummaries);
  const backlogHealthData = buildBacklogHealthData(issueSummaries);
  const resolutionDistributionData = buildDurationDistributionData(issueSummaries, (summary) =>
    summary.closed ? daysBetween(summary.publishedAt, summary.closedAt) : null
  );
  const responseDistributionData = buildDurationDistributionData(issueSummaries, (summary) =>
    daysBetween(summary.publishedAt, summary.firstMaintainerResponseAt ?? summary.firstAssignedAt)
  );
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
    dependency.relationships.length,
    t
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
      label: t("detail.packageHealth"),
      score: dependency.scoreEntry?.popularityScore ?? null,
      weight: 0.5,
      description: t("detail.packageHealthDescription"),
      inputs: [
        { label: t("detail.weeklyDownloads"), key: "weeklyDownloads", raw: formatMetric(typeof npmMetrics?.weeklyDownloads === "number" ? npmMetrics.weeklyDownloads : null) },
        { label: t("detail.latestPublishAge"), key: "latestPublishAge", raw: `${formatMetric(typeof npmMetrics?.latestPublishAgeDays === "number" ? npmMetrics.latestPublishAgeDays : null)} ${t("common.days")}` },
        { label: t("detail.packageAge"), key: "packageAge", raw: `${formatMetric(typeof npmMetrics?.packageAgeDays === "number" ? npmMetrics.packageAgeDays : null)} ${t("common.days")}` },
        { label: t("detail.versionCount"), key: "versionCount", raw: formatMetric(typeof npmMetrics?.versionCount === "number" ? npmMetrics.versionCount : null) },
        { label: t("detail.dependencyCount"), key: "dependencyCount", raw: formatMetric(typeof npmMetrics?.dependencyCount === "number" ? npmMetrics.dependencyCount : null) },
        { label: t("detail.npmLicense"), key: "npmLicense", raw: formatBoolean(npmMetrics?.hasLicense, t) },
        { label: t("detail.repositoryMetadata"), key: "npmRepository", raw: formatBoolean(npmMetrics?.hasRepository, t) },
        { label: "README", key: "npmReadme", raw: formatBoolean(npmMetrics?.hasReadme, t) },
      ],
    },
    {
      label: t("detail.repositoryHealth"),
      score: dependency.scoreEntry?.maintenanceScore ?? null,
      weight: 0.3,
      description: t("detail.repositoryHealthDescription"),
      inputs: [
        { label: t("result.stars"), key: "stars", raw: formatMetric(typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null) },
        { label: t("result.forks"), key: "forks", raw: formatMetric(typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null) },
        { label: t("detail.watchers"), key: "watchers", raw: formatMetric(typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null) },
        { label: t("detail.contributors"), key: "contributors", raw: formatMetric(typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null) },
        { label: t("detail.projectAge"), key: "projectAge", raw: `${formatMetric(typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null)} ${t("common.days")}` },
        { label: t("detail.pullRequests"), key: "pullRequests", raw: formatMetric(typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null) },
        { label: t("detail.githubLicense"), key: "githubLicense", raw: getStringValue(githubMetrics?.license) ?? "-" },
      ],
    },
    {
      label: t("detail.issueResolution"),
      score: dependency.scoreEntry?.resolutionQualityScore ?? null,
      weight: 0.2,
      description: t("detail.issueResolutionDescription"),
      inputs: [
        { label: t("detail.resolutionTime"), key: "resolutionTime", raw: `${formatMetric(typeof issueMetrics?.medianResolutionTimeDays === "number" ? issueMetrics.medianResolutionTimeDays : typeof issueMetrics?.averageResolutionTimeDays === "number" ? issueMetrics.averageResolutionTimeDays : null)} ${t("common.daysMedian")}` },
        { label: t("detail.maintainerResponseTime"), key: "firstResponseTime", raw: `${formatMetric(typeof issueMetrics?.medianFirstResponseTimeDays === "number" ? issueMetrics.medianFirstResponseTimeDays : typeof issueMetrics?.averageFirstResponseTimeDays === "number" ? issueMetrics.averageFirstResponseTimeDays : null)} ${t("common.daysMedian")}` },
        { label: t("detail.closureRate"), key: "closureRate", raw: formatPercentValue(issueMetrics?.closureRate) },
        { label: t("detail.healthyClosureRate"), key: "healthyClosureRate", raw: formatPercentValue(issueMetrics?.healthyClosureRate) },
        { label: t("detail.staleOpenIssueRate"), key: "staleOpenIssueRate", raw: formatPercentValue(issueMetrics?.staleOpenIssueRate) },
        { label: t("detail.postCloseActivity"), key: "postCloseActivityRate", raw: formatPercentValue(issueMetrics?.postCloseActivityRate) },
        { label: t("detail.sampleCoverage"), key: "sampleSize", raw: formatMetric(typeof issueMetrics?.totalIssuesAnalyzed === "number" ? issueMetrics.totalIssuesAnalyzed : null) },
        { label: t("detail.codeLinkedClosureRate"), key: "codeResolutionRate", raw: formatPercentValue(issueMetrics?.codeResolutionRate) },
        { label: t("detail.closedByPrRate"), key: "closedByPrRate", raw: formatPercentValue(issueMetrics?.closedByPrRate ?? issueMetrics?.closedByPRRate) },
      ],
    },
  ];
  const relationshipSignalCount =
    relationshipCounts.known + relationshipCounts.possible + relationshipCounts.mentions;
  const pieOuterRadius = isCompactCharts ? 54 : 80;
  const showPieLabels = !isCompactCharts;
  const verticalAxisWidth = isCompactCharts ? 72 : 92;
  const verticalChartMargin = isCompactCharts ? { left: 8, right: 8 } : { left: 28 };

  return (
    <section className="dependency-detail-page">
      <header className="detail-header">
        <div className="header-content">
          <h1>{dependency.name}</h1>
          <span className={`type-badge type-${dependency.type.toLowerCase()}`}>
            {dependency.type === "DEPENDENCY" ? t("dependency.type.dependency") : t("dependency.type.devDependency")}
          </span>
        </div>
        {analysis && (
          <button
            className="button"
            onClick={() => exportDependencyReport(analysis, dependency.name, language)}
          >
            {t("common.exportPdf")}
          </button>
        )}
        <button 
          className="button button-back"
          onClick={() => navigate(`/results/${resultToken}`)}
        >
          ← Back
        </button>
      </header>

      <article className="info-section">
        <h2>{t("detail.generalInformation")}</h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">{t("detail.requiredVersion")}</span>
            <span className="info-value">{dependency.versionRequirement}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t("result.type")}</span>
            <span className="info-value">
              {dependency.type === "DEPENDENCY" ? t("dependency.type.dependency") : t("dependency.type.devDependency")}
            </span>
          </div>
        </div>
      </article>

      <article className="metrics-section">
        <h2>{t("detail.scoreAndRisk")}</h2>
        <div className="metrics-grid">
          <div className="metric-card score-card">
            <h3>{t("detail.dependencyScore")}</h3>
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
              <h3>{t("result.riskLevel")}</h3>
              <button
                type="button"
                className="risk-info-button"
                onClick={() => setRiskInfoOpen(true)}
                aria-label={t("detail.openRiskExplanation")}
                title={t("detail.riskExplanationTitle")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
              </button>
            </div>
            <p className={`risk-level ${riskClassName(dependency.riskLevel)}`}>
              {riskLabel(dependency.riskLevel, t)}
            </p>
            <div className="risk-description">
              {dependency.riskLevel === "LOW" && (
                <p>{t("detail.lowRiskDescription")}</p>
              )}
              {dependency.riskLevel === "MEDIUM" && (
                <p>{t("detail.mediumRiskDescription")}</p>
              )}
              {dependency.riskLevel === "HIGH" && (
                <p>{t("detail.highRiskDescription")}</p>
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
                <p className="risk-modal-kicker">{t("detail.riskGuide")}</p>
                <h3 id="risk-modal-title">{t("detail.riskExplanationTitle")}</h3>
              </div>
              <button
                type="button"
                className="risk-modal-close"
                onClick={() => setRiskInfoOpen(false)}
                aria-label={t("detail.closeRiskExplanation")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="risk-modal-body">
              <p>
                {t("detail.riskModalIntro")}
              </p>

              <div className="risk-modal-grid">
                <article className="risk-modal-card">
                  <h4>{t("detail.lowRisk")}</h4>
                  <p>{t("detail.scoreRangeLow")}</p>
                  <p>{t("detail.lowRiskHelp")}</p>
                  <p>{t("detail.lowRiskSolution")}</p>
                </article>

                <article className="risk-modal-card">
                  <h4>{t("detail.mediumRisk")}</h4>
                  <p>{t("detail.scoreRangeMedium")}</p>
                  <p>{t("detail.mediumRiskHelp")}</p>
                  <p>{t("detail.mediumRiskSolution")}</p>
                </article>

                <article className="risk-modal-card">
                  <h4>{t("detail.highRisk")}</h4>
                  <p>{t("detail.scoreRangeHigh")}</p>
                  <p>{t("detail.highRiskHelp")}</p>
                  <p>{t("detail.highRiskSolution")}</p>
                </article>
              </div>

              <div className="risk-modal-notes">
                <h4>{t("detail.scoreInfluences")}</h4>
                <ul>
                  <li>{t("detail.influenceNpm")}</li>
                  <li>{t("detail.influenceGithub")}</li>
                  <li>{t("detail.influenceIssues")}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="detail-tabs" role="tablist" aria-label={t("detail.detailViews")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "signals"}
          className={`detail-tab ${activeTab === "signals" ? "is-active" : ""}`}
          onClick={() => setActiveTab("signals")}
        >
          {t("detail.signals")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "score"}
          className={`detail-tab ${activeTab === "score" ? "is-active" : ""}`}
          onClick={() => setActiveTab("score")}
        >
          {t("detail.scoreBreakdown")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "relationships"}
          className={`detail-tab ${activeTab === "relationships" ? "is-active" : ""}`}
          onClick={() => setActiveTab("relationships")}
        >
          {t("detail.relationships")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "issues"}
          className={`detail-tab ${activeTab === "issues" ? "is-active" : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          {t("detail.issues")}
        </button>
      </div>

      {activeTab === "relationships" && (
      <article className="github-section">
        <div className="relationship-section-heading">
          <div>
            <h2>{t("detail.dependencyRelationships")}</h2>
            <p>{relationshipStatus.message}</p>
          </div>
          <span className={`relationship-status-badge ${relationshipStatus.className}`}>
            {relationshipStatus.label}
          </span>
        </div>
        <div className="relationship-summary-grid">
          <div className="relationship-summary-card relationship-summary-critical">
            <span>{t("detail.knownIncompatibilities")}</span>
            <strong>{showRelationshipCounts ? relationshipCounts.known : "-"}</strong>
          </div>
          <div className="relationship-summary-card relationship-summary-warning">
            <span>{t("detail.possibleConflicts")}</span>
            <strong>{showRelationshipCounts ? relationshipCounts.possible : "-"}</strong>
          </div>
          <div className="relationship-summary-card relationship-summary-info">
            <span>{t("detail.integrationMentions")}</span>
            <strong>{showRelationshipCounts ? relationshipCounts.mentions : "-"}</strong>
          </div>
          <div className="relationship-summary-card">
            <span>{t("detail.noEvidenceFound")}</span>
            <strong>{showRelationshipCounts ? unknownRelationshipCount : "-"}</strong>
          </div>
        </div>
        {relationshipAnalysisPending && (
          <p className="relationship-status-note">
            {t("detail.relationshipNotReady")}
          </p>
        )}
        {!relationshipAnalysisPending && !relationshipChecksAvailable && (
          <p className="relationship-status-note">
            {t("detail.noRelationshipChecksSaved")}
          </p>
        )}
        {showRelationshipCounts && unknownRelationshipCount > 0 && (
          <p className="relationship-muted-note">
            {t("detail.noIssueEvidenceCount", { count: unknownRelationshipCount })}
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
                      {relationshipLabel(relationship.relationshipType, t)}
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
                            <span> {t("detail.terms", { terms: issue.matchedTerms.join(", ") })}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="github-metric-value">{t("detail.noIssueEvidenceLinks")}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="github-metric-value">
            {relationshipAnalysisPending
              ? t("detail.relationshipPendingEmpty")
              : relationshipChecksAvailable
                ? t("detail.noRelationshipRisks")
                : t("detail.noRelationshipChecks")}
          </div>
        )}
      </article>
      )}

      {activeTab === "signals" && (
      <article className="github-section">
        <div className="section-heading">
          <div>
            <h2>{t("detail.dependencySignals")}</h2>
            <p>{t("detail.dependencySignalsCopy")}</p>
          </div>
        </div>

        <div className="signal-stat-grid">
          <div className="signal-stat-card">
            <span>{t("detail.weeklyDownloads")}</span>
            <strong>{formatMetric(typeof npmMetrics?.weeklyDownloads === "number" ? npmMetrics.weeklyDownloads : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>{t("result.stars")}</span>
            <strong>{formatMetric(typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>{t("detail.repositoryIssues")}</span>
            <strong>{formatMetric(typeof githubMetrics?.issues === "number" ? githubMetrics.issues : null)}</strong>
          </div>
          <div className="signal-stat-card">
            <span>{t("detail.latestPublishAge")}</span>
            <strong>{formatMetric(typeof npmMetrics?.latestPublishAgeDays === "number" ? npmMetrics.latestPublishAgeDays : null)} {t("common.days")}</strong>
          </div>
        </div>

        <div className="signals-layout">
          <div className="signal-panel signal-panel-wide">
            <div className="signal-panel-header">
              <p>{t("detail.repository")}</p>
              {getRepositoryUrl(dependency.scoreEntry) && (
                <a href={getRepositoryUrl(dependency.scoreEntry) ?? "#"} target="_blank" rel="noreferrer">
                  {t("detail.openRepo")}
                </a>
              )}
            </div>
            <div className="repository-identity">
              <strong>{getStringValue(repository?.fullName) ?? getStringValue(repository?.name) ?? "-"}</strong>
              <span>{getStringValue(githubMetrics?.primaryLanguage) ?? t("detail.unknownLanguage")}</span>
            </div>
            <p className="signal-description">{getStringValue(repository?.description) ?? t("detail.noRepositoryDescription")}</p>
            <dl className="signal-definition-grid">
              <div>
                <dt>{t("detail.owner")}</dt>
                <dd>{getStringValue(repository?.owner) ?? "-"}</dd>
              </div>
              <div>
                <dt>{t("common.created")}</dt>
                <dd>{formatDate(repository?.createdAt)}</dd>
              </div>
              <div>
                <dt>{t("detail.projectAge")}</dt>
                <dd>{formatMetric(typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null)} {t("common.days")}</dd>
              </div>
            </dl>
            <div className="signal-mini-metrics">
              <div><span>{t("detail.watchers")}</span><strong>{formatMetric(typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null)}</strong></div>
              <div><span>{t("result.forks")}</span><strong>{formatMetric(typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null)}</strong></div>
              <div><span>{t("detail.pullRequests")}</span><strong>{formatMetric(typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null)}</strong></div>
              <div><span>{t("detail.contributors")}</span><strong>{formatMetric(typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null)}</strong></div>
            </div>
          </div>

          <div className="signal-panel signal-panel-side">
            <div className="signal-panel-header">
              <p>{t("detail.packageHealth")}</p>
            </div>
            <dl className="signal-list">
              <div><dt>README</dt><dd>{formatBoolean(npmMetrics?.hasReadme, t)}</dd></div>
              <div><dt>{t("detail.license")}</dt><dd>{getStringValue(githubMetrics?.license) ?? formatBoolean(npmMetrics?.hasLicense, t)}</dd></div>
              <div><dt>{t("detail.repositoryField")}</dt><dd>{formatBoolean(npmMetrics?.hasRepository, t)}</dd></div>
              <div><dt>{t("detail.versions")}</dt><dd>{formatMetric(typeof npmMetrics?.versionCount === "number" ? npmMetrics.versionCount : null)}</dd></div>
              <div><dt>{t("detail.packageAge")}</dt><dd>{formatMetric(typeof npmMetrics?.packageAgeDays === "number" ? npmMetrics.packageAgeDays : null)} {t("common.days")}</dd></div>
              <div><dt>{t("common.dependencies")}</dt><dd>{formatMetric(typeof npmMetrics?.dependencyCount === "number" ? npmMetrics.dependencyCount : null)}</dd></div>
              <div><dt>{t("detail.devDependencies")}</dt><dd>{formatMetric(typeof npmMetrics?.devDependencyCount === "number" ? npmMetrics.devDependencyCount : null)}</dd></div>
            </dl>
          </div>

          <div className="signal-panel signal-panel-tags">
            <div className="signal-panel-header">
              <p>{t("detail.ecosystemTags")}</p>
            </div>
            <div className="signal-chip-group-label">{t("detail.topics")}</div>
            <div className="signal-chip-list">
              {topics.length > 0 ? topics.map((topic) => (
                <span className="signal-chip" key={topic}>{topic}</span>
              )) : <span className="signal-empty">{t("detail.noTopics")}</span>}
            </div>
            <div className="signal-chip-group-label">{t("detail.languages")}</div>
            <div className="signal-chip-list">
              {languages.length > 0 ? languages.map((language) => (
                <span className="signal-chip" key={language}>{language}</span>
              )) : <span className="signal-empty">{t("detail.noLanguages")}</span>}
            </div>
          </div>

          <div className="signal-panel signal-panel-issue">
            <div className="signal-panel-header">
              <p>{t("detail.sampledIssueWindow")}</p>
            </div>
            <p className="signal-description">
              {t("detail.sampledIssueWindowCopy")}
            </p>
            <dl className="signal-list">
              <div><dt>{t("detail.sampledOpenIssues")}</dt><dd>{formatMetric(typeof issueMetrics?.openIssues === "number" ? issueMetrics.openIssues : null)}</dd></div>
              <div><dt>{t("detail.sampledClosedIssues")}</dt><dd>{formatMetric(typeof issueMetrics?.closedIssues === "number" ? issueMetrics.closedIssues : null)}</dd></div>
              <div><dt>{t("detail.recentOpenSample")}</dt><dd>{formatMetric(typeof issueMetrics?.sampleRecentOpenIssues === "number" ? issueMetrics.sampleRecentOpenIssues : null)}</dd></div>
              <div><dt>{t("detail.recentClosedSample")}</dt><dd>{formatMetric(typeof issueMetrics?.sampleRecentClosedIssues === "number" ? issueMetrics.sampleRecentClosedIssues : null)}</dd></div>
              <div><dt>{t("detail.olderClosedSample")}</dt><dd>{formatMetric(typeof issueMetrics?.sampleOlderClosedIssues === "number" ? issueMetrics.sampleOlderClosedIssues : null)}</dd></div>
              <div><dt>{t("detail.oldOpenSample")}</dt><dd>{formatMetric(typeof issueMetrics?.sampleOldOpenIssues === "number" ? issueMetrics.sampleOldOpenIssues : null)}</dd></div>
              <div><dt>{t("detail.warnings")}</dt><dd>{warnings.length}</dd></div>
            </dl>
            {warnings.length > 0 ? (
              <ul className="signal-warning-list">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="signal-empty">{t("detail.noWarnings")}</p>
            )}
          </div>
        </div>
      </article>
      )}

      {activeTab === "score" && (
      <article className="github-section">
        <div className="section-heading">
          <div>
            <h2>{t("detail.scoreBreakdown")}</h2>
            <p>{t("detail.scoreBreakdownCopy")}</p>
          </div>
        </div>

        <div className="score-breakdown-hero">
          <div>
            <span>{t("detail.overallDependencyScore")}</span>
            <strong>{dependency.score}/100</strong>
          </div>
          <div>
            <span>{t("result.riskLevel")}</span>
            <strong className={riskClassName(dependency.riskLevel)}>{riskLabel(dependency.riskLevel, t)}</strong>
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
                    <strong>{formatScoreValue(item.score, t)}</strong>
                    <span>{Math.round(item.weight * 100)}% {t("common.weight")}</span>
                  </div>
                </div>
                <div className="score-breakdown-bar" aria-hidden="true">
                  <div style={{ width: `${barWidth}%` }}></div>
                </div>
                <div className="score-breakdown-footer">
                  <span>{t("detail.contribution", { points: contribution ?? "-" })}</span>
                </div>
                <details className="score-input-details">
                  <summary>{t("detail.showScoringInputs")}</summary>
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
                            {scoreSignalLabel(normalizedValue, t)}
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
            <h3>{t("result.relationshipSignals")}</h3>
            <p>
              {t("detail.relationshipSignalsCopy")}
            </p>
          </div>
          <div className="score-relationship-counts">
            <span>{relationshipCounts.known} {t("detail.known")}</span>
            <span>{relationshipCounts.possible} {t("detail.possible")}</span>
            <span>{relationshipCounts.mentions} {t("detail.mentions")}</span>
            <span>{relationshipSignalCount} {t("detail.total")}</span>
          </div>
        </article>
      </article>
      )}

      {activeTab === "issues" && (
      <article className="github-section">
        <h2>
          {t("detail.issueActivity")} <a href="#issue-activity-note" className="footnote-link">*</a>
          {selectedWeek && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedWeek(null)}>
                  {t("detail.clearWeekFilter", { value: selectedWeek })}
                </button>
              )}
              {selectedCloserCategory && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedCloserCategory(null)}>
                  {t("detail.clearCloserFilter", { value: selectedCloserCategory })}
                </button>
              )}
              {selectedActivityBucket && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedActivityBucket(null)}>
                  {t("detail.clearActivityFilter", { value: selectedActivityBucket })}
                </button>
              )}
              {selectedCloseReason && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedCloseReason(null)}>
                  {t("detail.clearReasonFilter", { value: selectedCloseReason })}
                </button>
              )}
              {selectedPostCloseActivity && (
                <button type="button" className="filter-clear-button" onClick={() => setSelectedPostCloseActivity(null)}>
                  {t("detail.clearActivityFilter", { value: selectedPostCloseActivity })}
                </button>
              )}
        </h2>
        <div className="issue-chart-toggle" role="tablist" aria-label={t("detail.issueChartViews")}>
          <button
            type="button"
            role="tab"
            aria-selected={issueChartView === "activity"}
            className={`issue-chart-toggle-button ${issueChartView === "activity" ? "is-active" : ""}`}
            onClick={() => setIssueChartView("activity")}
          >
            {t("detail.activity")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={issueChartView === "insights"}
            className={`issue-chart-toggle-button ${issueChartView === "insights" ? "is-active" : ""}`}
            onClick={() => setIssueChartView("insights")}
          >
            {t("detail.scoreInsights")}
          </button>
        </div>
        <div className="github-metrics">

          {issueChartView === "activity" ? (
          <>
          <div className="metric-placeholder metric-placeholder-wide">
            <div className="chart-grid">
              <div className="metric-placeholder">
                <p>{t("detail.closedBy")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={closerBreakdownData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={pieOuterRadius}
                        label={showPieLabels}
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
                <p>{t("detail.timelineActivityLevel")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityBucketData} margin={isCompactCharts ? { left: -20, right: 8 } : undefined}>
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
                <p>{t("detail.closeReasons")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={closeReasonData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={pieOuterRadius}
                        label={showPieLabels}
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
                <p>{t("detail.postCloseActivity")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={postCloseActivityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={pieOuterRadius}
                        label={showPieLabels}
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
                <p>{t("detail.timeToClose")}</p>
                <div className="stat-card-body">
                  <div className="stat-value-group">
                    <div className="stat-value-label">{t("detail.median")}</div>
                    <div className="stat-value-number">
                      {timeToCloseStats.median !== null ? `${timeToCloseStats.median} ${t("common.days")}` : "-"}
                    </div>
                  </div>
                  <div className="stat-value-group">
                    <div className="stat-value-label">{t("detail.average")}</div>
                    <div className="stat-value-number">
                      {timeToCloseStats.average !== null ? `${timeToCloseStats.average} ${t("common.days")}` : "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.triageSpeed")}</p>
                <div className="stat-card-body">
                  <div className="stat-value-group">
                    <div className="stat-value-label">{t("detail.median")}</div>
                    <div className="stat-value-number">
                      {triageSpeedStats.median !== null ? `${triageSpeedStats.median} ${t("common.days")}` : "-"}
                    </div>
                  </div>
                  <div className="stat-value-group">
                    <div className="stat-value-label">{t("detail.average")}</div>
                    <div className="stat-value-number">
                      {triageSpeedStats.average !== null ? `${triageSpeedStats.average} ${t("common.days")}` : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="metric-placeholder metric-placeholder-wide">
            <p>{t("detail.issuesOpenedVsClosed")}</p>
            <div className="wide-chart-container">
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
                  <Line type="monotone" dataKey="opened" name={t("detail.opened")} stroke="#2563eb" />
                  <Line type="monotone" dataKey="closed" name={t("detail.closed")} stroke="#ef4444" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          </>
          ) : (
          <>
          <div className="metric-placeholder metric-placeholder-wide">
            <div className="chart-grid chart-grid-insights">
              <div className="metric-placeholder">
                <p>{t("detail.resolutionFunnel")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resolutionFunnelData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="stage" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.backlogHealth")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={backlogHealthData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.resolutionTimeDistribution")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resolutionDistributionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.maintainerResponseDistribution")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={responseDistributionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.closureMethod")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={closerBreakdownData} layout="vertical" margin={verticalChartMargin}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={verticalAxisWidth} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="metric-placeholder">
                <p>{t("detail.closeReasons")}</p>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={closeReasonData} layout="vertical" margin={verticalChartMargin}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={verticalAxisWidth} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
          </>
          )}

          <div className="metric-placeholder metric-placeholder-wide">
            <p>{t("detail.issueDetails")}</p>
            <div className="issues-table-wrapper">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("detail.published")}</th>
                    <th>{t("detail.closedAt")}</th>
                    <th>{t("detail.closeReason")}</th>
                    <th>{t("detail.closerType")}</th>
                    <th>{t("detail.closedByBot")}</th>
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
                        <td>{formatBoolean(summary.closedByBot, t)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="metric-placeholder metric-placeholder-wide" id="issue-activity-note">
            <p>{t("detail.issueActivityNote")}</p>
          </div>

        </div>
      </article>
      )}

    </section>
  );
}
