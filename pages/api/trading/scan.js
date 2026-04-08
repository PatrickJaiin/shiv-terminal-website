import { kalshiFetch } from "../../../utils/kalshi-auth";

function devig(oddsA, oddsB) {
  const rawA = 1 / oddsA;
  const rawB = 1 / oddsB;
  const overround = rawA + rawB;
  return { devigA: rawA / overround, devigB: rawB / overround, overround, rawA, rawB };
}

/* ── Team name matching helpers ── */
const TEAM_ALIASES = {
  // IPL Cricket
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
  // NBA teams
  "atlanta": ["atlanta", "hawks", "atl"],
  "boston": ["boston", "celtics", "bos"],
  "brooklyn": ["brooklyn", "nets", "bkn"],
  "charlotte": ["charlotte", "hornets", "cha"],
  "chicago": ["chicago", "bulls", "chi"],
  "cleveland": ["cleveland", "cavaliers", "cavs", "cle"],
  "dallas": ["dallas", "mavericks", "mavs", "dal"],
  "denver": ["denver", "nuggets", "den"],
  "detroit": ["detroit", "pistons", "det"],
  "golden state": ["golden state", "warriors", "gsw"],
  "houston": ["houston", "rockets", "hou"],
  "indiana": ["indiana", "pacers", "ind"],
  "los angeles c": ["los angeles c", "clippers", "lac"],
  "los angeles l": ["los angeles l", "lakers", "lal"],
  "memphis": ["memphis", "grizzlies", "mem"],
  "miami": ["miami", "heat", "mia"],
  "milwaukee": ["milwaukee", "bucks", "mil"],
  "minnesota": ["minnesota", "timberwolves", "wolves", "min"],
  "new orleans": ["new orleans", "pelicans", "nop"],
  "new york": ["new york", "knicks", "nyk"],
  "oklahoma city": ["oklahoma city", "thunder", "okc"],
  "orlando": ["orlando", "magic", "orl"],
  "philadelphia": ["philadelphia", "76ers", "sixers", "phi"],
  "phoenix": ["phoenix", "suns", "phx"],
  "portland": ["portland", "trail blazers", "blazers", "por"],
  "sacramento": ["sacramento", "kings", "sac"],
  "san antonio": ["san antonio", "spurs", "sas"],
  "toronto": ["toronto", "raptors", "tor"],
  "utah": ["utah", "jazz", "uta"],
  "washington": ["washington", "wizards", "was"],
  // LoL teams
  "t1": ["t1", "sk telecom", "skt"],
  "gen.g": ["gen.g", "geng", "gen g"],
  "hanwha": ["hanwha", "hle", "hanwha life"],
  "dplus": ["dplus", "dplus kia", "dk", "dwg", "damwon"],
  "kt rolster": ["kt rolster", "kt", "kt rolster"],
  "drx": ["drx"],
  "fnatic": ["fnatic", "fnc"],
  "g2": ["g2", "g2 esports"],
  "cloud9": ["cloud9", "c9"],
  "team liquid": ["team liquid", "liquid", "tl"],
  "flyquest": ["flyquest", "fly"],
  "100 thieves": ["100 thieves", "100t"],
  "nrg": ["nrg", "nrg esports"],
  "bilibili": ["bilibili", "blg", "bilibili gaming"],
  "jdg": ["jdg", "jd gaming"],
  "weibo": ["weibo", "wbg", "weibo gaming"],
  "top esports": ["top esports", "tes", "top"],
  "lng": ["lng", "lng esports"],
  // Valorant teams
  "sentinels": ["sentinels", "sen"],
  "loud": ["loud"],
  "paper rex": ["paper rex", "prx"],
  "drx val": ["drx"],
  "fnatic val": ["fnatic", "fnc"],
  "navi": ["navi", "natus vincere"],
  "evil geniuses": ["evil geniuses", "eg"],
  "leviatán": ["leviatán", "leviatan", "lev"],
  "edg": ["edward gaming", "edg"],
  "fut": ["fut", "fut esports"],
  "karmine": ["karmine", "karmine corp", "kc"],
  "gentle mates": ["gentle mates", "m8"],
  "trace": ["trace", "trace esports"],
  "team heretics": ["heretics", "team heretics", "th"],
};

