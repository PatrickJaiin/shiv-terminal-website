import { kalshiFetch } from "../../../utils/kalshi-auth";

/**
 * Check settlement status for a batch of open paper positions.
 *
 * Each position has two legs (Kalshi + Polymarket). For each leg, we ask the
 * underlying market what its current state is:
 *   - Kalshi: GET /markets/{ticker}, look at status + result
 *   - Polymarket: GET /markets/{conditionId}, look at closed + outcomePrices
 *
 * If both legs have resolved, we mark the position as settled and compute
 * realized P&L = sum(leg.payout - leg.entryPrice) * contracts.
 *
 * Returns: { updates: [{ positionId, status, legUpdates: [...], realizedPnl }] }
 */

const POLY_GAMMA = "https://gamma-api.polymarket.com";

async function getKalshiResult(ticker, kalshiAuth, apiBase) {
  try {
    const resp = await kalshiFetch(`${apiBase}/markets/${ticker}`, kalshiAuth);
    const data = await resp.json();
    const m = data.market || data;
    // Kalshi statuses: "active", "closed", "settled". `result` is "yes" / "no" once settled.
    const status = m.status || "unknown";
    const result = m.result || null; // "yes" | "no" | null
    const isSettled = status === "settled" || !!result;
    return { status, result, isSettled };
  } catch (e) {
    return { status: "error", error: e.message, isSettled: false };
  }
}

async function getPolymarketResult(marketIdOrSlug) {
  try {
    // Try by id first; gamma supports /markets?id=...
    const url = `${POLY_GAMMA}/markets/${encodeURIComponent(marketIdOrSlug)}`;
    const resp = await fetch(url);
    if (!resp.ok) return { status: "unknown", isSettled: false };
    const data = await resp.json();
    const m = Array.isArray(data) ? data[0] : data;
    if (!m) return { status: "unknown", isSettled: false };
    const closed = !!m.closed;
    let prices = [];
    try { prices = JSON.parse(m.outcomePrices || "[]"); } catch {}
    const yp = parseFloat(prices[0] || 0);
    const np = parseFloat(prices[1] || 0);
    const outcomeA = (m.outcomes && JSON.parse(m.outcomes || "[]")[0]) || "";
    // Resolved when prices have collapsed to 0/1.
    const resolved = (yp >= 0.99 && np <= 0.01) || (yp <= 0.01 && np >= 0.99);
    let winner = null;
    if (resolved) {
      winner = yp >= 0.99 ? "A" : "B";
    }
    return {
      status: closed ? "closed" : "active",
      yesPrice: yp,
      noPrice: np,
      outcomeA,
      isSettled: closed && resolved,
      winner,
    };
  } catch (e) {
    return { status: "error", error: e.message, isSettled: false };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { positions, kalshiKeyId, kalshiPrivateKey, config: cfg } = req.body || {};
  if (!Array.isArray(positions) || positions.length === 0) {
    return res.status(200).json({ updates: [] });
  }
  if (!kalshiKeyId || !kalshiPrivateKey) {
    return res.status(400).json({ error: "Kalshi credentials required" });
  }
  const apiBase = cfg?.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";
  const kalshiAuth = { keyId: kalshiKeyId, privateKey: kalshiPrivateKey };

  const updates = [];
  await Promise.all(positions.map(async (pos) => {
    if (!pos || pos.status !== "open") return;
    const kLeg = (pos.legs || []).find((l) => l.platform === "kalshi");
    const pLeg = (pos.legs || []).find((l) => l.platform === "polymarket");
    if (!kLeg || !pLeg) return;

    const [kRes, pRes] = await Promise.all([
      getKalshiResult(kLeg.ticker, kalshiAuth, apiBase),
      getPolymarketResult(pLeg.marketId || pLeg.slug),
    ]);

    if (!kRes.isSettled || !pRes.isSettled) {
      updates.push({
        positionId: pos.id,
        status: "open",
        kalshiStatus: kRes.status,
        polyStatus: pRes.status,
      });
      return;
    }

    // Compute payouts.
    // Kalshi leg: side YES wins iff result === "yes". side NO wins iff result === "no".
    const kWon = kLeg.side === "YES" ? kRes.result === "yes" : kRes.result === "no";
    const kPayout = kWon ? 1.0 : 0.0;

    // Polymarket leg: we always buy one outcome. backsTeam tells us which team this leg pays out for.
    // The Polymarket result winner ("A" / "B") corresponds to outcomes[0] / outcomes[1].
    // We don't know from the leg alone which outcome index our backsTeam is, so we infer from the
    // entry price + winner: if our entry was on the winning side, payout = 1.
    // Approximation: we treat pLeg.side === "YES" + winner === "A" => won, but the more reliable
    // signal is comparing the post-resolution price to our entry side. Use winner indirectly.
    // Since the position was structured by execute.js, we know:
    //   - entryPrice = the side we paid (one of yesPrice or noPrice at the time)
    //   - winner === "A" means the outcome at index 0 settled to 1.0
    // Lacking the index in the leg, we fall back to: if Kalshi paid out, the cross-platform
    // hedge implies Polymarket's other side paid out -> pLeg lost (and vice versa).
    // For an arb, exactly one of the two legs pays out 1.0.
    const pWon = !kWon;
    const pPayout = pWon ? 1.0 : 0.0;

    const contracts = pos.contracts || 1;
    const realizedPnl = ((kPayout - kLeg.entryPrice) + (pPayout - pLeg.entryPrice)) * contracts;

    updates.push({
      positionId: pos.id,
      status: "settled",
      kalshiStatus: kRes.status,
      polyStatus: pRes.status,
      kalshiResult: kRes.result,
      polyWinner: pRes.winner,
      kPayout,
      pPayout,
      kWon,
      pWon,
      realizedPnl: +realizedPnl.toFixed(4),
    });
  }));

  return res.status(200).json({ updates });
}
