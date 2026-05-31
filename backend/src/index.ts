import express from "express";
import cors from "cors";
import { connectDB, prisma } from "./db/client";
import { redis } from "./redis/client";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
    const health: Record<string, string> = { status: "ok" };

    // Check Postgres
    try {
        await prisma.$queryRaw`SELECT 1`
        health.postgres = "ok"
    } catch {
        health.postgres = "error"
        health.status = "degraded"
    }

    // Check Redis
    try {
        await redis.ping()
        health.redis = "ok"
    } catch {
        health.redis = "error"
        health.status = "degraded"
    }

    res.json(health);
});

async function start() {

    await connectDB();

    app.listen(4000, () => {
        console.log("Backend running on http://localhost:4000");
    });
}

start();
