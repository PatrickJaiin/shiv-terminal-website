/**
 * Deterministic cross-venue market matching.
 *
 * Strategy:
 * 1. Canonicalize each side's teams to a small registry id (e.g. "lal", "csk")
 *    using exact + tokenized + longest-substring alias matching.
 * 2. Join markets by unordered {canonA, canonB} team pair AND game date (±1 day).
 *
 * The alias registry is intentionally small. When IDs match this never fires,
 * when they do not it is the only line of defense so aliases are deliberate
 * rather than "include anything that contains a 3-letter code".
 */

/** @typedef {import('./types.js').Team} Team */

export const TEAM_REGISTRY = [
  // NBA
  { id: "atl", sport: "nba", display: "Atlanta Hawks",        names: ["atl", "atlanta", "hawks"] },
  { id: "bos", sport: "nba", display: "Boston Celtics",       names: ["bos", "boston", "celtics"] },
  { id: "bkn", sport: "nba", display: "Brooklyn Nets",        names: ["bkn", "brooklyn", "nets"] },
  { id: "cha", sport: "nba", display: "Charlotte Hornets",    names: ["cha", "charlotte", "hornets"] },
  { id: "chi", sport: "nba", display: "Chicago Bulls",        names: ["chi", "chicago", "bulls"] },
  { id: "cle", sport: "nba", display: "Cleveland Cavaliers",  names: ["cle", "cleveland", "cavaliers", "cavs"] },
  { id: "dal", sport: "nba", display: "Dallas Mavericks",     names: ["dal", "dallas", "mavericks", "mavs"] },
  { id: "den", sport: "nba", display: "Denver Nuggets",       names: ["den", "denver", "nuggets"] },
  { id: "det", sport: "nba", display: "Detroit Pistons",      names: ["det", "detroit", "pistons"] },
  { id: "gsw", sport: "nba", display: "Golden State Warriors",names: ["gsw", "golden state", "warriors"] },
  { id: "hou", sport: "nba", display: "Houston Rockets",      names: ["hou", "houston", "rockets"] },
  { id: "ind", sport: "nba", display: "Indiana Pacers",       names: ["ind", "indiana", "pacers"] },
  { id: "lac", sport: "nba", display: "LA Clippers",          names: ["lac", "la clippers", "los angeles clippers", "clippers"] },
  { id: "lal", sport: "nba", display: "LA Lakers",            names: ["lal", "la lakers", "los angeles lakers", "lakers"] },
  { id: "mem", sport: "nba", display: "Memphis Grizzlies",    names: ["mem", "memphis", "grizzlies"] },
  { id: "mia", sport: "nba", display: "Miami Heat",           names: ["mia", "miami", "heat"] },
  { id: "mil", sport: "nba", display: "Milwaukee Bucks",      names: ["mil", "milwaukee", "bucks"] },
  { id: "min", sport: "nba", display: "Minnesota Timberwolves", names: ["min", "minnesota", "timberwolves", "wolves"] },
  { id: "nop", sport: "nba", display: "New Orleans Pelicans", names: ["nop", "new orleans", "pelicans"] },
  { id: "nyk", sport: "nba", display: "New York Knicks",      names: ["nyk", "new york", "knicks"] },
  { id: "okc", sport: "nba", display: "Oklahoma City Thunder",names: ["okc", "oklahoma city", "thunder"] },
  { id: "orl", sport: "nba", display: "Orlando Magic",        names: ["orl", "orlando", "magic"] },
  { id: "phi", sport: "nba", display: "Philadelphia 76ers",   names: ["phi", "philadelphia", "76ers", "sixers"] },
  { id: "phx", sport: "nba", display: "Phoenix Suns",         names: ["phx", "phoenix", "suns"] },
  { id: "por", sport: "nba", display: "Portland Trail Blazers", names: ["por", "portland", "trail blazers", "blazers"] },
  { id: "sac", sport: "nba", display: "Sacramento Kings",     names: ["sac", "sacramento", "kings"] },
  { id: "sas", sport: "nba", display: "San Antonio Spurs",    names: ["sas", "san antonio", "spurs"] },
  { id: "tor", sport: "nba", display: "Toronto Raptors",      names: ["tor", "toronto", "raptors"] },
  { id: "uta", sport: "nba", display: "Utah Jazz",            names: ["uta", "utah", "jazz"] },
  { id: "was", sport: "nba", display: "Washington Wizards",   names: ["was", "washington", "wizards"] },

  // IPL
  { id: "csk",  sport: "ipl", display: "Chennai Super Kings", names: ["csk", "chennai", "super kings"] },
  { id: "mi",   sport: "ipl", display: "Mumbai Indians",      names: ["mi", "mumbai indians", "mumbai"] },
  { id: "rcb",  sport: "ipl", display: "Royal Challengers Bengaluru", names: ["rcb", "bangalore", "bengaluru", "royal challengers"] },
  { id: "kkr",  sport: "ipl", display: "Kolkata Knight Riders", names: ["kkr", "kolkata", "knight riders"] },
  { id: "dc",   sport: "ipl", display: "Delhi Capitals",      names: ["dc", "delhi capitals", "delhi"] },
  { id: "rr",   sport: "ipl", display: "Rajasthan Royals",    names: ["rr", "rajasthan", "royals"] },
  { id: "pbks", sport: "ipl", display: "Punjab Kings",        names: ["pbks", "punjab kings", "punjab"] },
  { id: "srh",  sport: "ipl", display: "Sunrisers Hyderabad", names: ["srh", "hyderabad", "sunrisers"] },
  { id: "lsg",  sport: "ipl", display: "Lucknow Super Giants",names: ["lsg", "lucknow", "super giants"] },
  { id: "gt",   sport: "ipl", display: "Gujarat Titans",      names: ["gt", "gujarat", "titans"] },

  // LoL
  { id: "t1",   sport: "lol", display: "T1",                  names: ["t1", "sk telecom", "skt"] },
  { id: "geng", sport: "lol", display: "Gen.G",               names: ["geng", "gen.g", "gen g"] },
  { id: "hle",  sport: "lol", display: "Hanwha Life Esports", names: ["hle", "hanwha", "hanwha life"] },
  { id: "dk",   sport: "lol", display: "Dplus KIA",           names: ["dk", "dplus", "dplus kia", "dwg", "damwon"] },
  { id: "kt",   sport: "lol", display: "KT Rolster",          names: ["kt", "kt rolster"] },
  { id: "drx",  sport: "lol", display: "DRX",                 names: ["drx"] },
  { id: "fnc",  sport: "lol", display: "Fnatic",              names: ["fnc", "fnatic"] },
  { id: "g2",   sport: "lol", display: "G2 Esports",          names: ["g2", "g2 esports"] },
  { id: "c9",   sport: "lol", display: "Cloud9",              names: ["c9", "cloud9"] },
  { id: "tl",   sport: "lol", display: "Team Liquid",         names: ["tl", "team liquid", "liquid"] },
  { id: "fly",  sport: "lol", display: "FlyQuest",            names: ["fly", "flyquest"] },
  { id: "100t", sport: "lol", display: "100 Thieves",         names: ["100t", "100 thieves"] },
  { id: "nrg",  sport: "lol", display: "NRG Esports",         names: ["nrg", "nrg esports"] },
  { id: "blg",  sport: "lol", display: "Bilibili Gaming",     names: ["blg", "bilibili", "bilibili gaming"] },
  { id: "jdg",  sport: "lol", display: "JD Gaming",           names: ["jdg", "jd gaming"] },
  { id: "wbg",  sport: "lol", display: "Weibo Gaming",        names: ["wbg", "weibo", "weibo gaming"] },
  { id: "tes",  sport: "lol", display: "Top Esports",         names: ["tes", "top esports"] },
  { id: "lng",  sport: "lol", display: "LNG Esports",         names: ["lng", "lng esports"] },

  // Valorant
  { id: "sen",  sport: "val", display: "Sentinels",           names: ["sen", "sentinels"] },
  { id: "loud", sport: "val", display: "LOUD",                names: ["loud"] },
  { id: "prx",  sport: "val", display: "Paper Rex",           names: ["prx", "paper rex"] },
  { id: "navi", sport: "val", display: "Natus Vincere",       names: ["navi", "natus vincere"] },
  { id: "eg",   sport: "val", display: "Evil Geniuses",       names: ["eg", "evil geniuses"] },
  { id: "lev",  sport: "val", display: "Leviatan",            names: ["lev", "leviatan", "leviatán"] },
  { id: "edg",  sport: "val", display: "EDward Gaming",       names: ["edg", "edward gaming"] },
  { id: "fut",  sport: "val", display: "FUT Esports",         names: ["fut", "fut esports"] },
  { id: "kc",   sport: "val", display: "Karmine Corp",        names: ["kc", "karmine", "karmine corp"] },
  { id: "m8",   sport: "val", display: "Gentle Mates",        names: ["m8", "gentle mates"] },
  { id: "th",   sport: "val", display: "Team Heretics",       names: ["th", "team heretics", "heretics"] },
];

