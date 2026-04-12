/**
 * POST /api/trading/check-positions
 *
 * Walks every OPEN position in the store and, if both legs have resolved on
 * their respective venues, marks the position SETTLED with realized P&L.
 *
 * The old route accepted a `positions` array from the client. The new engine
 * reads from its own store (so the ground truth is server-side), but we keep
 * the same endpoint and response shape so the UI needs no change.
 */

import { buildStack } from "../../../lib/trading/factory.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiKeyId, kalshiPrivateKey, config: cfg = {} } = req.body || {};
  if (!kalshiKeyId || !kalshiPrivateKey) {
    return res.status(400).json({ error: "Kalshi credentials required" });
  }

  try {
    const { executor } = await buildStack({
      kalshiAuth: { keyId: kalshiKeyId, privateKey: kalshiPrivateKey },
      apiBase: cfg.kalshiApiBase,
    });
    const updates = await executor.reconcileSettled();
    // Legacy field name: `updates` with `{ positionId, status, realizedPnl }`
    return res.status(200).json({
      updates: updates.map((u) => ({
        positionId: u.id,
        status: u.status,
        realizedPnl: u.realizedPnl ?? null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
