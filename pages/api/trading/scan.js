/**
 * POST /api/trading/scan
 *
 * Thin wrapper over lib/trading/engine. Fetches Kalshi + Polymarket markets,
 * matches them, pulls books, and returns opportunities. The response preserves
 * the legacy field names the UI renders, while the engine itself uses the new
 * canonical Opportunity shape.
 */

import { buildStack } from "../../../lib/trading/factory.js";
import { findOpportunities } from "../../../lib/trading/engine.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { game, kalshiKeyId, kalshiPrivateKey, config: cfg = {} } = req.body || {};
  const sport = normalizeSport(game);

  if (!kalshiKeyId || !kalshiPrivateKey) {
    return res.status(400).json({ error: "Kalshi API credentials required." });
  }

  const apiBase = cfg.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";

  try {
    const { adapters } = await buildStack({
      kalshiAuth: { keyId: kalshiKeyId, privateKey: kalshiPrivateKey },
      apiBase,
    });

    const engineCfg = {
      bankrollUsd: cfg.bankroll ?? 1000,
      maxPositionPct: cfg.maxPositionPct ?? 0.05,
      kellyFrac: cfg.kellyFrac ?? 0.25,
      minGrossEdge: cfg.minGrossArb ?? 0.01,
      minNetEdge: cfg.minNetArb ?? 0.005,
      slippageBuffer: cfg.slippageBuffer ?? 0.005,
    };

    const result = await findOpportunities({
      adapters,
      sport,
      cfg: engineCfg,
    });

    return res.status(200).json({
      opportunities: result.opportunities.map(toLegacyOpportunity),
      matchedEventCount: result.matchedEventCount,
      kalshiMarketCount: result.kalshiMarketCount,
      polymarketCount: result.polymarketCount,
      stakeMatchCount: 0,
      kalshiRawMarkets: (result.diag?.kalshiSample) || [],
      polymarketRawMarkets: (result.diag?.polymarketSample) || [],
      diag: result.diag || null,
      mock: false,
      ts: result.ts,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function normalizeSport(game) {
  const g = (game || "ipl").toLowerCase();
  if (g === "valorant") return "val";
  return g;
}

/**
 * Map the engine's canonical Opportunity onto the legacy fields the UI reads.
 * The underlying data is identical; we just rename.
 */
function toLegacyOpportunity(opp) {
  const { legA, legB } = opp;
  // Legacy shape expected by UI:
  //   pairType, matchName, team, grossArb, netArb, positionSize, passesThreshold,
  //   abortReason, kalshiTicker, polymarketId, kalshiNoPrice, kalshiNoDepth,
  //   polymarketLiquidity, buyPlatform, buyPrice, sellPlatform, sellPrice
  const kalshiLeg = legA.venue === "kalshi" ? legA : (legB.venue === "kalshi" ? legB : null);
  const polyLeg = legA.venue === "polymarket" ? legA : (legB.venue === "polymarket" ? legB : null);

  const buyLeg = legA;  // we always BUY both in a binary hedge
  const sellLeg = legB;

  return {
    id: opp.id,
    pairType: opp.pairType,
    matchName: opp.eventLabel,
    team: (legA.backsTeamCanon || "").toUpperCase(),
    teamA: legA.backsTeamCanon,
    teamB: legB.backsTeamCanon,
    direction: `${legA.venue}_${legA.side.toLowerCase()}_${legB.venue}_${legB.side.toLowerCase()}`.toLowerCase(),
    grossArb: opp.grossEdge,
    netArb: opp.netEdge,
    positionSize: opp.sizeUsd,
    sizeContracts: opp.sizeContracts,
    passesThreshold: opp.passes,
    abortReason: opp.abortReason,
    expiresAt: opp.expiresAt,
    gameDate: opp.gameDate,

    kalshiTicker: kalshiLeg?.marketId || null,
    kalshiYesPrice: kalshiLeg?.side === "YES" ? kalshiLeg.price : null,
    kalshiNoPrice: kalshiLeg?.side === "NO" ? kalshiLeg.price : null,
    kalshiNoDepth: opp.diag?.depthB ?? opp.diag?.depthA ?? null,

    polymarketId: polyLeg?.marketId || null,
    polymarketTokenId: polyLeg?.tokenId || null,
    polymarketYesPrice: polyLeg?.price ?? null,
    polymarketLiquidity: opp.diag?.polymarketLiquidity ?? null,

    buyPlatform: `${buyLeg.venue} ${buyLeg.side}`,
    buyPrice: buyLeg.price,
    sellPlatform: `${sellLeg.venue} ${sellLeg.side}`,
    sellPrice: sellLeg.price,

    // Raw legs for the executor path.
    _legs: [legA, legB],
    _diag: opp.diag,
  };
}
