/**
 * POST /api/trading/check-fill
 *
 * Legacy endpoint. The new executor handles fill polling server-side within
 * its TTL window, so this route now just looks up order status directly and
 * returns it in the old shape so the UI's fallback polling path still works.
 */

import { buildStack } from "../../../lib/trading/factory.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiKeyId, kalshiPrivateKey, orderId, config: cfg = {} } = req.body || {};
  if (!kalshiKeyId || !kalshiPrivateKey || !orderId) {
    return res.status(400).json({ error: "Missing Kalshi credentials or orderId" });
  }

  try {
    const { adapters } = await buildStack({
      kalshiAuth: { keyId: kalshiKeyId, privateKey: kalshiPrivateKey },
      apiBase: cfg.kalshiApiBase,
    });
    const order = await adapters.kalshi.getOrder(orderId);
    if (order.status === "filled") {
      return res.status(200).json({
        filled: true,
        fillPrice: order.fillPrice ?? 0,
        filledCount: order.filledCount || 0,
      });
    }
    return res.status(200).json({ filled: false, status: order.status || "unknown" });
  } catch (e) {
    return res.status(200).json({ filled: false, error: e.message });
  }
}
