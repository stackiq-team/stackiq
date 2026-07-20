const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

export interface AnalysisResult {
  globalScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  dependencyScores: Array<{
    score: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    popularityScore?: number | null;
    maintenanceScore?: number | null;
    resolutionQualityScore?: number | null;
    normalizedInputs?: Record<string, number | null> | null;
    githubMetrics?: unknown;
    issueMetrics?: unknown;
    issueData?: unknown;
    warnings?: string[] | null;
    dependency: {
      id: string;
      name: string;
      versionRequirement: string;
      type: "DEPENDENCY" | "DEV_DEPENDENCY";
    };
  }>;
}

export interface AnalysisSubmissionResponse {
  message: string;
  analysis: {
    resultToken: string;
  };
  result: AnalysisResult;
}

export interface AnalysisLookupResponse {
  message: string;
  analysis: {
    id: string;
    email: string | null;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    resultToken: string;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    dependencies: Array<{
      id: string;
      name: string;
      versionRequirement: string;
      type: "DEPENDENCY" | "DEV_DEPENDENCY";
    }>;
    result: AnalysisResult | null;
  };
}

export type RepoLeaderboardItem = {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  issues: number;
  pullRequests: number;
  license: string | null;
  primaryLanguage: string | null;
  topics: string[];
  createdAt: string;
  pushedAt: string;
  popularityScore: number;
  activityScore: number;
  compatibilityScore: number;
  analysisScore: number | null;
  analysisStatus: string | null;
  analysisResultToken: string | null;
  packageJsonPresent: boolean;
};

export interface LeaderboardLists {
  popular: RepoLeaderboardItem[];
  active: RepoLeaderboardItem[];
  bestRanked: RepoLeaderboardItem[];
}

export interface LeaderboardResponse {
  message: string;
  lastUpdatedAt: string;
  leaderboards: LeaderboardLists;
}

export interface LeaderboardsFetchResult {
  success: boolean;
  message?: string;
  data?: LeaderboardResponse;
}

export interface AnalyseResponse {
  success: boolean;
  message?: string;
  data?: AnalysisSubmissionResponse;
}

export async function sendJsonForAnalysis(
  email: string,
  file: File
): Promise<AnalyseResponse> {
  try {
    const formData = new FormData();

    formData.append("email", email);
    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/analyses`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error occurred",
    };
  }
}

export async function fetchAnalysisByResultToken(
  resultToken: string
): Promise<{ success: boolean; message?: string; data?: AnalysisLookupResponse }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/analyses/${encodeURIComponent(resultToken)}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error occurred",
    };
  }
}

export async function fetchLeaderboards(forceRefresh = false): Promise<LeaderboardsFetchResult> {
  try {
    const query = forceRefresh ? "?forceRefresh=true" : "";
    const response = await fetch(`${API_BASE_URL}/leaderboards${query}`);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error occurred",
    };
  }
}

export async function submitRepoAnalysis(
  owner: string,
  repo: string
): Promise<AnalyseResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/analyses/repository`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owner, repo }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error occurred",
    };
  }
}
