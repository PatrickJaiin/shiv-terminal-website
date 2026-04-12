/**
 * Signal engine.
 *
 * Pulls normalized markets from each active venue, matches them, pulls books,
 * and emits Opportunity objects. No execution, no persistence.
 *
 *   findOpportunities({ adapters, sport, cfg }) -> Opportunity[]
 *
 * Currently specialized for Kalshi<>Polymarket because:
 *   - Both have deep limit order books priced 0..1 for binary outcomes
 *   - Both have programmatic REST orderbook endpoints
 *   - Both settle binary, so 1 - priceA - priceB IS the arb edge per contract
 *
 * Extending to a third venue means adding another branch that joins on the
 * normalized Market + converts prices into 0..1 dollar terms.
 */

import { matchMarkets } from "./match.js";
import { walkBookVwap, netEdge, sizeArb, opportunityId } from "./math.js";

const DEFAULT_CFG = {
  bankrollUsd: 1000,
  maxPositionPct: 0.05,
  kellyFrac: 0.25,
  minGrossEdge: 0.01,   // 1c per $1 notional
  minNetEdge: 0.005,    // 0.5c after fees+gas+slippage
  slippageBuffer: 0.005, // 0.5c static buffer
  bookTtlMs: 2500,      // reject opps whose books are older than this
  maxOppAgeMs: 5000,    // opportunities expire after this
};

/**
 * @param {{
 *   adapters: { kalshi: ReturnType<typeof import('../venues/kalshi.js').buildKalshiAdapter>,
 *               polymarket: ReturnType<typeof import('../venues/polymarket.js').buildPolymarketAdapter> },
 *   sport: string,
 *   cfg?: Partial<typeof DEFAULT_CFG>,
 * }} params
 */
