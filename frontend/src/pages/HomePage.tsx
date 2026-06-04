import { useState, useCallback } from "react";
import "./HomePage.css";
import { sendJsonForAnalysis } from "../service/ApiService";

export default function JsonDropZone() {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [jsonContent, setJsonContent] = useState<any>(null);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    setJsonContent(null);

    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setError("Please upload a .json file.");
      return;
    }
    setSelectedFile(file);
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
        setJsonContent(parsed);
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

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Please upload a JSON file.");
      return;
    }

    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    const result = await sendJsonForAnalysis(
      email,
      selectedFile
    );

    setLoading(false);

    if (result.success) {
      alert("File sent successfully!");
      console.log(result.data);
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

      {jsonContent && (
        <pre className="preview">
          {JSON.stringify(jsonContent, null, 2)}
        </pre>
      )}

      <button
        className="submitButton"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Sending..." : "Send File"}
      </button>
    </div>
  );
}
