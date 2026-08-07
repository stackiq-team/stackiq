import { Router, Request, Response } from "express";
import { getAnalysisQueueStatus } from "../../queue/analysisQueue";

const router = Router();

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await getAnalysisQueueStatus();
    return res.status(200).json({ message: "Success", status });
  } catch (error: any) {
    console.error("[backend] Queue status lookup failed:", error);
    return res.status(500).json({
      message: error.message || "Unable to load queue status.",
    });
  }
});

export default router;
