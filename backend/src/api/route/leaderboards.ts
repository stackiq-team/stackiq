import { Router, Request, Response } from "express";
import { getLeaderboards } from "../../services/leaderboardService";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.forceRefresh === "true";
    const leaderboardData = await getLeaderboards(forceRefresh);
    return res.status(200).json({ message: "Success", ...leaderboardData });
  } catch (error: any) {
    console.error("[backend] Leaderboards request failed:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
});

export default router;
