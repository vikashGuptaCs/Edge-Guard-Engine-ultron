import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fixturesRouter from "./fixtures";
import agentsRouter from "./agents";
import alertsRouter from "./alerts";
import receiptsRouter from "./receipts";
import dashboardRouter from "./dashboard";
import txlineRouter from "./txline";
import narrateRouter from "./narrate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fixturesRouter);
router.use(agentsRouter);
router.use(alertsRouter);
router.use(receiptsRouter);
router.use(dashboardRouter);
router.use(txlineRouter);
router.use(narrateRouter);

export default router;
