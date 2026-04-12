/**
 * GET /api/trading/health
 *
 * Returns venue connectivity and whether live order placement is enabled.
 * Does not require credentials; when provided it will exercise the auth path.
 */

import { buildStack } from "../../../lib/trading/factory.js";

export default async function handler(req, res) {
  const started = Date.now();
  const { kalshiKeyId, kalshiPrivateKey } = req.query || {};

  const { adapters } = await buildStack({
    kalshiAuth: kalshiKeyId ? { keyId: kalshiKeyId, privateKey: kalshiPrivateKey } : null,
  });

  const checks = {};

  // Kalshi ping: try to list NBA markets (auth-exercising).
  try {
    if (kalshiKeyId) {
      const markets = await adapters.kalshi.listMarkets({ sport: "nba" });
      checks.kalshi = { ok: true, markets: markets.length };
    } else {
      checks.kalshi = { ok: null, reason: "no credentials provided" };
    }
  } catch (e) {
    checks.kalshi = { ok: false, error: e.message };
  }

  // Polymarket public read.
  try {
    const markets = await adapters.polymarket.listMarkets({ sport: "nba" });
    checks.polymarket = {
      ok: true,
      markets: markets.length,
      liveEnabled: adapters.polymarket.liveEnabled,
    };
  } catch (e) {
    checks.polymarket = { ok: false, error: e.message };
  }

  return res.status(200).json({
    checks,
    tookMs: Date.now() - started,
    ts: Date.now(),
  });
}
