import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

function hashPassword(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return String(hash);
}

const PASSWORD_HASH = "2987399";

/* ═══════════════════════════════════════════════════
   Password Gate
   ═══════════════════════════════════════════════════ */
function PasswordGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hashPassword(password) === PASSWORD_HASH) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className={`max-w-sm w-full mx-4 ${shake ? "animate-shake" : ""}`}>
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Protected Project</h1>
            <p className="text-sm text-gray-500 mt-1">Enter the password to view this project</p>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Password"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${error ? "border-red-400 bg-red-50" : "border-gray-200"}`}
              autoFocus
            />
            {error && <p className="text-xs text-red-500 mt-2">Incorrect password. Try again.</p>}
            <button type="submit" className="w-full mt-4 bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
              Unlock
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/#projects" className="text-xs text-gray-400 hover:text-gray-600">&larr; Back to Projects</Link>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 50%{transform:translateX(8px)} 75%{transform:translateX(-4px)} }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}

const STAKE_GQL_URL = "https://stake.com/_api/graphql";
const STAKE_SPORT_QUERY = `
query SportEvents($sport: String!, $league: String!) {
  sportEvents(sport: $sport, league: $league, status: "upcoming") {
    id
    name
    slug
    startTime
    competitors { name, id }
    markets {
      id
      name
      selections { id, name, odds }
    }
  }
}`;

const GAME_OPTIONS = {
  nba: { label: "NBA", stakeVars: { sport: "basketball", league: "nba" }, icon: "🏀" },
  ipl: { label: "Cricket - IPL", stakeVars: { sport: "cricket", league: "ipl" }, icon: "🏏" },
  lol: { label: "League of Legends", stakeVars: { sport: "esports", league: "lol" }, icon: "⚔" },
  valorant: { label: "Valorant", stakeVars: { sport: "esports", league: "valorant" }, icon: "🎯" },
};

async function fetchStakeMatchesClient(apiKey, game) {
  const vars = GAME_OPTIONS[game]?.stakeVars || GAME_OPTIONS.ipl.stakeVars;
  const resp = await fetch(STAKE_GQL_URL, {
    method: "POST",
    headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: STAKE_SPORT_QUERY, variables: vars }),
  });
  if (!resp.ok) throw new Error(`Stake API ${resp.status}`);
  const data = await resp.json();
  if (data.errors) throw new Error(data.errors[0]?.message || "Stake GQL error");
  const events = data.data?.sportEvents || [];
  return events
    .map((e) => {
      const wm = e.markets?.find((m) => m.name?.toLowerCase().includes("winner"));
      if (!wm || wm.selections?.length < 2) return null;
      const s = wm.selections;
      return {
        match_id: e.id,
        name: e.name,
        team_a: { name: s[0].name, odds: parseFloat(s[0].odds), selection_id: s[0].id },
        team_b: { name: s[1].name, odds: parseFloat(s[1].odds), selection_id: s[1].id },
      };
    })
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════
   Platform helpers
   The engine trades only Kalshi <-> Polymarket. Stake was removed entirely
   from the live path; its closed API and TOS risk made it unsafe.
   ═══════════════════════════════════════════════════ */
const PLATFORM_LABELS = { kalshi: "Kalshi", polymarket: "Polymarket" };
const ACTIVE_PLATFORMS = ["kalshi", "polymarket"];

function platformPairLabel(platforms) {
  return platforms.map((p) => PLATFORM_LABELS[p] || p).join(" x ");
}

/* ═══════════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════════ */

const DEFAULT_CONFIG = {
  bankroll: 1000,
  // Engine thresholds (minGrossArb / minNetArb map to minGrossEdge / minNetEdge).
  minNetArb: 0.005,
  minGrossArb: 0.01,
  slippageBuffer: 0.005,
  maxPositionPct: 0.05,
  kellyFrac: 0.25,
  // Legacy depth knob kept so existing settings panels still render; the new
  // engine uses book VWAP instead.
  kalshiMinDepthMult: 1.0,
  kalshiTimeout: 10000,
  pollInterval: 5,
  kalshiApiBase: "https://api.elections.kalshi.com/trade-api/v2",
};

function fmt(n, d = 1) { return (n * 100).toFixed(d) + "c"; }
function ts() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }

