/**
 * Poker engine for 27-card deck (3 suits x 9 ranks).
 * Ported from Python submission code for the Jump Trading x CMU AI Poker Tournament.
 *
 * Card encoding: integer 0-26
 *   rank = card % 9  (0=2, 1=3, 2=4, 3=5, 4=6, 5=7, 6=8, 7=9, 8=Ace)
 *   suit = Math.floor(card / 9)  (0=diamonds, 1=hearts, 2=spades)
 */

export const NUM_CARDS = 27;
export const NUM_RANKS = 9;
export const NUM_SUITS = 3;

// Rank/suit display
const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "A"];
const SUIT_SYMBOLS = ["\u2666", "\u2665", "\u2660"]; // diamonds, hearts, spades
const SUIT_NAMES = ["Diamonds", "Hearts", "Spades"];
const CATEGORY_NAMES = [
  "Straight Flush", "Full House", "Flush", "Straight",
  "Three of a Kind", "Two Pair", "One Pair", "High Card",
];

export function cardRank(card) { return card % NUM_RANKS; }
export function cardSuit(card) { return Math.floor(card / NUM_RANKS); }
export function rankName(r) { return RANK_NAMES[r]; }
export function suitSymbol(s) { return SUIT_SYMBOLS[s]; }
export function suitName(s) { return SUIT_NAMES[s]; }
export function categoryName(cat) { return CATEGORY_NAMES[cat]; }
export function cardLabel(card) {
  return RANK_NAMES[card % NUM_RANKS] + SUIT_SYMBOLS[Math.floor(card / NUM_RANKS)];
}
export function suitColor(s) {
  return s === 2 ? "#1a1a2e" : "#dc2626"; // spades=dark, hearts/diamonds=red
}

// ── Precomputed binomial coefficients C(n, k) for n=0..26, k=0..7 ──

const COMB = [];
for (let n = 0; n < NUM_CARDS; n++) {
  COMB[n] = new Array(8).fill(0);
  COMB[n][0] = 1;
  for (let k = 1; k < Math.min(n + 1, 8); k++) {
    COMB[n][k] = COMB[n - 1][k - 1] + COMB[n - 1][k];
  }
}

// Valid straights: Map from sorted rank key to top rank
// Ranks: 0=2,1=3,2=4,3=5,4=6,5=7,6=8,7=9,8=Ace
const STRAIGHT_PATTERNS = [
  [[0, 1, 2, 3, 8], 3], // A-2-3-4-5 (5-high)
  [[0, 1, 2, 3, 4], 4], // 2-3-4-5-6
  [[1, 2, 3, 4, 5], 5], // 3-4-5-6-7
  [[2, 3, 4, 5, 6], 6], // 4-5-6-7-8
  [[3, 4, 5, 6, 7], 7], // 5-6-7-8-9
  [[4, 5, 6, 7, 8], 8], // 6-7-8-9-A
];

const CAT_MULT = 100000;

// ── Hand evaluation ──

