/**
 * Fixture-based end-to-end test of the scan pipeline.
 *
 * Simulates the Kalshi and Polymarket REST responses we'd see in production
 * for 3 real-world NBA games plus 2 adversarial cases (stale market, single
 * team, different date). Verifies that `findOpportunities` joins them cleanly.
 *
 * Run:   node scripts/test-scan-fixtures.mjs
 */

import { buildKalshiAdapter } from "../lib/venues/kalshi.js";
import { buildPolymarketAdapter } from "../lib/venues/polymarket.js";
import { findOpportunities } from "../lib/trading/engine.js";

/* ── Fixtures ── */

// Kalshi /markets?series_ticker=KXNBAGAME response shape.
// One event = two sibling markets, one per team.
const KALSHI_NBA_MARKETS = {
  markets: [
    { ticker: "KXNBAGAME-26APR12LALBOS-LAL", title: "LAL at BOS Winner?", subtitle: "Los Angeles Lakers", status: "open", yes_ask: 48, no_ask: 53 },
    { ticker: "KXNBAGAME-26APR12LALBOS-BOS", title: "LAL at BOS Winner?", subtitle: "Boston Celtics",     status: "open", yes_ask: 53, no_ask: 48 },
    { ticker: "KXNBAGAME-26APR12GSWPHX-GSW", title: "GSW at PHX Winner?", subtitle: "Golden State Warriors", status: "open", yes_ask: 42, no_ask: 59 },
    { ticker: "KXNBAGAME-26APR12GSWPHX-PHX", title: "GSW at PHX Winner?", subtitle: "Phoenix Suns",       status: "open", yes_ask: 59, no_ask: 42 },
    { ticker: "KXNBAGAME-26APR12MIATOR-MIA", title: "MIA at TOR Winner?", subtitle: "Miami Heat",         status: "open", yes_ask: 55, no_ask: 46 },
    { ticker: "KXNBAGAME-26APR12MIATOR-TOR", title: "MIA at TOR Winner?", subtitle: "Toronto Raptors",    status: "open", yes_ask: 46, no_ask: 55 },
    // Adversarial: single-team event (sibling missing). Should be discarded.
    { ticker: "KXNBAGAME-26APR13NYKORL-NYK", title: "NYK at ORL Winner?", subtitle: "New York Knicks",    status: "open", yes_ask: 60, no_ask: 41 },
  ],
};

const KALSHI_ORDERBOOKS = {
  "KXNBAGAME-26APR12LALBOS-LAL": { orderbook: { yes: [{ price: 48, quantity: 300 }, { price: 47, quantity: 600 }], no: [{ price: 52, quantity: 400 }] } },
  "KXNBAGAME-26APR12LALBOS-BOS": { orderbook: { yes: [{ price: 52, quantity: 350 }, { price: 51, quantity: 500 }], no: [{ price: 48, quantity: 350 }] } },
  "KXNBAGAME-26APR12GSWPHX-GSW": { orderbook: { yes: [{ price: 42, quantity: 300 }], no: [{ price: 58, quantity: 400 }] } },
  "KXNBAGAME-26APR12GSWPHX-PHX": { orderbook: { yes: [{ price: 58, quantity: 250 }], no: [{ price: 42, quantity: 400 }] } },
  "KXNBAGAME-26APR12MIATOR-MIA": { orderbook: { yes: [{ price: 54, quantity: 200 }], no: [{ price: 46, quantity: 300 }] } },
  "KXNBAGAME-26APR12MIATOR-TOR": { orderbook: { yes: [{ price: 46, quantity: 200 }], no: [{ price: 54, quantity: 300 }] } },
};

