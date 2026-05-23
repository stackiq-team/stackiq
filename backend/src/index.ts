import express from "express";
import cors from "cors";
import { connectDB } from "./db/client";

const app = express();

app.use(cors());
app.use(express.json());

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