export function evaluate5Cards(cards) {
  const ranks = cards.map((c) => c % NUM_RANKS);
  const suits = cards.map((c) => Math.floor(c / NUM_RANKS));

  const isFlush = suits[0] === suits[1] && suits[1] === suits[2] && suits[2] === suits[3] && suits[3] === suits[4];

  // Check straight
  const rankSet = new Set(ranks);
  let straightTop = -1;
  if (rankSet.size === 5) {
    const sorted = [...rankSet].sort((a, b) => a - b);
    const key = sorted.join(",");
    for (const [pat, top] of STRAIGHT_PATTERNS) {
      if (pat.join(",") === key) { straightTop = top; break; }
    }
  }
  const isStraight = straightTop >= 0;

  // Frequency counts
  const freq = new Array(NUM_RANKS).fill(0);
  for (const r of ranks) freq[r]++;

  // Build groups sorted by (count desc, rank desc)
  const groups = [];
  for (let r = 0; r < NUM_RANKS; r++) {
    if (freq[r] > 0) groups.push([freq[r], r]);
  }
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  const counts = groups.map((g) => g[0]);
  const gr = groups.map((g) => g[1]);

  // Straight Flush
  if (isStraight && isFlush) return 0 * CAT_MULT + (8 - straightTop);

  // Full House
  if (counts[0] === 3 && counts[1] === 2) return 1 * CAT_MULT + (8 - gr[0]) * 9 + (8 - gr[1]);

  // Flush
  if (isFlush) {
    const sr = [...ranks].sort((a, b) => b - a);
    return 2 * CAT_MULT + (8 - sr[0]) * 6561 + (8 - sr[1]) * 729 + (8 - sr[2]) * 81 + (8 - sr[3]) * 9 + (8 - sr[4]);
  }

  // Straight
  if (isStraight) return 3 * CAT_MULT + (8 - straightTop);

  // Three of a Kind
  if (counts[0] === 3) {
    const kickers = gr.slice(1).sort((a, b) => b - a);
    return 4 * CAT_MULT + (8 - gr[0]) * 81 + (8 - kickers[0]) * 9 + (8 - kickers[1]);
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    const highP = Math.max(gr[0], gr[1]);
    const lowP = Math.min(gr[0], gr[1]);
    return 5 * CAT_MULT + (8 - highP) * 81 + (8 - lowP) * 9 + (8 - gr[2]);
  }

  // One Pair
  if (counts[0] === 2) {
    const kickers = gr.slice(1).sort((a, b) => b - a);
    return 6 * CAT_MULT + (8 - gr[0]) * 729 + (8 - kickers[0]) * 81 + (8 - kickers[1]) * 9 + (8 - kickers[2]);
  }

  // High Card
  const sr = [...ranks].sort((a, b) => b - a);
  return 7 * CAT_MULT + (8 - sr[0]) * 6561 + (8 - sr[1]) * 729 + (8 - sr[2]) * 81 + (8 - sr[3]) * 9 + (8 - sr[4]);
}

export function handCategory(rank) {
  return Math.floor(rank / CAT_MULT);
}

function comboIndex5(c0, c1, c2, c3, c4) {
  return COMB[c0][1] + COMB[c1][2] + COMB[c2][3] + COMB[c3][4] + COMB[c4][5];
}

// ── Lookup table (80,730 entries) ──

let _handTable = null;
let _preflopScores = null;

export function buildHandLookup() {
  if (_handTable) return _handTable;
  const table = new Int32Array(80730);
  // Enumerate all C(27,5) = 80,730 combinations
  for (let a = 0; a < 23; a++)
    for (let b = a + 1; b < 24; b++)
      for (let c = b + 1; c < 25; c++)
        for (let d = c + 1; d < 26; d++)
          for (let e = d + 1; e < 27; e++) {
            const idx = COMB[a][1] + COMB[b][2] + COMB[c][3] + COMB[d][4] + COMB[e][5];
            table[idx] = evaluate5Cards([a, b, c, d, e]);
          }
  _handTable = table;
  return table;
}

export function best5From7(sevenCards, table) {
  const s = [...sevenCards].map(Number).sort((a, b) => a - b);
  const [s0, s1, s2, s3, s4, s5, s6] = s;
  let best = 999999;
  const fives = [
    [s0,s1,s2,s3,s4],[s0,s1,s2,s3,s5],[s0,s1,s2,s3,s6],
    [s0,s1,s2,s4,s5],[s0,s1,s2,s4,s6],[s0,s1,s2,s5,s6],
    [s0,s1,s3,s4,s5],[s0,s1,s3,s4,s6],[s0,s1,s3,s5,s6],
    [s0,s1,s4,s5,s6],[s0,s2,s3,s4,s5],[s0,s2,s3,s4,s6],
    [s0,s2,s3,s5,s6],[s0,s2,s4,s5,s6],[s0,s3,s4,s5,s6],
    [s1,s2,s3,s4,s5],[s1,s2,s3,s4,s6],[s1,s2,s3,s5,s6],
    [s1,s2,s4,s5,s6],[s1,s3,s4,s5,s6],[s2,s3,s4,s5,s6],
  ];
  for (const five of fives) {
    const idx = COMB[five[0]][1] + COMB[five[1]][2] + COMB[five[2]][3] + COMB[five[3]][4] + COMB[five[4]][5];
    const r = table[idx];
    if (r < best) best = r;
  }
  return best;
}