// Polymarket Gamma /public-search?q=nba response shape.
// Each event groups markets; the moneyline has 2 outcomes (team names).
const POLY_NBA_EVENTS = [
  {
    slug: "nba-lal-bos-2026-04-12", title: "Lakers vs Celtics", startDate: "2026-04-12T23:00:00Z",
    markets: [{
      id: "m-lal-bos", conditionId: "0xCOND_LALBOS", questionId: "0xQ_LALBOS",
      question: "Will the Lakers or Celtics win?",
      outcomes: '["Los Angeles Lakers","Boston Celtics"]',
      outcomePrices: '["0.47","0.53"]',
      clobTokenIds: '["TOK_LAL","TOK_BOS"]',
      liquidity: "5000", volume: "12000",
    }],
  },
  {
    // Same game date but Polymarket uses nicknames vs Kalshi subtitles. The
    // canonicalizer should still resolve both into the same canon ids.
    slug: "nba-warriors-suns-2026-04-12", title: "Warriors vs Suns", startDate: "2026-04-12T20:30:00Z",
    markets: [{
      id: "m-gsw-phx", conditionId: "0xCOND_GSWPHX", questionId: "0xQ_GSWPHX",
      question: "Which team wins, Warriors or Suns?",
      outcomes: '["Warriors","Suns"]',
      outcomePrices: '["0.44","0.56"]',
      clobTokenIds: '["TOK_GSW","TOK_PHX"]',
      liquidity: "3000", volume: "7000",
    }],
  },
  {
    // Heat/Raptors: reversed team order on Polymarket vs Kalshi. Match must
    // be order-independent on {teamA,teamB}.
    slug: "nba-raptors-heat-2026-04-12", title: "Raptors vs Heat", startDate: "2026-04-12T19:30:00Z",
    markets: [{
      id: "m-mia-tor", conditionId: "0xCOND_MIATOR", questionId: "0xQ_MIATOR",
      question: "Heat vs Raptors winner?",
      outcomes: '["Toronto Raptors","Miami Heat"]',
      outcomePrices: '["0.43","0.57"]',
      clobTokenIds: '["TOK_TOR","TOK_MIA"]',
      liquidity: "2500", volume: "6000",
    }],
  },
  {
    // Adversarial: props / spread / over-under should be filtered out.
    slug: "nba-lal-bos-spread-2026-04-12", title: "Lakers -3.5 spread",
    markets: [{
      id: "m-spread", conditionId: "0xCOND_SPREAD", question: "Lakers -3.5 spread cover?",
      outcomes: '["Yes","No"]', outcomePrices: '["0.52","0.48"]',
      clobTokenIds: '["TOK_SY","TOK_SN"]',
    }],
  },
  {
    // Adversarial: already-resolved market (0/1 pricing) should be skipped.
    slug: "nba-finished-game", title: "Already-resolved",
    markets: [{
      id: "m-done", conditionId: "0xCOND_DONE", question: "Team A vs Team B winner?",
      outcomes: '["Denver Nuggets","Dallas Mavericks"]',
      outcomePrices: '["1.00","0.00"]',
      clobTokenIds: '["TOK_DEN","TOK_DAL"]',
    }],
  },
];

// Polymarket CLOB /book?token_id=... response.
const POLY_BOOKS = {
  TOK_LAL: { bids: [{ price: "0.46", size: "800" }], asks: [{ price: "0.47", size: "1000" }, { price: "0.48", size: "1500" }] },
  TOK_BOS: { bids: [{ price: "0.52", size: "900" }], asks: [{ price: "0.53", size: "1200" }, { price: "0.54", size: "1500" }] },
  TOK_GSW: { bids: [{ price: "0.43", size: "500" }], asks: [{ price: "0.44", size: "800" }] },
  TOK_PHX: { bids: [{ price: "0.55", size: "500" }], asks: [{ price: "0.56", size: "800" }] },
  TOK_MIA: { bids: [{ price: "0.56", size: "400" }], asks: [{ price: "0.57", size: "600" }] },
  TOK_TOR: { bids: [{ price: "0.42", size: "400" }], asks: [{ price: "0.43", size: "600" }] },
};

/* ── Mock fetchers ── */

function mockKalshiFetch(url /*, opts */) {
  const u = new URL(url);
  if (u.pathname.endsWith("/markets") && u.searchParams.get("series_ticker")) {
    return mockResp(KALSHI_NBA_MARKETS);
  }
  const obMatch = u.pathname.match(/\/markets\/([^/]+)\/orderbook$/);
  if (obMatch) {
    return mockResp(KALSHI_ORDERBOOKS[obMatch[1]] || { orderbook: { yes: [], no: [] } });
  }
  return mockResp({ markets: [] });
}

function mockPolyFetch(url) {
  const u = new URL(url);
  if (u.pathname === "/public-search") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    if (q.includes("nba")) return mockResp({ events: POLY_NBA_EVENTS });
    return mockResp({ events: [] });
  }
  if (u.pathname === "/book") {
    const tok = u.searchParams.get("token_id");
    return mockResp(POLY_BOOKS[tok] || { bids: [], asks: [] });
  }
  return mockResp({});
}

function mockResp(obj) {
  return Promise.resolve({
    ok: true,
    async json() { return obj; },
    async text() { return JSON.stringify(obj); },
  });
}

/* ── Run ── */