const ALIAS_INDEX = (() => {
  const map = new Map();
  for (const t of TEAM_REGISTRY) {
    for (const alias of t.names) {
      const key = alias.toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
  }
  return map;
})();

const TEAM_BY_ID = new Map(TEAM_REGISTRY.map((t) => [t.id, t]));

function pickSport(list, sportHint) {
  if (!list || list.length === 0) return null;
  if (!sportHint) return list[0];
  return list.find((t) => t.sport === sportHint) || list[0];
}

/**
 * Resolve an arbitrary string to a canonical team. Returns null if no match.
 * @param {string} input
 * @param {string|null} sportHint
 * @returns {Team|null}
 */
export function canonicalize(input, sportHint = null) {
  const s = (input || "").toLowerCase().trim();
  if (!s) return null;

  // 1. Exact alias match.
  const exact = ALIAS_INDEX.get(s);
  if (exact) {
    const t = pickSport(exact, sportHint);
    if (t) return { canon: t.id, display: t.display, sport: t.sport };
  }

  // 2. Tokenized exact match (split on non-alphanumeric).
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    const hit = ALIAS_INDEX.get(tok);
    if (hit) {
      const t = pickSport(hit, sportHint);
      if (t) return { canon: t.id, display: t.display, sport: t.sport };
    }
  }

  // 3. Longest-substring alias match, skip aliases <4 chars to avoid false
  //    positives (e.g. "no" matching "north"), unless the alias appears as a
  //    standalone token.
  let best = null;
  let bestLen = 0;
  for (const [alias, ts] of ALIAS_INDEX) {
    if (alias.length < 4) continue;
    if (sportHint && !ts.some((t) => t.sport === sportHint)) continue;
    if (s.includes(alias) && alias.length > bestLen) {
      best = pickSport(ts, sportHint);
      bestLen = alias.length;
    }
  }
  if (best) return { canon: best.id, display: best.display, sport: best.sport };

  return null;
}