export async function findOpportunities({ adapters, sport, cfg: userCfg = {} }) {
  const cfg = { ...DEFAULT_CFG, ...userCfg };
  const { kalshi, polymarket } = adapters;

  // 1. Pull Kalshi first (cheap REST), then use each game's two team names as
  //    targeted Polymarket search hints. This massively improves recall: the
  //    broad /events tag page often doesn't list game-level markets until
  //    game time, but a direct search on "Warriors Suns" finds the matchup.
  const kMarketsRaw = await kalshi.listMarkets({ sport }).catch((e) => ({ __err: e.message }));
  const kList = Array.isArray(kMarketsRaw) ? kMarketsRaw : [];

  const hintQueries = new Set();
  for (const m of kList) {
    // Prefer the display matchup ("LA Lakers Boston Celtics"), fall back to
    // raw title strings from the Kalshi markets ("LAL at BOS Winner?").
    hintQueries.add(`${m.teamA.display} ${m.teamB.display}`);
    if (m.raw?.titleA) hintQueries.add(m.raw.titleA.replace(/Winner\??/gi, "").replace(/ at /gi, " ").trim());
  }

  const pMarketsRaw = await polymarket.listMarkets({ sport, hintQueries: [...hintQueries] }).catch((e) => ({ __err: e.message }));
  const pList = Array.isArray(pMarketsRaw) ? pMarketsRaw : [];

  // 2. Match by canonical team pair + game date.
  const pairs = matchMarkets(kList, pList);

  // 3. For each pair, pull books on both sides (one book per team).
  //    Kalshi: one orderbook per sibling ticker (team). Polymarket: one book
  //    per tokenId. We fetch all four books per pair in parallel.
  const opportunities = [];
  const ts = Date.now();

  await Promise.all(pairs.map(async ({ a: kMkt, b: pMkt }) => {
    // Align both venues to a shared team ordering. We anchor on the Polymarket
    // market because its tokenA/tokenB indices are fixed on-chain; Kalshi
    // siblings are symmetric so we pick the ticker matching pMkt.teamA.
    const canonA = pMkt.teamA.canon;
    const canonB = pMkt.teamB.canon;
    const kAIsTeamA = canonOf(kMkt.teamA.canon) === canonOf(canonA);
    const kTickerForA = kAIsTeamA ? kMkt.raw.tickerA : kMkt.raw.tickerB;
    const kTickerForB = kAIsTeamA ? kMkt.raw.tickerB : kMkt.raw.tickerA;
    const pTokenA = pMkt.raw.tokenIdA;
    const pTokenB = pMkt.raw.tokenIdB;

    const [bookKA, bookKB, bookPA, bookPB] = await Promise.all([
      safe(kalshi.getBook({ marketTicker: kTickerForA })),
      safe(kalshi.getBook({ marketTicker: kTickerForB })),
      safe(polymarket.getBook({ tokenId: pTokenA })),
      safe(polymarket.getBook({ tokenId: pTokenB })),
    ]);

    // For each team slot we can build an arb two ways:
    //
    //   Direction 1: BUY team A on Kalshi (YES), BUY team B on Polymarket.
    //     gross = 1 - kalshiYesAsk(A) - polyAsk(B)
    //
    //   Direction 2: BUY team A on Polymarket, BUY team B on Kalshi YES.
    //     gross = 1 - polyAsk(A) - kalshiYesAsk(B)
    //
    // These are the only two legal binary hedge pairs. We evaluate both and
    // emit any that has positive gross at top of book.

    const dir1 = evalDirection({
      legABook: bookKA?.yesAsks,   // buy Kalshi YES on team A
      legBBook: bookPB?.asks,      // buy Polymarket on team B token
      legALabel: "kalshi_yes",
      legBLabel: "polymarket_yes",
      eventLabel: pMkt.label,
      teamAMeta: { venue: "kalshi",     marketId: kTickerForA,  side: "YES", backsTeamCanon: canonA },
      teamBMeta: { venue: "polymarket", marketId: pMkt.marketId, tokenId: pTokenB, side: "YES", backsTeamCanon: canonB },
      kalshi, polymarket, cfg,
    });

    const dir2 = evalDirection({
      legABook: bookPA?.asks,      // buy Polymarket team A
      legBBook: bookKB?.yesAsks,   // buy Kalshi YES team B
      legALabel: "polymarket_yes",
      legBLabel: "kalshi_yes",
      eventLabel: pMkt.label,
      teamAMeta: { venue: "polymarket", marketId: pMkt.marketId, tokenId: pTokenA, side: "YES", backsTeamCanon: canonA },
      teamBMeta: { venue: "kalshi",     marketId: kTickerForB,  side: "YES", backsTeamCanon: canonB },
      kalshi, polymarket, cfg,
    });

    for (const opp of [dir1, dir2]) {
      if (!opp) continue;
      opportunities.push({
        ...opp,
        id: opportunityId({ legA: opp.legA, legB: opp.legB, ts }),
        eventLabel: pMkt.label,
        gameDate: kMkt.gameDate || pMkt.gameDate,
        pairType: "kalshi_polymarket",
        expiresAt: ts + cfg.maxOppAgeMs,
      });
    }
  }));

  // Rank: passing opps first, by netEdge desc, then by edge even if failing.
  opportunities.sort((a, b) => {
    if (a.passes !== b.passes) return a.passes ? -1 : 1;
    return (b.netEdge || 0) - (a.netEdge || 0);
  });

  return {
    opportunities,
    matchedEventCount: pairs.length,
    kalshiMarketCount: kList.length,
    polymarketCount: pList.length,
    diag: {
      kalshi: kList._diag || null,
      polymarket: pList._diag || null,
      hintQueriesSent: [...hintQueries],
      kalshiSample: kList.slice(0, 5).map((m) => ({ id: m.eventId, label: m.label, date: m.gameDate, teams: [m.teamA.canon, m.teamB.canon] })),
      polymarketSample: pList.slice(0, 5).map((m) => ({ id: m.eventId, label: m.label, date: m.gameDate, teams: [m.teamA.canon, m.teamB.canon] })),
    },
    ts,
  };
}

function canonOf(x) { return (x || "").toLowerCase(); }

async function safe(promise) {
  try { return await promise; } catch { return null; }
}

/**
 * Evaluate a single hedge direction. Returns a partial Opportunity (without
 * id/eventLabel/pairType) or null if the direction is impossible.
 */
