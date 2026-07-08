import app from "./app";
import { logger } from "./lib/logger";
import { startTxlinePoller, stopTxlinePoller } from "./txline-poller";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  // The poller stays on the existing boot path: start after HTTP listen succeeds.
  logger.info({ port }, "Server listening");
  startTxlinePoller();
});

function shutdown(signal: string) {
  logger.info(
    { signal },
    "Shutting down server; /health exposes poller liveness while the process is running, but host sleep still pauses ingestion",
  );
  stopTxlinePoller();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error while closing server");
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
