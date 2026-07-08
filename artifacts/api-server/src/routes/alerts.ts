import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { agentSignalsTable, alertsTable, fixturesTable } from "@workspace/db";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import {
  deriveAlertConfidenceBand,
  isAlertSuppressedByFeedHealth,
  isLiveEligibleFixture,
  isPrematchEligibleFixture,
  isSignalFresh,
  shouldDegradeAlertConfidence,
} from "./lib/alerting";

const router = Router();

type AlertRecord = typeof alertsTable.$inferSelect;
type FixtureRecord = typeof fixturesTable.$inferSelect;
type AgentSignalRecord = typeof agentSignalsTable.$inferSelect;

type AlertSignalSummary = {
  id: number;
  fixtureId: number;
  ts: number;
  agentName: string;
  signalType: string;
  confidence: number;
};

type AlertResponse = {
  id: number;
  userId: string | null;
  fixtureId: number;
  ts: number;
  edgeScore: number;
  narration: string | null;
  action: string;
  fired: boolean;
  lifecycleState: string | null;
  feedHealth: string | null;
  confidenceBand: string | null;
  suppressed: boolean;
  suppressionReason: string | null;
  hasFreshSignalSupport: boolean;
  latestFreshSignalTs: number | null;
  recentSignals: AlertSignalSummary[];
  fixture: {
    fixtureId: number;
    homeTeam: string;
    awayTeam: string;
    competition: string;
    status: string;
    kickoffTs: number;
    monitoringState: string;
    feedHealth: string;
    lastSuccessfulIngestAt: string | null;
  } | null;
};

type AlertMonitoringStats = {
  suppressedFeedError: number;
  downgradedFeedHealth: number;
  ignoredInactiveFixture: number;
  interpretedPrematch: number;
  interpretedLive: number;
  liveWithoutFreshSignals: number;
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isHealthAlertAction(action: string | null | undefined): boolean {
  return (action ?? "").toUpperCase().includes("HEALTH");
}

function getEffectiveLifecycleState(
  alert: Pick<AlertRecord, "lifecycleState">,
  fixture: FixtureRecord | null | undefined,
): string | null {
  return alert.lifecycleState ?? fixture?.monitoringState ?? null;
}

function getEffectiveFeedHealth(
  alert: Pick<AlertRecord, "feedHealth">,
  fixture: FixtureRecord | null | undefined,
): string | null {
  return alert.feedHealth ?? fixture?.feedHealth ?? null;
}

function isPrematchLifecycleState(lifecycleState: string | null): boolean {
  return lifecycleState === "prematch" || isPrematchEligibleFixture({ monitoringState: lifecycleState });
}

function isLiveLifecycleState(lifecycleState: string | null): boolean {
  return isLiveEligibleFixture({ monitoringState: lifecycleState });
}

function createMonitoringStats(): AlertMonitoringStats {
  return {
    suppressedFeedError: 0,
    downgradedFeedHealth: 0,
    ignoredInactiveFixture: 0,
    interpretedPrematch: 0,
    interpretedLive: 0,
    liveWithoutFreshSignals: 0,
  };
}

function buildFreshSignalMap(signals: AgentSignalRecord[]): Map<number, AlertSignalSummary[]> {
  const latestFreshSignalByAgent = new Map<number, Map<string, AlertSignalSummary>>();

  for (const signal of signals) {
    if (!isSignalFresh(signal.ts)) {
      continue;
    }

    let signalMap = latestFreshSignalByAgent.get(signal.fixtureId);
    if (!signalMap) {
      signalMap = new Map<string, AlertSignalSummary>();
      latestFreshSignalByAgent.set(signal.fixtureId, signalMap);
    }

    if (signalMap.has(signal.agentName)) {
      continue;
    }

    signalMap.set(signal.agentName, {
      id: signal.id,
      fixtureId: signal.fixtureId,
      ts: signal.ts,
      agentName: signal.agentName,
      signalType: signal.signalType,
      confidence: Number.parseFloat(signal.confidence),
    });
  }

  return new Map(
    [...latestFreshSignalByAgent.entries()].map(([fixtureId, signalMap]) => [
      fixtureId,
      [...signalMap.values()].sort((a, b) => b.ts - a.ts),
    ]),
  );
}

async function loadAlertContext(alerts: AlertRecord[]) {
  const fixtureIds = [...new Set(alerts.map((alert) => alert.fixtureId))];
  if (fixtureIds.length === 0) {
    return {
      fixtureMap: new Map<number, FixtureRecord>(),
      freshSignalMap: new Map<number, AlertSignalSummary[]>(),
    };
  }

  const [fixtures, signals] = await Promise.all([
    db.select().from(fixturesTable).where(inArray(fixturesTable.fixtureId, fixtureIds)),
    db
      .select()
      .from(agentSignalsTable)
      .where(inArray(agentSignalsTable.fixtureId, fixtureIds))
      .orderBy(desc(agentSignalsTable.ts)),
  ]);

  return {
    fixtureMap: new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture])),
    freshSignalMap: buildFreshSignalMap(signals),
  };
}

