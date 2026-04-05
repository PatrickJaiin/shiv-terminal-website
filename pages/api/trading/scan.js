import { kalshiFetch } from "../../../utils/kalshi-auth";

function devig(oddsA, oddsB) {
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return { devigA: rawA / overround, devigB: rawB / overround, overround, rawA, rawB };
}

/* ── Team name matching helpers ── */
const IPL_TEAM_ALIASES = {
  "chennai": ["chennai", "csk", "super kings"],
  "mumbai": ["mumbai", "mi", "indians"],
  "bangalore": ["bangalore", "bengaluru", "rcb", "royal challengers"],
  "kolkata": ["kolkata", "kkr", "knight riders"],
  "delhi": ["delhi", "dc", "capitals"],
  "rajasthan": ["rajasthan", "rr", "royals"],
  "punjab": ["punjab", "pbks", "kings"],
  "hyderabad": ["hyderabad", "srh", "sunrisers"],
  "lucknow": ["lucknow", "lsg", "super giants"],
  "gujarat": ["gujarat", "gt", "titans"],
};

function normalizeTeamName(name) {
  const lower = (name || "").toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(IPL_TEAM_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) return canonical;
  }
  return lower;
}

function fuzzyTeamMatch(nameA, nameB) {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  if (a.includes(b) || b.includes(a)) return true;
  if (a.split(" ").filter((w) => w.length > 3).some((w) => b.includes(w))) return true;
  if (normalizeTeamName(a) === normalizeTeamName(b) && normalizeTeamName(a) !== a) return true;
  return false;
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

function matchStakePolymarket(stakeMatches, polymarketMarkets) {
  const pairs = [];
  for (const sm of stakeMatches) {
    const teamANorm = normalizeTeamName(sm.team_a.name);
    const teamBNorm = normalizeTeamName(sm.team_b.name);
    for (const pm of polymarketMarkets) {
      const qNorm = (pm.question || "").toLowerCase();
      // Check if this polymarket question mentions one of the teams
      const teamAInQ = teamANorm && (qNorm.includes(teamANorm) || fuzzyTeamMatch(sm.team_a.name, pm.question));
      const teamBInQ = teamBNorm && (qNorm.includes(teamBNorm) || fuzzyTeamMatch(sm.team_b.name, pm.question));
      if (teamAInQ) {
        pairs.push({ stakeMatch: sm, polyMarket: pm, teamName: sm.team_a.name, stakeTeamSide: "a" });
      }
      if (teamBInQ && !teamAInQ) {
        pairs.push({ stakeMatch: sm, polyMarket: pm, teamName: sm.team_b.name, stakeTeamSide: "b" });
      }
    }
  }
  return pairs;
}

function matchKalshiPolymarket(kalshiMarkets, polymarketMarkets) {
  const pairs = [];
  for (const km of kalshiMarkets) {
    const kalshiNorm = normalizeTeamName(km.team_name);
    for (const pm of polymarketMarkets) {
      const polyNorm = normalizeTeamName(pm.question);
      if (
        (kalshiNorm && polyNorm && kalshiNorm === polyNorm) ||
        fuzzyTeamMatch(km.team_name, pm.question)
      ) {
        pairs.push({ kalshiMarket: km, polyMarket: pm, teamName: km.team_name });
      }
    }
  }
  return pairs;
}

/* ── Platform fetch functions ── */

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

async function fetchPolymarketMarkets() {
  const resp = await fetch(`https://gamma-api.polymarket.com/markets?tag=sports&closed=false&limit=100`);
  if (!resp.ok) throw new Error(`Polymarket API ${resp.status}`);
  const markets = await resp.json();
  return markets
    .filter((m) => {
      const q = (m.question || "").toLowerCase();
      return q.includes("ipl") || q.includes("cricket") || (q.includes("premier league") && q.includes("india"));
    })
    .map((m) => {
      const prices = JSON.parse(m.outcomePrices || "[]");
      return {
        id: m.id,
        question: m.question,
        slug: m.slug,
        yesPrice: parseFloat(prices[0] || 0),
        noPrice: parseFloat(prices[1] || 0),
        volume: parseFloat(m.volume || 0),
        liquidity: parseFloat(m.liquidity || 0),
      };
    });
}

/* ── Main handler ── */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { platforms, stakeMatches, kalshiKeyId, kalshiPrivateKey, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";
  const bankroll = cfg?.bankroll || 1000;
  const minGrossArb = cfg?.minGrossArb ?? 0.025;
  const minNetArb = cfg?.minNetArb ?? 0.015;
  const slippageBuffer = cfg?.slippageBuffer ?? 0.02;
  const maxPositionPct = cfg?.maxPositionPct ?? 0.05;
  const maxStakeVig = cfg?.maxStakeVig ?? 0.06;
  const kalshiMinDepthMult = cfg?.kalshiMinDepthMult ?? 1.5;

  const activePlatforms = platforms || ["stake", "kalshi"];
  const hasStake = activePlatforms.includes("stake");
  const hasKalshi = activePlatforms.includes("kalshi");
  const hasPoly = activePlatforms.includes("polymarket");

  // Validate credentials for selected platforms
  if (hasKalshi && (!kalshiKeyId || !kalshiPrivateKey)) {
    return res.status(400).json({ error: "Kalshi API credentials required." });
  }
  if (hasStake && (!stakeMatches || !stakeMatches.length)) {
    return res.status(200).json({ opportunities: [], message: "No Stake matches provided", stakeMatchCount: 0, kalshiMarketCount: 0, polymarketCount: 0 });
  }

  const kalshiAuth = hasKalshi ? { keyId: kalshiKeyId, privateKey: kalshiPrivateKey } : null;

  try {
    // Fetch market data for selected platforms
    let kalshiMarkets = [];
    let polymarketMarkets = [];

    if (hasKalshi) {
      kalshiMarkets = await fetchKalshiMarkets(kalshiAuth, apiBase);
    }
    if (hasPoly) {
      polymarketMarkets = await fetchPolymarketMarkets();
    }

    const opportunities = [];

    /* ── Stake + Kalshi ── */
    if (hasStake && hasKalshi) {
      if (!kalshiMarkets.length) {
        return res.status(200).json({ opportunities: [], message: "No IPL markets on Kalshi", stakeMatchCount: stakeMatches.length, kalshiMarketCount: 0, polymarketCount: 0 });
      }

      const pairs = matchTeams(stakeMatches, kalshiMarkets);
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
          pairType: "stake_kalshi",
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
    }

    /* ── Stake + Polymarket ── */
    if (hasStake && hasPoly) {
      const pairs = matchStakePolymarket(stakeMatches, polymarketMarkets);
      for (const { stakeMatch: sm, polyMarket: pm, teamName, stakeTeamSide } of pairs) {
        const oddsA = stakeTeamSide === "a" ? sm.team_a.odds : sm.team_b.odds;
        const oddsB = stakeTeamSide === "a" ? sm.team_b.odds : sm.team_a.odds;
        const { devigA, overround, rawA, rawB } = devig(oddsA, oddsB);
        // Arb: back team on Stake (devigged) + buy NO on Polymarket
        const grossArb = 1.0 - devigA - pm.noPrice;
        const netArb = grossArb - slippageBuffer;
        const positionSize = bankroll * maxPositionPct;

        let passesThreshold = true;
        let abortReason = null;
        if (grossArb < minGrossArb) { passesThreshold = false; abortReason = `Gross arb ${(grossArb*100).toFixed(1)}c < min ${(minGrossArb*100).toFixed(1)}c`; }
        else if (netArb < minNetArb) { passesThreshold = false; abortReason = `Net arb ${(netArb*100).toFixed(1)}c < min ${(minNetArb*100).toFixed(1)}c`; }
        else if (overround > 1 + maxStakeVig) { passesThreshold = false; abortReason = `Overround ${overround.toFixed(4)} > max ${1 + maxStakeVig}`; }

        opportunities.push({
          pairType: "stake_polymarket",
          matchName: sm.name,
          team: teamName,
          stakeOddsA: oddsA,
          stakeOddsB: oddsB,
          stakeSelectionId: stakeTeamSide === "a" ? sm.team_a.selection_id : sm.team_b.selection_id,
          rawProbA: +rawA.toFixed(4),
          rawProbB: +rawB.toFixed(4),
          overround: +overround.toFixed(4),
          devigProbA: +devigA.toFixed(4),
          polymarketId: pm.id,
          polymarketQuestion: pm.question,
          polymarketNoPrice: +pm.noPrice.toFixed(4),
          polymarketYesPrice: +pm.yesPrice.toFixed(4),
          polymarketLiquidity: pm.liquidity,
          grossArb: +grossArb.toFixed(4),
          netArb: +netArb.toFixed(4),
          positionSize,
          passesThreshold,
          abortReason,
        });
      }
    }

    /* ── Kalshi + Polymarket ── */
    if (hasKalshi && hasPoly) {
      const pairs = matchKalshiPolymarket(kalshiMarkets, polymarketMarkets);
      for (const { kalshiMarket: km, polyMarket: pm, teamName } of pairs) {
        let book;
        try {
          book = await fetchKalshiOrderbook(km.ticker, kalshiAuth, apiBase);
        } catch {
          continue;
        }

        // Two-sided check: buy YES on cheaper platform, buy NO on the other
        // Direction 1: Kalshi YES + Polymarket NO
        const grossArb1 = 1.0 - km.yes_price - pm.noPrice;
        // Direction 2: Polymarket YES + Kalshi NO
        const grossArb2 = 1.0 - pm.yesPrice - book.best_no_ask;

        // Pick the better direction
        let grossArb, direction, buyPlatform, buyPrice, sellPlatform, sellPrice;
        if (grossArb1 >= grossArb2) {
          grossArb = grossArb1;
          direction = "kalshi_yes_poly_no";
          buyPlatform = "Kalshi YES";
          buyPrice = km.yes_price;
          sellPlatform = "Polymarket NO";
          sellPrice = pm.noPrice;
        } else {
          grossArb = grossArb2;
          direction = "poly_yes_kalshi_no";
          buyPlatform = "Polymarket YES";
          buyPrice = pm.yesPrice;
          sellPlatform = "Kalshi NO";
          sellPrice = book.best_no_ask;
        }

        const netArb = grossArb - slippageBuffer;
        const positionSize = bankroll * maxPositionPct;

        let passesThreshold = true;
        let abortReason = null;
        if (grossArb < minGrossArb) { passesThreshold = false; abortReason = `Gross arb ${(grossArb*100).toFixed(1)}c < min ${(minGrossArb*100).toFixed(1)}c`; }
        else if (netArb < minNetArb) { passesThreshold = false; abortReason = `Net arb ${(netArb*100).toFixed(1)}c < min ${(minNetArb*100).toFixed(1)}c`; }
        else if (book.no_depth < positionSize * kalshiMinDepthMult && direction === "poly_yes_kalshi_no") {
          passesThreshold = false; abortReason = `Kalshi depth ${book.no_depth} < ${(positionSize * kalshiMinDepthMult).toFixed(0)} required`;
        }

        opportunities.push({
          pairType: "kalshi_polymarket",
          matchName: `${km.title || km.team_name} / ${pm.question}`,
          team: teamName,
          direction,
          buyPlatform,
          buyPrice: +buyPrice.toFixed(4),
          sellPlatform,
          sellPrice: +sellPrice.toFixed(4),
          kalshiTicker: km.ticker,
          kalshiYesPrice: +km.yes_price.toFixed(4),
          kalshiNoPrice: +book.best_no_ask.toFixed(4),
          kalshiNoDepth: book.no_depth,
          polymarketId: pm.id,
          polymarketQuestion: pm.question,
          polymarketYesPrice: +pm.yesPrice.toFixed(4),
          polymarketNoPrice: +pm.noPrice.toFixed(4),
          polymarketLiquidity: pm.liquidity,
          grossArb: +grossArb.toFixed(4),
          netArb: +netArb.toFixed(4),
          positionSize,
          passesThreshold,
          abortReason,
        });
      }
    }

    return res.status(200).json({
      opportunities,
      stakeMatchCount: hasStake ? (stakeMatches || []).length : 0,
      kalshiMarketCount: kalshiMarkets.length,
      polymarketCount: polymarketMarkets.length,
      mock: false,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