// ── Preflop hand scoring ──

function twoCardScore(r1, r2, s1, s2) {
  let score = 0;
  if (r1 === r2) score += 50 + r1 * 5;
  score += r1 + r2;
  if (s1 === s2) score += 12;
  const gap = Math.abs(r1 - r2);
  if (gap > 0 && gap <= 4) score += (5 - gap) * 3;
  if ((r1 === 8 && r2 <= 3) || (r2 === 8 && r1 <= 3)) score += 4;
  return score;
}

export function preflopHandStrength(cards) {
  const ranks = cards.map((c) => c % NUM_RANKS);
  const suits = cards.map((c) => Math.floor(c / NUM_RANKS));

  let score = 0;

  // Pairs and trips
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  for (const cnt of Object.values(rankCounts)) {
    if (cnt >= 3) score += 35;
    else if (cnt === 2) score += 18;
  }

  // Suit concentration
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const maxSuited = Math.max(...Object.values(suitCounts));
  score += (maxSuited - 1) * 10;

  // Connectivity
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  const rankSet = new Set(uniqueRanks);
  for (const [pat] of STRAIGHT_PATTERNS) {
    const patSet = new Set(pat);
    let overlap = 0;
    for (const r of rankSet) if (patSet.has(r)) overlap++;
    if (overlap >= 4) score += 12;
    else if (overlap >= 3) score += 5;
  }

  // High card value
  score += ranks.reduce((a, b) => a + b, 0) * 0.6;

  // Flexibility: score all 10 possible 2-card subsets
  const subsetScores = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      subsetScores.push(twoCardScore(ranks[i], ranks[j], suits[i], suits[j]));
    }
  }
  subsetScores.sort((a, b) => b - a);
  if (subsetScores.length >= 2) {
    score += 0.7 * subsetScores[0] + 0.3 * subsetScores[1];
  } else if (subsetScores.length > 0) {
    score += subsetScores[0];
  }

  return score;
}

export function buildPreflopPercentiles() {
  if (_preflopScores) return _preflopScores;
  const scores = [];
  for (let a = 0; a < 23; a++)
    for (let b = a + 1; b < 24; b++)
      for (let c = b + 1; c < 25; c++)
        for (let d = c + 1; d < 26; d++)
          for (let e = d + 1; e < 27; e++) {
            scores.push(preflopHandStrength([a, b, c, d, e]));
          }
  scores.sort((a, b) => a - b);
  _preflopScores = scores;
  return scores;
}

