import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env" });
config({ path: "../.env", override: false });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env["DATABASE_URL"] ||
      "postgresql://postgres:postgres@localhost:55432/stackiq?schema=public",
  },
});
