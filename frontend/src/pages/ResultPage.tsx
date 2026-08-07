import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import { exportFullStackReport } from "../reporting/fullStackReport";
import "./ResultPage.css";
import { useTranslation, type TranslationKey } from "../i18n/LanguageContext";

type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DependencyEntry = AnalysisLookupResponse["analysis"]["dependencies"][number];
type ScoreEntry = NonNullable<AnalysisLookupResponse["analysis"]["result"]>["dependencyScores"][number];
type RelationshipEntry = AnalysisLookupResponse["analysis"]["dependencyRelationships"][number];

const statusLabelKeys: Record<AnalysisStatus, TranslationKey> = {
  PENDING: "status.pending",
  PROCESSING: "status.processing",
  COMPLETED: "status.completed",
  FAILED: "status.failed",
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
  relationshipCount: number,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (analysisStatus !== "COMPLETED") return t("result.analysisPending");
  if (relationshipCount === 0) return t("result.notCheckedYet");

  const riskCount = counts.known + counts.possible;
  const signalCount = riskCount + counts.mentions;

  if (signalCount === 0) return t("result.noSignalsFound");
  if (riskCount > 0) {
    return t("result.risksFound", {
      count: riskCount,
      label: t(riskCount === 1 ? "result.riskSingular" : "result.riskPlural"),
    });
  }
  return t("result.mentionsFound", {
    count: counts.mentions,
    label: t(counts.mentions === 1 ? "result.mentionSingular" : "result.mentionPlural"),
  });
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function dependencyStatusLabel(
  analysisStatus: AnalysisStatus,
  score: ScoreEntry | undefined,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (score) return t("result.completed");
  if (analysisStatus === "FAILED") return t("result.notScored");
  if (analysisStatus === "COMPLETED") return t("result.notScored");
  if (analysisStatus === "PROCESSING") return t("status.processing");
  return t("status.pending");
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
  const { t } = useTranslation();
  return (
    <span className={`dependency-status ${dependencyStatusClassName(analysisStatus, score)}`}>
      {dependencyStatusLabel(analysisStatus, score, t)}
    </span>
  );
}

function DependencyTable({
  analysis,
}: {
  analysis: AnalysisLookupResponse["analysis"];
}) {
  const { t } = useTranslation();
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
            <th>{t("result.name")}</th>
            <th>{t("result.repoUrl")}</th>
            <th>{t("result.version")}</th>
            <th>{t("result.type")}</th>
            <th>{t("common.status")}</th>
            <th>{t("result.score")}</th>
            <th>{t("result.risk")}</th>
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
                      aria-label={t(isExpanded ? "result.collapse" : "result.expand", { name: dependency.name })}
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
                            <span>{t("result.version")}</span>
                            <strong>{dependency.versionRequirement}</strong>
                          </div>
                          <div className="strip-group">
                            <span>{t("result.stars")}</span>
                            <strong>{formatMetric(githubMetrics.stars)}</strong>
                          </div>
                          <div className="strip-group">
                            <span>{t("result.forks")}</span>
                            <strong>{formatMetric(githubMetrics.forks)}</strong>
                          </div>
                          <div className="strip-group">
                            <span>{t("result.repoIssues")}</span>
                            <strong>{formatMetric(githubMetrics.repositoryIssues)}</strong>
                          </div>
                          <div className="strip-group strip-group-wide">
                            <span>{t("result.relationships")}</span>
                            <strong>
                              {relationshipSummaryLabel(
                                relationshipCounts,
                                analysis.status,
                                dependencyRelationships.length,
                                t
                              )}
                            </strong>
                          </div>
                          <div className="strip-group strip-group-wide">
                            <span>{t("result.sampledIssues")}</span>
                            <strong>
                              {formatMetric(githubMetrics.openIssues)} open · {formatMetric(githubMetrics.closedIssues)} closed
                            </strong>
                          </div>
                          <Link className="dependency-strip-link" to={viewMoreLink}>
                            {t("result.openDetails")}
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
  const { language, t } = useTranslation();
  const { resultToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] =
    useState<AnalysisLookupResponse["analysis"] | null>(null);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!resultToken) {
      setError(t("result.missingToken"));
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
      setError(response.message || t("result.unableToLoad"));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setAnalysis(response.data.analysis);
    setLoading(false);
    setRefreshing(false);
  }, [resultToken, t]);

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
        <h1>{t("result.title")}</h1>
        <p>{t("result.loading")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="result-page">
        <h1>{t("result.title")}</h1>
        <p className="error-text">{error}</p>
        <div className="result-actions">
          <button className="button" onClick={() => void load()}>
            {t("common.retry")}
          </button>
          <Link className="button button-secondary" to="/">
            {t("common.backToHome")}
          </Link>
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="result-page">
        <h1>{t("result.title")}</h1>
        <p>{t("result.noAnalysis")}</p>
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
          <p className="result-kicker">{t("result.stackAnalysis")}</p>
          <h1>{t("result.title")}</h1>
        </div>
        <span className={`status-badge status-${analysis.status.toLowerCase()}`}>
          {t(statusLabelKeys[analysis.status])}
        </span>
      </header>

      <p className="token-row">{t("result.token", { token: analysis.resultToken })}</p>
      {(analysis.status === "PENDING" || analysis.status === "PROCESSING") && (
        <p className="polling-row">
          {t("result.autoRefreshing", {
            seconds: POLLING_INTERVAL_MS / 1000,
            suffix: refreshing ? "..." : "",
          })}
        </p>
      )}

      {completedResult ? (
        <>
          <div className="summary-grid">
            <article className="summary-card">
              <h2>{t("result.globalScore")}</h2>
              <p>{completedResult.globalScore}</p>
            </article>
            <article className="summary-card">
              <h2>{t("result.riskLevel")}</h2>
              <p className={riskClassName(completedResult.riskLevel)}>
                {completedResult.riskLevel}
              </p>
            </article>
            <article className="summary-card">
              <h2>{t("result.totalTime")}</h2>
              <p>{analysisDuration}</p>
            </article>
            <article className="summary-card">
              <h2>{t("result.relationshipSignals")}</h2>
              <p>{totalRelationshipSignals}</p>
              {relationshipChecksStillUpdating && (
                <span className="summary-card-note">
                  {t("result.updatingChecks", {
                    current: analysis.dependencyRelationships.length,
                    expected: expectedRelationshipChecks,
                  })}
                </span>
              )}
            </article>
          </div>

          <article className="summary-section">
            <h2>{t("result.summary")}</h2>
            <p>{completedResult.summary}</p>
          </article>

          <article className="summary-section">
            <h2>{t("result.dependencyScores")}</h2>
            <DependencyTable analysis={analysis} />
          </article>
        </>
      ) : (
        <>
          <div className="analysis-status-row">
            <article className="summary-section analysis-status-info">
              <h2>{analysis.status === "FAILED" ? t("result.analysisFailed") : t("result.analysisInProgress")}</h2>
              <p>
                {analysis.result
                  ? analysis.result.summary
                  : t("result.notReady")}
              </p>
            </article>

            <article className="summary-card analysis-status-time">
              <h2>{t("result.elapsedTime")}</h2>
              <p>{analysisDuration}</p>
            </article>
          </div>

          <article className="summary-section">
            <h2>{t("result.dependencies")}</h2>
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
          onClick={() => exportFullStackReport(analysis, language)}
        >
          {t("common.exportPdf")}
        </button>
        <button
          className="button"
          disabled={refreshing}
          onClick={() => void load({ showLoading: false })}
        >
          {refreshing ? t("common.refreshing") : t("common.refresh")}
        </button>
        <Link className="button button-secondary" to="/">
          {t("common.backToHome")}
        </Link>
      </div>
    </section>
  );
}