function evalDirection({
  legABook, legBBook, legALabel, legBLabel,
  eventLabel, teamAMeta, teamBMeta,
  kalshi, polymarket, cfg,
}) {
  if (!Array.isArray(legABook) || !Array.isArray(legBBook)) return null;
  if (legABook.length === 0 || legBBook.length === 0) return null;

  // Best-price one-unit view, then size-dependent vwap.
  const topA = legABook[0].price;
  const topB = legBBook[0].price;
  if (!Number.isFinite(topA) || !Number.isFinite(topB)) return null;
  const grossTop = 1 - topA - topB;
  if (grossTop <= 0) {
    // No edge even at top of book. Still emit as diagnostic? Skip for speed.
    return null;
  }

  // Preliminary sizing by depth at/near top of book.
  const depthA = legABook.reduce((s, l) => s + l.size, 0);
  const depthB = legBBook.reduce((s, l) => s + l.size, 0);

  const feesBpsA = teamAMeta.venue === "kalshi" ? kalshi.feesBps : polymarket.feesBps;
  const feesBpsB = teamBMeta.venue === "kalshi" ? kalshi.feesBps : polymarket.feesBps;
  const gasA = teamAMeta.venue === "polymarket" ? polymarket.gasUsdPerLeg : 0;
  const gasB = teamBMeta.venue === "polymarket" ? polymarket.gasUsdPerLeg : 0;

  // First sizing pass using top prices; we refine with vwap once we know size.
  const firstSize = sizeArb({
    bankrollUsd: cfg.bankrollUsd,
    edge: grossTop,
    depthA, depthB,
    priceA: topA, priceB: topB,
    maxPositionPct: cfg.maxPositionPct,
    kellyFrac: cfg.kellyFrac,
  });
  if (firstSize.contracts <= 0) return null;

  const qA = walkBookVwap(legABook, firstSize.contracts);
  const qB = walkBookVwap(legBBook, firstSize.contracts);
  if (!qA.vwap || !qB.vwap) return null;

  // With vwap known, final price per leg is qA.vwap / qB.vwap; recompute edge.
  const grossEdge = 1 - qA.vwap - qB.vwap;
  const sizeUsd = firstSize.contracts * (qA.vwap + qB.vwap);
  const net = netEdge({
    grossEdge,
    feesBpsA, feesBpsB,
    gasUsd: gasA + gasB,
    sizeUsd,
    slippageBuffer: cfg.slippageBuffer,
  });

  const passes =
    grossEdge >= cfg.minGrossEdge &&
    net >= cfg.minNetEdge &&
    firstSize.contracts > 0;

  let abortReason = null;
  if (!passes) {
    if (grossEdge < cfg.minGrossEdge) abortReason = `grossEdge ${pct(grossEdge)} < min ${pct(cfg.minGrossEdge)}`;
    else if (net < cfg.minNetEdge) abortReason = `netEdge ${pct(net)} < min ${pct(cfg.minNetEdge)}`;
    else abortReason = "unknown";
  }

  const legA = {
    ...teamAMeta,
    action: "BUY",
    price: round4(qA.vwap),
    size: firstSize.contracts,
  };
  const legB = {
    ...teamBMeta,
    action: "BUY",
    price: round4(qB.vwap),
    size: firstSize.contracts,
  };

  return {
    eventLabel,
    legA, legB,
    grossEdge: round4(grossEdge),
    netEdge: round4(net),
    sizeUsd: round2(sizeUsd),
    sizeContracts: firstSize.contracts,
    passes,
    abortReason,
    diag: {
      topA: round4(topA),
      topB: round4(topB),
      depthA, depthB,
      filledA: qA.filledSize,
      filledB: qB.filledSize,
      legALabel, legBLabel,
      feesBpsA, feesBpsB, gasUsd: gasA + gasB,
      sizeLimits: firstSize.limits,
    },
  };
}

function round4(x) { return Math.round(x * 10000) / 10000; }
function round2(x) { return Math.round(x * 100) / 100; }
function pct(x) { return `${(x * 100).toFixed(2)}c`; }
