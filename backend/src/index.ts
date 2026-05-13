import express from "express";
import cors from "cors";
import { connectDB } from "./db/client";
import { runMigrations } from "./db/migrate";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

async function start() {

    //Connect to db and run new migrations before starting the server
    await connectDB();
    await runMigrations();

    app.listen(4000, () => {
        console.log("Backend running on http://localhost:4000");
    });
}

start();