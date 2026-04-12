/**
 * Pure math primitives for the trading engine. No network, no state, no side
 * effects. Everything here is unit-testable.
 */

/**
 * Remove bookmaker vig from a 2-way moneyline. Returns devigged probabilities
 * that sum to 1, plus the overround (how wide the book is).
 * @param {number} oddsA Decimal odds, e.g. 2.10
 * @param {number} oddsB Decimal odds, e.g. 1.80
 */
export function devigTwoWay(oddsA, oddsB) {
  if (!oddsA || !oddsB || oddsA <= 1 || oddsB <= 1) {
    return { pA: null, pB: null, overround: null, rawA: null, rawB: null };
  }
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return {
    pA: rawA / overround,
    pB: rawB / overround,
    overround,
    rawA,
    rawB,
  };
}

/** Generic n-way devig. Odds <= 1 are skipped. */
export function devigNWay(oddsList) {
  const raws = oddsList.map((o) => (o > 1 ? 1 / o : 0));
  const overround = raws.reduce((a, b) => a + b, 0);
  if (overround <= 0) return { probs: oddsList.map(() => null), overround: null };
  return { probs: raws.map((r) => r / overround), overround };
}

/**
 * Convert Kalshi / Polymarket contract price in dollars (0..1) into implied
 * probability. For a binary outcome these are the same thing.
 */
export function impliedProbFromContract(price) {
  if (price == null) return null;
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  return Math.max(0, Math.min(1, p));
}

/**
 * Walk a price/size ladder and compute volume-weighted average price for a
 * target size. `levels` is sorted appropriately (asks ascending, bids descending).
 * @param {{price:number,size:number}[]} levels
 * @param {number} targetSize Contracts or shares we want to trade
 * @returns {{vwap:number|null, filledSize:number, topPrice:number|null, exhausted:boolean}}
 */
export function walkBookVwap(levels, targetSize) {
  if (!Array.isArray(levels) || levels.length === 0 || targetSize <= 0) {
    return { vwap: null, filledSize: 0, topPrice: null, exhausted: true };
  }
  let remaining = targetSize;
  let cost = 0;
  let filled = 0;
  for (const lvl of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lvl.size || 0);
    if (take <= 0) continue;
    cost += take * lvl.price;
    filled += take;
    remaining -= take;
  }
  if (filled <= 0) {
    return { vwap: null, filledSize: 0, topPrice: levels[0]?.price ?? null, exhausted: true };
  }
  return {
    vwap: cost / filled,
    filledSize: filled,
    topPrice: levels[0].price,
    exhausted: remaining > 0,
  };
}

/**
 * Net edge after fees, gas, and a static slippage buffer.
 * All inputs in dollar terms for a notional of `sizeUsd`.
 */
export function netEdge({ grossEdge, feesBpsA = 0, feesBpsB = 0, gasUsd = 0, sizeUsd = 0, slippageBuffer = 0 }) {
  const feesFrac = (feesBpsA + feesBpsB) / 10000;
  const gasFrac = sizeUsd > 0 ? gasUsd / sizeUsd : 0;
  return grossEdge - feesFrac - gasFrac - slippageBuffer;
}

/**
 * Fractional Kelly stake on an edge.
 *   f* = edge / variance, clipped to [0, maxFrac].
 * For binary outcomes with probability p of winning 1 unit vs losing the
 * combined stake, the simplified formula used here is edge / (1 - edge) bound
 * by maxFrac. Using a fraction of that (kellyFrac) is conservative.
 */
export function kellyFraction({ edge, kellyFrac = 0.25, maxFrac = 0.1 }) {
  if (edge == null || edge <= 0) return 0;
  const full = edge / Math.max(1e-6, 1 - edge);
  return Math.max(0, Math.min(maxFrac, kellyFrac * full));
}

/**
 * Size a two-leg arb: cap by bankroll fraction, by book depth on both legs,
 * and by a hard USD ceiling.
 */
export function sizeArb({ bankrollUsd, edge, depthA, depthB, priceA, priceB, maxPositionPct = 0.05, kellyFrac = 0.25, maxUsd = Infinity }) {
  const kellyF = kellyFraction({ edge, kellyFrac, maxFrac: maxPositionPct });
  const kellyUsd = bankrollUsd * kellyF;
  const maxUsdCap = Math.min(kellyUsd, maxUsd, bankrollUsd * maxPositionPct);
  // Each leg costs `price * contracts`. Combined notional for `n` contracts
  // per leg is n*(priceA+priceB).
  const combinedUnitCost = Math.max(0.0001, (priceA || 0) + (priceB || 0));
  const byBudget = Math.floor(maxUsdCap / combinedUnitCost);
  const byDepth = Math.floor(Math.min(depthA || 0, depthB || 0));
  const contracts = Math.max(0, Math.min(byBudget, byDepth));
  return {
    contracts,
    sizeUsd: contracts * combinedUnitCost,
    limits: { kellyF, kellyUsd, maxUsdCap, byBudget, byDepth, combinedUnitCost },
  };
}

/** Clamp helper. */
export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/**
 * Stable id from leg fields + timestamp. Small, readable, collision-safe for
 * the volume this bot handles.
 */
export function opportunityId({ legA, legB, ts }) {
  const s = `${legA.venue}:${legA.marketId}:${legA.side}:${legA.price.toFixed(4)}|${legB.venue}:${legB.marketId}:${legB.side}:${legB.price.toFixed(4)}|${ts}`;
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `opp_${h.toString(16)}`;
}
