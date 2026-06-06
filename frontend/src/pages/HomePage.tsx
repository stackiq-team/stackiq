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

    if (value === "") {
      setEmailError("Email is required.");
    } else if (!validateEmail(value)) {
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

    if (!validateEmail(email)) {
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
    <div className="container">
      <div className="emailSection">
        <label className="emailLabel">Email Address</label>

        <input
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="example@email.com"
          className={`emailInput ${
            emailError ? "inputError" : ""
          }`}
        />

        {emailError && (
          <div className="error">{emailError}</div>
        )}
      </div>

      <div
      className="dropZone"
        style={{
          borderColor: dragActive ? "#007bff" : "#999",
          backgroundColor: dragActive ? "#eef5ff" : "#fafafa",
        }}
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
          Drag & drop a JSON file here
          <br />
          or click to browse
        </label>
      </div>

      {fileName && (
        <div className="success">
          <strong>File loaded successfully:</strong> {fileName}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <textarea
        className="jsonTextArea"
        value={jsonText}
        onChange={handleJsonTextChange}
        placeholder="Paste your package.json content here, or upload a JSON file above."
        spellCheck={false}
      />

      <button
        className="submitButton"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Sending..." : "Send File"}
      </button>

      {resultUrl && (
        <a
          className="resultButton"
          href={resultUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Result Page
        </a>
      )}
    </div>
  );
}
