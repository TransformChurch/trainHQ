import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import path from "path";

const rootEnvFile = [path.resolve(process.cwd(), "../../.env"), path.resolve(process.cwd(), ".env")]
  .find(existsSync);
if (rootEnvFile) process.loadEnvFile(rootEnvFile);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
