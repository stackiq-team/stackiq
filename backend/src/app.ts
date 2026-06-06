import express from "express";
import cors from "cors";
import { prisma } from "./db/client";
import { redis } from "./redis/client";
import analysisRoutes from "./api/route/analyses";

export const app = express();

app.use(cors());
app.use(express.json());
app.use("/analyses", analysisRoutes);

app.get("/health", async (req, res) => {
    const health: Record<string, string> = { status: "ok" };

    try {
        await prisma.$queryRaw`SELECT 1`
        health.postgres = "ok"
    } catch {
        health.postgres = "error"
        health.status = "degraded"
    }

    try {
        await redis.ping()
        health.redis = "ok"
    } catch {
        health.redis = "error"
        health.status = "degraded"
    }

    res.json(health);
});
