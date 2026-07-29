import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import { exportFullStackReport } from "../reporting/fullStackReport";
import "./ResultPage.css";

type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DependencyEntry = AnalysisLookupResponse["analysis"]["dependencies"][number];
type ScoreEntry = NonNullable<AnalysisLookupResponse["analysis"]["result"]>["dependencyScores"][number];
type RelationshipEntry = AnalysisLookupResponse["analysis"]["dependencyRelationships"][number];

const statusLabels: Record<AnalysisStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const POLLING_INTERVAL_MS = 3000;
const RELATIONSHIP_REFRESH_WINDOW_MS = 15 * 60 * 1000;

function riskClassName(risk: RiskLevel): string {
  if (risk === "LOW") return "risk-low";
  if (risk === "MEDIUM") return "risk-medium";
  return "risk-high";
}

function formatDuration(start: string, end?: string | null) {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return "-";
  }

  const totalSeconds = Math.round((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getScoreCompletionTime(analysis: AnalysisLookupResponse["analysis"]) {
  const scoreTimes =
    analysis.result?.dependencyScores
      .map((score) => getRecord(score)?.updatedAt)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "") ?? [];

  if (scoreTimes.length === 0) return analysis.updatedAt;

  return scoreTimes.reduce((latest, value) => {
    const latestMs = new Date(latest).getTime();
    const valueMs = new Date(value).getTime();

    if (Number.isNaN(valueMs)) return latest;
    if (Number.isNaN(latestMs)) return value;
    return valueMs > latestMs ? value : latest;
  }, scoreTimes[0]!);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function getGithubMetrics(score?: ScoreEntry) {
  const metrics = getRecord(score?.githubMetrics);
  const issueMetrics = getRecord(score?.issueMetrics);

  return {
    stars: typeof metrics?.stars === "number" ? metrics.stars : null,
    watchers: typeof metrics?.watchers === "number" ? metrics.watchers : null,
    forks: typeof metrics?.forks === "number" ? metrics.forks : null,
    repositoryIssues: typeof metrics?.issues === "number" ? metrics.issues : null,
    pullRequests: typeof metrics?.pullRequests === "number" ? metrics.pullRequests : null,
    contributors: typeof metrics?.contributors === "number" ? metrics.contributors : null,
    openIssues:
      typeof issueMetrics?.openIssues === "number" ? issueMetrics.openIssues : null,
    closedIssues:
      typeof issueMetrics?.closedIssues === "number" ? issueMetrics.closedIssues : null,
  };
}

function hasRepositoryForRelationshipChecks(score: ScoreEntry) {
  const metrics = getRecord(score.githubMetrics);
  const repository = getRecord(metrics?.repository);

  return Boolean(
    typeof repository?.owner === "string" &&
      repository.owner.trim() !== "" &&
      typeof repository?.name === "string" &&
      repository.name.trim() !== "" &&
      typeof repository?.fullName === "string" &&
      repository.fullName.trim() !== ""
  );
}

function expectedRelationshipCheckCount(analysis: AnalysisLookupResponse["analysis"]) {
  const relationshipCandidates =
    analysis.result?.dependencyScores.filter(hasRepositoryForRelationshipChecks).length ?? 0;

  return relationshipCandidates > 1
    ? relationshipCandidates * (relationshipCandidates - 1)
    : 0;
}

function shouldPollForRelationshipUpdates(analysis: AnalysisLookupResponse["analysis"]) {
  if (analysis.status !== "COMPLETED" || !analysis.result) return false;

  const expectedChecks = expectedRelationshipCheckCount(analysis);
  if (expectedChecks === 0) return false;
  if (analysis.dependencyRelationships.length >= expectedChecks) return false;

  const scoreCompletedAt = new Date(getScoreCompletionTime(analysis)).getTime();
  if (Number.isNaN(scoreCompletedAt)) return true;

  return Date.now() - scoreCompletedAt < RELATIONSHIP_REFRESH_WINDOW_MS;
}

function countRelationshipRisks(relationships: RelationshipEntry[]) {
  return {
    known: relationships.filter((item) => item.relationshipType === "KNOWN_INCOMPATIBILITY").length,
    possible: relationships.filter((item) => item.relationshipType === "POSSIBLE_CONFLICT").length,
    mentions: relationships.filter((item) => item.relationshipType === "INTEGRATION_MENTION").length,
  };
}

function relationshipSummaryLabel(
  counts: ReturnType<typeof countRelationshipRisks>,
  analysisStatus: AnalysisStatus,
  relationshipCount: number
) {
  if (analysisStatus !== "COMPLETED") return "Analysis pending";
  if (relationshipCount === 0) return "Not checked yet";

  const riskCount = counts.known + counts.possible;
  const signalCount = riskCount + counts.mentions;

  if (signalCount === 0) return "No signals found";
  if (riskCount > 0) {
    return `${riskCount} ${riskCount === 1 ? "risk" : "risks"} found`;
  }
  return `${counts.mentions} ${counts.mentions === 1 ? "mention" : "mentions"} found`;
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function dependencyStatusLabel(analysisStatus: AnalysisStatus, score?: ScoreEntry) {
  if (score) return "Completed";
  if (analysisStatus === "FAILED") return "Not Scored";
  if (analysisStatus === "COMPLETED") return "Not Scored";
  if (analysisStatus === "PROCESSING") return "Processing";
  return "Pending";
}

function dependencyStatusClassName(analysisStatus: AnalysisStatus, score?: ScoreEntry) {
  if (score) return "dependency-status-scored";
  if (analysisStatus === "FAILED" || analysisStatus === "COMPLETED") {
    return "dependency-status-missing";
  }
  if (analysisStatus === "PROCESSING") return "dependency-status-processing";
  return "dependency-status-pending";
}

function DependencyStatusBadge({
  analysisStatus,
  score,
}: {
  analysisStatus: AnalysisStatus;
  score?: ScoreEntry;
}) {
  return (
    <span className={`dependency-status ${dependencyStatusClassName(analysisStatus, score)}`}>
      {dependencyStatusLabel(analysisStatus, score)}
    </span>
  );
}

function DependencyTable({
  analysis,
}: {
  analysis: AnalysisLookupResponse["analysis"];
}) {
  const [expandedDependencies, setExpandedDependencies] = useState<Record<string, boolean>>({});

  const scoresByDependencyId = new Map(
    analysis.result?.dependencyScores.map((score) => [
      score.dependency.id,
      score,
    ]) ?? []
  );

  const dependencies: DependencyEntry[] = analysis.dependencies.length > 0
    ? analysis.dependencies
    : analysis.result?.dependencyScores.map((score) => ({
        id: score.dependency.id,
        name: score.dependency.name,
        versionRequirement: score.dependency.versionRequirement,
        type: score.dependency.type,
      })) ?? [];

  const toggleDependency = useCallback((dependencyId: string) => {
    setExpandedDependencies((current) => ({
      ...current,
      [dependencyId]: !current[dependencyId],
    }));
  }, []);

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Repo URL</th>
            <th>Version</th>
            <th>Type</th>
            <th>Status</th>
            <th>Score</th>
            <th>Risk</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dependencies.map((dependency) => {
            const score = scoresByDependencyId.get(dependency.id);
            const repositoryUrl = getRepositoryUrl(score);
            const githubMetrics = getGithubMetrics(score);
            const dependencyRelationships = analysis.dependencyRelationships.filter(
              (relationship) => relationship.sourceDependencyId === dependency.id
            );
            const relationshipCounts = countRelationshipRisks(dependencyRelationships);
            const isExpanded = Boolean(expandedDependencies[dependency.id]);
            const viewMoreLink = `/results/${analysis.resultToken}/dependency/${encodeURIComponent(dependency.name)}`;

            return (
              <Fragment key={`${dependency.id}-${dependency.type}`}>
                <tr className="dependency-row">
                  <td className="dependency-name-cell">{dependency.name}</td>
                  <td className="repo-url-cell">
                    {repositoryUrl ? (
                      <a href={repositoryUrl} target="_blank" rel="noreferrer">
                        {repositoryUrl}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{dependency.versionRequirement}</td>
                  <td>{dependency.type}</td>
                  <td>
                    <DependencyStatusBadge analysisStatus={analysis.status} score={score} />
                  </td>
                  <td>{score?.score ?? "-"}</td>
                  <td className={score ? riskClassName(score.riskLevel) : undefined}>
                    {score?.riskLevel ?? "-"}
                  </td>
                  <td className="dependency-toggle-cell dependency-toggle-cell-right">
                    <button
                      type="button"
                      className={`dependency-toggle ${isExpanded ? "is-expanded" : ""}`}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${dependency.name}`}
                      onClick={() => toggleDependency(dependency.id)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="dependency-toggle-icon"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m19.5 8.25-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="dependency-expanded-row">
                    <td colSpan={8}>
                      <div className="dependency-expanded-panel">
                        <div className="dependency-detail-strip">
                          <div className="strip-group strip-group-primary">
                            <span>Version</span>
                            <strong>{dependency.versionRequirement}</strong>
                          </div>
                          <div className="strip-group">
                            <span>Stars</span>
                            <strong>{formatMetric(githubMetrics.stars)}</strong>
                          </div>
                          <div className="strip-group">
                            <span>Forks</span>
                            <strong>{formatMetric(githubMetrics.forks)}</strong>
                          </div>
                          <div className="strip-group">
                            <span>Repo issues</span>
                            <strong>{formatMetric(githubMetrics.repositoryIssues)}</strong>
                          </div>
                          <div className="strip-group strip-group-wide">
                            <span>Relationships</span>
                            <strong>
                              {relationshipSummaryLabel(
                                relationshipCounts,
                                analysis.status,
                                dependencyRelationships.length
                              )}
                            </strong>
                          </div>
                          <div className="strip-group strip-group-wide">
                            <span>Sampled issues</span>
                            <strong>
                              {formatMetric(githubMetrics.openIssues)} open · {formatMetric(githubMetrics.closedIssues)} closed
                            </strong>
                          </div>
                          <Link className="dependency-strip-link" to={viewMoreLink}>
                            Open details
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ResultPage() {
  const { resultToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] =
    useState<AnalysisLookupResponse["analysis"] | null>(null);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!resultToken) {
      setError("Missing result token in URL.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError("");

    const response = await fetchAnalysisByResultToken(resultToken);

    if (!response.success || !response.data?.analysis) {
      setAnalysis(null);
      setError(response.message || "Unable to load analysis.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setAnalysis(response.data.analysis);
    setLoading(false);
    setRefreshing(false);
  }, [resultToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !analysis ||
      analysis.status === "FAILED" ||
      (analysis.status === "COMPLETED" && !shouldPollForRelationshipUpdates(analysis))
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void load({ showLoading: false });
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [analysis, load]);

  if (loading) {
    return (
      <section className="result-page">
        <h1>Analysis Result</h1>
        <p>Loading analysis...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="result-page">
        <h1>Analysis Result</h1>
        <p className="error-text">{error}</p>
        <div className="result-actions">
          <button className="button" onClick={() => void load()}>
            Retry
          </button>
          <Link className="button button-secondary" to="/">
            Back to Home
          </Link>
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="result-page">
        <h1>Analysis Result</h1>
        <p>No analysis found.</p>
      </section>
    );
  }

  const completedResult = analysis.status === "COMPLETED" ? analysis.result : null;
  const durationEnd =
    analysis.status === "COMPLETED" || analysis.status === "FAILED"
      ? getScoreCompletionTime(analysis)
      : null;
  const analysisDuration = formatDuration(analysis.createdAt, durationEnd);
  const relationshipCounts = countRelationshipRisks(analysis.dependencyRelationships);
  const totalRelationshipSignals =
    relationshipCounts.known + relationshipCounts.possible + relationshipCounts.mentions;
  const expectedRelationshipChecks = expectedRelationshipCheckCount(analysis);
  const relationshipChecksStillUpdating = shouldPollForRelationshipUpdates(analysis);

  return (
    <section className="result-page">
      <header className="result-header">
        <div>
          <p className="result-kicker">Stack analysis</p>
          <h1>Analysis Result</h1>
        </div>
        <span className={`status-badge status-${analysis.status.toLowerCase()}`}>
          {statusLabels[analysis.status]}
        </span>
      </header>

      <p className="token-row">Result token: {analysis.resultToken}</p>
      {(analysis.status === "PENDING" || analysis.status === "PROCESSING") && (
        <p className="polling-row">
          Auto-refreshing every {POLLING_INTERVAL_MS / 1000}s
          {refreshing ? "..." : ""}
        </p>
      )}

      {completedResult ? (
        <>
          <div className="summary-grid">
            <article className="summary-card">
              <h2>Global Score</h2>
              <p>{completedResult.globalScore}</p>
            </article>
            <article className="summary-card">
              <h2>Risk Level</h2>
              <p className={riskClassName(completedResult.riskLevel)}>
                {completedResult.riskLevel}
              </p>
            </article>
            <article className="summary-card">
              <h2>Total Time</h2>
              <p>{analysisDuration}</p>
            </article>
            <article className="summary-card">
              <h2>Relationship Signals</h2>
              <p>{totalRelationshipSignals}</p>
              {relationshipChecksStillUpdating && (
                <span className="summary-card-note">
                  Updating {analysis.dependencyRelationships.length}/{expectedRelationshipChecks} checks
                </span>
              )}
            </article>
          </div>

          <article className="summary-section">
            <h2>Summary</h2>
            <p>{completedResult.summary}</p>
          </article>

          <article className="summary-section">
            <h2>Dependency Scores</h2>
            <DependencyTable analysis={analysis} />
          </article>
        </>
      ) : (
        <>
          <div className="analysis-status-row">
            <article className="summary-section analysis-status-info">
              <h2>{analysis.status === "FAILED" ? "Analysis Failed" : "Analysis In Progress"}</h2>
              <p>
                {analysis.result
                  ? analysis.result.summary
                  : "The analysis exists but results are not ready yet. Press refresh in a few moments."}
              </p>
            </article>

            <article className="summary-card analysis-status-time">
              <h2>Elapsed Time</h2>
              <p>{analysisDuration}</p>
            </article>
          </div>

          <article className="summary-section">
            <h2>Dependencies</h2>
            <DependencyTable analysis={analysis} />
          </article>
        </>
      )}

      {analysis.status === "FAILED" && analysis.errorMessage && (
        <p className="error-text">{analysis.errorMessage}</p>
      )}

      <div className="result-actions">
        <button
          className="button"
          onClick={() => exportFullStackReport(analysis)}
        >
          Export PDF
        </button>
        <button
          className="button"
          disabled={refreshing}
          onClick={() => void load({ showLoading: false })}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <Link className="button button-secondary" to="/">
          Back to Home
        </Link>
      </div>
    </section>
  );
}
