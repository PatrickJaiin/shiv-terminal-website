import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

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

export default function PokerBot() {
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

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed">
              Built a competitive AI poker agent for the Jump Trading x CMU AI Poker Tournament 2026, competing against 100+ teams in an ELO-ranked tournament. The game is a modified Texas Hold&apos;em variant played on a 27-card deck (ranks 2-9 and Ace, three suits only) with a unique discard mechanic where players receive 5 hole cards, discard 3 after the flop, and discards are revealed to the opponent.
            </p>
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
