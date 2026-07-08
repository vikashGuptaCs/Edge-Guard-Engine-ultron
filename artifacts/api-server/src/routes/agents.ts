import { Router } from "express";
import { db } from "@workspace/db";
import { agentSignalsTable, fixturesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isSignalFresh } from "./lib/alerting";

const AGENT_NAMES = ["Sentinel", "Overreaction", "Volatility", "Pattern", "Orchestrator"];

const router = Router();

router.get("/agents/signals", async (req, res) => {
  try {
    const { agentName, signalType, fixtureId, freshOnly, limit } = req.query;
    const conditions = [];

    if (agentName) {
      conditions.push(eq(agentSignalsTable.agentName, agentName as string));
    }
    if (signalType) {
      conditions.push(eq(agentSignalsTable.signalType, signalType as string));
    }
    if (fixtureId) {
      conditions.push(eq(agentSignalsTable.fixtureId, parseInt(fixtureId as string, 10)));
    }

    let query = db.select().from(agentSignalsTable).$dynamic();
    if (conditions.length === 1) {
      query = query.where(conditions[0]!);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }

    const lim = limit ? parseInt(limit as string) : 50;
    const signals = await query.orderBy(desc(agentSignalsTable.ts)).limit(lim);
    const includeFreshOnly = freshOnly === "true" || freshOnly === "1";
    const filteredSignals = includeFreshOnly
      ? signals.filter((signal) => isSignalFresh(signal.ts))
      : signals;

    res.json(filteredSignals.map(s => ({
      id: s.id,
      fixtureId: s.fixtureId,
      ts: s.ts,
      agentName: s.agentName,
      signalType: s.signalType,
      confidence: parseFloat(s.confidence),
      payload: s.payload,
    })));
    return;
  } catch (err) {
    req.log.error({ err }, "listAgentSignals error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

router.get("/agents/heartbeat", async (req, res) => {
  try {
    const now = Date.now();
    const activeFixtures = await db
      .select()
      .from(fixturesTable)
      .where(inArray(fixturesTable.monitoringState, ["live", "halftime"]));

    const heartbeats = await Promise.all(
      AGENT_NAMES.map(async (agentName) => {
        const [lastSignal] = await db
          .select()
          .from(agentSignalsTable)
          .where(eq(agentSignalsTable.agentName, agentName))
          .orderBy(desc(agentSignalsTable.ts))
          .limit(1);

        const lastSignalTs = lastSignal ? lastSignal.ts : null;
        const isStale = !isSignalFresh(lastSignalTs, now);
        const status = isStale ? "PAUSED" : (lastSignal?.signalType === "CIRCUIT_BREAKER" ? "ALERT" : "ACTIVE");
        const verdict = lastSignal ? `${lastSignal.signalType} @ ${Math.round(parseFloat(lastSignal.confidence) * 100)}% conf` : null;

        return {
          agentName,
          status,
          lastSignalTs,
          activeFixtures: activeFixtures.length,
          verdict,
        };
      })
    );

    res.json(heartbeats);
    return;
  } catch (err) {
    req.log.error({ err }, "getAgentHeartbeats error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

export default router;
