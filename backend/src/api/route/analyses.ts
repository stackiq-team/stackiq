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

router.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const startedAt = Date.now();

    try {
      const email = req.body.email as string;
      const file = req.file;

      if (!email) {
        console.warn("[backend] Analysis create rejected: missing email");
        return res.status(400).json({ message: "Email is required" });
      }

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
