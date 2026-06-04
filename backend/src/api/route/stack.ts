import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../../db/client";
import { DependencyType } from "../../generated/prisma/enums";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.post(
  "/create",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const email = req.body.email as string;
      const file = req.file;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!file) {
        return res.status(400).json({ message: "File is required" });
      }

      const jsonContent = JSON.parse(file.buffer.toString());
      const dependencies = jsonContent.dependencies || {};
      const devDependencies = jsonContent.devDependencies || {};

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
      await prisma.analysis.create({
        data: {
          stackId: stack.id, // must be a valid Stack UUID
          status: "PENDING",
        },
      });

      return res.status(200).json({
        message: "Success",
        stack,
      });
    } catch (error:any) {
      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

export default router;