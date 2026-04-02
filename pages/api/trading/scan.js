const STAKE_GQL_URL = "https://stake.com/_api/graphql";
const SPORT_EVENTS_QUERY = `
query SportEvents($sport: String!, $league: String!) {
  sportEvents(sport: $sport, league: $league, status: "upcoming") {
    id
    name
    slug
    startTime
    competitors { name, id }
    markets {
      id
      name
      selections { id, name, odds }
    }
  }
}`;

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

async function fetchStakeMatches(apiKey) {
  const resp = await fetch(STAKE_GQL_URL, {
    method: "POST",
    headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: SPORT_EVENTS_QUERY, variables: { sport: "cricket", league: "ipl" } }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(data.errors[0]?.message || "Stake GQL error");
  const events = data.data?.sportEvents || [];
  return events
    .map((e) => {
      const wm = e.markets?.find((m) => m.name?.toLowerCase().includes("winner"));
      if (!wm || wm.selections?.length < 2) return null;
      const s = wm.selections;
      return {
        match_id: e.id,
        name: e.name,
        team_a: { name: s[0].name, odds: parseFloat(s[0].odds), selection_id: s[0].id },
        team_b: { name: s[1].name, odds: parseFloat(s[1].odds), selection_id: s[1].id },
      };
    })
    .filter(Boolean);
}

async function fetchKalshiMarkets(token, apiBase) {
  const resp = await fetch(`${apiBase}/markets?series_ticker=IPL&status=open`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  return (data.markets || []).map((m) => ({
    ticker: m.ticker,
    title: m.title || "",
    team_name: m.subtitle || m.title || "",
    yes_price: (m.yes_ask || 0) / 100,
    no_price: (m.no_ask || 0) / 100,
  }));
}

async function fetchKalshiOrderbook(ticker, token, apiBase) {
  const resp = await fetch(`${apiBase}/markets/${ticker}/orderbook`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

  const { stakeApiKey, kalshiToken, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://trading-api.kalshi.com/trade-api/v2";
  const bankroll = cfg?.bankroll || 1000;
  const minGrossArb = cfg?.minGrossArb ?? 0.025;
  const minNetArb = cfg?.minNetArb ?? 0.015;
  const slippageBuffer = cfg?.slippageBuffer ?? 0.02;
  const maxPositionPct = cfg?.maxPositionPct ?? 0.05;
  const maxStakeVig = cfg?.maxStakeVig ?? 0.06;
  const kalshiMinDepthMult = cfg?.kalshiMinDepthMult ?? 1.5;

  // API keys required — paper and live both use real market data
  if (!stakeApiKey || !kalshiToken) {
    return res.status(400).json({ error: "API keys required. Connect your Stake and Kalshi accounts to scan real markets." });
  }

  try {
    const [stakeMatches, kalshiMarkets] = await Promise.all([
      fetchStakeMatches(stakeApiKey),
      fetchKalshiMarkets(kalshiToken, apiBase),
    ]);

    if (!stakeMatches.length) return res.status(200).json({ opportunities: [], message: "No IPL matches on Stake" });
    if (!kalshiMarkets.length) return res.status(200).json({ opportunities: [], message: "No IPL markets on Kalshi" });

    const pairs = matchTeams(stakeMatches, kalshiMarkets);
    const opportunities = [];

    for (const { stakeMatch: sm, kalshiMarket: km, teamName } of pairs) {
      let book;
      try {
        book = await fetchKalshiOrderbook(km.ticker, kalshiToken, apiBase);
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
