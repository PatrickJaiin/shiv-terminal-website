import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function PokerBot() {
  return (
    <>
      <Head>
        <title>AI Poker Bot – CMU Poker Tournament - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Poker Bot – CMU Poker Tournament
          </h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Game Theory</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Bayesian Inference</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Monte Carlo</span>
            <span className="text-xs text-gray-400 ml-2">2026</span>
          </div>

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed mb-6">
              Built a competitive AI poker agent for the CMU AI Poker Tournament 2026, competing against 100+ teams in an ELO-ranked tournament. The game is a modified Texas Hold&apos;em variant played on a 27-card deck (ranks 2–9 and Ace, three suits only) with a unique discard mechanic where players receive 5 hole cards, discard 3 after the flop, and discards are revealed to the opponent.
            </p>
          </div>

          {/* Architecture Overview */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">System Architecture</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-10 font-mono text-sm text-gray-700 overflow-x-auto">
            <pre>{`┌─────────────────────────────────────────────────────┐
│                   PlayerAgent                       │
│  ┌───────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  State     │  │  Opponent  │  │   Bankroll    │  │
│  │  Parser    │  │  Tracker   │  │   Manager     │  │
│  └─────┬─────┘  └─────┬──────┘  └───────┬───────┘  │
│        │              │                  │          │
│  ┌─────▼──────────────▼──────────────────▼───────┐  │
│  │              Strategy Engine                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ Pre-flop │ │Post-flop │ │   Discard    │  │  │
│  │  │ Strategy │ │ Strategy │ │  Optimizer   │  │  │
│  │  └────┬─────┘ └────┬─────┘ └──────┬───────┘  │  │
│  └───────┼────────────┼──────────────┼───────────┘  │
│          │            │              │              │
│  ┌───────▼────────────▼──────────────▼───────────┐  │
│  │            Core Engine                        │  │
│  │  ┌────────────┐  ┌───────────────────────┐   │  │
│  │  │ Evaluator  │  │   Equity Calculator   │   │  │
│  │  │ 80,730     │  │  Exact Enumeration +  │   │  │
│  │  │ Hand Table │  │  Monte Carlo Sampling │   │  │
│  │  └────────────┘  └───────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘`}</pre>
          </div>

          {/* Key Technical Details */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Technical Deep Dive</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Hand Evaluation</h3>
              <p className="text-sm text-gray-600">
                Precomputed lookup table of all 80,730 possible 5-card hands (C(27,5)) with integer-based ranking. Enables instant hand strength comparison without runtime computation.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Equity Computation</h3>
              <p className="text-sm text-gray-600">
                Dual approach: exact enumeration over all opponent hands and board completions for precision, plus Monte Carlo sampling with configurable limits for speed-critical decisions.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Bayesian Opponent Modeling</h3>
              <p className="text-sm text-gray-600">
                Tracks 12+ metrics (VPIP, PFR, aggression factor, fold-to-CBet, WTSD) to classify opponents as nit, calling station, maniac, LAG, or TAG. Dynamically adjusts strategy thresholds based on classification.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Discard Optimization</h3>
              <p className="text-sm text-gray-600">
                Multi-phase discard selection: heuristic scoring of all 10 possible keeps, followed by exact equity evaluation of top candidates. Bayesian range narrowing from opponent&apos;s revealed discards with information leak penalty.
              </p>
            </div>
          </div>

          {/* Strategy Pipeline */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Decision Pipeline</h2>
          <div className="space-y-3 mb-10">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">1</span>
              <div>
                <p className="font-medium text-gray-900">Pre-flop Hand Scoring</p>
                <p className="text-sm text-gray-500">Score 5-card hands via pairs/trips bonus, suit concentration, connectivity, high cards, and flexibility. Map to percentile from 80,730 precomputed rankings.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">2</span>
              <div>
                <p className="font-medium text-gray-900">Position-Aware Action Selection</p>
                <p className="text-sm text-gray-500">Separate thresholds for Small Blind (discards 2nd, information advantage) and Big Blind (discards 1st, information disadvantage). Adjusts raise sizing and frequency by position.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">3</span>
              <div>
                <p className="font-medium text-gray-900">Discard Phase</p>
                <p className="text-sm text-gray-500">Select optimal 2-card keep from 5 hole cards. Evaluate each combination via equity against estimated opponent range, penalizing information leakage from revealed discards.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">4</span>
              <div>
                <p className="font-medium text-gray-900">Post-flop Equity-Based Betting</p>
                <p className="text-sm text-gray-500">Compute real-time equity against Bayesian-weighted opponent range. Apply opponent-type adjustments: exploit calling stations with value bets, bluff nits more aggressively.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-bold">5</span>
              <div>
                <p className="font-medium text-gray-900">Bankroll Lock-in</p>
                <p className="text-sm text-gray-500">When sufficiently ahead, calculate worst-case blind losses for remaining hands and lock in the win by folding everything — a mathematically guaranteed victory condition.</p>
              </div>
            </div>
          </div>

          {/* Tournament Details */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tournament Format</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-gray-400 uppercase tracking-wide text-xs mb-1">Open Season</p>
                <p className="text-gray-900 font-medium">March 14–21, 2026</p>
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
          <div className="border-l-2 border-gray-200 pl-6 space-y-6 mb-10">
            <div>
              <p className="font-medium text-gray-900">v1.0 — Baseline</p>
              <p className="text-sm text-gray-500">Basic hand evaluation and simple threshold-based betting. Established the agent framework and game engine integration.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">v2.0 — Equity Engine</p>
              <p className="text-sm text-gray-500">Added exact equity computation and precomputed hand lookup tables. Implemented heuristic-based discard selection.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">v3.0 — Opponent Modeling</p>
              <p className="text-sm text-gray-500">Introduced opponent tracking with 12+ metrics and dynamic strategy adjustment. Added Bayesian range weighting from revealed discards.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">v4.0 — Final</p>
              <p className="text-sm text-gray-500">Monte Carlo sampling for speed, modular strategy architecture (preflop/postflop/discard/exploit), NumPy-based tracking, and bankroll lock-in logic.</p>
            </div>
          </div>

        </article>
      </main>

      <Footer />
    </>
  );
}