(async () => {
  const kalshi = buildKalshiAdapter({ fetchImpl: mockKalshiFetch });
  const polymarket = buildPolymarketAdapter({ fetchImpl: mockPolyFetch });

  console.log("== KALSHI listMarkets(nba) ==");
  const kMarkets = await kalshi.listMarkets({ sport: "nba" });
  for (const m of kMarkets) {
    console.log(`  ${m.eventId}  ${m.teamA.canon} vs ${m.teamB.canon}  date=${m.gameDate}`);
  }
  console.log(`  total: ${kMarkets.length} events (expected 3, adversarial single-team dropped)`);

  console.log("\n== POLYMARKET listMarkets(nba) ==");
  const pMarkets = await polymarket.listMarkets({ sport: "nba" });
  for (const m of pMarkets) {
    console.log(`  ${m.eventId}  ${m.teamA.canon} vs ${m.teamB.canon}  date=${m.gameDate}  prices=${JSON.stringify(m.raw.outcomePrices)}`);
  }
  console.log(`  total: ${pMarkets.length} events (expected 3, spread/resolved dropped)`);

  console.log("\n== findOpportunities (engine) ==");
  const result = await findOpportunities({
    adapters: { kalshi, polymarket },
    sport: "nba",
    cfg: { bankrollUsd: 1000, minGrossEdge: -1, minNetEdge: -1, slippageBuffer: 0.005, maxPositionPct: 0.1 },
  });
  console.log(`  matchedEventCount: ${result.matchedEventCount}  (expected 3)`);
  console.log(`  opportunities: ${result.opportunities.length}  (expected 6: 2 directions x 3 games)`);
  for (const o of result.opportunities) {
    console.log(`    ${o.eventLabel.padEnd(40)}  ` +
      `legA=${o.legA.venue}:${o.legA.backsTeamCanon}@${o.legA.price}  ` +
      `legB=${o.legB.venue}:${o.legB.backsTeamCanon}@${o.legB.price}  ` +
      `gross=${(o.grossEdge * 100).toFixed(2)}c  net=${(o.netEdge * 100).toFixed(2)}c  ` +
      `size=${o.sizeContracts}  passes=${o.passes}`);
  }

  // Quick assertions.
  const ok = [];
  const fail = [];
  (kMarkets.length === 3 ? ok : fail).push("kalshi event count");
  (pMarkets.length === 3 ? ok : fail).push("polymarket event count (spread/resolved filtered)");
  (result.matchedEventCount === 3 ? ok : fail).push("cross-venue matched events");
  (result.opportunities.length >= 3 ? ok : fail).push("opportunities emitted");
  // Verify order-reversed teams still match (MIA/TOR).
  const mtOpp = result.opportunities.find((o) => o.eventLabel.match(/Miami|Heat|Raptors|Toronto/));
  (mtOpp ? ok : fail).push("MIA/TOR matched despite reversed outcome order");
  // Verify nicknames match canonical ids (GSW "Warriors", PHX "Suns").
  const gpOpp = result.opportunities.find((o) => o.eventLabel.match(/Golden State|Warriors|Phoenix|Suns/));
  (gpOpp ? ok : fail).push("GSW/PHX matched via nickname canonicalization");

  // Strict: for each opportunity, the Kalshi leg's ticker must END in the
  // backed team's canon id (case-insensitive), and the Polymarket leg's
  // tokenId must equal the token the adapter assigned to that canon team.
  let labelMisalign = 0;
  for (const o of result.opportunities) {
    for (const leg of [o.legA, o.legB]) {
      if (leg.venue === "kalshi") {
        const tickerTail = (leg.marketId || "").split("-").pop().toLowerCase();
        if (tickerTail !== leg.backsTeamCanon) {
          console.error(`  LABEL MISALIGN: leg backs ${leg.backsTeamCanon} but ticker is ${leg.marketId}`);
          labelMisalign++;
        }
      } else if (leg.venue === "polymarket") {
        // Find the source pMkt by marketId.
        const src = pMarkets.find((x) => x.marketId === leg.marketId);
        if (!src) { labelMisalign++; continue; }
        const expectedToken = leg.backsTeamCanon === src.teamA.canon ? src.raw.tokenIdA
                           : leg.backsTeamCanon === src.teamB.canon ? src.raw.tokenIdB : null;
        if (leg.tokenId !== expectedToken) {
          console.error(`  LABEL MISALIGN: leg backs ${leg.backsTeamCanon} but tokenId is ${leg.tokenId} (expected ${expectedToken})`);
          labelMisalign++;
        }
      }
    }
  }
  (labelMisalign === 0 ? ok : fail).push(`leg backsTeamCanon matches ticker/tokenId (${labelMisalign} misaligned)`);

  console.log("\n== checks ==");
  for (const c of ok) console.log("  PASS", c);
  for (const c of fail) console.log("  FAIL", c);
  process.exit(fail.length === 0 ? 0 : 1);
})();
