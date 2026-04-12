/**
 * Polymarket venue adapter.
 *
 * Read-path uses:
 *   Gamma API  (gamma-api.polymarket.com)  - market/event discovery, prices
 *   CLOB API   (clob.polymarket.com)       - orderbook
 *
 * Live order placement requires EIP-712 order signing via
 * @polymarket/clob-client. That package is not installed by default; set
 * POLYMARKET_PRIVATE_KEY in env and `npm i @polymarket/clob-client ethers` to
 * enable. Without them, placeOrder throws and the executor falls back to paper.
 */

import { canonicalize } from "../trading/match.js";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

// Polymarket charges no explicit maker/taker fee (market-maker rebates offset
// taker fees). Gas on Polygon is well under $0.05 at normal loads. Model as
// $0.10 per leg to be safe.
const GAS_USD_PER_LEG = 0.1;

const SPORT_KEYWORDS = {
  nba: ["nba"],
  ipl: ["ipl", "indian premier league"],
  lol: ["league of legends", "lol:"],
  val: ["valorant", "vct"],
  valorant: ["valorant", "vct"],
};

const SPORT_SLUG_PATTERNS = {
  nba: /^nba-/,
  ipl: /^(ipl|cricket-ipl)/,
  lol: /^(lol|league-of-legends)/,
  val: /^(valorant|vct)/,
  valorant: /^(valorant|vct)/,
};

