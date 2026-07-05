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
  const [riskInfoOpen, setRiskInfoOpen] = useState(false);

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
  const topics = toStringArray(githubMetrics?.topics);
  const languages = toStringArray(githubMetrics?.languages);
  const warnings = Array.isArray(dependency.scoreEntry?.warnings)
    ? dependency.scoreEntry.warnings
    : [];
  const _rawPayload = {
    dependencyId: dependency.scoreEntry?.dependency.id ?? null,
    packageName: dependency.name,
    versionRequirement: dependency.versionRequirement,
    type: dependency.type,
    score: dependency.score,
    riskLevel: dependency.riskLevel,
    repositoryMatchSource: getStringValue(githubMetrics?.repositoryMatchSource),
    repositoryMatchConfidence: getStringValue(githubMetrics?.repositoryMatchConfidence),
    stars: typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null,
    watchers: typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null,
    forks: typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null,
    issues: typeof githubMetrics?.issues === "number" ? githubMetrics.issues : null,
    topics,
    license: getStringValue(githubMetrics?.license),
    contributors: typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null,
    projectAgeDays:
      typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null,
    pullRequests: typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null,
    createdAt: getStringValue(githubMetrics?.createdAt),
    created_at: getStringValue(githubMetrics?.created_at),
    primaryLanguage: getStringValue(githubMetrics?.primaryLanguage),
    languages,
    repository,
    npm: npmMetrics,
    issueMetrics,
    warnings,
  };

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

      <article className="github-section">
        <h2>Full Data Snapshot</h2>
        <div className="github-metrics">
          <div className="metric-placeholder">
            <p>Dependency Overview</p>
            <div className="github-metric-value">Dependency ID: {dependency.scoreEntry?.dependency.id ?? "-"}</div>
            <div className="github-metric-value">Package Name: {dependency.name}</div>
            <div className="github-metric-value">Version Requirement: {dependency.versionRequirement}</div>
            <div className="github-metric-value">Type: {dependency.type === "DEPENDENCY" ? "Dependency" : "Dev Dependency"}</div>
            <div className="github-metric-value">Repository Match Source: {getStringValue(githubMetrics?.repositoryMatchSource) ?? "-"}</div>
            <div className="github-metric-value">Repository Match Confidence: {getStringValue(githubMetrics?.repositoryMatchConfidence) ?? "-"}</div>
          </div>

          <div className="metric-placeholder">
            <p>Repository Details</p>
            <div className="github-metric-value">
              Repository: {getRepositoryUrl(dependency.scoreEntry) ? (
                <a href={getRepositoryUrl(dependency.scoreEntry) ?? "#"} target="_blank" rel="noreferrer">
                  {getRepositoryUrl(dependency.scoreEntry)}
                </a>
              ) : (
                "-"
              )}
            </div>
            <div className="github-metric-value">Owner: {getStringValue(repository?.owner) ?? "-"}</div>
            <div className="github-metric-value">Name: {getStringValue(repository?.name) ?? "-"}</div>
            <div className="github-metric-value">Full Name: {getStringValue(repository?.fullName) ?? "-"}</div>
            <div className="github-metric-value">Description: {getStringValue(repository?.description) ?? "-"}</div>
            <div className="github-metric-value">Repository Created At: {formatDate(repository?.createdAt)}</div>
            <div className="github-metric-value">Created At: {formatDate(githubMetrics?.createdAt)}</div>
            <div className="github-metric-value">Raw Created At: {formatDate(githubMetrics?.created_at)}</div>
          </div>

          <div className="metric-placeholder">
            <p>Repository Stats</p>
            <div className="github-metric-value">Stars: {formatMetric(typeof githubMetrics?.stars === "number" ? githubMetrics.stars : null)}</div>
            <div className="github-metric-value">Watchers: {formatMetric(typeof githubMetrics?.watchers === "number" ? githubMetrics.watchers : null)}</div>
            <div className="github-metric-value">Forks: {formatMetric(typeof githubMetrics?.forks === "number" ? githubMetrics.forks : null)}</div>
            <div className="github-metric-value">Issues: {formatMetric(typeof githubMetrics?.issues === "number" ? githubMetrics.issues : null)}</div>
            <div className="github-metric-value">Pull Requests: {formatMetric(typeof githubMetrics?.pullRequests === "number" ? githubMetrics.pullRequests : null)}</div>
            <div className="github-metric-value">Contributors: {formatMetric(typeof githubMetrics?.contributors === "number" ? githubMetrics.contributors : null)}</div>
            <div className="github-metric-value">Project Age (days): {formatMetric(typeof githubMetrics?.projectAgeDays === "number" ? githubMetrics.projectAgeDays : null)}</div>
            <div className="github-metric-value">Primary Language: {getStringValue(githubMetrics?.primaryLanguage) ?? "-"}</div>
          </div>

          <div className="metric-placeholder">
            <p>Package Metadata</p>
            <div className="github-metric-value">Has README: {formatBoolean(npmMetrics?.hasReadme)}</div>
            <div className="github-metric-value">Has License: {formatBoolean(npmMetrics?.hasLicense)}</div>
            <div className="github-metric-value">Has Repository: {formatBoolean(npmMetrics?.hasRepository)}</div>
            <div className="github-metric-value">Version Count: {formatMetric(typeof npmMetrics?.versionCount === "number" ? npmMetrics.versionCount : null)}</div>
            <div className="github-metric-value">Package Age (days): {formatMetric(typeof npmMetrics?.packageAgeDays === "number" ? npmMetrics.packageAgeDays : null)}</div>
            <div className="github-metric-value">Dependency Count: {formatMetric(typeof npmMetrics?.dependencyCount === "number" ? npmMetrics.dependencyCount : null)}</div>
            <div className="github-metric-value">Weekly Downloads: {formatMetric(typeof npmMetrics?.weeklyDownloads === "number" ? npmMetrics.weeklyDownloads : null)}</div>
            <div className="github-metric-value">Dev Dependency Count: {formatMetric(typeof npmMetrics?.devDependencyCount === "number" ? npmMetrics.devDependencyCount : null)}</div>
            <div className="github-metric-value">Latest Publish Age (days): {formatMetric(typeof npmMetrics?.latestPublishAgeDays === "number" ? npmMetrics.latestPublishAgeDays : null)}</div>
            <div className="github-metric-value">NPM License: {getStringValue(githubMetrics?.license) ?? "-"}</div>
          </div>

          <div className="metric-placeholder">
            <p>Topics and Languages</p>
            <div className="github-metric-value">Topics:</div>
            {topics.length > 0 ? (
              <ul className="warning-list">
                {topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            ) : (
              <div className="github-metric-value">-</div>
            )}
            <div className="github-metric-value">Languages:</div>
            {languages.length > 0 ? (
              <ul className="warning-list">
                {languages.map((language) => (
                  <li key={language}>{language}</li>
                ))}
              </ul>
            ) : (
              <div className="github-metric-value">-</div>
            )}
          </div>

          <div className="metric-placeholder">
            <p>Issue Metrics and Warnings</p>
            <div className="github-metric-value">Open Issues: {formatMetric(typeof issueMetrics?.openIssues === "number" ? issueMetrics.openIssues : null)}</div>
            <div className="github-metric-value">Closed Issues: {formatMetric(typeof issueMetrics?.closedIssues === "number" ? issueMetrics.closedIssues : null)}</div>
            <div className="github-metric-value">Warnings:</div>
            {warnings.length > 0 ? (
              <ul className="warning-list">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <div className="github-metric-value">No warnings reported</div>
            )}
          </div>

        </div>
      </article>

    </section>
  );
}