function mapFixtureSummary(fixture: FixtureRecord | null | undefined): AlertResponse["fixture"] {
  if (!fixture) {
    return null;
  }

  return {
    fixtureId: fixture.fixtureId,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    competition: fixture.competition,
    status: fixture.status,
    kickoffTs: fixture.kickoffTs,
    monitoringState: fixture.monitoringState,
    feedHealth: fixture.feedHealth,
    lastSuccessfulIngestAt: fixture.lastSuccessfulIngestAt?.toISOString() ?? null,
  };
}

function enrichAlert(args: {
  alert: AlertRecord;
  fixture: FixtureRecord | null | undefined;
  recentSignals: AlertSignalSummary[];
  stats?: AlertMonitoringStats;
}): AlertResponse {
  const { alert, fixture, recentSignals, stats } = args;
  const lifecycleState = getEffectiveLifecycleState(alert, fixture);
  const feedHealth = getEffectiveFeedHealth(alert, fixture);
  const isPrematch = isPrematchLifecycleState(lifecycleState);
  const isLive = isLiveLifecycleState(lifecycleState);
  const isHealthAlert = isHealthAlertAction(alert.action);

  let suppressed = false;
  let suppressionReason: string | null = null;

  if (!isHealthAlert && isAlertSuppressedByFeedHealth({ feedHealth })) {
    suppressed = true;
    suppressionReason = "feed_error";
    stats?.suppressedFeedError++;
  } else if (!isHealthAlert && !isPrematch && !isLive) {
    suppressed = true;
    suppressionReason = "fixture_inactive";
    stats?.ignoredInactiveFixture++;
  }

  if (isPrematch) {
    stats?.interpretedPrematch++;
  }

  if (isLive) {
    stats?.interpretedLive++;
    if (recentSignals.length === 0) {
      stats?.liveWithoutFreshSignals++;
    }
  }

  let confidenceBand = alert.confidenceBand ?? deriveAlertConfidenceBand({
    fixture: { feedHealth },
    edgeScore: alert.edgeScore,
  });

  if (!suppressed && shouldDegradeAlertConfidence({ feedHealth })) {
    if (confidenceBand !== "degraded") {
      stats?.downgradedFeedHealth++;
    }
    confidenceBand = "degraded";
  }

  return {
    id: alert.id,
    userId: alert.userId,
    fixtureId: alert.fixtureId,
    ts: alert.ts,
    edgeScore: alert.edgeScore,
    narration: alert.narration,
    action: alert.action,
    fired: alert.fired,
    lifecycleState,
    feedHealth,
    confidenceBand,
    suppressed,
    suppressionReason,
    hasFreshSignalSupport: recentSignals.length > 0,
    latestFreshSignalTs: recentSignals[0]?.ts ?? null,
    recentSignals,
    fixture: mapFixtureSummary(fixture),
  };
}

