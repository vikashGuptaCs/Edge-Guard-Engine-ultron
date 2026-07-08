import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getTxlinePollerRuntimeState } from "./txline-poller";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  const poller = getTxlinePollerRuntimeState();
  const nowIso = new Date().toISOString();
  const now = Date.now();
  const lastFinished = poller.lastCycleFinishedAt
    ? new Date(poller.lastCycleFinishedAt).getTime()
    : null;
  const stale = lastFinished == null ? false : now - lastFinished > 60_000;
  const degraded =
    stale ||
    !poller.active ||
    poller.lastCycleSucceeded === false ||
    poller.lastCycleError !== null;

  res.status(200).json({
    status: degraded ? "degraded" : "ok",
    stale,
    poller,
    now: nowIso,
  });
});

app.use("/api", router);

export default app;
