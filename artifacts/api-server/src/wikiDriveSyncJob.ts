import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnvFile = [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]
  .find(existsSync);
if (rootEnvFile) process.loadEnvFile(rootEnvFile);

const { runWikiDriveSync } = await import("./lib/wikiDriveSync");
const { logger } = await import("./lib/logger");

try {
  const summary = await runWikiDriveSync();
  logger.info({ summary }, "Wiki Drive scheduled sync completed");
  process.exitCode = 0;
} catch (error) {
  logger.error({ error }, "Wiki Drive scheduled sync failed");
  process.exitCode = 1;
}