import { kalshiFetch } from "../../../utils/kalshi-auth";

const STAKE_GQL_URL = "https://stake.com/_api/graphql";
const PLACE_BET_MUTATION = `
mutation PlaceBet($selectionId: String!, $amount: Float!, $odds: Float!) {
  sportBetPlace(selectionId: $selectionId, amount: $amount, odds: $odds, currency: "usdt") {
    id, status, odds, amount, potentialPayout
  }
}`;

function devig(oddsA, oddsB) {
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return rawA / overround;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { stakeApiKey, kalshiKeyId, kalshiPrivateKey, opportunity: opp, mode, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://trading-api.kalshi.com/trade-api/v2";
  const slippageBuffer = cfg?.slippageBuffer ?? 0.02;
  const kalshiMinDepthMult = cfg?.kalshiMinDepthMult ?? 1.5;
  const ts = Date.now();

  // ── Paper trade: simulate execution with realistic slippage ──
  if (mode === "paper") {
    const posSize = opp.positionSize || (cfg?.bankroll || 1000) * (cfg?.maxPositionPct || 0.05);
    const stakeSlip = (Math.random() - 0.4) * 0.04;
    const kalshiSlip = (Math.random() - 0.4) * 0.02;
    const simStakeOdds = opp.stakeOddsA + stakeSlip;
    const simKalshiFill = Math.max(0.01, opp.kalshiNoPrice + kalshiSlip);
    const simDevigA = devig(simStakeOdds, opp.stakeOddsB);
    const simGross = 1.0 - simDevigA - simKalshiFill;
    const simNet = simGross - slippageBuffer;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));
    return res.status(200).json({
      success: true,
      shadow: true,
      timestamp: ts,
      stakeConfirmedOdds: +simStakeOdds.toFixed(3),
      stakeAmount: posSize,
      kalshiFillPrice: +simKalshiFill.toFixed(4),
      actualGrossArb: +simGross.toFixed(4),
      actualNetArb: +simNet.toFixed(4),
    });
  }

  // ── Live trade ──
  if (!stakeApiKey || !kalshiKeyId || !kalshiPrivateKey) {
    return res.status(400).json({ error: "API keys required for live trading" });
  }

  const kalshiAuth = { keyId: kalshiKeyId, privateKey: kalshiPrivateKey };

  const positionSize = opp.positionSize || (cfg?.bankroll || 1000) * (cfg?.maxPositionPct || 0.05);

  // Step 8: Verify Kalshi depth
  let book;
  try {
    const bookResp = await kalshiFetch(`${apiBase}/markets/${opp.kalshiTicker}/orderbook`, kalshiAuth);
    book = await bookResp.json();
  } catch (e) {
    return res.status(200).json({ success: false, timestamp: ts, error: `Orderbook fetch failed: ${e.message}` });
  }

  const noLevels = book.orderbook?.no || [];
  const depth = noLevels.reduce((s, l) => s + (l.quantity || 0), 0);
  const requiredDepth = positionSize * kalshiMinDepthMult;
  if (depth < requiredDepth) {
    return res.status(200).json({ success: false, timestamp: ts, error: `Depth ${depth} < ${requiredDepth.toFixed(0)} required` });
  }

  // Step 9: Place Stake bet (FIRST — irreversible)
  let stakeResult;
  try {
    const stakeStart = Date.now();
    const stakeResp = await fetch(STAKE_GQL_URL, {
      method: "POST",
      headers: { "x-access-token": stakeApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: PLACE_BET_MUTATION,
        variables: { selectionId: opp.stakeSelectionId, amount: positionSize, odds: opp.stakeOddsA },
      }),
    });
    const stakeData = await stakeResp.json();
    if (stakeData.errors) throw new Error(stakeData.errors[0]?.message || "Stake error");
    const bet = stakeData.data?.sportBetPlace || {};
    stakeResult = {
      betId: bet.id || "",
      confirmedOdds: parseFloat(bet.odds || opp.stakeOddsA),
      amount: parseFloat(bet.amount || positionSize),
      latency: Date.now() - stakeStart,
    };
  } catch (e) {
    return res.status(200).json({ success: false, timestamp: ts, error: `Stake bet failed: ${e.message}` });
  }

  // Recalculate arb with confirmed odds (strategy Section 4)
  const newDevigA = devig(stakeResult.confirmedOdds, opp.stakeOddsB);
  const newGross = 1.0 - newDevigA - opp.kalshiNoPrice;

  // Step 10: Place Kalshi NO limit order
  const priceCents = Math.round(opp.kalshiNoPrice * 100);
  const contracts = Math.max(1, Math.floor(positionSize));
  let kalshiResult;
  try {
    const kResp = await kalshiFetch(`${apiBase}/portfolio/orders`, {
      ...kalshiAuth,
      method: "POST",
      body: { ticker: opp.kalshiTicker, action: "buy", side: "no", type: "limit", count: contracts, no_price: priceCents },
    });
    const kData = await kResp.json();
    if (!kResp.ok) throw new Error(kData.message || "Order failed");
    const order = kData.order || {};
    kalshiResult = {
      orderId: order.order_id || "",
      fillPrice: (order.no_price || priceCents) / 100,
      status: order.status || "unknown",
      filledCount: order.place_count || 0,
    };
  } catch (e) {
    return res.status(200).json({
      success: false, timestamp: ts,
      stakeBetId: stakeResult.betId, stakeConfirmedOdds: stakeResult.confirmedOdds, stakeAmount: stakeResult.amount,
      error: `Kalshi order failed after Stake placed: ${e.message}. MANUAL HEDGE NEEDED.`,
    });
  }

  // Return immediately with both legs placed — client will poll for Kalshi fill
  const filled = kalshiResult.status === "filled";
  if (filled) {
    const actualGross = 1.0 - newDevigA - kalshiResult.fillPrice;
    const actualNet = actualGross - slippageBuffer;
    return res.status(200).json({
      success: true, shadow: false, timestamp: ts,
      stakeBetId: stakeResult.betId, stakeConfirmedOdds: stakeResult.confirmedOdds, stakeAmount: stakeResult.amount,
      kalshiOrderId: kalshiResult.orderId, kalshiFillPrice: kalshiResult.fillPrice, kalshiFilledCount: kalshiResult.filledCount,
      actualGrossArb: +actualGross.toFixed(4), actualNetArb: +actualNet.toFixed(4),
    });
  }

  // Not immediately filled — return pending so client can poll via check-fill
  return res.status(200).json({
    success: false,
    pending: true,
    timestamp: ts,
    stakeBetId: stakeResult.betId,
    stakeConfirmedOdds: stakeResult.confirmedOdds,
    stakeAmount: stakeResult.amount,
    kalshiOrderId: kalshiResult.orderId,
    kalshiTicker: opp.kalshiTicker,
    newDevigA: +newDevigA.toFixed(4),
    error: "Kalshi order pending — polling for fill...",
  });
}