function logAlertMonitoringSummary(
  req: Request,
  route: string,
  stats: AlertMonitoringStats,
  totalAlerts: number,
  returnedAlerts: number,
) {
  const activityCount =
    stats.suppressedFeedError +
    stats.downgradedFeedHealth +
    stats.ignoredInactiveFixture +
    stats.interpretedPrematch +
    stats.interpretedLive +
    stats.liveWithoutFreshSignals;

  if (activityCount === 0) {
    return;
  }

  req.log.info(
    {
      route,
      totalAlerts,
      returnedAlerts,
      suppressedDueToFeedError: stats.suppressedFeedError,
      downgradedDueToFeedHealth: stats.downgradedFeedHealth,
      ignoredInactiveFixtures: stats.ignoredInactiveFixture,
      interpretedPrematch: stats.interpretedPrematch,
      interpretedLive: stats.interpretedLive,
      liveWithoutFreshSignals: stats.liveWithoutFreshSignals,
    },
    "alert monitoring decisions",
  );
}

router.get("/alerts", async (req, res) => {
  try {
    const fixtureId = typeof req.query.fixtureId === "string" ? req.query.fixtureId : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
    const lifecycleState =
      typeof req.query.lifecycleState === "string" ? req.query.lifecycleState : undefined;
    const feedHealth = typeof req.query.feedHealth === "string" ? req.query.feedHealth : undefined;
    const confidenceBand =
      typeof req.query.confidenceBand === "string" ? req.query.confidenceBand : undefined;
    const conditions: SQL[] = [];
    let query = db.select().from(alertsTable).$dynamic();

    if (fixtureId) {
      conditions.push(eq(alertsTable.fixtureId, parseInt(fixtureId, 10)));
    }
    if (action) {
      conditions.push(eq(alertsTable.action, action));
    }

    if (conditions.length === 1) {
      query = query.where(conditions[0]!);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const lim = parsePositiveInt(limit, 50);
    const needsPostFilter = Boolean(lifecycleState || feedHealth || confidenceBand);
    const alerts = needsPostFilter
      ? await query.orderBy(desc(alertsTable.ts))
      : await query.orderBy(desc(alertsTable.ts)).limit(lim);

    const { fixtureMap, freshSignalMap } = await loadAlertContext(alerts);
    const stats = createMonitoringStats();
    const enrichedAlerts = alerts.map((alert) =>
      enrichAlert({
        alert,
        fixture: fixtureMap.get(alert.fixtureId),
        recentSignals: freshSignalMap.get(alert.fixtureId) ?? [],
        stats,
      }),
    );

    const filteredAlerts = enrichedAlerts
      .filter((alert) => {
        if (lifecycleState && alert.lifecycleState !== lifecycleState) {
          return false;
        }
        if (feedHealth && alert.feedHealth !== feedHealth) {
          return false;
        }
        if (confidenceBand && alert.confidenceBand !== confidenceBand) {
          return false;
        }
        return true;
      })
      .slice(0, lim);

    logAlertMonitoringSummary(req, "/alerts", stats, alerts.length, filteredAlerts.length);
    res.json(filteredAlerts);
  } catch (err) {
    req.log.error({ err }, "listAlerts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/alerts/:alertId", async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId, 10);
    const [alert] = await db.select().from(alertsTable).where(eq(alertsTable.id, alertId));
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    const { fixtureMap, freshSignalMap } = await loadAlertContext([alert]);
    const stats = createMonitoringStats();
    const response = enrichAlert({
      alert,
      fixture: fixtureMap.get(alert.fixtureId),
      recentSignals: freshSignalMap.get(alert.fixtureId) ?? [],
      stats,
    });

    logAlertMonitoringSummary(req, "/alerts/:alertId", stats, 1, 1);
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "getAlert error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
