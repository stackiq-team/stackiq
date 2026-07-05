import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import "./DependencyDetailPage.css";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type ScoreEntry = NonNullable<AnalysisLookupResponse["analysis"]["result"]>["dependencyScores"][number];

interface DependencyDetail {
  name: string;
  versionRequirement: string;
  type: "DEPENDENCY" | "DEV_DEPENDENCY";
  score: number;
  riskLevel: RiskLevel;
  scoreEntry?: ScoreEntry;
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

function getGithubMetrics(score?: ScoreEntry) {
  const metrics = getRecord(score?.githubMetrics);
  const issueMetrics = getRecord(score?.issueMetrics);

  return {
    stars: typeof metrics?.stars === "number" ? metrics.stars : null,
    watchers: typeof metrics?.watchers === "number" ? metrics.watchers : null,
    forks: typeof metrics?.forks === "number" ? metrics.forks : null,
    openIssues:
      typeof issueMetrics?.openIssues === "number" ? issueMetrics.openIssues : null,
    closedIssues:
      typeof issueMetrics?.closedIssues === "number" ? issueMetrics.closedIssues : null,
    warnings: Array.isArray(score?.warnings) ? score?.warnings : [],
  };
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
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

export default function DependencyDetailPage() {
  const { resultToken, dependencyName } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dependency, setDependency] = useState<DependencyDetail | null>(null);

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
            <h3>Risk Level</h3>
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

      <article className="github-section">
        <h2>GitHub Metrics</h2>
        <div className="github-metrics">
          <div className="metric-placeholder">
            <p>Repository</p>
            <div className="github-metric-value">
              {getRepositoryUrl(dependency.scoreEntry) ? (
                <a href={getRepositoryUrl(dependency.scoreEntry) ?? "#"} target="_blank" rel="noreferrer">
                  {getRepositoryUrl(dependency.scoreEntry)}
                </a>
              ) : (
                "-"
              )}
            </div>
          </div>

          <div className="metric-placeholder">
            <p>Popularity</p>
            <div className="github-metric-value">Stars: {formatMetric(getGithubMetrics(dependency.scoreEntry).stars)}</div>
            <div className="github-metric-value">Watchers: {formatMetric(getGithubMetrics(dependency.scoreEntry).watchers)}</div>
          </div>

          <div className="metric-placeholder">
            <p>Maintenance</p>
            <div className="github-metric-value">Forks: {formatMetric(getGithubMetrics(dependency.scoreEntry).forks)}</div>
            <div className="github-metric-value">Open issues: {formatMetric(getGithubMetrics(dependency.scoreEntry).openIssues)}</div>
            <div className="github-metric-value">Closed issues: {formatMetric(getGithubMetrics(dependency.scoreEntry).closedIssues)}</div>
          </div>

          <div className="metric-placeholder">
            <p>Warnings</p>
            <div className="github-metric-value">
              {getGithubMetrics(dependency.scoreEntry).warnings.length > 0 ? (
                <ul className="warning-list">
                  {getGithubMetrics(dependency.scoreEntry).warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                "No warnings reported"
              )}
            </div>
          </div>
        </div>
      </article>

    </section>
  );
}
