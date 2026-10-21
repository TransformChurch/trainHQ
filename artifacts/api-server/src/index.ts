import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./lib/logger";

const rootEnvFile = [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]
  .find(existsSync);
if (rootEnvFile) process.loadEnvFile(rootEnvFile);

const { default: app } = await import("./app");
const { startDocumentPdfIndexer } = await import("./lib/documentPdfSearch");
startDocumentPdfIndexer();
const { startWikiDriveScheduler } = await import("./lib/wikiDriveSync");
startWikiDriveScheduler();
const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Keep the Worker's copy of the Weekly Pulse send times current after every
  // deploy/restart (lib/pulseSchedule.ts). Best-effort.
  import("./lib/pulseSchedule")
    .then(({ publishPulseSchedule }) => publishPulseSchedule())
    .then((result) => logger.info(result, "Weekly Pulse schedule published"))
    .catch((error) => logger.error({ err: error }, "Could not publish the Weekly Pulse schedule"));
});
