import { Router } from "express";
import { testTxlineConnection, getTxlineFixtures, getTxlineOdds, getTxlineScores } from "../txline-client";

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

export default router;
