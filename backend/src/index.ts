import { app } from "./app";
import { connectDB } from "./db/client";

async function start() {
    await connectDB();
    app.listen(4000, () => {
        console.log("Backend running on http://localhost:4000");
    });
}

start();