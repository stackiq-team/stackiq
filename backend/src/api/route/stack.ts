import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../../db/client";
import { AnalysisStatus, DependencyType } from "../../generated/prisma/enums";
import { enqueueAnalysisJob } from "../../queue/analysisQueue";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.post(
  "/create",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const startedAt = Date.now();

    try {
      const email = req.body.email as string;
      const file = req.file;

      if (!email) {
        console.warn("[backend] Stack create rejected: missing email");
        return res.status(400).json({ message: "Email is required" });
      }

      if (!file) {
        console.warn(`[backend] Stack create rejected for ${email}: missing file`);
        return res.status(400).json({ message: "File is required" });
      }

      console.log(
        `[backend] Stack create received: email=${email}, file=${file.originalname}, size=${file.size} bytes`
      );

      const jsonContent = JSON.parse(file.buffer.toString());
      const dependencies = jsonContent.dependencies || {};
      const devDependencies = jsonContent.devDependencies || {};
      const dependencyCount = Object.keys(dependencies).length;
      const devDependencyCount = Object.keys(devDependencies).length;

      console.log(
        `[backend] Parsed package.json for ${email}: dependencies=${dependencyCount}, devDependencies=${devDependencyCount}`
      );

      const stack = await prisma.stack.create({
        data: {
          name: email,
          dependencies: {
            create: [
              // dependencies
              ...Object.entries(dependencies).map(([name, version]) => ({
                name,
                versionRequirement: version as string,
                type: DependencyType.DEPENDENCY,
              })),

              // devDependencies
              ...Object.entries(devDependencies).map(([name, version]) => ({
                name,
                versionRequirement: version as string,
                type: DependencyType.DEV_DEPENDENCY,
              })),
            ],
          },
        },
        include: {
          dependencies: true,
        },
      });

      console.log(
        `[backend] Stack created: stackId=${stack.id}, dependencyRecords=${stack.dependencies.length}`
      );

      const analysis = await prisma.analysis.create({
        data: {
          stackId: stack.id,
          status: AnalysisStatus.PENDING,
        },
      });

      console.log(
        `[backend] Analysis created: analysisId=${analysis.id}, stackId=${stack.id}, status=${analysis.status}`
      );

      await enqueueAnalysisJob({
        analysisId: analysis.id,
        stackId: stack.id,
      });

      console.log(
        `[backend] Stack create completed: analysisId=${analysis.id}, durationMs=${Date.now() - startedAt}`
      );

      return res.status(200).json({
        message: "Success",
        stack,
        analysis,
      });
    } catch (error:any) {
      console.error(
        `[backend] Stack create failed after ${Date.now() - startedAt}ms:`,
        error
      );

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

export default router;
