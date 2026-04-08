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

  const { platforms, stakeApiKey, kalshiKeyId, kalshiPrivateKey, opportunity: opp, mode, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";
  const slippageBuffer = cfg?.slippageBuffer ?? 0.02;
  const kalshiMinDepthMult = cfg?.kalshiMinDepthMult ?? 1.5;
  const ts = Date.now();

  const activePlatforms = platforms || ["stake", "kalshi"];
  const hasStake = activePlatforms.includes("stake");
  const hasKalshi = activePlatforms.includes("kalshi");
  const hasPoly = activePlatforms.includes("polymarket");
  const pairType = opp.pairType || "stake_kalshi";

  // ── Paper trade: simulate execution with realistic slippage ──
  if (mode === "paper") {
    const posSize = opp.positionSize || (cfg?.bankroll || 1000) * (cfg?.maxPositionPct || 0.05);
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));

    if (pairType === "stake_kalshi") {
      const stakeSlip = (Math.random() - 0.4) * 0.04;
      const kalshiSlip = (Math.random() - 0.4) * 0.02;
      const simStakeOdds = opp.stakeOddsA + stakeSlip;
      const simKalshiFill = Math.max(0.01, opp.kalshiNoPrice + kalshiSlip);
      const simDevigA = devig(simStakeOdds, opp.stakeOddsB);
      const simGross = 1.0 - simDevigA - simKalshiFill;
      const simNet = simGross - slippageBuffer;
      return res.status(200).json({
        success: true, shadow: true, timestamp: ts,
        stakeConfirmedOdds: +simStakeOdds.toFixed(3),
        stakeAmount: posSize,
        kalshiFillPrice: +simKalshiFill.toFixed(4),
        actualGrossArb: +simGross.toFixed(4),
        actualNetArb: +simNet.toFixed(4),
      });
    }

    if (pairType === "stake_polymarket") {
      const stakeSlip = (Math.random() - 0.4) * 0.04;
      const polySlip = (Math.random() - 0.4) * 0.02;
      const simStakeOdds = opp.stakeOddsA + stakeSlip;
      const simPolyFill = Math.max(0.01, opp.polymarketNoPrice + polySlip);
      const simDevigA = devig(simStakeOdds, opp.stakeOddsB);
      const simGross = 1.0 - simDevigA - simPolyFill;
      const simNet = simGross - slippageBuffer;
      return res.status(200).json({
        success: true, shadow: true, timestamp: ts,
        stakeConfirmedOdds: +simStakeOdds.toFixed(3),
        stakeAmount: posSize,
        polymarketFillPrice: +simPolyFill.toFixed(4),
        actualGrossArb: +simGross.toFixed(4),
        actualNetArb: +simNet.toFixed(4),
        polymarketNote: "Polymarket leg simulated (paper mode)",
      });
    }

    if (pairType === "kalshi_polymarket") {
      // Simulate fills with small slippage on top of quoted prices.
      const slip1 = (Math.random() - 0.4) * 0.02;
      const slip2 = (Math.random() - 0.4) * 0.02;
      const buyFill  = Math.max(0.01, Math.min(0.99, opp.buyPrice  + slip1));
      const sellFill = Math.max(0.01, Math.min(0.99, opp.sellPrice + slip2));
      const simGross = 1.0 - buyFill - sellFill;
      const simNet = simGross - slippageBuffer;

      // Build the open position. Each leg will pay out 1.0 if its side wins,
      // 0 otherwise. Combined cost = buyFill + sellFill, max payoff = 1.0,
      // so realized arb = 1.0 - (buyFill + sellFill) regardless of outcome.
      // We sell `contracts` units on each leg; the dollar position size is
      // contracts * (buyFill + sellFill).
      const totalCost = buyFill + sellFill;
      const contracts = totalCost > 0 ? Math.max(1, Math.floor(posSize / totalCost)) : 1;
      const realizedDollarSize = contracts * totalCost;

      // Identify which side each leg backs.
      // direction "kalshi_yes_poly_no": buy=Kalshi YES on opp.team, sell=Poly opponent
      // direction "poly_yes_kalshi_no": buy=Poly opp.team,            sell=Kalshi NO on opp.team
      const team = (opp.team || "").toLowerCase();
      const opponent = team === (opp.teamA || "").toLowerCase()
        ? (opp.teamB || "").toLowerCase()
        : (opp.teamA || "").toLowerCase();
      const isKYes = opp.direction === "kalshi_yes_poly_no";

      // Kalshi leg
      const kalshiLeg = {
        platform: "kalshi",
        ticker: opp.kalshiTicker,
        side: isKYes ? "YES" : "NO",
        backsTeam: isKYes ? team : opponent,
        entryPrice: isKYes ? +buyFill.toFixed(4) : +sellFill.toFixed(4),
        payoffIfWin: 1.0,
      };
      // Polymarket leg
      const polyLeg = {
        platform: "polymarket",
        marketId: opp.polymarketId,
        slug: opp.polymarketSlug,
        question: opp.polymarketQuestion,
        side: "YES", // Polymarket is two binary outcomes; we're always buying one outcome
        backsTeam: isKYes ? opponent : team,
        entryPrice: isKYes ? +sellFill.toFixed(4) : +buyFill.toFixed(4),
        payoffIfWin: 1.0,
      };

      const positionId = `paper-${ts}-${Math.floor(Math.random() * 1e6)}`;
      const position = {
        id: positionId,
        createdAt: ts,
        mode: "paper",
        status: "open",
        pairType: "kalshi_polymarket",
        event: {
          label: opp.matchName,
          gameDate: opp.gameDate || null,
          teamA: opp.teamA || null,
          teamB: opp.teamB || null,
        },
        backingTeam: team,
        contracts,
        legs: [kalshiLeg, polyLeg],
        entryGrossArb: +simGross.toFixed(4),
        entryNetArb: +simNet.toFixed(4),
        positionSize: realizedDollarSize,
      };

      return res.status(200).json({
        success: true, shadow: true, timestamp: ts,
        position,
        // Legacy fields kept for compatibility with the existing trade-row renderer
        buyPlatform: opp.buyPlatform,
        buyFillPrice: +buyFill.toFixed(4),
        sellPlatform: opp.sellPlatform,
        sellFillPrice: +sellFill.toFixed(4),
        positionSize: realizedDollarSize,
        actualGrossArb: +simGross.toFixed(4),
        actualNetArb: +simNet.toFixed(4),
      });
    }

    // Fallback paper
    return res.status(200).json({
      success: true, shadow: true, timestamp: ts,
      actualGrossArb: opp.grossArb,
      actualNetArb: opp.netArb,
    });
  }

  // ── Live trade ──

  // Polymarket live execution is not supported (requires on-chain transactions)
  if (hasPoly && (pairType === "stake_polymarket" || pairType === "kalshi_polymarket")) {
    return res.status(200).json({
      success: false, timestamp: ts,
      error: "Polymarket live execution not supported yet (requires on-chain transactions). Use Paper mode for Polymarket pairs.",
    });
  }

  // Original Stake + Kalshi live execution
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
