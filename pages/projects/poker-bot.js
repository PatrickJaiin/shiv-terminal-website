import { useState, useRef, useCallback, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import {
  NUM_RANKS, NUM_SUITS, cardRank, cardSuit, rankName, suitSymbol, suitColor,
  cardLabel, categoryName, handCategory, evaluate5Cards, buildHandLookup,
  preflopHandStrength, buildPreflopPercentiles, getPercentile, preflopAction,
  quickKeepScore, evaluateAllKeeps, evaluateKeepEquity, exactEquity,
  best5From7, allCards, createGame, stepGame,
} from "../../lib/poker-engine";

function StatCard({ value, label, sub, accent = "text-blue-600" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <div className={`text-3xl font-bold ${accent}`}>{value}</div>
      <div className="text-sm font-medium text-gray-800 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function Bar({ value, max = 100, color = "bg-blue-500", label, sublabel }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-28 text-sm text-gray-600 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-gray-700">
          {sublabel || `${value}%`}
        </span>
      </div>
    </div>
  );
}

function PipelineStep({ number, title, subtitle, icon, detail, isLast = false }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-lg flex-shrink-0">
          {icon}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
      </div>
      <div className={`pb-8 ${isLast ? "" : ""}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-400 font-mono">STEP {number}</span>
        </div>
        <p className="font-semibold text-gray-900 mt-0.5">{title}</p>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        {detail && (
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600 font-mono">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card Picker ──

function CardPicker({ selected, onToggle, disabled = new Set(), maxCards = 5, label }) {
  const cards = allCards();
  return (
    <div>
      {label && <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>}
      <div className="space-y-1.5">
        {[0, 1, 2].map((suit) => (
          <div key={suit} className="flex gap-1 flex-wrap">
            <span className="w-5 text-sm flex items-center justify-center" style={{ color: suitColor(suit) }}>
              {suitSymbol(suit)}
            </span>
            {Array.from({ length: NUM_RANKS }, (_, rank) => {
              const card = suit * NUM_RANKS + rank;
              const isSel = selected.has(card);
              const isDis = disabled.has(card);
              const atMax = selected.size >= maxCards && !isSel;
              return (
                <button
                  key={card}
                  onClick={() => !isDis && !atMax && onToggle(card)}
                  disabled={isDis || atMax}
                  className={`w-9 h-11 rounded-md text-xs font-bold border transition-all flex items-center justify-center ${
                    isSel
                      ? "bg-gray-900 text-white border-gray-900 ring-2 ring-blue-400 ring-offset-1"
                      : isDis
                      ? "bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed"
                      : atMax
                      ? "bg-white text-gray-300 border-gray-200 cursor-not-allowed"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                  style={isSel ? {} : { color: isDis ? undefined : suitColor(suit) }}
                >
                  {rankName(rank)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        {selected.size}/{maxCards} selected
        {selected.size > 0 && (
          <> - {[...selected].map(cardLabel).join(", ")}</>
        )}
      </p>
    </div>
  );
}

// ── Card display (small inline card) ──

function Card({ card, small = false }) {
  const r = cardRank(card);
  const s = cardSuit(card);
  return (
    <span
      className={`inline-flex items-center justify-center rounded border border-gray-200 font-bold ${
        small ? "w-7 h-8 text-[10px]" : "w-9 h-11 text-xs"
      }`}
      style={{ color: suitColor(s) }}
    >
      {rankName(r)}{suitSymbol(s)}
    </span>
  );
}

// ── Hand Evaluator Tab ──

function HandEvaluatorTab({ handTable, preflopScores }) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (card) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card);
      else if (next.size < 5) next.add(card);
      return next;
    });
  };

  const cards = [...selected];
  const hasHand = cards.length === 5;

  let result = null;
  if (hasHand && handTable && preflopScores) {
    const sorted = [...cards].sort((a, b) => a - b);
    const rank = evaluate5Cards(sorted);
    const cat = handCategory(rank);
    const catName = categoryName(cat);

    const strength = preflopHandStrength(sorted);
    const percentile = getPercentile(strength, preflopScores);

    // Check for pairs
    const ranks = cards.map(cardRank);
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const hasPair = Object.values(rankCounts).some((c) => c >= 2);

    const sbAction = preflopAction(percentile, true, hasPair);
    const bbAction = preflopAction(percentile, false, hasPair);

    // Best 2-card subsets
    const subsets = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        const r1 = cardRank(cards[i]), r2 = cardRank(cards[j]);
        const s1 = cardSuit(cards[i]), s2 = cardSuit(cards[j]);
        let ss = 0;
        if (r1 === r2) ss += 50 + r1 * 5;
        ss += r1 + r2;
        if (s1 === s2) ss += 12;
        const gap = Math.abs(r1 - r2);
        if (gap > 0 && gap <= 4) ss += (5 - gap) * 3;
        if ((r1 === 8 && r2 <= 3) || (r2 === 8 && r1 <= 3)) ss += 4;
        subsets.push({ cards: [cards[i], cards[j]], score: ss });
      }
    }
    subsets.sort((a, b) => b.score - a.score);

    const catColors = ["text-yellow-600 bg-yellow-50", "text-purple-600 bg-purple-50", "text-blue-600 bg-blue-50", "text-emerald-600 bg-emerald-50", "text-orange-600 bg-orange-50", "text-pink-600 bg-pink-50", "text-gray-600 bg-gray-50", "text-gray-400 bg-gray-50"];

    result = { rank, cat, catName, strength, percentile, sbAction, bbAction, subsets, catColors };
  }

  return (
    <div>
      <CardPicker selected={selected} onToggle={toggle} maxCards={5} label="Pick 5 hole cards" />

      {!hasHand && (
        <p className="text-xs text-gray-400 mt-4 text-center">Select 5 cards to evaluate</p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* Category + Rank */}
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${result.catColors[result.cat]}`}>
              {result.catName}
            </span>
            <span className="text-xs text-gray-400">Rank {result.rank.toLocaleString()} of 80,730</span>
          </div>

          {/* Percentile bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">Pre-flop Percentile</span>
              <span className="font-bold text-gray-900">{result.percentile.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full transition-all duration-500"
                style={{ width: `${result.percentile}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Better than {result.percentile.toFixed(1)}% of all possible 5-card hands
            </p>
          </div>

          {/* Bot actions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">As Small Blind</p>
              <p className={`text-sm font-bold ${
                result.sbAction.action === "Fold" ? "text-red-500" : result.sbAction.action === "Raise" ? "text-emerald-600" : "text-yellow-600"
              }`}>{result.sbAction.action}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{result.sbAction.detail}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">As Big Blind</p>
              <p className={`text-sm font-bold ${
                result.bbAction.action === "Fold" ? "text-red-500" : result.bbAction.action === "3-Bet" ? "text-emerald-600" : "text-yellow-600"
              }`}>{result.bbAction.action}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{result.bbAction.detail}</p>
            </div>
          </div>

          {/* Best 2-card subsets */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Best 2-card keeps (flexibility)</p>
            <div className="space-y-1">
              {result.subsets.slice(0, 5).map((sub, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${i === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}>
                  <span className="font-bold text-gray-400 w-4">#{i + 1}</span>
                  <Card card={sub.cards[0]} small />
                  <Card card={sub.cards[1]} small />
                  <span className="text-gray-400 ml-auto font-mono">{sub.score.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Discard Advisor Tab ──

function DiscardAdvisorTab({ handTable }) {
  const [holeCards, setHoleCards] = useState(new Set());
  const [community, setCommunity] = useState(new Set());
  const [results, setResults] = useState(null);
  const [computing, setComputing] = useState(false);
  const [equityProgress, setEquityProgress] = useState(0);

  const toggleHole = (card) => {
    setHoleCards((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card); else if (next.size < 5) next.add(card);
      return next;
    });
    setResults(null);
  };
  const toggleComm = (card) => {
    setCommunity((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card); else if (next.size < 3) next.add(card);
      return next;
    });
    setResults(null);
  };

  const canAnalyze = holeCards.size === 5 && community.size === 3 && handTable;

  const analyze = useCallback(async () => {
    if (!canAnalyze) return;
    setComputing(true);
    setEquityProgress(0);

    // Run in setTimeout chunks to avoid blocking UI
    const hCards = [...holeCards];
    const cCards = [...community];
    const keeps = evaluateAllKeeps(hCards, cCards, handTable);

    // Compute equity for top 6 keeps
    const topN = Math.min(6, keeps.length);
    for (let i = 0; i < topN; i++) {
      setEquityProgress(i + 1);
      await new Promise((r) => setTimeout(r, 0)); // yield to UI
      const eq = evaluateKeepEquity(keeps[i].kept, keeps[i].discarded, cCards, handTable);
      keeps[i].equity = eq.equity;
      keeps[i].wins = eq.wins;
      keeps[i].losses = eq.losses;
      keeps[i].ties = eq.ties;
    }
    // Remaining keeps get heuristic only
    for (let i = topN; i < keeps.length; i++) {
      keeps[i].equity = null;
    }

    // Re-sort by equity (for those that have it), then heuristic
    keeps.sort((a, b) => {
      if (a.equity !== null && b.equity !== null) return b.equity - a.equity;
      if (a.equity !== null) return -1;
      if (b.equity !== null) return 1;
      return b.heuristicScore - a.heuristicScore;
    });

    setResults(keeps);
    setComputing(false);
  }, [canAnalyze, holeCards, community, handTable]);

  return (
    <div>
      <CardPicker selected={holeCards} onToggle={toggleHole} maxCards={5} label="Pick 5 hole cards" />
      <div className="mt-4">
        <CardPicker
          selected={community}
          onToggle={toggleComm}
          disabled={holeCards}
          maxCards={3}
          label="Pick 3 community cards (flop)"
        />
      </div>

      <button
        onClick={analyze}
        disabled={!canAnalyze || computing}
        className="mt-4 w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {computing ? `Computing equity (${equityProgress}/6)...` : "Analyze Discards"}
      </button>

      {results && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium text-gray-600 mb-3">All 10 possible keeps, ranked by equity</p>
          {results.map((keep, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                i === 0 ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"
              }`}
            >
              <span className="font-bold text-gray-400 text-xs w-5">#{i + 1}</span>
              <div className="flex gap-1">
                <span className="text-[10px] text-gray-400 mr-1">Keep:</span>
                <Card card={keep.kept[0]} small />
                <Card card={keep.kept[1]} small />
              </div>
              <div className="flex gap-1 opacity-40">
                <span className="text-[10px] text-gray-400 mr-1">Toss:</span>
                {keep.discarded.map((c) => <Card key={c} card={c} small />)}
              </div>
              <div className="ml-auto text-right">
                {keep.equity !== null ? (
                  <span className={`text-sm font-bold ${keep.equity > 0.55 ? "text-emerald-600" : keep.equity > 0.45 ? "text-yellow-600" : "text-red-500"}`}>
                    {(keep.equity * 100).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">heuristic only</span>
                )}
                <p className="text-[10px] text-gray-400">score: {keep.heuristicScore}</p>
              </div>
            </div>
          ))}
          {results[0]?.reasons?.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-1">Why #{1} is best:</p>
              <ul className="text-xs text-gray-500 space-y-0.5">
                {results[0].reasons.map((r, i) => <li key={i}>- {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Equity Calculator Tab ──

function EquityCalculatorTab({ handTable }) {
  const [myCards, setMyCards] = useState(new Set());
  const [community, setCommunity] = useState(new Set());
  const [deadCards, setDeadCards] = useState(new Set());
  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);

  const toggleMy = (card) => {
    setMyCards((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card); else if (next.size < 2) next.add(card);
      return next;
    });
    setResult(null);
  };
  const toggleComm = (card) => {
    setCommunity((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card); else if (next.size < 5) next.add(card);
      return next;
    });
    setResult(null);
  };
  const toggleDead = (card) => {
    setDeadCards((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card); else next.add(card);
      return next;
    });
    setResult(null);
  };

  const canCalc = myCards.size === 2 && community.size >= 3 && handTable;

  const calculate = useCallback(async () => {
    if (!canCalc) return;
    setComputing(true);
    await new Promise((r) => setTimeout(r, 0));
    const eq = exactEquity([...myCards], [...community], deadCards, handTable);

    // Also get hand category
    if (community.size === 5) {
      const my7 = [...myCards, ...community];
      const rank = best5From7(my7, handTable);
      eq.handCategory = categoryName(Math.floor(rank / 100000));
    }

    setResult(eq);
    setComputing(false);
  }, [canCalc, myCards, community, deadCards, handTable]);

  const usedCards = new Set([...myCards, ...community, ...deadCards]);

  return (
    <div>
      <CardPicker selected={myCards} onToggle={toggleMy} maxCards={2} label="Your 2 hole cards" />
      <div className="mt-4">
        <CardPicker
          selected={community}
          onToggle={toggleComm}
          disabled={myCards}
          maxCards={5}
          label="Community cards (3-5)"
        />
      </div>
      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          Dead cards ({deadCards.size})
        </summary>
        <div className="mt-2">
          <CardPicker
            selected={deadCards}
            onToggle={toggleDead}
            disabled={new Set([...myCards, ...community])}
            maxCards={20}
          />
        </div>
      </details>

      <button
        onClick={calculate}
        disabled={!canCalc || computing}
        className="mt-4 w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {computing ? "Computing..." : "Calculate Equity"}
      </button>

      {result && (
        <div className="mt-5">
          {/* Big equity number */}
          <div className="text-center mb-4">
            <div className={`text-5xl font-bold ${result.equity > 0.55 ? "text-emerald-600" : result.equity > 0.45 ? "text-yellow-600" : "text-red-500"}`}>
              {(result.equity * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Equity vs random opponent
              {result.handCategory && <> - Your hand: {result.handCategory}</>}
            </p>
          </div>

          {/* Win/Tie/Lose breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center bg-emerald-50 rounded-lg p-3">
              <div className="text-lg font-bold text-emerald-600">
                {((result.wins / result.total) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-500">Win</div>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <div className="text-lg font-bold text-gray-600">
                {((result.ties / result.total) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-500">Tie</div>
            </div>
            <div className="text-center bg-red-50 rounded-lg p-3">
              <div className="text-lg font-bold text-red-500">
                {((result.losses / result.total) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-500">Lose</div>
            </div>
          </div>

          {/* Stacked bar */}
          <div className="h-4 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${(result.wins / result.total) * 100}%` }} />
            <div className="bg-gray-300 h-full" style={{ width: `${(result.ties / result.total) * 100}%` }} />
            <div className="bg-red-400 h-full" style={{ width: `${(result.losses / result.total) * 100}%` }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-1 text-center">
            {result.total.toLocaleString()} scenarios evaluated
          </p>
        </div>
      )}
    </div>
  );
}

// ── Bot vs Bot Tab ──

const STARTING_CHIPS = 500;
const MAX_HANDS = 420;
const STEP_DELAY_MS = 400;
const BETWEEN_HANDS_DELAY_MS = 1000;

function ChipGraph({ history }) {
  if (history.length < 2) return null;
  const W = 600, H = 200, PAD = 40;
  const allVals = history.flatMap((h) => [h.bot, h.opp]);
  const minY = Math.min(...allVals) - 20;
  const maxY = Math.max(...allVals) + 20;
  const rangeY = maxY - minY || 1;
  const xStep = (W - PAD * 2) / (history.length - 1);

  const toX = (i) => PAD + i * xStep;
  const toY = (v) => H - PAD - ((v - minY) / rangeY) * (H - PAD * 2);

  const botPath = history.map((h, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(h.bot).toFixed(1)}`).join(" ");
  const oppPath = history.map((h, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(h.opp).toFixed(1)}`).join(" ");

  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => minY + (rangeY * i) / (ticks - 1));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD} x2={W - PAD} y1={toY(v)} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.5} />
            <text x={PAD - 4} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">{Math.round(v)}</text>
          </g>
        ))}
        <line x1={PAD} x2={W - PAD} y1={toY(STARTING_CHIPS)} y2={toY(STARTING_CHIPS)} stroke="#d1d5db" strokeDasharray="4 3" strokeWidth={0.8} />
        <path d={botPath} fill="none" stroke="#2563eb" strokeWidth={2} />
        <path d={oppPath} fill="none" stroke="#ef4444" strokeWidth={2} />
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">Hands played</text>
        <rect x={PAD} y={4} width={8} height={8} rx={2} fill="#2563eb" />
        <text x={PAD + 12} y={12} fontSize={9} fill="#374151">Our Bot</text>
        <rect x={PAD + 70} y={4} width={8} height={8} rx={2} fill="#ef4444" />
        <text x={PAD + 82} y={12} fontSize={9} fill="#374151">Opponent</text>
      </svg>
    </div>
  );
}