export function getPercentile(score, sortedScores) {
  // Binary search
  let lo = 0, hi = sortedScores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedScores[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return (lo * 100) / sortedScores.length;
}

// ── Preflop action (simplified for demo) ──

export function preflopAction(percentile, isSB, hasPair) {
  if (isSB) {
    if (hasPair) return { action: "Raise", detail: "Always raise pairs from SB" };
    if (percentile >= 45) return { action: "Raise", detail: `Top ${(100 - percentile).toFixed(0)}% - open raise to 6` };
    if (percentile >= 5) return { action: "Limp", detail: "Marginal hand - limp in" };
    return { action: "Fold", detail: "Bottom 5% unpaired - fold" };
  } else {
    if (hasPair) return { action: "Defend", detail: "Always defend pairs as BB" };
    if (percentile >= 70) return { action: "3-Bet", detail: `Top ${(100 - percentile).toFixed(0)}% - 3-bet` };
    if (percentile >= 40) return { action: "Call", detail: "Defend - call" };
    return { action: "Fold", detail: "Below defend threshold - fold" };
  }
}

// ── Quick keep score (heuristic for discard) ──

export function quickKeepScore(keptCards, community) {
  const r1 = cardRank(keptCards[0]), r2 = cardRank(keptCards[1]);
  const s1 = cardSuit(keptCards[0]), s2 = cardSuit(keptCards[1]);
  const commRanks = community.map(cardRank);
  const commSuits = community.map(cardSuit);

  let score = 0;
  const reasons = [];

  // Pair in hand
  if (r1 === r2) {
    score += 120 + r1 * 10;
    reasons.push(`Pocket ${rankName(r1)}s (+${120 + r1 * 10})`);
    if (commRanks.includes(r1)) {
      score += 150;
      reasons.push("Trips on board (+150)");
    }
    if (commRanks.filter((r) => r === r1).length >= 2) {
      score += 200;
      reasons.push("Full house! (+200)");
    }
  }

  // Match community
  for (const r of [r1, r2]) {
    if (commRanks.includes(r)) {
      score += 80;
      reasons.push(`Pairs ${rankName(r)} on board (+80)`);
      if (commRanks.filter((cr) => cr === r).length >= 2) {
        score += 60;
        reasons.push("Full house potential (+60)");
      }
    }
  }

  // Suited
  if (s1 === s2) {
    const suitOnBoard = commSuits.filter((s) => s === s1).length;
    score += 8;
    if (suitOnBoard >= 2) { score += 25; reasons.push("Flush draw (+25)"); }
    if (suitOnBoard >= 3) { score += 50; reasons.push("Strong flush (+50)"); }
    if (suitOnBoard < 2) reasons.push("Suited (+8)");
  }

  // High cards
  score += r1 * 2 + r2 * 2;

  // Connectivity
  const allRanks = new Set([r1, r2, ...commRanks]);
  const myRanks = new Set([r1, r2]);
  for (const [pat] of STRAIGHT_PATTERNS) {
    const patSet = new Set(pat);
    let have = 0;
    for (const r of allRanks) if (patSet.has(r)) have++;
    const myInPat = [...myRanks].filter((r) => patSet.has(r)).length;
    if (have >= 4 && myInPat > 0) {
      score += 20;
      reasons.push("4 to a straight (+20)");
    } else if (have >= 3 && myInPat >= 1) {
      score += 5;
    }
  }

  return { score, reasons };
}

// ── Exact equity calculator ──

export function exactEquity(myCards, community, deadCards, handTable) {
  const allKnown = new Set([...myCards, ...community, ...deadCards]);
  const remaining = [];
  for (let c = 0; c < NUM_CARDS; c++) {
    if (!allKnown.has(c)) remaining.push(c);
  }

  const cardsTocome = 5 - community.length;
  let wins = 0, ties = 0, total = 0;

  // Enumerate opponent hands
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const oppHand = [remaining[i], remaining[j]];

      if (cardsTocome === 0) {
        // River - no more cards
        const my7 = [...myCards, ...community];
        const opp7 = [...oppHand, ...community];
        const myRank = best5From7(my7, handTable);
        const oppRank = best5From7(opp7, handTable);
        total++;
        if (myRank < oppRank) wins++;
        else if (myRank === oppRank) ties++;
      } else {
        // Need to enumerate board completions
        const pool = remaining.filter((c) => c !== oppHand[0] && c !== oppHand[1]);
        const boardExts = combinations(pool, cardsTocome);
        for (const ext of boardExts) {
          const fullBoard = [...community, ...ext];
          const my7 = [...myCards, ...fullBoard];
          const opp7 = [...oppHand, ...fullBoard];
          const myRank = best5From7(my7, handTable);
          const oppRank = best5From7(opp7, handTable);
          total++;
          if (myRank < oppRank) wins++;
          else if (myRank === oppRank) ties++;
        }
      }
    }
  }

  if (total === 0) return { equity: 0.5, wins: 0, ties: 0, total: 0 };
  return {
    equity: (wins + 0.5 * ties) / total,
    wins,
    ties,
    losses: total - wins - ties,
    total,
  };
}

// ── Discard advisor ──

