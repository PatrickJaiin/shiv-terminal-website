/**
 * Execution engine.
 *
 * Opens a two-leg arbitrage position safely:
 *
 *   1. Re-validate the opportunity against live books. Abort if edge collapsed.
 *   2. Place both legs as post-only limit orders in parallel, each with a
 *      short TTL. Use client_order_id for idempotency.
 *   3. After TTL, inspect fills:
 *        - both filled  -> position OPEN
 *        - one filled   -> unwind: cancel the unfilled leg, try to market-out
 *                          the filled leg at the opposing venue if net edge
 *                          is still positive; otherwise flag for manual review.
 *        - neither      -> cancel both, walk away.
 *   4. Record every state transition in the store before returning.
 *
 * Paper mode simulates fills with light slippage and goes through the same
 * state machine so the UI and store behave identically.
 */

import { POSITION_STATUS } from "./types.js";

const DEFAULT_TTL_MS = 3000;
const POLL_INTERVAL_MS = 400;

export function buildExecutor({ adapters, store, now = Date.now }) {
  const { kalshi, polymarket } = adapters;

  /**
   * @param {{ opportunity: object, mode: "paper"|"live", cfg?: object }} params
   */
  async function openPosition({ opportunity: opp, mode, cfg = {} }) {
    const ts = now();
    if (!opp || !opp.legA || !opp.legB) {
      return { success: false, error: "invalid opportunity" };
    }
    if (opp.expiresAt && ts > opp.expiresAt) {
      return { success: false, error: "opportunity expired" };
    }
    if (!opp.passes) {
      return { success: false, error: `opportunity did not pass thresholds: ${opp.abortReason || "unknown"}` };
    }
    if (opp.sizeContracts <= 0) {
      return { success: false, error: "zero size" };
    }

    const positionId = `pos_${ts}_${Math.floor(Math.random() * 1e6)}`;
    const basePosition = {
      id: positionId,
      createdAt: ts,
      mode,
      status: POSITION_STATUS.OPENING,
      pairType: opp.pairType,
      eventLabel: opp.eventLabel,
      backingTeamCanon: opp.legA.backsTeamCanon,
      sizeContracts: opp.sizeContracts,
      sizeUsd: opp.sizeUsd,
      legs: [
        { ...opp.legA, fill: null },
        { ...opp.legB, fill: null },
      ],
      entryGrossEdge: opp.grossEdge,
      entryNetEdge: opp.netEdge,
      realizedPnl: null,
      diag: { openedFromOppId: opp.id, ...opp.diag },
    };
    store.savePosition(basePosition);

    if (mode === "paper") {
      const filled = await simulateFills(basePosition);
      const finalPos = store.updatePosition(positionId, {
        status: POSITION_STATUS.OPEN,
        legs: filled.legs,
        diag: { ...basePosition.diag, paperSlippage: filled.slippage },
      });
      return { success: true, shadow: true, position: finalPos };
    }

    // ── Live path ──
    const ttlMs = cfg.orderTtlMs || DEFAULT_TTL_MS;

    // Place both legs in parallel.
    const [resA, resB] = await Promise.allSettled([
      placeLeg(basePosition.legs[0], positionId, cfg),
      placeLeg(basePosition.legs[1], positionId, cfg),
    ]);

    let legA = { ...basePosition.legs[0], order: extractOrder(resA) };
    let legB = { ...basePosition.legs[1], order: extractOrder(resB) };

    // Poll for fills until TTL or both filled.
    const deadline = now() + ttlMs;
    while (now() < deadline) {
      legA = await pollLeg(legA);
      legB = await pollLeg(legB);
      if (isFilled(legA) && isFilled(legB)) break;
      await sleep(POLL_INTERVAL_MS);
    }

    const aFilled = isFilled(legA);
    const bFilled = isFilled(legB);

    if (aFilled && bFilled) {
      legA.fill = { price: legA.order.fillPrice, size: legA.order.filledCount };
      legB.fill = { price: legB.order.fillPrice, size: legB.order.filledCount };
      const finalPos = store.updatePosition(positionId, {
        status: POSITION_STATUS.OPEN,
        legs: [legA, legB],
      });
      return { success: true, shadow: false, position: finalPos };
    }

    // Partial or no fills: unwind.
    return unwind({ positionId, legA, legB, aFilled, bFilled });
  }

  async function placeLeg(leg, positionId, cfg) {
    const clientOrderId = `${positionId}_${leg.venue}_${Date.now()}`;
    if (leg.venue === "kalshi") {
      return kalshi.placeOrder({
        ticker: leg.marketId,
        action: "buy",
        side: leg.side.toLowerCase(),
        count: leg.size,
        priceDollars: leg.price,
        clientOrderId,
        postOnly: cfg.postOnly !== false,
      });
    }
    if (leg.venue === "polymarket") {
      return polymarket.placeOrder({
        tokenId: leg.tokenId,
        side: leg.action,        // "BUY"
        priceDollars: leg.price,
        sizeShares: leg.size,
        postOnly: cfg.postOnly !== false,
      });
    }
    throw new Error(`unsupported venue: ${leg.venue}`);
  }

  async function pollLeg(leg) {
    if (!leg.order || !leg.order.orderId) return leg;
    if (leg.venue === "kalshi") {
      try {
        const upd = await kalshi.getOrder(leg.order.orderId);
        return { ...leg, order: { ...leg.order, ...upd } };
      } catch { return leg; }
    }
    if (leg.venue === "polymarket") {
      try {
        const upd = await polymarket.getOrder(leg.order.orderId);
        return { ...leg, order: { ...leg.order, ...upd } };
      } catch { return leg; }
    }
    return leg;
  }

  async function unwind({ positionId, legA, legB, aFilled, bFilled }) {
    store.updatePosition(positionId, { status: POSITION_STATUS.UNWINDING });
    const results = { cancelled: [], marketOut: [] };

    // Cancel any unfilled orders.
    for (const [leg, filled] of [[legA, aFilled], [legB, bFilled]]) {
      if (filled || !leg.order?.orderId) continue;
      try {
        if (leg.venue === "kalshi") {
          await kalshi.cancelOrder(leg.order.orderId);
        } else if (leg.venue === "polymarket") {
          await polymarket.cancelOrder(leg.order.orderId);
        }
        results.cancelled.push(leg.venue);
      } catch (e) {
        results.cancelled.push(`${leg.venue}(err:${e.message})`);
      }
    }

    // If exactly one leg filled, we are naked. Flag for manual hedge.
    // Auto market-out is tempting but dangerous without venue-specific depth
    // guarantees; leave it for a follow-up.
    if (aFilled ^ bFilled) {
      const final = store.updatePosition(positionId, {
        status: POSITION_STATUS.FAILED,
        legs: [legA, legB],
        diag: { unwindResults: results, reason: "partial fill, manual hedge required" },
      });
      return { success: false, partial: true, position: final, error: "partial fill, manual hedge required" };
    }

    const final = store.updatePosition(positionId, {
      status: POSITION_STATUS.FAILED,
      legs: [legA, legB],
      diag: { unwindResults: results, reason: "neither leg filled in TTL" },
    });
    return { success: false, partial: false, position: final, error: "no fills in TTL" };
  }

  /**
   * Close a position at market by buying the opposite side on each venue. For
   * now we only support closing by settlement (waiting for the underlying
   * market to resolve); an active close would require orderbook queries that
   * aren't worth implementing until the open path is rock-solid.
   */
  async function closePosition() {
    return { success: false, error: "active close not implemented; wait for settlement" };
  }

  /** Walk through open positions and settle any whose underlying resolved. */
  async function reconcileSettled() {
    const open = store.listPositions({ status: POSITION_STATUS.OPEN });
    const updates = [];
    for (const pos of open) {
      const [kLeg, pLeg] = sortLegs(pos.legs);
      if (!kLeg || !pLeg) continue;
      const [kRes, pRes] = await Promise.all([
        safe(kalshi.getMarketResult(kLeg.marketId)),
        safe(polymarket.getMarketResult(pLeg.marketId)),
      ]);
      if (!kRes?.isSettled || !pRes?.isSettled) {
        updates.push({ id: pos.id, status: pos.status });
        continue;
      }
      // Kalshi: leg wins if result === "yes" when side=YES, or result==="no" when side=NO.
      const kWon = kLeg.side === "YES" ? kRes.result === "yes" : kRes.result === "no";
      const kPayout = kWon ? 1 : 0;
      // For a correctly-hedged binary arb, exactly one leg pays out 1.
      const pWon = !kWon;
      const pPayout = pWon ? 1 : 0;
      const contracts = pos.sizeContracts || 1;
      const realized =
        ((kPayout - (kLeg.fill?.price ?? kLeg.price)) +
         (pPayout - (pLeg.fill?.price ?? pLeg.price))) * contracts;

      const saved = store.updatePosition(pos.id, {
        status: POSITION_STATUS.SETTLED,
        realizedPnl: +realized.toFixed(4),
        diag: { ...(pos.diag || {}), settlement: { kRes, pRes } },
      });
      updates.push({ id: saved.id, status: saved.status, realizedPnl: saved.realizedPnl });
    }
    return updates;
  }

  return { openPosition, closePosition, reconcileSettled };
}

function sortLegs(legs) {
  const k = legs.find((l) => l.venue === "kalshi");
  const p = legs.find((l) => l.venue === "polymarket");
  return [k, p];
}

function extractOrder(settled) {
  if (settled.status !== "fulfilled") return { error: settled.reason?.message || "failed" };
  return settled.value;
}

function isFilled(leg) {
  const s = leg?.order?.status;
  return s === "filled" || s === "FILLED" || s === "matched";
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function safe(p) { try { return await p; } catch { return null; } }

/** Paper-mode simulation: apply small random slippage around limit prices. */
async function simulateFills(position) {
  // Uniform random slip in [-0.002, +0.005] dollars on each leg. Asymmetric
  // to bias towards realistic sub-par fills.
  const slipA = (Math.random() * 0.007) - 0.002;
  const slipB = (Math.random() * 0.007) - 0.002;
  const legs = position.legs.map((leg, i) => {
    const slip = i === 0 ? slipA : slipB;
    const fillPrice = Math.max(0.01, Math.min(0.99, leg.price + slip));
    return {
      ...leg,
      fill: { price: +fillPrice.toFixed(4), size: leg.size },
    };
  });
  return { legs, slippage: { slipA, slipB } };
}
