import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAnalysisByResultToken } from "../service/ApiService";
import type { AnalysisLookupResponse } from "../service/ApiService";
import "./ResultPage.css";

type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

const statusLabels: Record<AnalysisStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function riskClassName(risk: RiskLevel): string {
  if (risk === "LOW") return "risk-low";
  if (risk === "MEDIUM") return "risk-medium";
  return "risk-high";
}

export default function ResultPage() {
  const { resultToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] =
    useState<AnalysisLookupResponse["analysis"] | null>(null);

  const load = async () => {
    if (!resultToken) {
      setError("Missing result token in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetchAnalysisByResultToken(resultToken);

    if (!response.success || !response.data?.analysis) {
      setAnalysis(null);
      setError(response.message || "Unable to load analysis.");
      setLoading(false);
      return;
    }

    setAnalysis(response.data.analysis);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [resultToken]);

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

  return (
    <section className="result-page">
      <header className="result-header">
        <h1>Analysis Result</h1>
        <span className={`status-badge status-${analysis.status.toLowerCase()}`}>
          {statusLabels[analysis.status]}
        </span>
      </header>

      <p className="token-row">Result token: {analysis.resultToken}</p>

      {analysis.result ? (
        <>
          <div className="summary-grid">
            <article className="summary-card">
              <h2>Global Score</h2>
              <p>{analysis.result.globalScore}</p>
            </article>
            <article className="summary-card">
              <h2>Risk Level</h2>
              <p className={riskClassName(analysis.result.riskLevel)}>
                {analysis.result.riskLevel}
              </p>
            </article>
          </div>

          <article className="summary-section">
            <h2>Summary</h2>
            <p>{analysis.result.summary}</p>
          </article>

          <article className="summary-section">
            <h2>Dependency Scores</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Version</th>
                    <th>Type</th>
                    <th>Score</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.result.dependencyScores.map((entry) => (
                    <tr key={`${entry.dependency.name}-${entry.dependency.type}`} className="clickable-row">
                      <td>
                        <Link to={`/results/${analysis.resultToken}/dependency/${encodeURIComponent(entry.dependency.name)}`}>
                          {entry.dependency.name}
                        </Link>
                      </td>
                      <td>{entry.dependency.versionRequirement}</td>
                      <td>{entry.dependency.type}</td>
                      <td>{entry.score}</td>
                      <td className={riskClassName(entry.riskLevel)}>{entry.riskLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : (
        <article className="summary-section">
          <h2>Analysis In Progress</h2>
          <p>
            The analysis exists but results are not ready yet. Press refresh in a few
            moments.
          </p>
        </article>
      )}

      {analysis.status === "FAILED" && analysis.errorMessage && (
        <p className="error-text">{analysis.errorMessage}</p>
      )}

      <div className="result-actions">
        <button className="button" onClick={() => void load()}>
          Refresh
        </button>
        <Link className="button button-secondary" to="/">
          Back to Home
        </Link>
      </div>
    </section>
  );
}
