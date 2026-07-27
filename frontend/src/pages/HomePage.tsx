import { useState, useCallback } from "react";
import "./HomePage.css";
import { sendJsonForAnalysis } from "../service/ApiService";

export default function JsonDropZone() {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  
  const validateEmail = (value: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  const handleEmailChange = (
    event: React.ChangeEvent<HTMLInputElement>
    ) => {
    const value = event.target.value;

    setEmail(value);

    if (value !== "" && !validateEmail(value)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handleFile = useCallback((file: File | undefined) => {
    setError("");
    setResultUrl("");

    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setError("Please upload a .json file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const result = event.target?.result;

        if (typeof result !== "string") {
          setError("Could not read file.");
          return;
        }

        const parsed = JSON.parse(result);

        setFileName(file.name);
        setJsonText(JSON.stringify(parsed, null, 2));
      } catch {
        setError("Invalid JSON file.");
      }
    };

    reader.readAsText(file);
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    handleFile(file);
  };

  const handleJsonTextChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setJsonText(event.target.value);
    setFileName("");
    setError("");
    setResultUrl("");
  };

  const handleSubmit = async () => {
    const trimmedJsonText = jsonText.trim();

    if (!trimmedJsonText) {
      setError("Please upload a JSON file or paste JSON content.");
      return;
    }

    if (email.trim() !== "" && !validateEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    try {
      JSON.parse(trimmedJsonText);
    } catch {
      setError("Please enter valid JSON content.");
      return;
    }

    setLoading(true);

    const jsonFile = new File(
      [trimmedJsonText],
      fileName || "package.json",
      { type: "application/json" }
    );

    const result = await sendJsonForAnalysis(
      email,
      jsonFile
    );

    setLoading(false);

    if (result.success && result.data?.analysis.resultToken) {
      setResultUrl(
        `/results/${encodeURIComponent(
          result.data.analysis.resultToken
        )}`
      );
    } else if (result.success) {
      setError("Upload succeeded, but no result token was returned.");
    } else {
      setError(result.message || "Upload failed.");
    }
  };

  return (
    <section className="scanner-page">
      <div className="scanner-hero">
        <div>
          <h1>Analyze a package stack before it becomes production risk.</h1>
          <p className="hero-copy">
            Upload or paste a package.json to score dependency health, mine issue signals,
            and detect relationship risks between packages.
          </p>
        </div>
      </div>

      <div className="scanner-grid">
        <div className="scanner-panel">
          {fileName && (
            <div className="panel-header">
              <span className="file-pill">{fileName}</span>
            </div>
          )}

          <div className="form-section emailSection">
            <div className="section-kicker">Optional notification</div>
            <label className="emailLabel">Email Address (optional)</label>
            <p className="emailHelp">
              Analysis can take a few minutes. Leave an email to get notified when the result is ready.
            </p>
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="example@email.com"
              className={`emailInput ${emailError ? "inputError" : ""}`}
            />
            {emailError && <div className="error">{emailError}</div>}
          </div>

          <div className="form-section">
            <div className="section-kicker">Package JSON</div>
            <div
              className={`dropZone ${dragActive ? "dropZoneActive" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleInputChange}
                className="input"
                id="json-upload"
              />
              <label className="label" htmlFor="json-upload">
                <span className="upload-icon">JSON</span>
                <span>Drop package.json here or browse</span>
              </label>
            </div>

            {fileName && (
              <div className="success">
                Loaded {fileName}
              </div>
            )}
            {error && <div className="error">{error}</div>}

            <textarea
              className="jsonTextArea"
              value={jsonText}
              onChange={handleJsonTextChange}
              placeholder={`{\n  "dependencies": {\n    "express": "^5.2.1"\n  }\n}`}
              spellCheck={false}
            />
          </div>

          <div className="scanner-actions">
            <p className="submit-help">
              Runs package, repository, issue, and relationship checks.
            </p>
            <button
              className="submitButton"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Analyzing..." : "Analyze Stack"}
            </button>

            {resultUrl && (
              <a
                className="resultButton"
                href={resultUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Result
              </a>
            )}
          </div>
        </div>

        <aside className="home-output-panel">
          <h2>Analysis flow</h2>
          <div className="home-output-list">
            <div className="home-output-item">
              <span className="home-output-step signal-blue">1</span>
              <div>
                <strong>Resolve packages</strong>
                <p>Map each package to its package registry metadata and source repository.</p>
              </div>
            </div>
            <div className="home-output-item">
              <span className="home-output-step signal-orange">2</span>
              <div>
                <strong>Score dependency health</strong>
                <p>Combine release freshness, usage, repository activity, and issue-resolution behavior.</p>
              </div>
            </div>
            <div className="home-output-item">
              <span className="home-output-step signal-green">3</span>
              <div>
                <strong>Check package relationships</strong>
                <p>Look for issue evidence that packages conflict, integrate poorly, or are commonly used together.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
