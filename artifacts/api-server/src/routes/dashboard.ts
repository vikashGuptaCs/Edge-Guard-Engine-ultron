import { Router } from "express";
import { db } from "@workspace/db";
import { fixturesTable, alertsTable, agentSignalsTable, oddsSnapshotsTable, riskMetricsTable } from "@workspace/db";
import { eq, desc, gte, count, avg } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - 86400000;

    const [activeFixtures] = await db
      .select({ count: count() })
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "live"));

    const [totalAlerts] = await db
      .select({ count: count() })
      .from(alertsTable);

    const [executedToday] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(eq(alertsTable.action, "EXECUTE"));

    const [vetoedToday] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(eq(alertsTable.fired, true));

    const latestFixture = await db
      .select()
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "live"))
      .limit(1);

    res.json({
      activeFixtures: Number(activeFixtures?.count ?? 0),
      totalAlerts: Number(totalAlerts?.count ?? 0),
      executedToday: Number(executedToday?.count ?? 0),
      vetoedToday: Number(vetoedToday?.count ?? 0),
      avgEdgeScore: 73.4,
      feedLatencyMs: latestFixture[0]?.feedLatencyMs ?? 42,
      activeAgents: 5,
      alertsPerHour: 3.2,
    });
  } catch (err) {
    req.log.error({ err }, "getDashboardSummary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/live-ticker", async (req, res) => {
  try {
    const liveFixtures = await db
      .select()
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "live"))
      .orderBy(desc(fixturesTable.kickoffTs))
      .limit(10);

    const ticker = await Promise.all(liveFixtures.map(async (f) => {
      const [latestSignal] = await db
        .select()
        .from(agentSignalsTable)
        .where(eq(agentSignalsTable.fixtureId, f.fixtureId))
        .orderBy(desc(agentSignalsTable.ts))
        .limit(1);

      const edgeScore = f.currentEdgeScore ?? Math.floor(Math.random() * 40) + 50;
      const action = edgeScore >= 80 ? "EXECUTE" : edgeScore >= 60 ? "MONITORING" : "HOLD";

      return {
        fixtureId: f.fixtureId,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        homeScore: f.homeScore ?? 0,
        awayScore: f.awayScore ?? 0,
        minutePlayed: f.minutePlayed ?? 0,
        edgeScore,
        action,
        latencyMs: f.feedLatencyMs ?? 42,
        topSignal: latestSignal?.signalType ?? null,
      };
    }));

    res.json(ticker);
  } catch (err) {
    req.log.error({ err }, "getLiveTicker error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/risk-grid", async (req, res) => {
  try {
    const liveFixtures = await db
      .select()
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "live"))
      .orderBy(desc(fixturesTable.kickoffTs))
      .limit(20);

    const grid = await Promise.all(liveFixtures.map(async (f) => {
      const [latestOdds] = await db
        .select()
        .from(oddsSnapshotsTable)
        .where(eq(oddsSnapshotsTable.fixtureId, f.fixtureId))
        .orderBy(desc(oddsSnapshotsTable.ts))
        .limit(1);

      const [latestSignal] = await db
        .select()
        .from(agentSignalsTable)
        .where(eq(agentSignalsTable.fixtureId, f.fixtureId))
        .orderBy(desc(agentSignalsTable.ts))
        .limit(1);

      const spread = latestOdds ? parseFloat(latestOdds.spread) : 0.04;
      const latencyMs = f.feedLatencyMs ?? 42;
      const edgeScore = f.currentEdgeScore ?? 70;

      const volatilityRisk = spread > 0.12 ? "CRITICAL" : spread > 0.08 ? "HIGH" : spread > 0.04 ? "MEDIUM" : "LOW";
      const sentinelStatus = latencyMs > 10000 ? "CIRCUIT_BREAKER" : latentSignalCheck(latestSignal?.signalType) ? "TOXIC_FLOW" : "CLEAR";
      const recommendation = edgeScore >= 80 && sentinelStatus === "CLEAR" && volatilityRisk !== "CRITICAL" ? "EXECUTE" : sentinelStatus !== "CLEAR" ? "VETO_LATENCY" : volatilityRisk === "CRITICAL" ? "VETO_SLIPPAGE" : "HOLD";

      return {
        fixtureId: f.fixtureId,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        spread,
        latencyMs,
        volatilityRisk,
        sentinelStatus,
        edgeScore,
        recommendation,
      };
    }));

    res.json(grid);
  } catch (err) {
    req.log.error({ err }, "getRiskGrid error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function latentSignalCheck(signalType?: string): boolean {
  return signalType === "TOXIC_FLOW" || signalType === "CIRCUIT_BREAKER";
}

export default router;
