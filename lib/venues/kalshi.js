/**
 * Kalshi venue adapter.
 *
 * Exposes a uniform interface the engine can consume:
 *   listMarkets({ sport })  -> Market[]
 *   getBook({ marketId })   -> { bidsYes, asksYes, bidsNo, asksNo, ts }
 *   placeOrder(params)      -> { orderId, status, filledCount, fillPrice }
 *   getOrder(orderId)       -> { status, filledCount, fillPrice }
 *   cancelOrder(orderId)
 *   getMarketResult(marketId) -> { isSettled, result }
 *
 * Normalizes wire prices (cents) into dollars internally.
 */

import { kalshiFetch } from "../../utils/kalshi-auth.js";
import { canonicalize } from "../trading/match.js";

const DEFAULT_BASE = "https://api.elections.kalshi.com/trade-api/v2";

// Series tickers per sport. Tried in order, deduped by market ticker.
const SERIES_TICKERS = {
  nba: ["KXNBAGAME"],
  ipl: ["IPL", "KXCRICKETIPL"],
  lol: ["KXESPORTSLOL", "KXLOL"],
  val: ["KXESPORTSVAL", "KXVAL"],
};

// Kalshi fees (approximate, conservative). Real schedule is size+price
// dependent; 7bps round-trip is a safe upper bound for cents-priced markets.
// See https://kalshi.com/legal/fees-schedule
const FEES_BPS = 7;

const MONTH_CODES = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function parseTickerDate(ticker) {
  // e.g. "KXNBAGAME-26APR07MIATOR-TOR" -> "2026-04-07"
  const parts = (ticker || "").split("-");
  if (parts.length < 2) return null;
  const m = parts[1].match(/^(\d{2})([A-Z]{3})(\d{2})/);
  if (!m) return null;
  const mo = MONTH_CODES[m[2]];
  if (!mo) return null;
  return `20${m[1]}-${mo}-${m[3]}`;
}

function eventTickerFromMarketTicker(ticker) {
  const parts = (ticker || "").split("-");
  if (parts.length < 3) return ticker;
  return parts.slice(0, -1).join("-");
}

function centsToDollars(c) {
  if (c == null) return null;
  return Number(c) / 100;
}

