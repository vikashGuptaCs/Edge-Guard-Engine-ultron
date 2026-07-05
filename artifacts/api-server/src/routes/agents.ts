import { Router } from "express";
import { db } from "@workspace/db";
import { agentSignalsTable, fixturesTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

const AGENT_NAMES = ["Sentinel", "Overreaction", "Volatility", "Pattern", "Orchestrator"];

const router = Router();

router.get("/agents/signals", async (req, res) => {
  try {
    const { agentName, signalType, limit } = req.query;
    let query = db.select().from(agentSignalsTable).$dynamic();
    if (agentName) {
      query = query.where(eq(agentSignalsTable.agentName, agentName as string));
    }
    if (signalType) {
      query = query.where(eq(agentSignalsTable.signalType, signalType as string));
    }
    const lim = limit ? parseInt(limit as string) : 50;
    const signals = await query.orderBy(desc(agentSignalsTable.ts)).limit(lim);
    res.json(signals.map(s => ({
      id: s.id,
      fixtureId: s.fixtureId,
      ts: s.ts,
      agentName: s.agentName,
      signalType: s.signalType,
      confidence: parseFloat(s.confidence),
      payload: s.payload,
    })));
  } catch (err) {
    req.log.error({ err }, "listAgentSignals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/heartbeat", async (req, res) => {
  try {
    const now = Date.now();
    const activeFixtures = await db
      .select()
      .from(fixturesTable)
      .where(eq(fixturesTable.status, "live"));

    const heartbeats = await Promise.all(
      AGENT_NAMES.map(async (agentName) => {
        const [lastSignal] = await db
          .select()
          .from(agentSignalsTable)
          .where(eq(agentSignalsTable.agentName, agentName))
          .orderBy(desc(agentSignalsTable.ts))
          .limit(1);

        const lastSignalTs = lastSignal ? lastSignal.ts : null;
        const isStale = lastSignalTs ? (now - lastSignalTs) > 30000 : true;
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
  } catch (err) {
    req.log.error({ err }, "getAgentHeartbeats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
