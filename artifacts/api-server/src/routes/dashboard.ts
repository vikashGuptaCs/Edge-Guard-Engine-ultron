import { Router } from "express";
import { db } from "@workspace/db";
import { fixturesTable, alertsTable, agentSignalsTable, oddsSnapshotsTable } from "@workspace/db";
import { desc, count, eq, inArray, and, gte, sql, like } from "drizzle-orm";

const router = Router();

function computeCountdownMs(kickoffTs?: number | null) {
  if (!kickoffTs) return null;
  return Math.max(0, kickoffTs - Date.now());
}

function computeDataFreshnessMs(lastSuccessfulIngestAt?: string | Date | null) {
  if (!lastSuccessfulIngestAt) return null;
  return Math.max(0, Date.now() - new Date(lastSuccessfulIngestAt).getTime());
}

function isLiveMonitoringState(monitoringState?: string | null) {
  return monitoringState === "live" || monitoringState === "halftime";
}

function isFinishedMonitoringState(monitoringState?: string | null) {
  return monitoringState === "finished" || monitoringState === "archived";
}

function pickPrimaryMarketRow<T extends { market: string; selection: string; ts: number }>(
  rows: T[],
): T | null {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.market}:${row.selection}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  let best: T[] = [];
  for (const arr of groups.values()) {
    if (arr.length > best.length) best = arr;
  }
  return best.length > 0 ? best[0] : null; // rows are already ordered desc(ts)
}

router.get("/dashboard/summary", async (req, res) => {
  try {
    const [activeFixtures] = await db
      .select({ count: count() })
      .from(fixturesTable)
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]));

    const [totalAlerts] = await db
      .select({ count: count() })
      .from(alertsTable);

    const startOfDayTs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

    const [executedToday] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(and(eq(alertsTable.action, "EXECUTE"), gte(alertsTable.ts, startOfDayTs)));

    const [vetoedToday] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(and(like(alertsTable.action, "VETO%"), gte(alertsTable.ts, startOfDayTs)));

    const oneHourAgoTs = Date.now() - 60 * 60 * 1000;
    const [alertsLastHour] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(gte(alertsTable.ts, oneHourAgoTs));

    const [avgEdgeRow] = await db
      .select({ avg: sql<string>`avg(${fixturesTable.currentEdgeScore})` })
      .from(fixturesTable)
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]));

    const latestFixture = await db
      .select()
      .from(fixturesTable)
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]))
      .limit(1);

    res.json({
      activeFixtures: Number(activeFixtures?.count ?? 0),
      totalAlerts: Number(totalAlerts?.count ?? 0),
      executedToday: Number(executedToday?.count ?? 0),
      vetoedToday: Number(vetoedToday?.count ?? 0),
      avgEdgeScore: avgEdgeRow?.avg != null ? Number(avgEdgeRow.avg) : null,
      feedLatencyMs: latestFixture[0]?.feedLatencyMs ?? null,
      monitoringState: latestFixture[0]?.monitoringState ?? null,
      feedHealth: latestFixture[0]?.feedHealth ?? null,
      lastSuccessfulIngestAt: latestFixture[0]?.lastSuccessfulIngestAt?.toISOString() ?? null,
      dataFreshnessMs: computeDataFreshnessMs(latestFixture[0]?.lastSuccessfulIngestAt),
      isLive: isLiveMonitoringState(latestFixture[0]?.monitoringState),
      isFinished: isFinishedMonitoringState(latestFixture[0]?.monitoringState),
      activeAgents: 5,
      alertsPerHour: Number(alertsLastHour?.count ?? 0),
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
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]))
      .orderBy(desc(fixturesTable.kickoffTs))
      .limit(10);

    const ticker = await Promise.all(liveFixtures.map(async (f) => {
      const [latestSignal] = await db
        .select()
        .from(agentSignalsTable)
        .where(eq(agentSignalsTable.fixtureId, f.fixtureId))
        .orderBy(desc(agentSignalsTable.ts))
        .limit(1);

      const hasEdgeScore = f.currentEdgeScore != null;
      const edgeScore = f.currentEdgeScore ?? 50; // neutral placeholder, never random
      const action =
        f.feedHealth === "degraded" || f.feedHealth === "error"
          ? "VETO_FEED"
          : edgeScore >= 80
          ? "EXECUTE"
          : edgeScore >= 60
          ? "MONITORING"
          : "HOLD";
      const isLive = isLiveMonitoringState(f.monitoringState);
      const isFinished = isFinishedMonitoringState(f.monitoringState);

      return {
        fixtureId: f.fixtureId,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        homeScore: f.homeScore ?? 0,
        awayScore: f.awayScore ?? 0,
        minutePlayed: f.minutePlayed ?? 0,
        edgeScore,
        hasEdgeScore,
        action,
        latencyMs: f.feedLatencyMs ?? 42,
        topSignal: latestSignal?.signalType ?? null,
        monitoringState: f.monitoringState ?? null,
        feedHealth: f.feedHealth ?? null,
        lastSuccessfulIngestAt: f.lastSuccessfulIngestAt?.toISOString() ?? null,
        countdownMs: isLive || isFinished ? null : computeCountdownMs(Number(f.kickoffTs)),
        isLive,
        isFinished,
        dataFreshnessMs: computeDataFreshnessMs(f.lastSuccessfulIngestAt),
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
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]))
      .orderBy(desc(fixturesTable.kickoffTs))
      .limit(20);

    const grid = await Promise.all(liveFixtures.map(async (f) => {
      const recentOdds = await db
        .select()
        .from(oddsSnapshotsTable)
        .where(eq(oddsSnapshotsTable.fixtureId, f.fixtureId))
        .orderBy(desc(oddsSnapshotsTable.ts))
        .limit(50);
      const latestOdds = pickPrimaryMarketRow(recentOdds);

      const [latestSignal] = await db
        .select()
        .from(agentSignalsTable)
        .where(eq(agentSignalsTable.fixtureId, f.fixtureId))
        .orderBy(desc(agentSignalsTable.ts))
        .limit(1);

      const spread = latestOdds ? parseFloat(latestOdds.spread) : 0.04;
      const latencyMs = f.feedLatencyMs ?? 42;
      const edgeScore = f.currentEdgeScore ?? 70;
      const isLive = isLiveMonitoringState(f.monitoringState);
      const isFinished = isFinishedMonitoringState(f.monitoringState);

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
        monitoringState: f.monitoringState ?? null,
        feedHealth: f.feedHealth ?? null,
        lastSuccessfulIngestAt: f.lastSuccessfulIngestAt?.toISOString() ?? null,
        countdownMs: isLive || isFinished ? null : computeCountdownMs(Number(f.kickoffTs)),
        isLive,
        isFinished,
        dataFreshnessMs: computeDataFreshnessMs(f.lastSuccessfulIngestAt),
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