function Dashboard() {
  // ── platforms & game ──
  // Stake is hidden from the UI per project decision; server code is preserved.
  const platforms = ACTIVE_PLATFORMS;
  const [game, setGame] = useState("nba");

  // ── credentials ──
  const [kalshiKeyId, setKalshiKeyId] = useState("");
  const [kalshiPrivateKey, setKalshiPrivateKey] = useState("");

  // ── config ──
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  // ── state ──
  const [mode, setMode] = useState("paper");
  const [scanning, setScanning] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [opportunities, setOpportunities] = useState([]);
  const [logs, setLogs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [showSettings, setShowSettings] = useState(true);
  const [executing, setExecuting] = useState({});
  const [liveConfirm, setLiveConfirm] = useState(false);
  const [rawMarkets, setRawMarkets] = useState({ kalshi: [], polymarket: [] });

  // ── paper balance tracking ──
  const [paperBalance, setPaperBalance] = useState(null);
  const [paperPnL, setPaperPnL] = useState(0);

  // ── open positions (paper trades that haven't settled yet) ──
  const [openPositions, setOpenPositions] = useState([]);
  const openPositionsRef = useRef(openPositions);
  useEffect(() => { openPositionsRef.current = openPositions; }, [openPositions]);

  // ── auto-execute ──
  const [autoExecute, setAutoExecute] = useState(true);
  const autoExecuteRef = useRef(autoExecute);
  useEffect(() => { autoExecuteRef.current = autoExecute; }, [autoExecute]);

  const intervalRef = useRef(null);
  const logEndRef = useRef(null);

  // ── derived ──
  const hasStake = false; // Stake is permanently disabled in UI
  const hasKalshi = true;
  const hasPoly = true;

  // ── load saved credentials + positions from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("arbbot_creds");
      if (saved) {
        const c = JSON.parse(saved);
        if (c.kalshiKeyId) setKalshiKeyId(c.kalshiKeyId);
        if (c.kalshiPrivateKey) setKalshiPrivateKey(c.kalshiPrivateKey);
        if (c.game) setGame(c.game);
      }
      const savedCfg = localStorage.getItem("arbbot_config");
      if (savedCfg) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedCfg) });
      const savedPositions = localStorage.getItem("arbbot_positions");
      if (savedPositions) {
        const parsed = JSON.parse(savedPositions);
        if (Array.isArray(parsed)) setOpenPositions(parsed);
      }
      const savedTrades = localStorage.getItem("arbbot_trades");
      if (savedTrades) {
        const parsed = JSON.parse(savedTrades);
        if (Array.isArray(parsed)) setTrades(parsed);
      }
      const savedBalance = localStorage.getItem("arbbot_balance");
      if (savedBalance) {
        const b = JSON.parse(savedBalance);
        if (typeof b.balance === "number") setPaperBalance(b.balance);
        if (typeof b.pnl === "number") setPaperPnL(b.pnl);
      }
    } catch {}
  }, []);

  // ── persist positions / trades / balance whenever they change ──
  useEffect(() => {
    try { localStorage.setItem("arbbot_positions", JSON.stringify(openPositions)); } catch {}
  }, [openPositions]);
  useEffect(() => {
    try { localStorage.setItem("arbbot_trades", JSON.stringify(trades.slice(0, 200))); } catch {}
  }, [trades]);
  useEffect(() => {
    if (paperBalance === null) return;
    try { localStorage.setItem("arbbot_balance", JSON.stringify({ balance: paperBalance, pnl: paperPnL })); } catch {}
  }, [paperBalance, paperPnL]);

  // ── save credentials ──
  const saveCreds = useCallback(() => {
    try {
      localStorage.setItem("arbbot_creds", JSON.stringify({ kalshiKeyId, kalshiPrivateKey, game }));
      localStorage.setItem("arbbot_config", JSON.stringify(config));
    } catch {}
  }, [kalshiKeyId, kalshiPrivateKey, game, config]);

  // ── add log entry ──
  const addLog = useCallback((msg, level = "info") => {
    setLogs((prev) => [...prev.slice(-200), { time: ts(), msg, level, id: Date.now() + Math.random() }]);
  }, []);

  // auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ── hasApiKeys check ──
  const hasApiKeys = !!(kalshiKeyId && kalshiPrivateKey);

  // ── settle open positions: poll Kalshi + Polymarket for resolution and close any that are done ──
  const checkSettlements = useCallback(async () => {
    const open = openPositionsRef.current;
    if (!open || open.length === 0) return;
    try {
      const resp = await fetch("/api/trading/check-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: open, kalshiKeyId, kalshiPrivateKey, config }),
      });
      const data = await resp.json();
      if (!resp.ok || !Array.isArray(data.updates)) return;

      const settledIds = new Set();
      for (const u of data.updates) {
        if (u.status !== "settled") continue;
        const pos = open.find((p) => p.id === u.positionId);
        if (!pos) continue;
        settledIds.add(pos.id);

        const profit = u.realizedPnl;
        // Roll into trades + balance
        const trade = {
          id: pos.id,
          time: ts(),
          match: pos.event.label,
          team: pos.backingTeam.toUpperCase(),
          pairType: "kalshi_polymarket",
          mode: "Paper",
          grossArb: pos.entryGrossArb,
          netArb: pos.entryNetArb,
          positionSize: pos.positionSize,
          profit,
          success: true,
          error: null,
          settled: true,
          kalshiResult: u.kalshiResult,
          polyWinner: u.polyWinner,
        };
        setTrades((prev) => [trade, ...prev]);
        setPaperBalance((prev) => (prev ?? config.bankroll) + profit);
        setPaperPnL((prev) => prev + profit);
        addLog(`[SETTLED] ${pos.event.label} | Kalshi: ${u.kalshiResult || "?"} | realized=$${profit.toFixed(2)}`, "success");
      }
      if (settledIds.size > 0) {
        setOpenPositions((prev) => prev.filter((p) => !settledIds.has(p.id)));
      }
    } catch (e) {
      addLog(`Settlement check error: ${e.message}`, "dim");
    }
  }, [kalshiKeyId, kalshiPrivateKey, config, addLog]);

  // ── scan cycle ──
  const runScan = useCallback(async (cycleNum) => {
    addLog(`--- Scan cycle #${cycleNum} ---`);
    // Check settlements at the start of each cycle so balance reflects resolved games.
    checkSettlements();
    try {
      const resp = await fetch("/api/trading/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          game,
          kalshiKeyId,
          kalshiPrivateKey,
          config,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Scan failed");

      const opps = data.opportunities || [];
      setOpportunities(opps);
      setRawMarkets({ kalshi: data.kalshiRawMarkets || [], polymarket: data.polymarketRawMarkets || [] });

      if (data.message) addLog(data.message, "warn");

      const counts = [];
      if (data.kalshiMarketCount !== undefined) counts.push(`${data.kalshiMarketCount} Kalshi markets`);
      if (data.polymarketCount !== undefined) counts.push(`${data.polymarketCount} Polymarket markets`);
      if (data.matchedEventCount !== undefined) counts.push(`${data.matchedEventCount} matched events`);
      if (counts.length) addLog(`Found ${counts.join(", ")}`);

      const qualifying = opps.filter((o) => o.passesThreshold);
      const nonQualifying = opps.filter((o) => !o.passesThreshold);

      for (const o of qualifying) {
        addLog(`ARB FOUND: ${o.matchName} | ${o.team} | gross=${fmt(o.grossArb)} net=${fmt(o.netArb)}`, "success");
      }
      for (const o of nonQualifying) {
        addLog(`No arb: ${o.matchName} | ${o.team} | gross=${fmt(o.grossArb)} | ${o.abortReason}`, "dim");
      }

      if (!opps.length) addLog("No opportunities found this cycle");

      // Auto-execute qualifying opportunities
      if (autoExecuteRef.current && qualifying.length > 0) {
        addLog(`Auto-executing ${qualifying.length} qualifying trade(s)...`, "info");
        for (const o of qualifying) {
          if (executeTradeRef.current) await executeTradeRef.current(o);
        }
      }
    } catch (e) {
      addLog(`Scan error: ${e.message}`, "error");
    }
  }, [platforms, kalshiKeyId, kalshiPrivateKey, game, config, addLog]);

  // ── start/stop scanning ──
  const startScanning = () => {
    if (mode === "live" && !liveConfirm) {
      setLiveConfirm(true);
      return;
    }
    setLiveConfirm(false);
    setScanning(true);
    saveCreds();
    if (paperBalance === null) {
      setPaperBalance(config.bankroll);
      setPaperPnL(0);
    }
    const c = cycle + 1;
    setCycle(c);
    addLog(`Bot started in ${mode.toUpperCase()} mode (${platformPairLabel(platforms)})`, "success");
    addLog(`Bankroll: $${config.bankroll.toFixed(2)} | Position: $${(config.bankroll * config.maxPositionPct).toFixed(2)} | Poll: ${config.pollInterval}s`);
    runScan(c);
    intervalRef.current = setInterval(() => {
      setCycle((prev) => {
        const next = prev + 1;
        runScan(next);
        return next;
      });
    }, config.pollInterval * 1000);
  };

  const stopScanning = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setScanning(false);
    setLiveConfirm(false);
    addLog("Bot stopped", "warn");
  };

  useEffect(() => { return () => clearInterval(intervalRef.current); }, []);

  // ── execute trade ──
  const executeTradeRef = useRef(null);

  // Poll Kalshi for fill (client-side, 1s intervals, max 10s)
  const pollKalshiFill = async (orderId, timeout) => {
    const deadline = Date.now() + (timeout || config.kalshiTimeout || 10000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const resp = await fetch("/api/trading/check-fill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kalshiKeyId, kalshiPrivateKey, orderId, config }),
        });
        const data = await resp.json();
        if (data.filled) return data;
      } catch {}
    }
    // Timed out — cancel the order
    try {
      await fetch("/api/trading/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalshiKeyId, kalshiPrivateKey, orderId, config }),
      });
    } catch {}
    return null;
  };

  const executeTrade = async (opp) => {
    const key = (opp.kalshiTicker || opp.polymarketId || "") + opp.team;
    setExecuting((prev) => ({ ...prev, [key]: true }));
    addLog(`Executing: ${opp.matchName} | ${opp.team} (${mode})...`);

    try {
      const resp = await fetch("/api/trading/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          kalshiKeyId,
          kalshiPrivateKey,
          opportunity: opp,
          mode,
          config,
        }),
      });
      let result = await resp.json();

      // If Kalshi order is pending, poll for fill from client side
      if (result.pending && result.kalshiOrderId) {
        addLog(`Kalshi order pending — polling for fill (${(config.kalshiTimeout / 1000).toFixed(0)}s timeout)...`, "warn");
        const fill = await pollKalshiFill(result.kalshiOrderId, config.kalshiTimeout);
        if (fill) {
          const slipBuf = config.slippageBuffer || 0.02;
          const actualGross = 1.0 - result.newDevigA - fill.fillPrice;
          const actualNet = actualGross - slipBuf;
          result = {
            ...result,
            success: true,
            pending: false,
            kalshiFillPrice: fill.fillPrice,
            kalshiFilledCount: fill.filledCount,
            actualGrossArb: +actualGross.toFixed(4),
            actualNetArb: +actualNet.toFixed(4),
            error: null,
          };
          addLog(`Kalshi order filled at ${fmt(fill.fillPrice, 1)}`, "success");
        } else {
          result = {
            ...result,
            success: false,
            pending: false,
            error: "Kalshi order unfilled after timeout — cancelled. MANUAL HEDGE NEEDED.",
          };
          addLog("Kalshi fill timeout — order cancelled. MANUAL HEDGE NEEDED.", "error");
        }
      }

      const posSize = result.stakeAmount ?? result.positionSize ?? opp.positionSize ?? config.bankroll * config.maxPositionPct;
      const netArbVal = result.actualNetArb ?? opp.netArb;

      // ── Paper K+P trades become OPEN POSITIONS that settle when the game resolves.
      //    Realized P&L is recorded later by the settlement check, not here.
      if (result.success && result.shadow && result.position) {
        const pos = result.position;
        const dupKey = `${pos.legs[0].ticker}|${pos.legs[1].marketId || pos.legs[1].slug}|${pos.backingTeam}`;
        let added = false;
        // Dedup inside the setter so concurrent paper trades on the same opp don't double-up
        setOpenPositions((prev) => {
          const exists = prev.some((p) => {
            const k = `${p.legs[0].ticker}|${p.legs[1].marketId || p.legs[1].slug}|${p.backingTeam}`;
            return k === dupKey;
          });
          if (exists) return prev;
          added = true;
          return [pos, ...prev];
        });
        if (paperBalance === null) setPaperBalance(config.bankroll);
        if (added) {
          addLog(`[PAPER] Opened position: ${pos.event.label} | backing ${pos.backingTeam.toUpperCase()} | size=$${pos.positionSize.toFixed(2)} | expected net=${fmt(pos.entryNetArb)}`, "success");
        } else {
          addLog(`Skipped duplicate open position for ${opp.matchName} (${opp.team})`, "dim");
        }
      } else {
        // Non-paper-K+P path: live execution still records into trades immediately.
        const profit = result.success ? posSize * netArbVal : 0;
        const trade = {
          id: Date.now(),
          time: ts(),
          match: opp.matchName,
          team: opp.team,
          pairType: opp.pairType || "stake_kalshi",
          mode: result.shadow ? "Paper" : "Live",
          grossArb: result.actualGrossArb ?? opp.grossArb,
          netArb: netArbVal,
          positionSize: posSize,
          profit,
          success: result.success,
          error: result.error,
          stakeBetId: result.stakeBetId,
          kalshiOrderId: result.kalshiOrderId,
        };
        setTrades((prev) => [trade, ...prev]);

        if (result.success) {
          setPaperBalance((prev) => (prev ?? config.bankroll) + profit);
          setPaperPnL((prev) => prev + profit);
          const tag = result.shadow ? "[PAPER]" : "[LIVE]";
          addLog(`${tag} Trade completed: ${opp.team} | gross=${fmt(result.actualGrossArb)} net=${fmt(result.actualNetArb)} | profit=$${profit.toFixed(2)}`, "success");
          if (result.polymarketNote) addLog(result.polymarketNote, "dim");
        } else if (!result.pending) {
          addLog(`Trade failed: ${result.error}`, "error");
        }
      }
    } catch (e) {
      addLog(`Execution error: ${e.message}`, "error");
    } finally {
      setExecuting((prev) => ({ ...prev, [key]: false }));
    }
  };

  executeTradeRef.current = executeTrade;

  const qualifyingOpps = opportunities.filter((o) => o.passesThreshold);
  const otherOpps = opportunities.filter((o) => !o.passesThreshold);

  /* ── Render helper for opportunity details based on pair type ── */
  function renderOppDetails(opp) {
    if (opp.pairType === "stake_kalshi") {
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>Team: <strong>{opp.team}</strong></span>
          <span>Stake: <span className="font-mono">{opp.stakeOddsA}/{opp.stakeOddsB}</span></span>
          <span>Kalshi NO: <span className="font-mono">{fmt(opp.kalshiNoPrice, 1)}</span></span>
          <span>Depth: <span className="font-mono">{opp.kalshiNoDepth}</span></span>
          <span>Overround: <span className="font-mono">{(opp.overround * 100).toFixed(1)}%</span></span>
        </div>
      );
    }
    if (opp.pairType === "stake_polymarket") {
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>Team: <strong>{opp.team}</strong></span>
          <span>Stake: <span className="font-mono">{opp.stakeOddsA}/{opp.stakeOddsB}</span></span>
          <span>Poly NO: <span className="font-mono">{fmt(opp.polymarketNoPrice, 1)}</span></span>
          <span>Poly Liq: <span className="font-mono">${(opp.polymarketLiquidity || 0).toFixed(0)}</span></span>
          <span>Overround: <span className="font-mono">{(opp.overround * 100).toFixed(1)}%</span></span>
        </div>
      );
    }
    if (opp.pairType === "kalshi_polymarket") {
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>Team: <strong>{opp.team}</strong></span>
          <span>{opp.buyPlatform}: <span className="font-mono">{fmt(opp.buyPrice, 1)}</span></span>
          <span>{opp.sellPlatform}: <span className="font-mono">{fmt(opp.sellPrice, 1)}</span></span>
          {opp.kalshiNoDepth !== undefined && <span>Kalshi Depth: <span className="font-mono">{opp.kalshiNoDepth}</span></span>}
          {opp.polymarketLiquidity !== undefined && <span>Poly Liq: <span className="font-mono">${(opp.polymarketLiquidity || 0).toFixed(0)}</span></span>}
        </div>
      );
    }
    return null;
  }

  function renderPairBadge(pairType) {
    const labels = {
      stake_kalshi: "S+K",
      stake_polymarket: "S+P",
      kalshi_polymarket: "K+P",
    };
    const colors = {
      stake_kalshi: "bg-blue-100 text-blue-700",
      stake_polymarket: "bg-purple-100 text-purple-700",
      kalshi_polymarket: "bg-indigo-100 text-indigo-700",
    };
    return (
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors[pairType] || "bg-gray-100 text-gray-700"}`}>
        {labels[pairType] || pairType}
      </span>
    );
  }

  return (
    <main className="pt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          &larr; Back to Projects
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{GAME_OPTIONS[game]?.icon} {GAME_OPTIONS[game]?.label || "Esports"} Arb Bot</h1>
            <p className="text-gray-400 text-sm mt-1">{platformPairLabel(platforms)} Cross-Platform Arb Scanner</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              scanning ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
            }`}>
              <div className={`w-2 h-2 rounded-full ${scanning ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
              {scanning ? `Scanning #${cycle}` : "Idle"}
            </div>
          </div>
        </div>

        {/* ── Settings Panel ── */}
        <div className="border border-gray-200 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-sm font-semibold text-gray-700">Settings & API Keys</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showSettings ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showSettings && (
            <div className="p-5 space-y-5 border-t border-gray-200">
              {/* Game Selector */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Platforms</p>
                <div className="flex gap-2 mb-2">
                  <span className="px-4 py-2 rounded-full text-sm font-medium bg-gray-900 text-white">Kalshi</span>
                  <span className="px-4 py-2 rounded-full text-sm font-medium bg-gray-900 text-white">Polymarket</span>
                </div>
                <p className="text-xs text-gray-400">Bot scans for the same real-world game on both platforms, then checks for cross-market arb.</p>

                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-3">Game</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(GAME_OPTIONS).map(([key, g]) => (
                    <button
                      key={key}
                      onClick={() => { if (!scanning) setGame(key); }}
                      disabled={scanning}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                        game === key
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                      } disabled:opacity-50`}
                    >
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Keys */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">API Credentials</p>
                <p className="text-xs text-gray-400 mb-3">Keys are stored in your browser only. Kalshi credentials are required to read market data and orderbooks. Polymarket needs no key.</p>
                <details className="mb-3 border border-blue-100 rounded-lg bg-blue-50 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-blue-700 cursor-pointer hover:bg-blue-100">How to get your Kalshi API key</summary>
                  <div className="px-3 pb-3 text-xs text-blue-800 space-y-3">
                    <div>
                      <ol className="list-decimal ml-4 mt-2 space-y-0.5 text-blue-700">
                        <li>Create an account at <strong>kalshi.com</strong></li>
                        <li>Complete identity verification (KYC)</li>
                        <li>Go to <strong>Settings -&gt; API Keys</strong></li>
                        <li>Click <strong>Create API Key</strong> - this generates an RSA key pair</li>
                        <li>Copy the <strong>Key ID</strong> into the &quot;Kalshi API Key ID&quot; field</li>
                        <li>Download the <strong>Private Key</strong> (.pem file), open it, and paste the full contents into the &quot;RSA Private Key&quot; field</li>
                      </ol>
                      <p className="mt-1 text-blue-600">Note: Kalshi is US-only. You need a verified, funded account to access market data.</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800">
                      <p className="font-semibold">Paper Mode</p>
                      <p className="mt-0.5">Paper Trade mode reads live market data (odds, depth, prices) but never sends orders. Trades become open positions that settle when the underlying game resolves.</p>
                    </div>
                  </div>
                </details>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Kalshi API Key ID</label>
                    <input type="password" value={kalshiKeyId} onChange={(e) => setKalshiKeyId(e.target.value)}
                      placeholder="Your Kalshi key ID" disabled={scanning}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-gray-500 block mb-1">Kalshi RSA Private Key</label>
                  <textarea value={kalshiPrivateKey} onChange={(e) => setKalshiPrivateKey(e.target.value)}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" disabled={scanning} rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 resize-y" />
                </div>
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500">
                    <strong>Polymarket:</strong> No API key needed for market data. Public API is used automatically.
                  </p>
                </div>
              </div>

              {/* Config */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Bankroll ($)", key: "bankroll", step: 100, min: 0 },
                    { label: "Min Net Arb (c)", key: "minNetArb", step: 0.005, min: 0, mult: 100 },
                    { label: "Slippage Buffer (c)", key: "slippageBuffer", step: 0.005, min: 0, mult: 100 },
                    { label: "Max Position (%)", key: "maxPositionPct", step: 0.01, min: 0, mult: 100 },
                    { label: "Min Depth Mult", key: "kalshiMinDepthMult", step: 0.1, min: 1 },
                    { label: "Poll Interval (s)", key: "pollInterval", step: 1, min: 2 },
                    { label: "Kalshi Timeout (ms)", key: "kalshiTimeout", step: 1000, min: 1000 },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                      <input type="number" step={f.step} min={f.min}
                        value={f.mult ? +(config[f.key] * f.mult).toFixed(2) : config[f.key]}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setConfig((prev) => ({ ...prev, [f.key]: f.mult ? v / f.mult : v }));
                        }}
                        disabled={scanning}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Control Bar ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => { if (!scanning) setMode("paper"); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === "paper" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              Paper Trade
            </button>
            <button onClick={() => { if (!scanning) setMode("live"); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === "live" ? "bg-red-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              Live Trade
            </button>
          </div>

          {/* Auto-Execute Toggle */}
          <button onClick={() => setAutoExecute(!autoExecute)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
              autoExecute ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"
            }`}>
            <div className={`w-7 h-4 rounded-full relative transition-colors ${autoExecute ? "bg-emerald-500" : "bg-gray-300"}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${autoExecute ? "left-3.5" : "left-0.5"}`} />
            </div>
            Auto-Execute
          </button>

          {mode === "live" && !scanning && (
            <span className="text-xs text-red-500 font-medium">Real money will be used</span>
          )}
          {mode === "live" && hasPoly && (
            <span className="text-xs text-amber-500 font-medium">Polymarket legs are paper-only</span>
          )}

          <div className="flex-1" />

          {/* Start / Stop */}
          {!scanning ? (
            <div className="flex items-center gap-2">
              {!hasApiKeys && (
                <span className="text-xs text-amber-600 font-medium">Connect API keys to start</span>
              )}
              {liveConfirm && (
                <span className="text-xs text-red-600 font-medium animate-pulse">Click again to confirm LIVE mode</span>
              )}
              <button onClick={startScanning} disabled={!hasApiKeys}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  !hasApiKeys ? "bg-gray-300 text-gray-500 cursor-not-allowed" :
                  liveConfirm ? "bg-red-600 hover:bg-red-700 text-white" :
                  "bg-gray-900 hover:bg-gray-800 text-white"
                }`}>
                {liveConfirm ? "Confirm Live Start" : "Start Scanning"}
              </button>
            </div>
          ) : (
            <button onClick={stopScanning}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Stop
            </button>
          )}
        </div>

        {/* ── Balance & Stats ── */}
        {paperBalance !== null && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Balance</div>
              <div className="text-xl font-bold text-gray-900">${paperBalance.toFixed(2)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">P&L</div>
              <div className={`text-xl font-bold ${paperPnL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {paperPnL >= 0 ? "+" : ""}${paperPnL.toFixed(2)}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Return</div>
              <div className={`text-xl font-bold ${paperPnL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {paperPnL >= 0 ? "+" : ""}{((paperPnL / config.bankroll) * 100).toFixed(2)}%
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Trades</div>
              <div className="text-xl font-bold text-gray-900">{trades.length}</div>
              <div className="text-xs text-gray-400">{trades.filter((t) => t.success).length} filled</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Win Rate</div>
              <div className="text-xl font-bold text-gray-900">
                {trades.length ? ((trades.filter((t) => t.success).length / trades.length) * 100).toFixed(0) : 0}%
              </div>
            </div>
          </div>
        )}

        {/* ── Opportunities ── */}
        {opportunities.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Live Opportunities</h2>
            <div className="space-y-3">
              {qualifyingOpps.map((opp) => {
                const key = (opp.kalshiTicker || opp.polymarketId || "") + opp.team;
                return (
                  <div key={key} className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">ARB</span>
                          {renderPairBadge(opp.pairType)}
                          <span className="font-semibold text-gray-900 text-sm">{opp.matchName}</span>
                        </div>
                        {renderOppDetails(opp)}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-lg font-bold text-emerald-700">{fmt(opp.netArb)}</div>
                          <div className="text-xs text-gray-400">net arb</div>
                        </div>
                        <button onClick={() => executeTrade(opp)} disabled={executing[key]}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            mode === "live"
                              ? "bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300"
                              : "bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-300"
                          }`}>
                          {executing[key] ? "Executing..." : mode === "live" ? "Execute LIVE" : "Paper Trade"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {otherOpps.map((opp) => (
                <div key={(opp.kalshiTicker || opp.polymarketId || "") + opp.team} className="border border-gray-200 bg-gray-50 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {renderPairBadge(opp.pairType)}
                      <span className="font-medium text-gray-700 text-sm">{opp.matchName}</span>
                      <span className="text-xs text-gray-400">{opp.team}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-gray-500">gross={fmt(opp.grossArb)} net={fmt(opp.netArb)}</span>
                      <span className="text-red-500">{opp.abortReason}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Open Positions ── */}
        {openPositions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Open Positions ({openPositions.length})</h2>
              <button
                onClick={() => {
                  if (!confirm("Discard all open positions?")) return;
                  setOpenPositions([]);
                }}
                className="text-xs text-gray-400 hover:text-red-500"
              >Clear all</button>
            </div>
            <div className="space-y-3">
              {openPositions.map((pos) => {
                const kLeg = pos.legs.find((l) => l.platform === "kalshi");
                const pLeg = pos.legs.find((l) => l.platform === "polymarket");
                return (
                  <div key={pos.id} className="border border-blue-200 bg-blue-50 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">OPEN</span>
                          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">K+P</span>
                          <span className="font-semibold text-gray-900 text-sm">{pos.event.label}</span>
                          {pos.event.gameDate && (
                            <span className="text-xs text-gray-500">{pos.event.gameDate}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 space-y-1 mt-2">
                          <div>
                            <span className="font-semibold text-gray-700">Kalshi</span>
                            <span className="ml-2">{kLeg.side} on <strong>{(kLeg.backsTeam || "").toUpperCase()}</strong></span>
                            <span className="ml-2 font-mono">@ {fmt(kLeg.entryPrice, 1)}</span>
                            <span className="ml-2 text-gray-400 font-mono">{kLeg.ticker}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-700">Polymarket</span>
                            <span className="ml-2">{pLeg.side} on <strong>{(pLeg.backsTeam || "").toUpperCase()}</strong></span>
                            <span className="ml-2 font-mono">@ {fmt(pLeg.entryPrice, 1)}</span>
                          </div>
                          <div className="text-gray-500">
                            {pos.contracts} contracts | size ${pos.positionSize.toFixed(2)} | expected net {fmt(pos.entryNetArb)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-blue-700">{fmt(pos.entryNetArb)}</div>
                        <div className="text-xs text-gray-400">expected</div>
                        <button
                          onClick={() => {
                            if (!confirm("Drop this open position without settling?")) return;
                            setOpenPositions((prev) => prev.filter((p) => p.id !== pos.id));
                          }}
                          className="mt-2 text-xs text-gray-400 hover:text-red-500"
                        >Drop</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Available Markets Browse ── */}
        {(rawMarkets.kalshi.length > 0 || rawMarkets.polymarket.length > 0) && (
          <details className="border border-gray-200 rounded-xl overflow-hidden mb-6">
            <summary className="px-5 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm font-semibold text-gray-700">
              Available Markets ({rawMarkets.kalshi.length + rawMarkets.polymarket.length})
            </summary>
            <div className="p-4 border-t border-gray-200 space-y-4 max-h-96 overflow-y-auto">
              {rawMarkets.kalshi.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kalshi ({rawMarkets.kalshi.length})</p>
                  <div className="space-y-2">
                    {rawMarkets.kalshi.map((m) => (
                      <div key={m.ticker} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{m.team_name || m.title}</p>
                          <p className="text-xs text-gray-400 font-mono">{m.ticker}</p>
                        </div>
                        <div className="flex gap-3 ml-3 text-xs font-mono shrink-0">
                          <span className="text-emerald-600">Y {(m.yes_price * 100).toFixed(0)}c</span>
                          <span className="text-red-500">N {(m.no_price * 100).toFixed(0)}c</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rawMarkets.polymarket.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Polymarket ({rawMarkets.polymarket.length})</p>
                  <div className="space-y-2">
                    {rawMarkets.polymarket.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{m.question}</p>
                          <p className="text-xs text-gray-400">Vol: ${m.volume >= 1000 ? (m.volume/1000).toFixed(1) + "k" : m.volume.toFixed(0)} | Liq: ${m.liquidity >= 1000 ? (m.liquidity/1000).toFixed(1) + "k" : m.liquidity.toFixed(0)}</p>
                        </div>
                        <div className="flex gap-3 ml-3 text-xs font-mono shrink-0">
                          <span className="text-emerald-600">Y {(m.yesPrice * 100).toFixed(0)}c</span>
                          <span className="text-red-500">N {(m.noPrice * 100).toFixed(0)}c</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* ── Scan Log ── */}
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scan Log</span>
            <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="h-64 overflow-y-auto bg-gray-900 p-4 font-mono text-xs leading-relaxed">
            {logs.length === 0 && (
              <p className="text-gray-600">Waiting for bot to start...</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className={`${
                log.level === "error" ? "text-red-400" :
                log.level === "success" ? "text-emerald-400" :
                log.level === "warn" ? "text-yellow-400" :
                log.level === "dim" ? "text-gray-600" : "text-gray-300"
              }`}>
                <span className="text-gray-600">{log.time}</span>{" "}{log.msg}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* ── Trade History ── */}
        {trades.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trade History</span>
              <button onClick={() => { setTrades([]); setPaperBalance(config.bankroll); setPaperPnL(0); }} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2 text-gray-400 font-medium">Time</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Pair</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Match</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Team</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Mode</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Gross</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Net</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Size</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Profit</th>
                    <th className="px-4 py-2 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trades.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 font-mono text-gray-500">{t.time}</td>
                      <td className="px-4 py-2">{renderPairBadge(t.pairType)}</td>
                      <td className="px-4 py-2 text-gray-700">{t.match}</td>
                      <td className="px-4 py-2 text-gray-700">{t.team}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.mode === "Paper" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                          {t.mode}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-700">{fmt(t.grossArb)}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">{fmt(t.netArb)}</td>
                      <td className="px-4 py-2 font-mono text-gray-700">${t.positionSize?.toFixed(2)}</td>
                      <td className={`px-4 py-2 font-mono ${t.profit > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                        {t.profit > 0 ? `+$${t.profit.toFixed(2)}` : "$0.00"}
                      </td>
                      <td className="px-4 py-2">
                        {t.success ? (
                          <span className="text-emerald-600 font-medium">Filled</span>
                        ) : (
                          <span className="text-red-500 font-medium" title={t.error}>Failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── How It Works (collapsed) ── */}
        <details className="border border-gray-200 rounded-xl overflow-hidden mb-6">
          <summary className="px-5 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm font-semibold text-gray-700">
            How the Arbitrage Works
          </summary>
          <div className="p-5 space-y-4 text-sm text-gray-600 border-t border-gray-200">
            <p>
              The bot scans <strong>Kalshi</strong> and <strong>Polymarket</strong> for the same real-world game, then checks whether the two platforms have priced it inconsistently enough to lock in a risk-free profit.
            </p>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-2">1. Reliable matching</p>
                <p className="text-xs text-gray-600">Each Kalshi event and each Polymarket event is parsed into <code>{`{teamA, teamB, gameDate}`}</code>. Both teams are normalised through a canonical team registry, then events are paired only when <strong>both teams</strong> and the <strong>game date</strong> agree. No single-team fuzzy matching, so we never trade on a mismatched game.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-2">2. Both-direction arb</p>
                <div className="font-mono text-xs text-gray-600 space-y-1">
                  <p>gross_arb_1 = 1.00 - kalshi_YES - polymarket_opponent</p>
                  <p>gross_arb_2 = 1.00 - polymarket_team - kalshi_NO</p>
                  <p>net_arb     = max(gross_1, gross_2) - slippage_buffer</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">For each team in a matched event we check both directions (buy on Kalshi + hedge on Poly, or buy on Poly + hedge on Kalshi) and pick the better one.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-2">3. Open positions until settlement</p>
                <p className="text-xs text-gray-600">Paper trades become open positions stored in localStorage. Each scan cycle re-polls Kalshi and Polymarket for resolution. When both legs settle, the position is closed and realised P&amp;L is added to the balance.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 text-center border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-3 border-r border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-400">Platform A: YES</p>
                <p className="text-xl font-bold text-gray-900">50c</p>
                <p className="text-xs text-gray-500">buy YES</p>
              </div>
              <div className="p-3 border-r border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-400">Platform B: NO</p>
                <p className="text-xl font-bold text-gray-900">47c</p>
                <p className="text-xs text-gray-500">buy NO</p>
              </div>
              <div className="p-3 bg-emerald-50">
                <p className="text-xs text-emerald-600">Gross Arb</p>
                <p className="text-xl font-bold text-emerald-700">3.0c</p>
                <p className="text-xs text-emerald-600">risk-free</p>
              </div>
            </div>
          </div>
        </details>

      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════
   Main Export
   ═══════════════════════════════════════════════════ */
export default function TradingBot() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <>
      <Head>
        <title>Esports Arbitrage Bot - Shiv Gupta</title>
      </Head>
      <Navbar />
      {unlocked ? <Dashboard /> : <PasswordGate onUnlock={() => setUnlocked(true)} />}
      <Footer />
    </>
  );
}
