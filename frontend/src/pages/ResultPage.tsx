import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import "./ResultPage.css";

type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type DependencyEntry = AnalysisLookupResponse["analysis"]["dependencies"][number];
type ScoreEntry = NonNullable<AnalysisLookupResponse["analysis"]["result"]>["dependencyScores"][number];

const statusLabels: Record<AnalysisStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const POLLING_INTERVAL_MS = 3000;

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
          </tr>
        </thead>
        <tbody>
          {dependencies.map((dependency) => {
            const score = scoresByDependencyId.get(dependency.id);
            const repositoryUrl = getRepositoryUrl(score);

            return (
              <tr key={`${dependency.id}-${dependency.type}`}>
                <td>{dependency.name}</td>
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
              </tr>
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
    if (!analysis || analysis.status === "COMPLETED" || analysis.status === "FAILED") {
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
      ? analysis.updatedAt
      : null;
  const analysisDuration = formatDuration(analysis.createdAt, durationEnd);

  return (
    <section className="result-page">
      <header className="result-header">
        <h1>Analysis Result</h1>
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
          <article className="summary-section">
            <h2>{analysis.status === "FAILED" ? "Analysis Failed" : "Analysis In Progress"}</h2>
            <p>
              {analysis.result
                ? analysis.result.summary
                : "The analysis exists but results are not ready yet. Press refresh in a few moments."}
            </p>
          </article>

          <div className="summary-grid">
            <article className="summary-card">
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
