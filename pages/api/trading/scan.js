import { kalshiFetch } from "../../../utils/kalshi-auth";

function devig(oddsA, oddsB) {
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return { devigA: rawA / overround, devigB: rawB / overround, overround, rawA, rawB };
}

function matchTeams(stakeMatches, kalshiMarkets) {
  const pairs = [];
  for (const sm of stakeMatches) {
    const teamAName = sm.team_a.name.toLowerCase().trim();
    for (const km of kalshiMarkets) {
      const kalshiTeam = km.team_name.toLowerCase().trim();
      if (
        kalshiTeam.includes(teamAName) ||
        teamAName.includes(kalshiTeam) ||
        teamAName.split(" ").filter((w) => w.length > 3).some((w) => kalshiTeam.includes(w))
      ) {
        pairs.push({ stakeMatch: sm, kalshiMarket: km, teamName: sm.team_a.name });
      }
    }
  }
  return pairs;
}

async function fetchKalshiMarkets(kalshiAuth, apiBase) {
  const resp = await kalshiFetch(`${apiBase}/markets?series_ticker=IPL&status=open`, kalshiAuth);
  const data = await resp.json();
  return (data.markets || []).map((m) => ({
    ticker: m.ticker,
    title: m.title || "",
    team_name: m.subtitle || m.title || "",
    yes_price: (m.yes_ask || 0) / 100,
    no_price: (m.no_ask || 0) / 100,
  }));
}

async function fetchKalshiOrderbook(ticker, kalshiAuth, apiBase) {
  const resp = await kalshiFetch(`${apiBase}/markets/${ticker}/orderbook`, kalshiAuth);
  const data = await resp.json();
  const noLevels = data.orderbook?.no || [];
  if (!noLevels.length) return { best_no_ask: 1.0, no_depth: 0 };
  return {
    best_no_ask: (noLevels[0].price || 100) / 100,
    no_depth: noLevels.reduce((sum, l) => sum + (l.quantity || 0), 0),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { stakeMatches, kalshiKeyId, kalshiPrivateKey, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";
  const bankroll = cfg?.bankroll || 1000;
  const minGrossArb = cfg?.minGrossArb ?? 0.025;
  const minNetArb = cfg?.minNetArb ?? 0.015;
  const slippageBuffer = cfg?.slippageBuffer ?? 0.02;
  const maxPositionPct = cfg?.maxPositionPct ?? 0.05;
  const maxStakeVig = cfg?.maxStakeVig ?? 0.06;
  const kalshiMinDepthMult = cfg?.kalshiMinDepthMult ?? 1.5;

  if (!kalshiKeyId || !kalshiPrivateKey) {
    return res.status(400).json({ error: "Kalshi API credentials required." });
  }
  if (!stakeMatches || !stakeMatches.length) {
    return res.status(200).json({ opportunities: [], message: "No Stake matches provided", stakeMatchCount: 0, kalshiMarketCount: 0 });
  }

  const kalshiAuth = { keyId: kalshiKeyId, privateKey: kalshiPrivateKey };

  try {
    const kalshiMarkets = await fetchKalshiMarkets(kalshiAuth, apiBase);

    if (!kalshiMarkets.length) return res.status(200).json({ opportunities: [], message: "No IPL markets on Kalshi", stakeMatchCount: stakeMatches.length, kalshiMarketCount: 0 });

    const pairs = matchTeams(stakeMatches, kalshiMarkets);
    const opportunities = [];

    for (const { stakeMatch: sm, kalshiMarket: km, teamName } of pairs) {
      let book;
      try {
        book = await fetchKalshiOrderbook(km.ticker, kalshiAuth, apiBase);
      } catch {
        continue;
      }

      const { devigA, overround, rawA, rawB } = devig(sm.team_a.odds, sm.team_b.odds);
      const grossArb = 1.0 - devigA - book.best_no_ask;
      const netArb = grossArb - slippageBuffer;
      const positionSize = bankroll * maxPositionPct;

      let passesThreshold = true;
      let abortReason = null;
      if (grossArb < minGrossArb) { passesThreshold = false; abortReason = `Gross arb ${(grossArb*100).toFixed(1)}c < min ${(minGrossArb*100).toFixed(1)}c`; }
      else if (netArb < minNetArb) { passesThreshold = false; abortReason = `Net arb ${(netArb*100).toFixed(1)}c < min ${(minNetArb*100).toFixed(1)}c`; }
      else if (overround > 1 + maxStakeVig) { passesThreshold = false; abortReason = `Overround ${overround.toFixed(4)} > max ${1 + maxStakeVig}`; }
      else if (book.no_depth < positionSize * kalshiMinDepthMult) { passesThreshold = false; abortReason = `Depth ${book.no_depth} < ${(positionSize * kalshiMinDepthMult).toFixed(0)} required`; }

      opportunities.push({
        matchName: sm.name,
        team: teamName,
        stakeOddsA: sm.team_a.odds,
        stakeOddsB: sm.team_b.odds,
        stakeSelectionId: sm.team_a.selection_id,
        rawProbA: +rawA.toFixed(4),
        rawProbB: +rawB.toFixed(4),
        overround: +overround.toFixed(4),
        devigProbA: +devigA.toFixed(4),
        kalshiTicker: km.ticker,
        kalshiNoPrice: +book.best_no_ask.toFixed(4),
        kalshiNoDepth: book.no_depth,
        grossArb: +grossArb.toFixed(4),
        netArb: +netArb.toFixed(4),
        positionSize,
        passesThreshold,
        abortReason,
      });
    }

    return res.status(200).json({
      opportunities,
      stakeMatchCount: stakeMatches.length,
      kalshiMarketCount: kalshiMarkets.length,
      mock: false,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
