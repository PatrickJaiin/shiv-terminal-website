/**
 * POST /api/trading/execute
 *
 * Opens a two-leg position via the executor. Accepts either a full Opportunity
 * in the body (preferred) or the legacy flat opportunity fields from the old
 * UI; the handler reconstructs canonical legs in the latter case.
 */

import { buildStack } from "../../../lib/trading/factory.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    opportunity: oppIn,
    mode = "paper",
    kalshiKeyId,
    kalshiPrivateKey,
    config: cfg = {},
  } = req.body || {};

  if (!oppIn) return res.status(400).json({ error: "opportunity required" });
  if (mode === "live" && (!kalshiKeyId || !kalshiPrivateKey)) {
    return res.status(400).json({ error: "Kalshi credentials required for live trading" });
  }

  const apiBase = cfg.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";

  try {
    const { executor } = await buildStack({
      kalshiAuth: kalshiKeyId ? { keyId: kalshiKeyId, privateKey: kalshiPrivateKey } : null,
      apiBase,
    });

    // Normalize opportunity: the UI sends the legacy-shaped object from scan.js.
    // We carry through `_legs` which is the canonical leg array emitted by scan.
    const canonicalOpp = toCanonicalOpportunity(oppIn);
    if (!canonicalOpp) return res.status(400).json({ error: "could not reconstruct opportunity legs" });

    const result = await executor.openPosition({
      opportunity: canonicalOpp,
      mode,
      cfg: {
        orderTtlMs: cfg.orderTtlMs || 3000,
        postOnly: cfg.postOnly !== false,
      },
    });

    return res.status(200).json({
      success: !!result.success,
      shadow: !!result.shadow,
      pending: false,
      error: result.error || null,
      position: result.position ? toLegacyPosition(result.position) : null,
      // Legacy fields so the existing UI's trade list keeps rendering.
      ...legacyExecuteFields(result),
      timestamp: Date.now(),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

function toCanonicalOpportunity(oppIn) {
  if (oppIn._legs && oppIn._legs.length === 2) {
    return {
      id: oppIn.id,
      eventLabel: oppIn.matchName,
      pairType: oppIn.pairType,
      gameDate: oppIn.gameDate,
      legA: oppIn._legs[0],
      legB: oppIn._legs[1],
      grossEdge: oppIn.grossArb,
      netEdge: oppIn.netArb,
      sizeUsd: oppIn.positionSize,
      sizeContracts: oppIn.sizeContracts || Math.max(1, Math.floor(oppIn.positionSize || 1)),
      expiresAt: oppIn.expiresAt || (Date.now() + 5000),
      passes: oppIn.passesThreshold,
      abortReason: oppIn.abortReason,
      diag: oppIn._diag || {},
    };
  }
  return null;
}

/**
 * Map the new Position shape onto the legacy fields the paper-K+P UI branch
 * reads: `event.label`, `backingTeam`, `positionSize`, `entryNetArb`,
 * `legs[0].ticker`, `legs[1].marketId`/`slug`, `legs[i].entryPrice`, `contracts`.
 */
function toLegacyPosition(pos) {
  const kLeg = pos.legs.find((l) => l.venue === "kalshi") || pos.legs[0];
  const pLeg = pos.legs.find((l) => l.venue === "polymarket") || pos.legs[1];
  return {
    id: pos.id,
    createdAt: pos.createdAt,
    mode: pos.mode,
    status: pos.status,
    pairType: pos.pairType,
    event: { label: pos.eventLabel },
    backingTeam: pos.backingTeamCanon,
    contracts: pos.sizeContracts,
    positionSize: pos.sizeUsd,
    entryGrossArb: pos.entryGrossEdge,
    entryNetArb: pos.entryNetEdge,
    legs: [
      {
        platform: kLeg.venue,
        ticker: kLeg.marketId,
        side: kLeg.side,
        backsTeam: kLeg.backsTeamCanon,
        entryPrice: kLeg.fill?.price ?? kLeg.price,
        payoffIfWin: 1.0,
      },
      {
        platform: pLeg.venue,
        marketId: pLeg.marketId,
        slug: pLeg.marketId,
        question: null,
        side: pLeg.side,
        backsTeam: pLeg.backsTeamCanon,
        entryPrice: pLeg.fill?.price ?? pLeg.price,
        payoffIfWin: 1.0,
      },
    ],
    // Keep a pointer to the canonical shape for anyone who wants it.
    _canonical: pos,
  };
}

function legacyExecuteFields(result) {
  const pos = result.position;
  if (!pos) return {};
  const kLeg = pos.legs.find((l) => l.venue === "kalshi");
  const pLeg = pos.legs.find((l) => l.venue === "polymarket");
  const buyFill = pos.legs[0]?.fill?.price ?? pos.legs[0]?.price;
  const sellFill = pos.legs[1]?.fill?.price ?? pos.legs[1]?.price;
  const actualGross = (buyFill != null && sellFill != null) ? 1 - buyFill - sellFill : null;
  return {
    positionSize: pos.sizeUsd,
    buyPlatform: `${pos.legs[0].venue} ${pos.legs[0].side}`,
    buyFillPrice: buyFill,
    sellPlatform: `${pos.legs[1].venue} ${pos.legs[1].side}`,
    sellFillPrice: sellFill,
    kalshiTicker: kLeg?.marketId || null,
    kalshiFillPrice: kLeg?.fill?.price ?? kLeg?.price ?? null,
    polymarketId: pLeg?.marketId || null,
    polymarketFillPrice: pLeg?.fill?.price ?? pLeg?.price ?? null,
    actualGrossArb: actualGross != null ? +actualGross.toFixed(4) : null,
    actualNetArb: actualGross != null ? +(actualGross - 0.005).toFixed(4) : null,
  };
}
