import https from "https";
import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../../db/client";
import { AnalysisStatus, DependencyType } from "../../generated/prisma/enums";
import { enqueueAnalysisJob } from "../../queue/analysisQueue";

const router = Router();

type DependencyInput = {
  name: string;
  versionRequirement: string;
  type: DependencyType;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024,
  },
});

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const repositoryPackageJsonQuery = `
  query RepositoryPackageJson($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: "HEAD:package.json") {
        ... on Blob {
          text
        }
      }
    }
  }
`;

function getGitHubToken(): string {
  const token = process.env.GITHUB_API_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is required to fetch repository package.json.");
  }
  return token;
}

async function fetchRepositoryPackageJson(owner: string, name: string): Promise<string> {
  const body = JSON.stringify({
    query: repositoryPackageJsonQuery,
    variables: { owner, name },
  });
  const token = getGitHubToken();

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      GITHUB_GRAPHQL_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "stackiq-backend",
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode == null || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub request failed ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const payload = JSON.parse(data) as {
              data?: {
                repository?: {
                  object?: { text?: string } | null;
                } | null;
              };
              errors?: Array<{ message: string }>;
            };

            if (payload.errors?.length) {
              reject(new Error(payload.errors.map((error) => error.message).join("; ")));
              return;
            }

            const text = payload.data?.repository?.object?.text;
            if (!text) {
              reject(new Error("package.json not found in repository root."));
              return;
            }

            resolve(text);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseDependencies(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((result, [key, item]) => {
    if (typeof key === "string" && (typeof item === "string" || typeof item === "number")) {
      result[key] = String(item);
    }
    return result;
  }, {});
}

function buildDependencyRecords(
  dependencies: unknown,
  devDependencies: unknown
): DependencyInput[] {
  const parsedDependencies = parseDependencies(dependencies);
  const parsedDevDependencies = parseDependencies(devDependencies);

  return [
    ...Object.entries(parsedDependencies).map(([name, version]) => ({
      name,
      versionRequirement: version,
      type: DependencyType.DEPENDENCY,
    })),
    ...Object.entries(parsedDevDependencies).map(([name, version]) => ({
      name,
      versionRequirement: version,
      type: DependencyType.DEV_DEPENDENCY,
    })),
  ];
}

router.post("/repository", async (req: Request, res: Response) => {
  const owner = typeof req.body.owner === "string" ? req.body.owner.trim() : "";
  const repo = typeof req.body.repo === "string" ? req.body.repo.trim() : "";
  const providedEmail = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const email = providedEmail.length > 0 ? providedEmail : null;

  if (!owner || !repo) {
    return res.status(400).json({ message: "Owner and repo are required." });
  }

  try {
    const packageJsonText = await fetchRepositoryPackageJson(owner, repo);
    const packageJson = JSON.parse(packageJsonText);
    const dependencyRecords = buildDependencyRecords(packageJson.dependencies, packageJson.devDependencies);

    if (dependencyRecords.length === 0) {
      return res.status(400).json({ message: "package.json must contain dependencies or devDependencies." });
    }

    const analysis = await prisma.analysis.create({
      data: {
        email,
        status: AnalysisStatus.PENDING,
        dependencies: {
          create: dependencyRecords,
        },
      },
      include: {
        dependencies: true,
      },
    });

    await enqueueAnalysisJob({
      analysisId: analysis.id,
      email: email ?? undefined,
      owner,
      repo,
    });

    return res.status(200).json({ message: "Success", analysis });
  } catch (error: any) {
    console.error("[backend] Repository analysis create failed:", error);
    return res.status(500).json({ message: error.message || "Unable to create repository analysis." });
  }
});

router.get("/:resultToken", async (req: Request, res: Response) => {
  const startedAt = Date.now();

  try {
    const resultTokenRaw = req.params.resultToken;
    const resultToken = Array.isArray(resultTokenRaw)
      ? resultTokenRaw[0]
      : resultTokenRaw;

    if (!resultToken) {
      return res.status(400).json({ message: "Result token is required" });
    }

    const analysis = await prisma.analysis.findUnique({
      where: { resultToken },
      include: {
        dependencies: {
          orderBy: { name: "asc" },
        },
        result: {
          include: {
            dependencyScores: {
              include: { dependency: true },
              orderBy: { dependency: { name: "asc" } },
            },
          },
        },
      },
    });

    if (!analysis) {
      console.warn(`[backend] Analysis lookup: token=${resultToken} not found`);
      return res.status(404).json({ message: "Analysis not found" });
    }

    console.log(
      `[backend] Analysis lookup completed: analysisId=${analysis.id}, durationMs=${Date.now() - startedAt}`
    );

    return res.status(200).json({ message: "Success", analysis });
  } catch (error: any) {
    console.error(
      `[backend] Analysis lookup failed after ${Date.now() - startedAt}ms:`,
      error
    );
    return res.status(500).json({ message: error.message });
  }
});

router.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const startedAt = Date.now();

    try {
      const providedEmail = typeof req.body.email === "string" ? req.body.email.trim() : "";
      const email = providedEmail.length > 0 ? providedEmail : null;
      const file = req.file;

      if (!file) {
        console.warn(`[backend] Analysis create rejected for ${email}: missing file`);
        return res.status(400).json({ message: "File is required" });
      }

      console.log(
        `[backend] Analysis create received: email=${email}, file=${file.originalname}, size=${file.size} bytes`
      );

      const jsonContent = JSON.parse(file.buffer.toString());
      const dependencies = jsonContent.dependencies || {};
      const devDependencies = jsonContent.devDependencies || {};
      const dependencyRecords: DependencyInput[] = [
        ...Object.entries(dependencies).map(([name, version]) => ({
          name,
          versionRequirement: String(version),
          type: DependencyType.DEPENDENCY,
        })),
        ...Object.entries(devDependencies).map(([name, version]) => ({
          name,
          versionRequirement: String(version),
          type: DependencyType.DEV_DEPENDENCY,
        })),
      ];
      const dependencyCount = Object.keys(dependencies).length;
      const devDependencyCount = Object.keys(devDependencies).length;

      if (dependencyRecords.length === 0) {
        console.warn(
          `[backend] Analysis create rejected for ${email}: no dependencies found`
        );
        return res.status(400).json({
          message: "package.json must contain dependencies or devDependencies.",
        });
      }

      console.log(
        `[backend] Parsed package.json for ${email}: dependencies=${dependencyCount}, devDependencies=${devDependencyCount}`
      );

      const analysis = await prisma.analysis.create({
        data: {
          email,
          status: AnalysisStatus.PENDING,
          dependencies: {
            create: dependencyRecords,
          },
        },
        include: {
          dependencies: true,
        },
      });

      console.log(
        `[backend] Analysis created: analysisId=${analysis.id}, status=${analysis.status}, dependencyRecords=${analysis.dependencies.length}`
      );

      const job = await enqueueAnalysisJob({
        analysisId: analysis.id,
        email: analysis.email || undefined,
      });

      console.log(
        `[backend] Analysis queued: analysisId=${analysis.id}, jobId=${job.id}`
      );

      console.log(
        `[backend] Analysis create completed: analysisId=${analysis.id}, durationMs=${Date.now() - startedAt}`
      );

      return res.status(200).json({
        message: "Success",
        analysis,
      });
    } catch (error:any) {
      console.error(
        `[backend] Analysis create failed after ${Date.now() - startedAt}ms:`,
        error
      );

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

export default router;