export function evaluateAllKeeps(holeCards, community, handTable) {
  // Generate all 10 possible 2-card keeps from 5 hole cards
  const keeps = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      const kept = [holeCards[i], holeCards[j]];
      const discarded = holeCards.filter((_, idx) => idx !== i && idx !== j);
      const { score, reasons } = quickKeepScore(kept, community);
      keeps.push({ kept, discarded, heuristicScore: score, reasons });
    }
  }
  // Sort by heuristic score descending
  keeps.sort((a, b) => b.heuristicScore - a.heuristicScore);
  return keeps;
}

export function evaluateKeepEquity(kept, discarded, community, handTable) {
  const deadCards = new Set(discarded);
  return exactEquity(kept, community, deadCards, handTable);
}

// ── Utility: combinations generator ──

function combinations(arr, k) {
  const result = [];
  function combine(start, combo) {
    if (combo.length === k) { result.push([...combo]); return; }
    for (let i = start; i <= arr.length - (k - combo.length); i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return result;
}

// ── All 27 cards for the picker ──

export function allCards() {
  const cards = [];
  for (let suit = 0; suit < NUM_SUITS; suit++) {
    for (let rank = 0; rank < NUM_RANKS; rank++) {
      cards.push(suit * NUM_RANKS + rank);
    }
  }
  return cards;
}

// ══════════════════════════════════════════════════════
// Game Simulator - Bot vs Bot
// ══════════════════════════════════════════════════════

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fast equity estimate from hand category (no enumeration)
function fastEquityEstimate(myCards, community, handTable) {
  const all = [...myCards, ...community];
  let cat = 7;
  if (all.length >= 7) cat = Math.floor(best5From7(all, handTable) / CAT_MULT);
  else if (all.length >= 5) cat = Math.floor(evaluate5Cards(all.slice(0, 5).sort((a, b) => a - b)) / CAT_MULT);
  const approx = [0.97, 0.93, 0.85, 0.80, 0.75, 0.62, 0.45, 0.25];
  return approx[cat] || 0.5;
}

// Bot strategy: simplified version of the tournament bot
function botDecision(myCards, community, street, myBet, oppBet, isSB, handTable, preflopScores, discardPhase) {
  const pot = myBet + oppBet;
  const callCost = oppBet - myBet;

  // Discard phase
  if (discardPhase && myCards.length === 5 && community.length >= 3) {
    const keeps = evaluateAllKeeps(myCards, community, handTable);
    // Use heuristic best (fast)
    return { action: "discard", keepIndices: [myCards.indexOf(keeps[0].kept[0]), myCards.indexOf(keeps[0].kept[1])] };
  }

  // Preflop with 5 cards
  if (street === 0 && myCards.length === 5 && preflopScores) {
    const strength = preflopHandStrength(myCards);
    const percentile = getPercentile(strength, preflopScores);
    const ranks = myCards.map(cardRank);
    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const hasPair = Object.values(counts).some((c) => c >= 2);

    if (isSB) {
      if (hasPair || percentile >= 45) {
        const raiseAmt = Math.min(Math.max(6, oppBet + 4), 100);
        return { action: "raise", amount: raiseAmt, detail: `Raise (${percentile.toFixed(0)}th pctl)` };
      }
      if (percentile >= 5) return { action: "call", detail: `Limp (${percentile.toFixed(0)}th pctl)` };
      return { action: "fold", detail: `Fold (${percentile.toFixed(0)}th pctl)` };
    } else {
      if (hasPair || percentile >= 70) {
        const raiseAmt = Math.min(Math.max(oppBet * 3, 6), 100);
        return { action: "raise", amount: raiseAmt, detail: `3-Bet (${percentile.toFixed(0)}th pctl)` };
      }
      if (percentile >= 40 || (callCost <= 1 && percentile >= 25)) return { action: "call", detail: `Defend (${percentile.toFixed(0)}th pctl)` };
      return { action: "fold", detail: `Fold (${percentile.toFixed(0)}th pctl)` };
    }
  }

  // Postflop with 2 cards
  if (myCards.length === 2 && community.length >= 3) {
    const equity = fastEquityEstimate(myCards, community, handTable);
    const potOdds = callCost > 0 ? callCost / (pot + callCost) : 0;

    if (equity >= 0.70) {
      const raiseAmt = Math.min(Math.max(Math.floor(pot * 0.75) + oppBet, oppBet + 4), 100);
      return { action: "raise", amount: raiseAmt, detail: `Value bet (${(equity * 100).toFixed(0)}% eq)` };
    }
    if (equity >= 0.50 && callCost === 0) {
      const betAmt = Math.min(Math.max(Math.floor(pot * 0.55), 4), 100);
      return { action: "raise", amount: betAmt, detail: `Bet (${(equity * 100).toFixed(0)}% eq)` };
    }
    if (callCost > 0 && equity >= potOdds + 0.03) {
      return { action: "call", detail: `Call (${(equity * 100).toFixed(0)}% eq vs ${(potOdds * 100).toFixed(0)}% odds)` };
    }
    if (callCost === 0) return { action: "check", detail: `Check (${(equity * 100).toFixed(0)}% eq)` };
    return { action: "fold", detail: `Fold (${(equity * 100).toFixed(0)}% eq)` };
  }

  // Fallback
  if (callCost === 0) return { action: "check", detail: "Check" };
  return { action: "fold", detail: "Fold" };
}

// Simple opponent: plays looser, less sophisticated
function simpleOpponentDecision(myCards, community, street, myBet, oppBet, isSB, handTable, preflopScores, discardPhase) {
  const callCost = oppBet - myBet;
  const pot = myBet + oppBet;

  if (discardPhase && myCards.length === 5 && community.length >= 3) {
    const keeps = evaluateAllKeeps(myCards, community, handTable);
    return { action: "discard", keepIndices: [myCards.indexOf(keeps[0].kept[0]), myCards.indexOf(keeps[0].kept[1])] };
  }

  if (street === 0 && myCards.length === 5 && preflopScores) {
    const strength = preflopHandStrength(myCards);
    const percentile = getPercentile(strength, preflopScores);
    // Looser: plays top 80%
    if (percentile >= 60) {
      const raiseAmt = Math.min(Math.max(6, oppBet + 4), 100);
      return { action: "raise", amount: raiseAmt, detail: `Raise (${percentile.toFixed(0)}th)` };
    }
    if (percentile >= 20) return { action: "call", detail: `Call (${percentile.toFixed(0)}th)` };
    return { action: "fold", detail: `Fold (${percentile.toFixed(0)}th)` };
  }

  if (myCards.length === 2 && community.length >= 3) {
    const equity = fastEquityEstimate(myCards, community, handTable);
    if (equity >= 0.65 && callCost === 0) {
      const betAmt = Math.min(Math.max(Math.floor(pot * 0.6), 4), 100);
      return { action: "raise", amount: betAmt, detail: `Bet (${(equity * 100).toFixed(0)}%)` };
    }
    if (callCost > 0 && equity >= 0.35) return { action: "call", detail: `Call (${(equity * 100).toFixed(0)}%)` };
    if (callCost === 0) return { action: "check", detail: `Check (${(equity * 100).toFixed(0)}%)` };
    return { action: "fold", detail: `Fold (${(equity * 100).toFixed(0)}%)` };
  }

  if (callCost === 0) return { action: "check", detail: "Check" };
  return { action: "fold", detail: "Fold" };
}

// Game state
export function createGame(handTable, preflopScores) {
  const deck = shuffle(Array.from({ length: 27 }, (_, i) => i));
  const p1Cards = deck.slice(0, 5);   // "Our Bot" (SB)
  const p2Cards = deck.slice(5, 10);  // "Opponent" (BB)
  const board = deck.slice(10, 15);   // 5 community cards (flop=3, turn=1, river=1)

  return {
    handTable,
    preflopScores,
    p1: { cards: p1Cards, kept: null, discarded: null, isSB: true, label: "Our Bot", bet: 1, folded: false },
    p2: { cards: p2Cards, kept: null, discarded: null, isSB: false, label: "Opponent", bet: 2, folded: false },
    board,
    community: [],       // revealed community cards
    street: 0,           // 0=preflop, 1=flop, 2=turn, 3=river
    pot: 3,              // 1+2 blinds
    p1BetTotal: 1,       // total chips p1 has put in this hand
    p2BetTotal: 2,       // total chips p2 has put in this hand
    phase: "preflop",    // preflop, discard-p2, discard-p1, flop, turn, river, showdown
    log: [{ type: "info", text: "Hand starts. Our Bot posts SB (1), Opponent posts BB (2)." }],
    winner: null,
    finished: false,
    actionsThisRound: 0,
    raisesThisRound: 0,
  };
}

export function stepGame(game) {
  if (game.finished) return game;
  const g = { ...game, log: [...game.log] };

  function addLog(who, text, detail) {
    g.log.push({ type: "action", who, text, detail });
  }

  function addChips(actor, cost) {
    g.pot += cost;
    if (actor === g.p1) g.p1BetTotal += cost;
    else g.p2BetTotal += cost;
  }

  function resolve(actor, decision) {
    const other = actor === g.p1 ? g.p2 : g.p1;
    if (decision.action === "fold") {
      actor.folded = true;
      addLog(actor.label, "Folds", decision.detail);
      g.winner = other.label;
      g.finished = true;
      g.phase = "showdown";
      return true;
    }
    if (decision.action === "check") {
      addLog(actor.label, "Checks", decision.detail);
      g.actionsThisRound++;
      return false;
    }
    if (decision.action === "call") {
      const cost = other.bet - actor.bet;
      addChips(actor, cost);
      actor.bet = other.bet;
      addLog(actor.label, `Calls ${cost}`, decision.detail);
      g.actionsThisRound++;
      return false;
    }
    if (decision.action === "raise") {
      // Cap at 3 raises per round to prevent infinite re-raising
      if (g.raisesThisRound >= 3) {
        const cost = other.bet - actor.bet;
        if (cost > 0) {
          addChips(actor, cost);
          actor.bet = other.bet;
          addLog(actor.label, `Calls ${cost}`, "raise cap reached");
        } else {
          addLog(actor.label, "Checks", "raise cap reached");
        }
        g.actionsThisRound++;
        return false;
      }
      const amt = Math.min(decision.amount || (other.bet + 4), 100);
      const cost = amt - actor.bet;
      addChips(actor, cost);
      actor.bet = amt;
      addLog(actor.label, `Raises to ${amt}`, decision.detail);
      g.actionsThisRound = 1;
      g.raisesThisRound++;
      return false;
    }
    return false;
  }

  // Determine who acts
  if (g.phase === "preflop") {
    // SB acts first preflop
    const actor = g.actionsThisRound % 2 === 0 ? g.p1 : g.p2;
    const other = actor === g.p1 ? g.p2 : g.p1;
    const decide = actor === g.p1 ? botDecision : simpleOpponentDecision;
    const d = decide(actor.cards, g.community, 0, actor.bet, other.bet, actor.isSB, g.handTable, g.preflopScores, false);

    const folded = resolve(actor, d);
    if (folded) return g;

    // Check if betting round is over (both acted, bets equal)
    if (g.actionsThisRound >= 2 && g.p1.bet === g.p2.bet) {
      // Deal flop
      g.community = g.board.slice(0, 3);
      g.street = 1;
      g.phase = "discard-p2"; // BB discards first
      g.log.push({ type: "info", text: `Flop: ${g.community.map(cardLabel).join(" ")}` });
      g.actionsThisRound = 0;
      g.raisesThisRound = 0;
      g.p1.bet = 0;
      g.p2.bet = 0;
    }
    return g;
  }

  if (g.phase === "discard-p2") {
    // BB (p2) discards first
    const d = simpleOpponentDecision(g.p2.cards, g.community, 1, 0, 0, false, g.handTable, g.preflopScores, true);
    if (d.action === "discard") {
      const keepIdx = d.keepIndices;
      g.p2.kept = keepIdx.map((i) => g.p2.cards[i]);
      g.p2.discarded = g.p2.cards.filter((_, i) => !keepIdx.includes(i));
      g.p2.cards = g.p2.kept;
      addLog(g.p2.label, `Discards ${g.p2.discarded.map(cardLabel).join(" ")}, keeps 2 cards`);
    }
    g.phase = "discard-p1";
    return g;
  }

  if (g.phase === "discard-p1") {
    // SB (p1) discards second (sees p2 discards)
    const d = botDecision(g.p1.cards, g.community, 1, 0, 0, true, g.handTable, g.preflopScores, true);
    if (d.action === "discard") {
      const keepIdx = d.keepIndices;
      g.p1.kept = keepIdx.map((i) => g.p1.cards[i]);
      g.p1.discarded = g.p1.cards.filter((_, i) => !keepIdx.includes(i));
      g.p1.cards = g.p1.kept;
      addLog(g.p1.label, `Discards ${g.p1.discarded.map(cardLabel).join(" ")}, keeps 2 cards`);
    }
    g.phase = "flop";
    g.actionsThisRound = 0;
    g.raisesThisRound = 0;
    return g;
  }

  // Post-flop betting: flop, turn, river
  if (["flop", "turn", "river"].includes(g.phase)) {
    // SB acts first post-flop
    const actor = g.actionsThisRound % 2 === 0 ? g.p1 : g.p2;
    const other = actor === g.p1 ? g.p2 : g.p1;
    const decide = actor === g.p1 ? botDecision : simpleOpponentDecision;
    const d = decide(actor.cards, g.community, g.street, actor.bet, other.bet, actor.isSB, g.handTable, g.preflopScores, false);

    const folded = resolve(actor, d);
    if (folded) return g;

    // Check if round over
    if (g.actionsThisRound >= 2 && g.p1.bet === g.p2.bet) {
      if (g.phase === "flop") {
        g.community = g.board.slice(0, 4);
        g.street = 2;
        g.phase = "turn";
        g.log.push({ type: "info", text: `Turn: ${cardLabel(g.board[3])}` });
      } else if (g.phase === "turn") {
        g.community = g.board.slice(0, 5);
        g.street = 3;
        g.phase = "river";
        g.log.push({ type: "info", text: `River: ${cardLabel(g.board[4])}` });
      } else {
        g.phase = "showdown";
      }
      g.actionsThisRound = 0;
      g.raisesThisRound = 0;
      g.p1.bet = 0;
      g.p2.bet = 0;
    }
    return g;
  }

  if (g.phase === "showdown") {
    if (!g.winner) {
      // Evaluate hands
      const p1Hand = best5From7([...g.p1.cards, ...g.community], g.handTable);
      const p2Hand = best5From7([...g.p2.cards, ...g.community], g.handTable);
      const p1Cat = categoryName(Math.floor(p1Hand / CAT_MULT));
      const p2Cat = categoryName(Math.floor(p2Hand / CAT_MULT));

      g.log.push({ type: "info", text: `${g.p1.label}: ${g.p1.cards.map(cardLabel).join(" ")} - ${p1Cat}` });
      g.log.push({ type: "info", text: `${g.p2.label}: ${g.p2.cards.map(cardLabel).join(" ")} - ${p2Cat}` });

      if (p1Hand < p2Hand) {
        g.winner = g.p1.label;
        g.log.push({ type: "result", text: `${g.p1.label} wins ${g.pot} chips with ${p1Cat}!` });
      } else if (p2Hand < p1Hand) {
        g.winner = g.p2.label;
        g.log.push({ type: "result", text: `${g.p2.label} wins ${g.pot} chips with ${p2Cat}!` });
      } else {
        g.winner = "Tie";
        g.log.push({ type: "result", text: `Split pot (${g.pot / 2} each) - both have ${p1Cat}` });
      }
    }
    g.finished = true;
    return g;
  }

  return g;
}
