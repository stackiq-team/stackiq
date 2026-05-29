import express from "express";
import cors from "cors";
import { connectDB } from "./db/client";
import stackRoutes from "./api/route/stack";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/stack", stackRoutes);
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

async function start() {

    await connectDB();

    app.listen(4000, () => {
        console.log("Backend running on http://localhost:4000");
    });
}

start();

export default app;
