import { Router } from "express";
import { db } from "@workspace/db";
import { txlineEventsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { testTxlineConnection, getTxlineFixtures, getTxlineOdds, getTxlineScores, getGuestJwt } from "../txline-client";

const router = Router();

router.get("/txline/status", async (req, res) => {
  try {
    const result = await testTxlineConnection();
    res.json({
      connected: result.connected,
      fixtureCount: result.fixtureCount,
      network: "devnet",
      tokenConfigured: !!process.env.TXLINE_API_TOKEN,
      error: result.error ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "txline status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/txline/fixtures", async (req, res) => {
  try {
    const competitionId = req.query.competitionId ? parseInt(req.query.competitionId as string) : undefined;
    const raw = await getTxlineFixtures(competitionId);
    const fixtures = (Array.isArray(raw) ? raw : []).map((f) => {
      const gameStateMap: Record<number, string> = {
        0: "prematch",
        1: "live",
        2: "halftime",
        3: "finished",
        4: "postponed",
        5: "cancelled",
      };
      return {
        fixtureId: f.FixtureId,
        homeTeam: f.Participant1IsHome ? f.Participant1 : f.Participant2,
        awayTeam: f.Participant1IsHome ? f.Participant2 : f.Participant1,
        startTime: f.StartTime,
        competitionId: f.CompetitionId,
        competitionName: f.Competition ?? f.CompetitionName ?? null,
        status: f.GameState != null ? (gameStateMap[f.GameState] ?? `state_${f.GameState}`) : (f.Status ?? "prematch"),
      };
    });
    res.json(fixtures);
  } catch (err) {
    req.log.error({ err }, "txline fixtures error");
    res.status(502).json({ error: "TxLINE feed unavailable", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/txline/odds/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid fixtureId" });
    const raw = await getTxlineOdds(fixtureId);
    res.json(Array.isArray(raw) ? raw : []);
  } catch (err) {
    req.log.error({ err }, "txline odds error");
    res.status(502).json({ error: "TxLINE feed unavailable", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/txline/scores/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid fixtureId" });
    const raw = await getTxlineScores(fixtureId);
    res.json(Array.isArray(raw) ? raw : []);
  } catch (err) {
    req.log.error({ err }, "txline scores error");
    res.status(502).json({ error: "TxLINE feed unavailable", details: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/txline/events/:fixtureId", async (req, res) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId);
    if (isNaN(fixtureId)) return res.status(400).json({ error: "Invalid fixtureId" });

    const category = req.query.category as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "200") || 200, 500);

    const conditions = category
      ? and(eq(txlineEventsTable.fixtureId, fixtureId), eq(txlineEventsTable.category, category))
      : eq(txlineEventsTable.fixtureId, fixtureId);

    const rows = await db
      .select()
      .from(txlineEventsTable)
      .where(conditions)
      .orderBy(desc(txlineEventsTable.ts))
      .limit(limit);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "txline events error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/txline/guest-jwt", async (req, res) => {
  try {
    const jwt = await getGuestJwt();
    res.json({ jwt });
  } catch (err) {
    req.log.error({ err }, "txline guest jwt error");
    res.status(502).json({ error: "Could not get TxLINE guest JWT" });
  }
});

router.post("/txline/activate", async (req, res) => {
  try {
    const { txSig, walletSignature, jwt, leagues } = req.body as {
      txSig: string;
      walletSignature: string;
      jwt: string;
      leagues?: string[];
    };

    if (!txSig || !walletSignature || !jwt) {
      return res.status(400).json({ error: "txSig, walletSignature, and jwt are required" });
    }

    const TXLINE_BASE = "https://txline-dev.txodds.com/api";
    const apiToken = process.env.TXLINE_API_TOKEN;

    const response = await fetch(`${TXLINE_BASE}/token/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        ...(apiToken ? { "X-Api-Token": apiToken } : {}),
      },
      body: JSON.stringify({ txSig, walletSignature, jwt, leagues: leagues ?? [] }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      req.log.error({ status: response.status, errText }, "TxLINE activate failed");
      return res.status(502).json({ error: `TxLINE activation failed: ${response.status}`, details: errText.slice(0, 300) });
    }

    const data = (await response.json()) as { apiToken?: string; token?: string };
    const token = data.apiToken ?? data.token;
    if (!token) {
      return res.status(502).json({ error: "TxLINE activation did not return a token", details: JSON.stringify(data) });
    }

    res.json({ apiToken: token, message: "TxLINE subscription activated successfully" });
  } catch (err) {
    req.log.error({ err }, "txline activate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