export function buildKalshiAdapter({ auth, apiBase = DEFAULT_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((url, opts) => kalshiFetch(url, { ...auth, ...opts }));

  /**
   * Fetch open markets for a sport, group into events (2 markets per event: team A / team B),
   * and return canonical Market[].
   * @param {{ sport: string }} p
   * @returns {Promise<import('../trading/types.js').Market[]>}
   */
  async function listMarkets({ sport }) {
    const tickers = SERIES_TICKERS[sport] || [];
    /** @type {Map<string, any[]>} eventTicker -> rawMarkets */
    const byEvent = new Map();

    for (const series of tickers) {
      try {
        const resp = await doFetch(`${apiBase}/markets?series_ticker=${series}&status=open&limit=200`, {});
        const data = await resp.json();
        for (const m of data.markets || []) {
          const ev = eventTickerFromMarketTicker(m.ticker);
          if (!byEvent.has(ev)) byEvent.set(ev, []);
          byEvent.get(ev).push(m);
        }
      } catch { /* continue on series error */ }
    }

    const out = [];
    for (const [eventTicker, raws] of byEvent) {
      if (raws.length < 2) continue;
      // Choose two markets with distinct canonical team ids.
      const picked = [];
      const seen = new Set();
      for (const m of raws) {
        const lastSeg = (m.ticker || "").split("-").pop();
        const team =
          canonicalize(lastSeg, sport) ||
          canonicalize(m.subtitle, sport) ||
          canonicalize(m.title, sport);
        if (!team) continue;
        if (seen.has(team.canon)) continue;
        seen.add(team.canon);
        picked.push({ team, raw: m });
        if (picked.length === 2) break;
      }
      if (picked.length !== 2) continue;

      // Each Kalshi market is for a single team's YES outcome. The "pair"
      // is the two sibling markets in the event. We surface this as ONE
      // Market record with both teams and include both sibling ticker ids.
      const [a, b] = picked;
      out.push({
        venue: "kalshi",
        marketId: eventTicker,                 // event-level id
        eventId: eventTicker,
        label: `${a.team.display} vs ${b.team.display}`,
        gameDate: parseTickerDate(a.raw.ticker),
        teamA: a.team,
        teamB: b.team,
        raw: {
          tickerA: a.raw.ticker,
          tickerB: b.raw.ticker,
          rawA: a.raw,
          rawB: b.raw,
        },
      });
    }
    return out;
  }

  /**
   * Return the YES orderbook for a single Kalshi market ticker (one team).
   * @param {{ marketTicker: string }} p
   */
  async function getBook({ marketTicker }) {
    const resp = await doFetch(`${apiBase}/markets/${marketTicker}/orderbook`, {});
    const data = await resp.json();
    const rawYes = data.orderbook?.yes || [];
    const rawNo = data.orderbook?.no || [];
    // Kalshi returns bid-only books for each side, where the "YES bids" side
    // is what someone is willing to PAY for YES at that price (cents), and
    // the "NO bids" side implies YES asks at (100 - noPrice). We surface both.
    const yesBids = rawYes
      .map((l) => ({ price: centsToDollars(l.price), size: l.quantity || 0 }))
      .filter((l) => l.price != null)
      .sort((a, b) => b.price - a.price);
    // NO bids at price p means willingness to pay p for NO -> that implies a
    // YES ask at 1 - p.
    const yesAsksFromNo = rawNo
      .map((l) => ({ price: 1 - centsToDollars(l.price), size: l.quantity || 0 }))
      .filter((l) => l.price != null && l.price >= 0)
      .sort((a, b) => a.price - b.price);
    const noBids = rawNo
      .map((l) => ({ price: centsToDollars(l.price), size: l.quantity || 0 }))
      .filter((l) => l.price != null)
      .sort((a, b) => b.price - a.price);
    const noAsksFromYes = rawYes
      .map((l) => ({ price: 1 - centsToDollars(l.price), size: l.quantity || 0 }))
      .filter((l) => l.price != null && l.price >= 0)
      .sort((a, b) => a.price - b.price);

    return {
      yesBids,
      yesAsks: yesAsksFromNo,
      noBids,
      noAsks: noAsksFromYes,
      ts: Date.now(),
    };
  }

  /**
   * Place a Kalshi limit order.
   * @param {{ ticker:string, action:"buy"|"sell", side:"yes"|"no", count:number, priceDollars:number, clientOrderId?:string, postOnly?:boolean }} p
   */
  async function placeOrder({ ticker, action, side, count, priceDollars, clientOrderId, postOnly = true }) {
    const priceCents = Math.round(priceDollars * 100);
    const body = {
      ticker,
      action,
      side,
      type: "limit",
      count,
      client_order_id: clientOrderId || `cid_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      post_only: !!postOnly,
    };
    if (side === "yes") body.yes_price = priceCents;
    else body.no_price = priceCents;

    const resp = await doFetch(`${apiBase}/portfolio/orders`, { method: "POST", body });
    const data = await resp.json();
    const order = data.order || {};
    return {
      orderId: order.order_id || "",
      clientOrderId: body.client_order_id,
      status: order.status || "unknown",
      filledCount: order.place_count || 0,
      fillPrice: centsToDollars(order.yes_price ?? order.no_price) ?? priceDollars,
      raw: order,
    };
  }

  async function getOrder(orderId) {
    const resp = await doFetch(`${apiBase}/portfolio/orders/${orderId}`, {});
    const data = await resp.json();
    const order = data.order || data;
    return {
      orderId,
      status: order.status || "unknown",
      filledCount: order.place_count || 0,
      fillPrice: centsToDollars(order.yes_price ?? order.no_price),
      raw: order,
    };
  }

  async function cancelOrder(orderId) {
    const resp = await doFetch(`${apiBase}/portfolio/orders/${orderId}`, { method: "DELETE" });
    const data = await resp.json();
    return { cancelled: true, raw: data };
  }

  async function getMarketResult(ticker) {
    const resp = await doFetch(`${apiBase}/markets/${ticker}`, {});
    const data = await resp.json();
    const m = data.market || data;
    const status = m.status || "unknown";
    const result = m.result || null;
    return {
      status,
      result,
      isSettled: status === "settled" || !!result,
      raw: m,
    };
  }

  return {
    venue: "kalshi",
    feesBps: FEES_BPS,
    listMarkets,
    getBook,
    placeOrder,
    getOrder,
    cancelOrder,
    getMarketResult,
  };
}