function normalizeTeamName(name) {
  const lower = (name || "").toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
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
      if (!isMoneylineMarket(pm.question)) continue;
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

function isMoneylineMarket(question) {
  const q = (question || "").toLowerCase();
  // Reject spreads, totals, props, over/under, player stats
  if (q.includes("spread") || q.includes("(-") || q.includes("(+")) return false;
  if (q.includes("over/under") || q.includes("over ") || q.includes("under ")) return false;
  if (q.includes("total") || q.includes("points scored")) return false;
  if (q.includes("player") || q.includes("mvp") || q.includes("award") || q.includes("year")) return false;
  if (q.includes("kills") || q.includes("assists") || q.includes("rebounds")) return false;
  // Accept "winner", "win", "vs", "beat", or simple team names
  if (q.includes("winner") || q.includes(" win") || q.includes(" vs") || q.includes(" beat")) return true;
  // Accept if it looks like a simple team matchup
  return true;
}

function matchKalshiPolymarket(kalshiMarkets, polymarketMarkets) {
  const pairs = [];
  for (const km of kalshiMarkets) {
    const kalshiNorm = normalizeTeamName(km.team_name);
    for (const pm of polymarketMarkets) {
      // Match Kalshi team to Polymarket teamA or teamB
      const polyTeamANorm = normalizeTeamName(pm.teamA || "");
      const polyTeamBNorm = normalizeTeamName(pm.teamB || "");
      let polySide = null;
      if (kalshiNorm && kalshiNorm === polyTeamANorm) polySide = "A";
      else if (kalshiNorm && kalshiNorm === polyTeamBNorm) polySide = "B";
      else if (fuzzyTeamMatch(km.team_name, pm.teamA || "")) polySide = "A";
      else if (fuzzyTeamMatch(km.team_name, pm.teamB || "")) polySide = "B";

      if (polySide) {
        // polySide A: yesPrice is this team's price, noPrice is opponent's
        // polySide B: noPrice is this team's price, yesPrice is opponent's
        const polyTeamPrice = polySide === "A" ? pm.yesPrice : pm.noPrice;
        const polyOpponentPrice = polySide === "A" ? pm.noPrice : pm.yesPrice;
        pairs.push({
          kalshiMarket: km,
          polyMarket: pm,
          teamName: km.team_name,
          polySide,
          polyTeamPrice,
          polyOpponentPrice,
        });
      }
    }
  }
  return pairs;
}

/* ── Platform fetch functions ── */

const KALSHI_GAME_TICKERS = {
  nba: ["KXNBAGAME"],
  ipl: ["IPL"],
  lol: ["KXESPORTSLOL", "KXLOL", "LOL"],
  valorant: ["KXESPORTSVAL", "KXVAL", "VALORANT"],
};

// NBA team abbreviation map for Kalshi tickers
const NBA_ABBREV = {
  ATL: "Atlanta", BOS: "Boston", BKN: "Brooklyn", CHA: "Charlotte", CHI: "Chicago",
  CLE: "Cleveland", DAL: "Dallas", DEN: "Denver", DET: "Detroit", GSW: "Golden State",
  HOU: "Houston", IND: "Indiana", LAC: "Los Angeles C", LAL: "Los Angeles L",
  MEM: "Memphis", MIA: "Miami", MIL: "Milwaukee", MIN: "Minnesota", NOP: "New Orleans",
  NYK: "New York", OKC: "Oklahoma City", ORL: "Orlando", PHI: "Philadelphia",
  PHX: "Phoenix", POR: "Portland", SAC: "Sacramento", SAS: "San Antonio",
  TOR: "Toronto", UTA: "Utah", WAS: "Washington",
};

async function fetchKalshiMarkets(kalshiAuth, apiBase, game) {
  const tickers = KALSHI_GAME_TICKERS[game] || KALSHI_GAME_TICKERS.ipl;
  const allMarkets = [];
  for (const ticker of tickers) {
    try {
      const resp = await kalshiFetch(`${apiBase}/markets?series_ticker=${ticker}&status=open&limit=100`, kalshiAuth);
      const data = await resp.json();
      const markets = (data.markets || []).map((m) => {
        // For NBA games, extract team from ticker (e.g. KXNBAGAME-26APR07MIATOR-TOR)
        let teamName = m.subtitle || m.title || "";
        if (game === "nba" && m.ticker) {
          const abbrev = m.ticker.split("-").pop();
          if (NBA_ABBREV[abbrev]) teamName = NBA_ABBREV[abbrev];
        }
        return {
          ticker: m.ticker,
          title: m.title || "",
          team_name: teamName,
          yes_price: (m.yes_ask || 0) / 100,
          no_price: (m.no_ask || 0) / 100,
        };
      });
      allMarkets.push(...markets);
    } catch {}
  }
  // Also try keyword search for esports
  if (game === "lol" || game === "valorant") {
    try {
      const keyword = game === "lol" ? "league of legends" : "valorant";
      const resp = await kalshiFetch(`${apiBase}/events?status=open&limit=50`, kalshiAuth);
      const data = await resp.json();
      const events = (data.events || []).filter((e) => {
        const t = ((e.title || "") + " " + (e.sub_title || "")).toLowerCase();
        return t.includes(keyword) || t.includes(game);
      });
      for (const ev of events) {
        for (const m of (ev.markets || [])) {
          if (!allMarkets.some((am) => am.ticker === m.ticker)) {
            allMarkets.push({
              ticker: m.ticker,
              title: m.title || "",
              team_name: m.subtitle || m.title || "",
              yes_price: (m.yes_ask || 0) / 100,
              no_price: (m.no_ask || 0) / 100,
            });
          }
        }
      }
    } catch {}
  }
  return allMarkets;
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

// Slug patterns for game events per sport on Polymarket
const POLYMARKET_GAME_SLUG = {
  nba: /^nba-[a-z]+-[a-z]+-\d{4}/,
  ipl: /^(ipl|cricket)/,
  lol: /^(lol|league)/,
  valorant: /^(val|valorant|vct)/,
};

const POLYMARKET_FALLBACK_KEYWORDS = {
  nba: ["nba", "basketball"],
  ipl: ["ipl", "indian premier league", "cricket"],
  lol: ["league of legends", "lol:"],
  valorant: ["valorant", "vct"],
};

// NBA team abbreviations for Polymarket slug construction
const POLY_NBA_ABBREVS = [
  "atl", "bos", "bkn", "cha", "chi", "cle", "dal", "den", "det", "gsw",
  "hou", "ind", "lac", "lal", "mem", "mia", "mil", "min", "nop", "nyk",
  "okc", "orl", "phi", "phx", "por", "sac", "sas", "tor", "uta", "was",
];

function extractMoneyline(markets) {
  return (markets || []).find((m) => {
    const q = (m.question || "").toLowerCase();
    const outcomes = m.outcomes || [];
    if (outcomes.length !== 2) return false;
    const o0 = (outcomes[0] || "").toLowerCase();
    if (o0 === "yes" || o0 === "over" || o0 === "under") return false;
    if (q.includes("spread") || q.includes("o/u") || q.includes("over") || q.includes("half") || q.includes("quarter") || q.includes("points") || q.includes("rebounds") || q.includes("assists")) return false;
    return true;
  });
}

async function searchPolymarket(query) {
  try {
    const resp = await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&keep_closed_markets=0`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.events || [];
  } catch { return []; }
}

function parsePolyGame(ev, slugPattern) {
  if (slugPattern && !slugPattern.test(ev.slug || "")) return null;
  const ml = extractMoneyline(ev.markets);
  if (!ml) return null;
  const prices = JSON.parse(ml.outcomePrices || "[]");
  const outcomes = ml.outcomes || [];
  const yp = parseFloat(prices[0] || 0);
  const np = parseFloat(prices[1] || 0);
  if ((yp <= 0.001 && np >= 0.999) || (yp >= 0.999 && np <= 0.001)) return null;
  return {
    id: ml.id, question: ml.question, slug: ev.slug, eventTitle: ev.title,
    teamA: outcomes[0] || "", teamB: outcomes[1] || "",
    yesPrice: yp, noPrice: np,
    volume: parseFloat(ml.volume || ev.volume || 0),
    liquidity: parseFloat(ml.liquidity || ev.liquidity || 0),
    startDate: ev.startDate || ml.startDate || null,
    endDate: ev.endDate || ml.endDate || null,
    closed: !!(ev.closed || ml.closed),
  };
}

async function fetchPolymarketMarkets(game, kalshiMarkets) {
  const allMarkets = [];
  const slugPattern = POLYMARKET_GAME_SLUG[game];
  const seen = new Set();

  // Build search queries from Kalshi game titles
  // e.g. "Miami at Toronto Winner?" -> search "Miami Toronto"
  const queries = new Set();
  if (kalshiMarkets && kalshiMarkets.length > 0) {
    const titles = new Set(kalshiMarkets.map((m) => m.title));
    for (const title of titles) {
      const clean = (title || "").replace(/Winner\??/gi, "").replace(/ at /gi, " ").trim();
      if (clean) queries.add(clean);
    }
  }
  // Fallback
  if (queries.size === 0) {
    const fb = { nba: ["nba"], ipl: ["ipl"], lol: ["league of legends"], valorant: ["valorant"] };
    for (const q of (fb[game] || [])) queries.add(q);
  }

  // Search all matchups in parallel
  const results = await Promise.all([...queries].map((q) => searchPolymarket(q)));
  for (const events of results) {
    for (const ev of events) {
      if (seen.has(ev.slug)) continue;
      seen.add(ev.slug);
      const m = parsePolyGame(ev, slugPattern);
      if (m) allMarkets.push(m);
    }
  }

  return allMarkets;
}

/* ══════════════════════════════════════════════════════════
   Structured event matching (Kalshi <-> Polymarket)
   Goal: identify the SAME real-world game on both platforms
   before checking prices, so arbitrage signals are reliable.
   ══════════════════════════════════════════════════════════ */

// Canonical team registry. id is the canonical key used for matching.
// Aliases include abbreviations, city names, and nicknames.
const TEAM_REGISTRY = [
  // ── NBA ──
  { id: "atl", sport: "nba", names: ["atl", "atlanta", "hawks", "atlanta hawks"] },
  { id: "bos", sport: "nba", names: ["bos", "boston", "celtics", "boston celtics"] },
  { id: "bkn", sport: "nba", names: ["bkn", "brooklyn", "nets", "brooklyn nets"] },
  { id: "cha", sport: "nba", names: ["cha", "charlotte", "hornets", "charlotte hornets"] },
  { id: "chi", sport: "nba", names: ["chi", "chicago", "bulls", "chicago bulls"] },
  { id: "cle", sport: "nba", names: ["cle", "cleveland", "cavaliers", "cavs", "cleveland cavaliers"] },
  { id: "dal", sport: "nba", names: ["dal", "dallas", "mavericks", "mavs", "dallas mavericks"] },
  { id: "den", sport: "nba", names: ["den", "denver", "nuggets", "denver nuggets"] },
  { id: "det", sport: "nba", names: ["det", "detroit", "pistons", "detroit pistons"] },
  { id: "gsw", sport: "nba", names: ["gsw", "golden state", "warriors", "golden state warriors"] },
  { id: "hou", sport: "nba", names: ["hou", "houston", "rockets", "houston rockets"] },
  { id: "ind", sport: "nba", names: ["ind", "indiana", "pacers", "indiana pacers"] },
  { id: "lac", sport: "nba", names: ["lac", "los angeles clippers", "la clippers", "clippers"] },
  { id: "lal", sport: "nba", names: ["lal", "los angeles lakers", "la lakers", "lakers"] },
  { id: "mem", sport: "nba", names: ["mem", "memphis", "grizzlies", "memphis grizzlies"] },
  { id: "mia", sport: "nba", names: ["mia", "miami", "heat", "miami heat"] },
  { id: "mil", sport: "nba", names: ["mil", "milwaukee", "bucks", "milwaukee bucks"] },
  { id: "min", sport: "nba", names: ["min", "minnesota", "timberwolves", "wolves", "minnesota timberwolves"] },
  { id: "nop", sport: "nba", names: ["nop", "no", "new orleans", "pelicans", "new orleans pelicans"] },
  { id: "nyk", sport: "nba", names: ["nyk", "new york", "knicks", "new york knicks"] },
  { id: "okc", sport: "nba", names: ["okc", "oklahoma city", "thunder", "oklahoma city thunder"] },
  { id: "orl", sport: "nba", names: ["orl", "orlando", "magic", "orlando magic"] },
  { id: "phi", sport: "nba", names: ["phi", "philadelphia", "76ers", "sixers", "philadelphia 76ers"] },
  { id: "phx", sport: "nba", names: ["phx", "phoenix", "suns", "phoenix suns"] },
  { id: "por", sport: "nba", names: ["por", "portland", "trail blazers", "blazers", "portland trail blazers"] },
  { id: "sac", sport: "nba", names: ["sac", "sacramento", "kings", "sacramento kings"] },
  { id: "sas", sport: "nba", names: ["sas", "san antonio", "spurs", "san antonio spurs"] },
  { id: "tor", sport: "nba", names: ["tor", "toronto", "raptors", "toronto raptors"] },
  { id: "uta", sport: "nba", names: ["uta", "utah", "jazz", "utah jazz"] },
  { id: "was", sport: "nba", names: ["was", "washington", "wizards", "washington wizards"] },
  // ── IPL ──
  { id: "csk", sport: "ipl", names: ["csk", "chennai", "super kings", "chennai super kings"] },
  { id: "mi",  sport: "ipl", names: ["mi", "mumbai", "indians", "mumbai indians"] },
  { id: "rcb", sport: "ipl", names: ["rcb", "bangalore", "bengaluru", "royal challengers", "royal challengers bangalore"] },
  { id: "kkr", sport: "ipl", names: ["kkr", "kolkata", "knight riders", "kolkata knight riders"] },
  { id: "dc",  sport: "ipl", names: ["dc", "delhi", "capitals", "delhi capitals"] },
  { id: "rr",  sport: "ipl", names: ["rr", "rajasthan", "royals", "rajasthan royals"] },
  { id: "pbks",sport: "ipl", names: ["pbks", "punjab", "kings", "punjab kings"] },
  { id: "srh", sport: "ipl", names: ["srh", "hyderabad", "sunrisers", "sunrisers hyderabad"] },
  { id: "lsg", sport: "ipl", names: ["lsg", "lucknow", "super giants", "lucknow super giants"] },
  { id: "gt",  sport: "ipl", names: ["gt", "gujarat", "titans", "gujarat titans"] },
  // ── LoL ──
  { id: "t1",  sport: "lol", names: ["t1", "sk telecom", "skt"] },
  { id: "geng",sport: "lol", names: ["geng", "gen.g", "gen g"] },
  { id: "hle", sport: "lol", names: ["hle", "hanwha", "hanwha life"] },
  { id: "dk",  sport: "lol", names: ["dk", "dplus", "dplus kia", "dwg", "damwon"] },
  { id: "kt",  sport: "lol", names: ["kt", "kt rolster"] },
  { id: "drx", sport: "lol", names: ["drx"] },
  { id: "fnc", sport: "lol", names: ["fnc", "fnatic"] },
  { id: "g2",  sport: "lol", names: ["g2", "g2 esports"] },
  { id: "c9",  sport: "lol", names: ["c9", "cloud9"] },
  { id: "tl",  sport: "lol", names: ["tl", "team liquid", "liquid"] },
  { id: "fly", sport: "lol", names: ["fly", "flyquest"] },
  { id: "100t",sport: "lol", names: ["100t", "100 thieves"] },
  { id: "nrg", sport: "lol", names: ["nrg", "nrg esports"] },
  { id: "blg", sport: "lol", names: ["blg", "bilibili", "bilibili gaming"] },
  { id: "jdg", sport: "lol", names: ["jdg", "jd gaming"] },
  { id: "wbg", sport: "lol", names: ["wbg", "weibo", "weibo gaming"] },
  { id: "tes", sport: "lol", names: ["tes", "top esports"] },
  { id: "lng", sport: "lol", names: ["lng", "lng esports"] },
  // ── Valorant (overlap with LoL teams handled by id collision is fine) ──
  { id: "sen", sport: "val", names: ["sen", "sentinels"] },
  { id: "loud",sport: "val", names: ["loud"] },
  { id: "prx", sport: "val", names: ["prx", "paper rex"] },
  { id: "navi",sport: "val", names: ["navi", "natus vincere"] },
  { id: "eg",  sport: "val", names: ["eg", "evil geniuses"] },
  { id: "lev", sport: "val", names: ["lev", "leviatan", "leviatán"] },
  { id: "edg", sport: "val", names: ["edg", "edward gaming"] },
  { id: "fut", sport: "val", names: ["fut", "fut esports"] },
  { id: "kc",  sport: "val", names: ["kc", "karmine", "karmine corp"] },
  { id: "m8",  sport: "val", names: ["m8", "gentle mates"] },
  { id: "th",  sport: "val", names: ["th", "team heretics", "heretics"] },
];

// Build alias index: lowercased alias -> { id, sport }
const ALIAS_INDEX = (() => {
  const map = new Map();
  for (const t of TEAM_REGISTRY) {
    for (const n of t.names) map.set(n.toLowerCase(), { id: t.id, sport: t.sport });
  }
  return map;
})();

/**
 * Resolve an arbitrary string to a canonical team id.
 * Tries exact alias match first, then longest substring match (skipping <3 char aliases
 * to avoid false positives like "no" matching "no team").
 */
function canonicalTeamId(input, sportHint) {
  const s = (input || "").toLowerCase().trim();
  if (!s) return null;
  // Exact match
  const exact = ALIAS_INDEX.get(s);
  if (exact && (!sportHint || exact.sport === sportHint)) return exact.id;
  // Tokenized exact match (split on non-letter)
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    const hit = ALIAS_INDEX.get(tok);
    if (hit && (!sportHint || hit.sport === sportHint)) return hit.id;
  }
  // Substring: longest alias contained in input
  let best = null;
  let bestLen = 0;
  for (const [alias, info] of ALIAS_INDEX) {
    if (alias.length < 4) continue; // skip short codes for substring matching
    if (sportHint && info.sport !== sportHint) continue;
    if (s.includes(alias) && alias.length > bestLen) {
      best = info.id;
      bestLen = alias.length;
    }
  }
  return best;
}

// Parse Kalshi date code "26APR07" -> "2026-04-07"
const KALSHI_MONTH_CODES = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};
function parseKalshiDateCode(s) {
  const m = (s || "").match(/^(\d{2})([A-Z]{3})(\d{2})/);
  if (!m) return null;
  const month = KALSHI_MONTH_CODES[m[2]];
  if (!month) return null;
  return `20${m[1]}-${month}-${m[3]}`;
}

/**
 * Group flat Kalshi markets into structured events.
 * Each event has both teams + a game date, ready for cross-platform matching.
 * Returns: [{ eventTicker, gameDate, teamA: {canon, market}, teamB: {canon, market} }]
 */
function structureKalshiEvents(kalshiMarkets, sportHint) {
  const groups = new Map();
  for (const m of kalshiMarkets) {
    const parts = (m.ticker || "").split("-");
    if (parts.length < 3) continue;
    const eventTicker = parts.slice(0, -1).join("-");
    if (!groups.has(eventTicker)) groups.set(eventTicker, []);
    groups.get(eventTicker).push(m);
  }
  const events = [];
  for (const [eventTicker, markets] of groups) {
    if (markets.length < 2) continue;
    // Date: parse from middle ticker segment
    const middleSeg = eventTicker.split("-")[1] || "";
    const gameDate = parseKalshiDateCode(middleSeg);
    // Canonicalize each market's team
    const seen = new Set();
    const finalTeams = [];
    for (const m of markets) {
      const lastSeg = (m.ticker || "").split("-").pop();
      const canon =
        canonicalTeamId(lastSeg, sportHint) ||
        canonicalTeamId(m.team_name, sportHint) ||
        canonicalTeamId(m.title, sportHint);
      if (!canon || seen.has(canon)) continue;
      seen.add(canon);
      finalTeams.push({ canon, market: m });
      if (finalTeams.length === 2) break;
    }
    if (finalTeams.length !== 2) continue;
    events.push({
      eventTicker,
      gameDate,
      teamA: finalTeams[0],
      teamB: finalTeams[1],
    });
  }
  return events;
}

/**
 * Structure Polymarket events for matching.
 * Pulls a game date from the slug or event start_date.
 */
function structurePolymarketEvents(polymarketMarkets, sportHint) {
  const events = [];
  for (const pm of polymarketMarkets) {
    const canonA = canonicalTeamId(pm.teamA, sportHint);
    const canonB = canonicalTeamId(pm.teamB, sportHint);
    if (!canonA || !canonB || canonA === canonB) continue;
    // Date: try slug first, then startDate
    let gameDate = null;
    const slugMatch = (pm.slug || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    if (slugMatch) gameDate = `${slugMatch[1]}-${slugMatch[2]}-${slugMatch[3]}`;
    else if (pm.startDate) {
      try { gameDate = new Date(pm.startDate).toISOString().slice(0, 10); } catch {}
    }
    events.push({ polyMarket: pm, gameDate, canonA, canonB });
  }
  return events;
}

// Two date strings refer to the same game (allow ±1 day timezone slack).
function sameGameDate(dA, dB) {
  if (!dA || !dB) return true; // missing date -> don't reject
  if (dA === dB) return true;
  const a = Date.parse(dA);
  const b = Date.parse(dB);
  if (isNaN(a) || isNaN(b)) return false;
  return Math.abs(a - b) <= 36 * 60 * 60 * 1000;
}

/**
 * Match Kalshi events to Polymarket events: BOTH teams must canonicalize
 * to the same pair AND game dates must agree.
 */
function matchEventsByTeamsAndDate(kEvents, pEvents) {
  const pairs = [];
  for (const ke of kEvents) {
    const kPair = new Set([ke.teamA.canon, ke.teamB.canon]);
    for (const pe of pEvents) {
      if (!kPair.has(pe.canonA) || !kPair.has(pe.canonB)) continue;
      if (!sameGameDate(ke.gameDate, pe.gameDate)) continue;
      pairs.push({ kEvent: ke, pEvent: pe });
    }
  }
  return pairs;
}

/* ── Main handler ── */

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { platforms, game, stakeMatches, kalshiKeyId, kalshiPrivateKey, config: cfg } = req.body;
  const activeGame = game || "ipl";
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
      kalshiMarkets = await fetchKalshiMarkets(kalshiAuth, apiBase, activeGame);
    }
    if (hasPoly) {
      // Pass Kalshi markets so we can build targeted searches from matchup names
      polymarketMarkets = await fetchPolymarketMarkets(activeGame, kalshiMarkets);
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

    /* ── Kalshi + Polymarket (structured event matching) ── */
    let matchedEventCount = 0;
    if (hasKalshi && hasPoly) {
      // Step 1: structure both sides into events with both teams + a date
      const kEvents = structureKalshiEvents(kalshiMarkets, activeGame);
      const pEvents = structurePolymarketEvents(polymarketMarkets, activeGame);

      // Step 2: match by canonical team pair + game date (no single-team fuzzy)
      const matchedPairs = matchEventsByTeamsAndDate(kEvents, pEvents);
      matchedEventCount = matchedPairs.length;

      // Step 3: fetch all needed Kalshi orderbooks in parallel
      const tickers = new Set();
      for (const { kEvent } of matchedPairs) {
        tickers.add(kEvent.teamA.market.ticker);
        tickers.add(kEvent.teamB.market.ticker);
      }
      const orderbookCache = new Map();
      await Promise.all([...tickers].map(async (t) => {
        try {
          orderbookCache.set(t, await fetchKalshiOrderbook(t, kalshiAuth, apiBase));
        } catch {
          orderbookCache.set(t, null);
        }
      }));

      // Step 4: for each matched event, compute both-direction arb on each team slot
      for (const { kEvent, pEvent } of matchedPairs) {
        const pm = pEvent.polyMarket;
        const eventLabel = `${kEvent.teamA.canon.toUpperCase()} vs ${kEvent.teamB.canon.toUpperCase()}`;
        const gameDate = kEvent.gameDate || pEvent.gameDate;

        for (const slot of [kEvent.teamA, kEvent.teamB]) {
          const km = slot.market;
          const teamCanon = slot.canon;
          const book = orderbookCache.get(km.ticker);
          if (!book) continue;

          // Polymarket prices: yesPrice belongs to canonA, noPrice belongs to canonB
          const polyTeamPrice = teamCanon === pEvent.canonA ? pm.yesPrice : pm.noPrice;
          const polyOppPrice  = teamCanon === pEvent.canonA ? pm.noPrice  : pm.yesPrice;
          const kalshiYes = km.yes_price || 0;

          // Two arb directions for this team slot:
          // (1) Buy Kalshi YES (team wins on K) + buy Polymarket opponent (team loses on P)
          const grossArb1 = 1.0 - kalshiYes - polyOppPrice;
          // (2) Buy Polymarket team (team wins on P) + buy Kalshi NO (team loses on K)
          const grossArb2 = 1.0 - polyTeamPrice - book.best_no_ask;

          let grossArb, direction, buyPlatform, buyPrice, sellPlatform, sellPrice;
          if (grossArb1 >= grossArb2) {
            grossArb = grossArb1;
            direction = "kalshi_yes_poly_no";
            buyPlatform = "Kalshi YES";
            buyPrice = kalshiYes;
            sellPlatform = "Polymarket opponent";
            sellPrice = polyOppPrice;
          } else {
            grossArb = grossArb2;
            direction = "poly_yes_kalshi_no";
            buyPlatform = "Polymarket team";
            buyPrice = polyTeamPrice;
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
            matchName: eventLabel,
            gameDate,
            team: teamCanon.toUpperCase(),
            teamA: kEvent.teamA.canon,
            teamB: kEvent.teamB.canon,
            direction,
            buyPlatform,
            buyPrice: +buyPrice.toFixed(4),
            sellPlatform,
            sellPrice: +sellPrice.toFixed(4),
            kalshiEventTicker: kEvent.eventTicker,
            kalshiTicker: km.ticker,
            kalshiYesPrice: +kalshiYes.toFixed(4),
            kalshiNoPrice: +book.best_no_ask.toFixed(4),
            kalshiNoDepth: book.no_depth,
            polymarketId: pm.id,
            polymarketSlug: pm.slug,
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
    }

    return res.status(200).json({
      opportunities,
      stakeMatchCount: hasStake ? (stakeMatches || []).length : 0,
      kalshiMarketCount: kalshiMarkets.length,
      polymarketCount: polymarketMarkets.length,
      matchedEventCount,
      // Return raw markets for browse view when no arbs found
      kalshiRawMarkets: kalshiMarkets.slice(0, 20),
      polymarketRawMarkets: polymarketMarkets.slice(0, 20),
      mock: false,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
