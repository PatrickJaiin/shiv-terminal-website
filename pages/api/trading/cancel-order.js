/**
 * POST /api/trading/cancel-order
 *
 * Legacy endpoint kept for UI fallback path. The new executor cancels in-band
 * on TTL expiry; this route is a thin wrapper over the Kalshi adapter.
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
    const data = await adapters.kalshi.cancelOrder(orderId);
    return res.status(200).json({ cancelled: true, data });
  } catch (e) {
    return res.status(200).json({ cancelled: false, error: e.message });
  }
}