/** Look up a canonical team id directly. */
export function teamById(canonId) {
  const t = TEAM_BY_ID.get(canonId);
  if (!t) return null;
  return { canon: t.id, display: t.display, sport: t.sport };
}

/** Game dates match if within 36h (timezone/UTC slack). Null date = don't reject. */
export function sameGameDate(dA, dB) {
  if (!dA || !dB) return true;
  if (dA === dB) return true;
  const a = Date.parse(dA);
  const b = Date.parse(dB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 36 * 60 * 60 * 1000;
}

/**
 * Cross-join two lists of normalized Markets by {teamA,teamB} pair + date.
 * Venues can appear on either side; the consumer decides which is buy vs sell.
 * @param {import('./types.js').Market[]} listA
 * @param {import('./types.js').Market[]} listB
 * @returns {{a:import('./types.js').Market, b:import('./types.js').Market}[]}
 */
export function matchMarkets(listA, listB) {
  const pairs = [];
  for (const a of listA) {
    if (!a?.teamA?.canon || !a?.teamB?.canon) continue;
    const aKey = new Set([a.teamA.canon, a.teamB.canon]);
    for (const b of listB) {
      if (!b?.teamA?.canon || !b?.teamB?.canon) continue;
      if (aKey.size !== 2) continue;
      if (!aKey.has(b.teamA.canon) || !aKey.has(b.teamB.canon)) continue;
      if (!sameGameDate(a.gameDate, b.gameDate)) continue;
      pairs.push({ a, b });
    }
  }
  return pairs;
}