function BotVsBotTab({ handTable, preflopScores }) {
  const [history, setHistory] = useState([{ bot: STARTING_CHIPS, opp: STARTING_CHIPS }]);
  const [game, setGame] = useState(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const timerRef = useRef(null);
  const logContainerRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const handsPlayed = history.length - 1;
  const botChips = history[history.length - 1].bot;
  const oppChips = history[history.length - 1].opp;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      playingRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  // Scroll hand log to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [game?.log?.length]);

  // Record finished hand into history
  const recordHand = useCallback((g) => {
    setHistory((prev) => {
      const curBot = prev[prev.length - 1].bot;
      const curOpp = prev[prev.length - 1].opp;
      let botDelta = 0, oppDelta = 0;
      if (g.winner === "Our Bot") {
        botDelta = g.pot - g.p1BetTotal;
        oppDelta = -g.p2BetTotal;
      } else if (g.winner === "Opponent") {
        oppDelta = g.pot - g.p2BetTotal;
        botDelta = -g.p1BetTotal;
      }
      return [...prev, { bot: curBot + botDelta, opp: curOpp + oppDelta }];
    });
  }, []);

  // Core loop: step through current hand, when done record it, deal next, repeat
  const runLoop = useCallback(() => {
    if (!handTable || !preflopScores) return;
    playingRef.current = true;
    setPlaying(true);

    function tick() {
      if (!playingRef.current) return;

      setGame((prev) => {
        // Need a new hand
        if (!prev || prev.finished) {
          const h = historyRef.current;
          if (h.length - 1 >= MAX_HANDS || h[h.length - 1].bot <= 0 || h[h.length - 1].opp <= 0) {
            playingRef.current = false;
            setPlaying(false);
            return prev;
          }
          // If previous hand just finished, record it
          if (prev?.finished) {
            recordHand(prev);
          }
          const ng = createGame(handTable, preflopScores);
          timerRef.current = setTimeout(tick, BETWEEN_HANDS_DELAY_MS);
          return ng;
        }
        // Step existing hand
        const next = stepGame(prev);
        timerRef.current = setTimeout(tick, next.finished ? BETWEEN_HANDS_DELAY_MS : STEP_DELAY_MS);
        return next;
      });
    }
    tick();
  }, [handTable, preflopScores, recordHand]);

  const stop = useCallback(() => {
    playingRef.current = false;
    clearTimeout(timerRef.current);
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setHistory([{ bot: STARTING_CHIPS, opp: STARTING_CHIPS }]);
    setGame(null);
  }, [stop]);

  // Manual step (when paused)
  const stepOnce = useCallback(() => {
    if (!game || !handTable || !preflopScores) return;
    if (game.finished) {
      recordHand(game);
      const h = historyRef.current;
      if (h.length - 1 < MAX_HANDS && h[h.length - 1].bot > 0 && h[h.length - 1].opp > 0) {
        setGame(createGame(handTable, preflopScores));
      }
      return;
    }
    setGame((prev) => stepGame(prev));
  }, [game, handTable, preflopScores, recordHand]);

  // Deal first hand manually
  const dealFirst = useCallback(() => {
    if (!handTable || !preflopScores) return;
    setGame(createGame(handTable, preflopScores));
  }, [handTable, preflopScores]);

  const phaseLabels = {
    preflop: "Pre-flop Betting",
    "discard-p2": "Opponent Discarding",
    "discard-p1": "Our Bot Discarding",
    flop: "Flop Betting",
    turn: "Turn Betting",
    river: "River Betting",
    showdown: "Showdown",
  };

  const done = handsPlayed >= MAX_HANDS || botChips <= 0 || oppChips <= 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {!game && !playing ? (
          <button
            onClick={() => { dealFirst(); setTimeout(runLoop, 50); }}
            disabled={!handTable || !preflopScores || done}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          >
            Start
          </button>
        ) : !playing ? (
          <>
            <button
              onClick={stepOnce}
              disabled={done && game?.finished}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {game?.finished ? "Next Hand" : "Step"}
            </button>
            <button
              onClick={runLoop}
              disabled={done}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Play
            </button>
          </>
        ) : (
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            Pause
          </button>
        )}
        {handsPlayed > 0 && !playing && (
          <button
            onClick={reset}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
        )}
        <span className="text-xs text-gray-400 ml-2">
          Hand {handsPlayed + (game && !game.finished ? 1 : 0)} / {MAX_HANDS}
          {done && " - done!"}
        </span>
      </div>

      {/* Chip counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 text-center border ${botChips >= oppChips ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="text-xs text-gray-500 mb-1">Our Bot</div>
          <div className="text-xl font-bold text-blue-600">{botChips}</div>
          <div className={`text-xs mt-0.5 ${botChips - STARTING_CHIPS >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {botChips - STARTING_CHIPS >= 0 ? "+" : ""}{botChips - STARTING_CHIPS}
          </div>
        </div>
        <div className={`rounded-lg p-3 text-center border ${oppChips > botChips ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="text-xs text-gray-500 mb-1">Opponent</div>
          <div className="text-xl font-bold text-red-500">{oppChips}</div>
          <div className={`text-xs mt-0.5 ${oppChips - STARTING_CHIPS >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {oppChips - STARTING_CHIPS >= 0 ? "+" : ""}{oppChips - STARTING_CHIPS}
          </div>
        </div>
      </div>

      {/* Graph */}
      <ChipGraph history={history} />

      {/* Hand viewer */}
      {!game && (
        <p className="text-sm text-gray-400 text-center py-8">Click "Start" to watch the bots play</p>
      )}

      {game && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              game.finished
                ? "bg-gray-900 text-white"
                : "bg-blue-100 text-blue-700 animate-pulse"
            }`}>
              {phaseLabels[game.phase] || game.phase}
            </span>
            <span className="text-sm font-bold text-gray-900">Pot: {game.pot}</span>
          </div>

          <div className="bg-emerald-900 rounded-xl p-5">
            <div className="flex justify-center gap-2 mb-4 min-h-[52px]">
              {game.community.length > 0 ? (
                game.community.map((c) => (
                  <span key={c} className="w-10 h-14 bg-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md" style={{ color: suitColor(cardSuit(c)) }}>
                    {rankName(cardRank(c))}{suitSymbol(cardSuit(c))}
                  </span>
                ))
              ) : (
                <span className="text-emerald-400 text-xs">No community cards yet</span>
              )}
              {Array.from({ length: 5 - game.community.length }, (_, i) => (
                <span key={`empty-${i}`} className="w-10 h-14 border-2 border-emerald-700 border-dashed rounded-lg" />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[game.p1, game.p2].map((p) => (
                <div key={p.label} className={`bg-emerald-800 rounded-lg p-3 ${p.folded ? "opacity-40" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-emerald-200 text-xs font-semibold">{p.label}</span>
                    <span className="text-emerald-300 text-[10px]">{p.isSB ? "SB" : "BB"}</span>
                  </div>
                  <div className="flex gap-1 mb-1">
                    {p.cards.map((c) => (
                      <span key={c} className="w-8 h-11 bg-white rounded flex items-center justify-center text-xs font-bold shadow" style={{ color: suitColor(cardSuit(c)) }}>
                        {rankName(cardRank(c))}{suitSymbol(cardSuit(c))}
                      </span>
                    ))}
                  </div>
                  {p.discarded && (
                    <div className="flex gap-0.5 mt-1">
                      <span className="text-[9px] text-emerald-400 mr-1">tossed:</span>
                      {p.discarded.map((c) => (
                        <span key={c} className="w-6 h-8 bg-emerald-600 rounded flex items-center justify-center text-[9px] font-bold text-emerald-200">
                          {rankName(cardRank(c))}{suitSymbol(cardSuit(c))}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.folded && <p className="text-red-300 text-xs mt-1">Folded</p>}
                </div>
              ))}
            </div>
          </div>

          <div ref={logContainerRef} className="bg-gray-950 rounded-lg p-4 max-h-48 overflow-y-auto">
            <p className="text-[10px] text-gray-500 mb-2 font-mono">// game log</p>
            {game.log.map((entry, i) => (
              <div key={i} className={`text-xs font-mono leading-relaxed ${
                entry.type === "result" ? "text-yellow-400 font-bold" :
                entry.type === "info" ? "text-gray-400" :
                "text-gray-300"
              }`}>
                {entry.who && <span className="text-blue-400">{entry.who}: </span>}
                {entry.text}
                {entry.detail && <span className="text-gray-500 ml-2">({entry.detail})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function PokerBot() {
  const [activeTab, setActiveTab] = useState("botvsbot");
  const [handTable, setHandTable] = useState(null);
  const [preflopScores, setPreflopScores] = useState(null);
  const [building, setBuilding] = useState(false);
  const demoRef = useRef(null);

  // Lazy-build lookup tables on first interaction
  const ensureTables = useCallback(async () => {
    if (handTable) return;
    if (building) return;
    setBuilding(true);
    await new Promise((r) => setTimeout(r, 50)); // let UI update
    const ht = buildHandLookup();
    setHandTable(ht);
    await new Promise((r) => setTimeout(r, 0));
    const ps = buildPreflopPercentiles();
    setPreflopScores(ps);
    setBuilding(false);
  }, [handTable, building]);

  // Build tables when demo section becomes active
  useEffect(() => {
    if (!handTable && !building) {
      // Defer until idle
      const hasRIC = typeof requestIdleCallback !== "undefined";
      const id = hasRIC ? requestIdleCallback(() => ensureTables()) : setTimeout(() => ensureTables(), 1000);
      return () => { if (hasRIC) cancelIdleCallback(id); else clearTimeout(id); };
    }
  }, [handTable, building, ensureTables]);

  return (
    <>
      <Head>
        <title>AI Poker Bot - Jump Trading Poker Competition - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Poker Bot - Jump Trading Poker Competition
          </h1>
          <p className="text-gray-400 text-sm mb-4">Jump Trading x CMU AI Poker Tournament 2026</p>
          <div className="flex flex-wrap gap-2 mb-8">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Game Theory</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Bayesian Inference</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Monte Carlo</span>
            <span className="text-xs text-gray-400 ml-2">2026</span>
          </div>

          <div className="prose prose-gray max-w-none mb-6">
            <p className="text-gray-600 leading-relaxed">
              Built a competitive AI poker agent for the Jump Trading x CMU AI Poker Tournament 2026, competing against 100+ teams in an ELO-ranked tournament. The game is a modified Texas Hold{"'"}em variant played on a 27-card deck (ranks 2-9 and Ace, three suits only) with a unique discard mechanic where players receive 5 hole cards, discard 3 after the flop, and discards are revealed to the opponent.
            </p>
          </div>

          {/* CTA button */}
          <div className="mb-12">
            <button
              onClick={() => demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-semibold text-base hover:bg-gray-800 transition-colors"
            >
              Try It Out
            </button>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
            <StatCard value="80,730" label="Hand Table" sub="C(27,5) precomputed" accent="text-gray-900" />
            <StatCard value="100+" label="Teams" sub="ELO-ranked matches" accent="text-blue-600" />
            <StatCard value="12+" label="Opponent Metrics" sub="VPIP, PFR, AF, WTSD..." accent="text-emerald-600" />
            <StatCard value="27" label="Card Deck" sub="3 suits, ranks 2-9 + A" accent="text-purple-600" />
          </div>

          {/* Architecture Overview */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">System Architecture</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden mb-12">
            {/* Top layer */}
            <div className="bg-gray-900 text-white px-6 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Entry Point</p>
              <p className="font-semibold">PlayerAgent</p>
            </div>
            {/* Middle modules */}
            <div className="grid grid-cols-3 border-b border-gray-200">
              <div className="p-4 border-r border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Input</p>
                <p className="text-sm font-medium text-gray-900">State Parser</p>
                <p className="text-xs text-gray-500 mt-1">Game state decoding</p>
              </div>
              <div className="p-4 border-r border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Intel</p>
                <p className="text-sm font-medium text-gray-900">Opponent Tracker</p>
                <p className="text-xs text-gray-500 mt-1">Bayesian profiling</p>
              </div>
              <div className="p-4 bg-gray-50">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Safety</p>
                <p className="text-sm font-medium text-gray-900">Bankroll Manager</p>
                <p className="text-xs text-gray-500 mt-1">Lock-in logic</p>
              </div>
            </div>
            {/* Strategy layer */}
            <div className="border-b border-gray-200 px-6 py-4 bg-blue-50">
              <p className="text-xs text-blue-600 uppercase tracking-wider mb-2">Strategy Engine</p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium">Pre-flop Strategy</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium">Post-flop Strategy</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium">Discard Optimizer</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium">Exploit Engine</span>
              </div>
            </div>
            {/* Core layer */}
            <div className="px-6 py-4 bg-emerald-50">
              <p className="text-xs text-emerald-600 uppercase tracking-wider mb-2">Core Engine</p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium">Hand Evaluator (80,730 table)</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium">Equity Calculator</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium">Monte Carlo Sampler</span>
              </div>
            </div>
          </div>

          {/* Opponent Classification */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Opponent Classification</h2>
          <p className="text-sm text-gray-500 mb-4">Bayesian profiling classifies opponents in real-time, adjusting strategy thresholds dynamically.</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-12">
            {[
              { type: "Nit", vpip: "< 20%", strategy: "Bluff more", color: "border-blue-300 bg-blue-50" },
              { type: "TAG", vpip: "20-30%", strategy: "Respect raises", color: "border-emerald-300 bg-emerald-50" },
              { type: "LAG", vpip: "30-45%", strategy: "Trap & call", color: "border-yellow-300 bg-yellow-50" },
              { type: "Station", vpip: "45-60%", strategy: "Value bet heavy", color: "border-orange-300 bg-orange-50" },
              { type: "Maniac", vpip: "> 60%", strategy: "Let them hang", color: "border-red-300 bg-red-50" },
            ].map((opp) => (
              <div key={opp.type} className={`border rounded-lg p-3 text-center ${opp.color}`}>
                <p className="font-semibold text-gray-900 text-sm">{opp.type}</p>
                <p className="text-xs text-gray-500 mt-1">VPIP {opp.vpip}</p>
                <p className="text-xs text-gray-600 mt-1 font-medium">{opp.strategy}</p>
              </div>
            ))}
          </div>

          {/* Decision Pipeline */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Decision Pipeline</h2>
          <div className="mb-12">
            <PipelineStep
              number={1}
              icon={<span className="text-sm">&#9827;</span>}
              title="Pre-flop Hand Scoring"
              subtitle="Score 5-card hands via pairs/trips bonus, suit concentration, connectivity, high cards, and flexibility. Map to percentile from 80,730 precomputed rankings."
              detail="score = pairs + trips + suit_bonus + connectivity + high_card + flexibility"
            />
            <PipelineStep
              number={2}
              icon={<span className="text-sm">&#9824;</span>}
              title="Position-Aware Action Selection"
              subtitle="Separate thresholds for Small Blind (discards 2nd, info advantage) and Big Blind (discards 1st, info disadvantage). Adjusts raise sizing and frequency by position."
              detail="SB: raise_thresh=0.65 | BB: raise_thresh=0.72 (tighter)"
            />
            <PipelineStep
              number={3}
              icon={<span className="text-sm">&#9829;</span>}
              title="Discard Phase"
              subtitle="Select optimal 2-card keep from 5 hole cards. Evaluate each of 10 combinations via equity against estimated opponent range, penalizing information leakage."
              detail="C(5,2) = 10 keeps -> heuristic filter -> equity eval top-k"
            />
            <PipelineStep
              number={4}
              icon={<span className="text-sm">&#9830;</span>}
              title="Post-flop Equity-Based Betting"
              subtitle="Compute real-time equity against Bayesian-weighted opponent range. Exploit calling stations with value bets, bluff nits more aggressively."
              detail="action = f(equity, pot_odds, opponent_type, position)"
            />
            <PipelineStep
              number={5}
              icon={<span className="text-sm">&#9733;</span>}
              title="Bankroll Lock-in"
              subtitle="When sufficiently ahead, calculate worst-case blind losses for remaining hands and lock in the win by folding everything - a mathematically guaranteed victory condition."
              detail="if bankroll - (remaining_hands * big_blind) > opponent_bankroll: FOLD_ALL"
              isLast
            />
          </div>

          {/* Equity Engine Visualization */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Equity Computation Approach</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="font-semibold text-gray-900">Exact Enumeration</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Enumerate all possible opponent hands and board completions. Precise but computationally expensive.
              </p>
              <div className="space-y-1">
                <Bar value={100} label="Accuracy" color="bg-emerald-500" sublabel="Exact" />
                <Bar value={25} label="Speed" color="bg-emerald-500" sublabel="Slow" />
              </div>
              <p className="text-xs text-gray-400 mt-2">Used for: discard phase, small remaining decks</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="font-semibold text-gray-900">Monte Carlo Sampling</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Random sampling with configurable iteration limits. Fast approximation for time-critical decisions.
              </p>
              <div className="space-y-1">
                <Bar value={92} label="Accuracy" color="bg-blue-500" sublabel="~92-98%" />
                <Bar value={90} label="Speed" color="bg-blue-500" sublabel="Fast" />
              </div>
              <p className="text-xs text-gray-400 mt-2">Used for: post-flop betting, large search spaces</p>
            </div>
          </div>

          {/* Discard Optimization */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Discard Optimization</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden mb-12">
            <div className="grid grid-cols-3 text-center border-b border-gray-200">
              <div className="p-4 border-r border-gray-200 bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">5</p>
                <p className="text-xs text-gray-500">Hole Cards</p>
              </div>
              <div className="p-4 border-r border-gray-200 bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">10</p>
                <p className="text-xs text-gray-500">Possible Keeps</p>
              </div>
              <div className="p-4 bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">2</p>
                <p className="text-xs text-gray-500">Cards Kept</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                <p className="text-sm text-gray-700"><span className="font-medium">Heuristic scoring</span> of all 10 keeps (pair quality, flush potential, straight draws)</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                <p className="text-sm text-gray-700"><span className="font-medium">Top-k filter</span> narrows to best 3-4 candidates</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                <p className="text-sm text-gray-700"><span className="font-medium">Exact equity evaluation</span> of top candidates against opponent range</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">4</span>
                <p className="text-sm text-gray-700"><span className="font-medium">Information leak penalty</span> - discards are revealed, so penalize keeps that leak hand strength</p>
              </div>
            </div>
          </div>

          {/* ── Interactive Demo ── */}
          <div ref={demoRef} className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Interactive Tools</h2>
            <p className="text-xs text-gray-500 mb-5">
              All computation runs client-side using a JS port of the bot{"'"}s Python engine
              {building && " - building hand tables..."}
            </p>

            {/* Tab selector */}
            <div className="flex gap-2 mb-5">
              {[
                { id: "botvsbot", label: "Bot vs Bot" },
                { id: "evaluator", label: "Hand Evaluator" },
                { id: "discard", label: "Discard Advisor" },
                { id: "equity", label: "Equity Calculator" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); ensureTables(); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    activeTab === tab.id
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {building && (
              <div className="text-center py-8">
                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-2" />
                <p className="text-sm text-gray-500">Building 80,730 hand lookup table...</p>
              </div>
            )}

            {!building && activeTab === "botvsbot" && (
              <BotVsBotTab handTable={handTable} preflopScores={preflopScores} />
            )}
            {!building && activeTab === "evaluator" && (
              <HandEvaluatorTab handTable={handTable} preflopScores={preflopScores} />
            )}
            {!building && activeTab === "discard" && (
              <DiscardAdvisorTab handTable={handTable} />
            )}
            {!building && activeTab === "equity" && (
              <EquityCalculatorTab handTable={handTable} />
            )}
          </div>

          {/* Tournament Details */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tournament Format</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-12">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">Jump Trading x CMU AI Poker Tournament 2026</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Open Season</p>
                <p className="text-gray-900 font-medium">March 14-21, 2026</p>
                <p className="text-gray-500 text-xs mt-1">ELO-ranked matchmaking, ~116 matches/day</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Finals</p>
                <p className="text-gray-900 font-medium">March 22, 2026</p>
                <p className="text-gray-500 text-xs mt-1">Top 10 teams, 1000-hand matches</p>
              </div>
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Compute Phases</p>
                <p className="text-gray-900 font-medium">3 Phases</p>
                <p className="text-gray-500 text-xs mt-1">1 vCPU / 500s &rarr; 4 vCPU / 1500s</p>
              </div>
            </div>
          </div>

          {/* Iteration History */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Iteration History</h2>
          <div className="space-y-4 mb-10">
            {[
              { ver: "v1.0", title: "Baseline", desc: "Basic hand evaluation and simple threshold-based betting. Established the agent framework and game engine integration.", pct: 25 },
              { ver: "v2.0", title: "Equity Engine", desc: "Added exact equity computation and precomputed hand lookup tables. Implemented heuristic-based discard selection.", pct: 50 },
              { ver: "v3.0", title: "Opponent Modeling", desc: "Introduced opponent tracking with 12+ metrics and dynamic strategy adjustment. Added Bayesian range weighting from revealed discards.", pct: 75 },
              { ver: "v4.0", title: "Final", desc: "Monte Carlo sampling for speed, modular strategy architecture (preflop/postflop/discard/exploit), NumPy-based tracking, and bankroll lock-in logic.", pct: 100 },
            ].map((v) => (
              <div key={v.ver} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-mono font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded">{v.ver}</span>
                  <span className="font-semibold text-gray-800 text-sm">{v.title}</span>
                  <div className="flex-1" />
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div className="bg-gray-900 h-2 rounded-full" style={{ width: `${v.pct}%` }} />
                  </div>
                </div>
                <div className="px-5 py-3">
                  <p className="text-sm text-gray-500">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>

        </article>
      </main>

      <Footer />
    </>
  );
}
