/**
 * Regression test for the production failure:
 *   "Found 15 Kalshi markets, 0 Polymarket markets, 0 matched events"
 *
 * Simulates the case where /public-search?q=nba returns nothing (matches the
 * live behavior we observed), but /events?tag_slug=nba and targeted matchup
 * searches do return events. Verifies the adapter + engine recover the match.
 */

import { buildKalshiAdapter } from "../lib/venues/kalshi.js";
import { buildPolymarketAdapter } from "../lib/venues/polymarket.js";
import { findOpportunities } from "../lib/trading/engine.js";

// 5 Kalshi NBA games (10 sibling markets) = what we want to match.
const GAME_PAIRS = [["LAL","BOS"],["GSW","PHX"],["MIA","TOR"],["DAL","DEN"],["NYK","ORL"]];
const KALSHI = {
  markets: GAME_PAIRS.flatMap(([a, b]) => [
    { ticker: `KXNBAGAME-26APR12${a}${b}-${a}`, title: `${a} at ${b} Winner?`, subtitle: a, status: "open", yes_ask: 50, no_ask: 50 },
    { ticker: `KXNBAGAME-26APR12${a}${b}-${b}`, title: `${a} at ${b} Winner?`, subtitle: b, status: "open", yes_ask: 50, no_ask: 50 },
  ]),
};

const POLY_EVENTS_BY_TAG = [
  // Tag-slug endpoint returns 3 of the 5 games (simulating partial coverage).
  {
    slug: "lakers-celtics-2026-04-12", title: "Lakers vs Celtics",
    markets: [{ id: "m1", conditionId: "0xLALBOS",
      question: "Lakers vs Celtics winner?",
      outcomes: '["Los Angeles Lakers","Boston Celtics"]',
      outcomePrices: '["0.48","0.52"]',
      clobTokenIds: '["TOK_LAL","TOK_BOS"]' }],
  },
  {
    slug: "warriors-vs-suns-apr12", title: "Warriors vs Suns",
    markets: [{ id: "m2", conditionId: "0xGSWPHX",
      question: "Which team wins?",
      outcomes: '["Warriors","Suns"]',
      outcomePrices: '["0.44","0.56"]',
      clobTokenIds: '["TOK_GSW","TOK_PHX"]' }],
  },
  {
    slug: "nyk-orl-april-2026", title: "Knicks vs Magic",
    markets: [{ id: "m3", conditionId: "0xNYKORL",
      question: "Knicks or Magic?",
      outcomes: '["New York Knicks","Orlando Magic"]',
      outcomePrices: '["0.65","0.35"]',
      clobTokenIds: '["TOK_NYK","TOK_ORL"]' }],
  },
];

// Hint search returns the other 2 games (MIA/TOR + DAL/DEN) only when queried
// by matchup name. This is the realistic case: some markets never appear on
// the sport's tag page but DO show up under text search for team names.
const POLY_EVENTS_BY_HINT = {
  "Miami Heat Toronto Raptors": [
    { slug: "heat-raptors-4-12", title: "Heat vs Raptors",
      markets: [{ id: "m4", conditionId: "0xMIATOR",
        question: "Heat vs Raptors winner?",
        outcomes: '["Toronto Raptors","Miami Heat"]',
        outcomePrices: '["0.43","0.57"]',
        clobTokenIds: '["TOK_TOR","TOK_MIA"]' }]
    },
  ],
  "Dallas Mavericks Denver Nuggets": [
    { slug: "mavs-nuggets", title: "Mavs vs Nuggets",
      markets: [{ id: "m5", conditionId: "0xDALDEN",
        question: "Mavs vs Nuggets?",
        outcomes: '["Dallas Mavericks","Denver Nuggets"]',
        outcomePrices: '["0.5","0.5"]',
        clobTokenIds: '["TOK_DAL","TOK_DEN"]' }]
    },
  ],
};

function mockKalshiFetch(url) {
  const u = new URL(url);
  if (u.pathname.endsWith("/markets")) return mockResp(KALSHI);
  if (u.pathname.endsWith("/events"))  return mockResp({ events: [] });
  const ob = u.pathname.match(/\/markets\/([^/]+)\/orderbook$/);
  if (ob) return mockResp({ orderbook: { yes: [{ price: 50, quantity: 100 }], no: [{ price: 50, quantity: 100 }] } });
  return mockResp({});
}

function mockPolyFetch(url) {
  const u = new URL(url);
  if (u.pathname === "/public-search") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    // Simulate the prod failure: bare "nba"/"basketball" returns NOTHING.
    if (q === "nba" || q === "basketball") return mockResp({ events: [] });
    // Hint queries by matchup name: look up case-insensitively.
    for (const [key, events] of Object.entries(POLY_EVENTS_BY_HINT)) {
      if (q.includes(key.toLowerCase()) || key.toLowerCase().includes(q)) return mockResp({ events });
    }
    return mockResp({ events: [] });
  }
  if (u.pathname === "/events") {
    // tag_slug=nba returns the 3 tag-indexed games.
    const tag = u.searchParams.get("tag_slug") || u.searchParams.get("tag");
    if (tag === "nba" || tag === "basketball") return mockResp({ events: POLY_EVENTS_BY_TAG });
    return mockResp({ events: [] });
  }
  if (u.pathname === "/book") {
    return mockResp({ bids: [{ price: "0.50", size: "100" }], asks: [{ price: "0.51", size: "100" }] });
  }
  return mockResp({});
}

function mockResp(o) { return Promise.resolve({ ok: true, async json() { return o; }, async text() { return JSON.stringify(o); } }); }

(async () => {
  const kalshi = buildKalshiAdapter({ fetchImpl: mockKalshiFetch });
  const polymarket = buildPolymarketAdapter({ fetchImpl: mockPolyFetch });

  const result = await findOpportunities({
    adapters: { kalshi, polymarket },
    sport: "nba",
    cfg: { bankrollUsd: 1000, minGrossEdge: -1, minNetEdge: -1, slippageBuffer: 0.005, maxPositionPct: 0.1 },
  });

  console.log("Kalshi games:     ", result.kalshiMarketCount);
  console.log("Polymarket games: ", result.polymarketCount);
  console.log("Matched events:   ", result.matchedEventCount);
  console.log("Hint queries sent:", result.diag.hintQueriesSent.slice(0, 6), "...");
  console.log("Kalshi sample:    ", result.diag.kalshiSample.map((x) => x.teams.join("/")).join(", "));
  console.log("Polymarket sample:", result.diag.polymarketSample.map((x) => x.teams.join("/")).join(", "));
  console.log("PM diag:          ", result.diag.polymarket);

  const ok = [];
  const fail = [];
  (result.kalshiMarketCount === 5 ? ok : fail).push(`Kalshi found 5 games (got ${result.kalshiMarketCount})`);
  (result.polymarketCount === 5 ? ok : fail).push(`Polymarket found 5 games via tag + hint merge (got ${result.polymarketCount})`);
  (result.matchedEventCount === 5 ? ok : fail).push(`All 5 games matched cross-venue (got ${result.matchedEventCount})`);

  console.log("\n== checks ==");
  for (const c of ok) console.log("  PASS", c);
  for (const c of fail) console.log("  FAIL", c);
  process.exit(fail.length === 0 ? 0 : 1);
})();
