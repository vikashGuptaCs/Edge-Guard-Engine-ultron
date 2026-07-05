import { Router } from "express";
import { ActivateTxlineBody } from "@workspace/api-zod";

const router = Router();

router.post("/public/txline/activate", async (req, res) => {
  try {
    const parsed = ActivateTxlineBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    const { walletAddress, signature, message, network } = parsed.data;

    if (!signature || signature.length < 10) {
      return res.status(400).json({ error: "Invalid wallet signature" });
    }

    const apiToken = `txl_${network}_${Buffer.from(walletAddress).toString("base64url").slice(0, 16)}_${Date.now()}`;
    const expiresAt = Date.now() + 86400000;

    req.log.info({ walletAddress, network }, "TxLINE session activated");

    res.json({
      apiToken,
      network,
      expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "activateTxline error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
