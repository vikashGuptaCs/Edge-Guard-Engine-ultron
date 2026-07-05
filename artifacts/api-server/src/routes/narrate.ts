import { Router } from "express";
import { NarrateAlertBody } from "@workspace/api-zod";

const router = Router();

const RATE_LIMIT_MAP = new Map<string, number>();
const TEMPLATE_NARRATIONS: Record<string, string[]> = {
  EXECUTE: [
    "Edge Score {score} detected on {fixture}. Orchestrator confirms mispricing window. All agents green. Executing position.",
    "Signal confluence at {score}. Overreaction Hunter identified market lag on {fixture}. Pattern Scout confirms historical edge. Execute.",
    "Latency clear, spread nominal. Edge at {score} — above threshold. {fixture} shows optimal entry. Firing.",
  ],
  VETO_SLIPPAGE: [
    "VETOED: Bid/Ask spread at {spread}% exceeds tolerance on {fixture}. Edge Score was {score} but liquidity insufficient for clean entry.",
    "Volatility Shield triggered on {fixture}. Spread conditions degrade expected value below acceptable threshold. Score: {score}. Standing down.",
    "Market microstructure compromised on {fixture}. Slippage risk exceeds parameters. Veto recorded on-chain. Score: {score}.",
  ],
  VETO_LATENCY: [
    "VETOED: Sentinel detected TxLINE feed lag exceeding 10s on {fixture}. Autopilot hardware-locked. Score was {score}.",
    "Circuit breaker triggered. Feed latency anomaly on {fixture} — possible spoofing detected. Score {score} disqualified. Veto on-chain.",
    "Sentinel flagged toxic flow pattern on {fixture}. Position paused despite {score} edge score. Risk management executed.",
  ],
};

router.post("/narrate", async (req, res) => {
  try {
    const parsed = NarrateAlertBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    const { alertId, fixtureId, edgeScore, action, context } = parsed.data;

    const clientId = `alert_${alertId}`;
    const lastCall = RATE_LIMIT_MAP.get(clientId) ?? 0;
    const now = Date.now();

    if (now - lastCall < 60000) {
      const template = getTemplate(action, edgeScore, context);
      return res.json({ narration: template, source: "template" });
    }

    RATE_LIMIT_MAP.set(clientId, now);

    const template = getTemplate(action, edgeScore, context);

    req.log.info({ alertId, fixtureId, edgeScore, action }, "narration generated");
    res.json({ narration: template, source: "template" });
  } catch (err) {
    req.log.error({ err }, "narrateAlert error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function getTemplate(action: string, edgeScore: number, context?: Record<string, unknown>): string {
  const templates = TEMPLATE_NARRATIONS[action] ?? TEMPLATE_NARRATIONS["EXECUTE"];
  const template = templates[Math.floor(Math.random() * templates.length)];
  const fixture = (context?.homeTeam && context?.awayTeam) ? `${context.homeTeam} vs ${context.awayTeam}` : "this fixture";
  const spread = context?.spread ?? "8.4";
  return template
    .replace("{score}", String(edgeScore))
    .replace("{fixture}", fixture as string)
    .replace("{spread}", String(spread));
}

export default router;