function parseSlugDate(slug) {
  const m = (slug || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractGameDate(ev, ml) {
  const bySlug = parseSlugDate(ev?.slug);
  if (bySlug) return bySlug;
  const startIso = ev?.startDate || ml?.startDate;
  if (startIso) {
    try { return new Date(startIso).toISOString().slice(0, 10); } catch {}
  }
  return null;
}

function findMoneyline(ev) {
  for (const m of ev.markets || []) {
    const outcomes = m.outcomes ? (typeof m.outcomes === "string" ? safeJson(m.outcomes) : m.outcomes) : [];
    if (!Array.isArray(outcomes) || outcomes.length !== 2) continue;
    const o0 = (outcomes[0] || "").toLowerCase();
    if (o0 === "yes" || o0 === "over" || o0 === "under") continue;
    const q = (m.question || "").toLowerCase();
    if (/(spread|o\/u|over\b|under\b|half|quarter|points|rebounds|assists|kills)/.test(q)) continue;
    return { ml: m, outcomes };
  }
  return null;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function parseOutcomePrices(ml) {
  const p = ml.outcomePrices;
  if (!p) return [null, null];
  const arr = Array.isArray(p) ? p : safeJson(p) || [];
  return [parseFloat(arr[0] ?? 0), parseFloat(arr[1] ?? 0)];
}

function parseClobTokenIds(ml) {
  const t = ml.clobTokenIds;
  if (!t) return [null, null];
  const arr = Array.isArray(t) ? t : safeJson(t) || [];
  return [arr[0] || null, arr[1] || null];
}

export function buildPolymarketAdapter({ signer = null, fetchImpl = fetch } = {}) {

  async function gammaSearch(query) {
    const url = `${GAMMA}/public-search?q=${encodeURIComponent(query)}&keep_closed_markets=0`;
    try {
      const resp = await fetchImpl(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.events || [];
    } catch { return []; }
  }

  async function gammaByKeyword(keyword) {
    // /events?tag= or search
    try {
      const resp = await fetchImpl(`${GAMMA}/events?closed=false&search=${encodeURIComponent(keyword)}&limit=100`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch { return []; }
  }

  /**
   * List open moneyline-style markets for a sport. Canonicalizes both outcomes
   * into our team registry and filters out anything that doesn't resolve.
   * @param {{ sport:string, hintQueries?: string[] }} p
   * @returns {Promise<import('../trading/types.js').Market[]>}
   */
  async function listMarkets({ sport, hintQueries = [] }) {
    const keywords = SPORT_KEYWORDS[sport] || [];
    const slugPattern = SPORT_SLUG_PATTERNS[sport];

    const queries = new Set([...keywords, ...hintQueries]);
    const resultSets = await Promise.all([...queries].map((q) => gammaSearch(q)));

    const seenEventSlug = new Set();
    const out = [];
    for (const events of resultSets) {
      for (const ev of events) {
        if (!ev?.slug || seenEventSlug.has(ev.slug)) continue;
        seenEventSlug.add(ev.slug);
        if (slugPattern && !slugPattern.test(ev.slug)) continue;
        const found = findMoneyline(ev);
        if (!found) continue;
        const { ml, outcomes } = found;
        const [p0, p1] = parseOutcomePrices(ml);
        if (!Number.isFinite(p0) || !Number.isFinite(p1)) continue;
        // Skip resolved markets.
        if ((p0 <= 0.001 && p1 >= 0.999) || (p0 >= 0.999 && p1 <= 0.001)) continue;

        const teamA = canonicalize(outcomes[0], sport);
        const teamB = canonicalize(outcomes[1], sport);
        if (!teamA || !teamB || teamA.canon === teamB.canon) continue;

        const [tokA, tokB] = parseClobTokenIds(ml);

        out.push({
          venue: "polymarket",
          marketId: ml.conditionId || ml.id || ev.slug,
          eventId: ev.slug,
          label: `${teamA.display} vs ${teamB.display}`,
          gameDate: extractGameDate(ev, ml),
          teamA,
          teamB,
          raw: {
            conditionId: ml.conditionId,
            marketGammaId: ml.id,
            tokenIdA: tokA,
            tokenIdB: tokB,
            questionId: ml.questionId,
            slug: ev.slug,
            question: ml.question,
            outcomes,
            outcomePrices: [p0, p1],
            liquidity: parseFloat(ml.liquidity || ev.liquidity || 0),
            volume: parseFloat(ml.volume || ev.volume || 0),
          },
        });
      }
    }
    return out;
  }

  /**
   * Fetch the CLOB orderbook for a single outcome token.
   * Returns bids / asks in price (dollars 0..1) / size (shares).
   */
  async function getBook({ tokenId }) {
    if (!tokenId) return { bids: [], asks: [], ts: Date.now() };
    const resp = await fetchImpl(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`);
    if (!resp.ok) return { bids: [], asks: [], ts: Date.now() };
    const data = await resp.json();
    const bids = (data.bids || [])
      .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .filter((l) => Number.isFinite(l.price) && l.size > 0)
      .sort((a, b) => b.price - a.price);
    const asks = (data.asks || [])
      .map((l) => ({ price: parseFloat(l.price), size: parseFloat(l.size) }))
      .filter((l) => Number.isFinite(l.price) && l.size > 0)
      .sort((a, b) => a.price - b.price);
    return { bids, asks, ts: Date.now() };
  }

  /**
   * Place a CLOB order. Requires @polymarket/clob-client + a signer/privkey.
   * Soft-imported so the rest of the engine works without the package.
   */
  async function placeOrder({ tokenId, side, priceDollars, sizeShares, postOnly = true }) {
    if (!signer) {
      throw new Error("POLYMARKET_PRIVATE_KEY not configured");
    }
    let ClobClient, OrderType;
    try {
      // eslint-disable-next-line import/no-unresolved
      const mod = await import("@polymarket/clob-client");
      ClobClient = mod.ClobClient;
      OrderType = mod.OrderType || { GTC: "GTC", POST_ONLY: "POST_ONLY" };
    } catch (e) {
      throw new Error("@polymarket/clob-client is not installed. Run: npm i @polymarket/clob-client ethers");
    }

    // The signer is expected to already be an ethers wallet. Derive L2 creds
    // on first use via createOrDeriveApiKey. We do it lazily per-call for
    // simplicity; caller may wrap with a cache.
    const client = new ClobClient(CLOB, /* chainId */ 137, signer);
    const creds = await client.createOrDeriveApiKey();
    client.setApiCreds(creds);

    const order = await client.createAndPostOrder({
      tokenID: tokenId,
      price: priceDollars,
      side: side.toUpperCase(), // "BUY" | "SELL"
      size: sizeShares,
      feeRateBps: "0",
      orderType: postOnly ? "GTC_POST_ONLY" : "GTC",
    });

    return {
      orderId: order.orderID || order.id,
      status: order.status || "unknown",
      filledCount: order.size_matched || 0,
      fillPrice: Number(order.price) || priceDollars,
      raw: order,
    };
  }

  async function getOrder() {
    throw new Error("Polymarket getOrder not implemented yet");
  }

  async function cancelOrder() {
    throw new Error("Polymarket cancelOrder not implemented yet");
  }

  async function getMarketResult(conditionIdOrId) {
    const url = `${GAMMA}/markets/${encodeURIComponent(conditionIdOrId)}`;
    const resp = await fetchImpl(url);
    if (!resp.ok) return { status: "unknown", isSettled: false };
    const data = await resp.json();
    const m = Array.isArray(data) ? data[0] : data;
    if (!m) return { status: "unknown", isSettled: false };
    const closed = !!m.closed;
    const [p0, p1] = parseOutcomePrices(m);
    const resolved = (p0 >= 0.99 && p1 <= 0.01) || (p0 <= 0.01 && p1 >= 0.99);
    const winnerIdx = resolved ? (p0 >= 0.99 ? 0 : 1) : null;
    return {
      status: closed ? "closed" : "active",
      isSettled: closed && resolved,
      winnerIdx,
      outcomePrices: [p0, p1],
      raw: m,
    };
  }

  return {
    venue: "polymarket",
    feesBps: 0,
    gasUsdPerLeg: GAS_USD_PER_LEG,
    liveEnabled: !!signer,
    listMarkets,
    getBook,
    placeOrder,
    getOrder,
    cancelOrder,
    getMarketResult,
  };
}
