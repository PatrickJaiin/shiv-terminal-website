/**
 * Canonical type shapes used by the trading engine.
 * JSDoc only, no runtime cost. Every venue adapter maps into these shapes
 * before any engine code sees venue-specific data.
 *
 * @typedef {"kalshi"|"polymarket"|"stake"} VenueId
 * @typedef {"nba"|"ipl"|"lol"|"val"|"valorant"} Sport
 *
 * @typedef {object} Team
 * @property {string} canon          Canonical team id (e.g. "lal", "csk")
 * @property {string} display        Human label (e.g. "Los Angeles Lakers")
 * @property {Sport}  sport
 *
 * @typedef {object} Market
 * @property {VenueId} venue
 * @property {string}  marketId      Venue-native id (Kalshi ticker, Polymarket conditionId)
 * @property {string}  eventId       Venue-native event/group id
 * @property {string}  label         Human label, e.g. "LAL vs BOS"
 * @property {string|null} gameDate  ISO YYYY-MM-DD, UTC approx
 * @property {Team}    teamA
 * @property {Team}    teamB
 * @property {object}  raw           Original venue payload for debugging
 *
 * @typedef {object} Level
 * @property {number} price          In dollars, 0..1
 * @property {number} size           Contracts or shares available at this price
 *
 * @typedef {object} Book
 * @property {VenueId} venue
 * @property {string}  marketId
 * @property {string}  side          "A" or "B" (which team this book is for)
 * @property {Level[]} bids          Descending by price
 * @property {Level[]} asks          Ascending by price
 * @property {number}  ts            ms epoch of snapshot
 *
 * @typedef {object} Quote
 * @property {number} vwap           Average fill price for a target size
 * @property {number} filledSize     Size actually available up to target
 * @property {number} topPrice       Best price on the side we are taking
 *
 * @typedef {object} Leg
 * @property {VenueId} venue
 * @property {string}  marketId
 * @property {"BUY"|"SELL"}   action
 * @property {"YES"|"NO"|"A"|"B"} side     Venue-native side
 * @property {number}  price         Limit price in dollars 0..1
 * @property {number}  size          Contracts/shares
 * @property {string}  backsTeamCanon  Which canonical team this leg wins for
 *
 * @typedef {object} Opportunity
 * @property {string}  id            Opaque id (hash of legs + ts)
 * @property {string}  eventLabel
 * @property {string}  pairType      "kalshi_polymarket" | "kalshi_kalshi" | ...
 * @property {Leg}     legA          Leg backing team A
 * @property {Leg}     legB          Leg backing team B
 * @property {number}  grossEdge     1 - legA.price - legB.price (fills at limit)
 * @property {number}  netEdge       grossEdge minus modeled fees/gas/slippage
 * @property {number}  sizeUsd       Recommended notional
 * @property {number}  sizeContracts Recommended contracts per leg
 * @property {number}  expiresAt     ms epoch, stop trading this opp after
 * @property {boolean} passes        Meets all thresholds
 * @property {string|null} abortReason
 * @property {object}  diag          Debug fields
 *
 * @typedef {object} Position
 * @property {string}   id
 * @property {number}   createdAt
 * @property {"paper"|"live"} mode
 * @property {"opening"|"open"|"closing"|"closed"|"unwinding"|"failed"|"settled"} status
 * @property {string}   pairType
 * @property {string}   eventLabel
 * @property {string}   backingTeamCanon
 * @property {number}   sizeContracts
 * @property {number}   sizeUsd
 * @property {Leg[]}    legs        With fills populated after execution
 * @property {number}   entryGrossEdge
 * @property {number}   entryNetEdge
 * @property {number|null} realizedPnl
 * @property {object}   diag
 */

export const VENUES = Object.freeze({
  KALSHI: "kalshi",
  POLYMARKET: "polymarket",
  STAKE: "stake",
});

export const SPORTS = Object.freeze({
  NBA: "nba",
  IPL: "ipl",
  LOL: "lol",
  VAL: "val",
});

export const POSITION_STATUS = Object.freeze({
  OPENING: "opening",
  OPEN: "open",
  CLOSING: "closing",
  CLOSED: "closed",
  UNWINDING: "unwinding",
  FAILED: "failed",
  SETTLED: "settled",
});
