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
   ═══════════════════════════════════════════════════ */
const PLATFORM_LABELS = { stake: "Stake", kalshi: "Kalshi", polymarket: "Polymarket" };

function platformPairLabel(platforms) {
  return platforms.map((p) => PLATFORM_LABELS[p] || p).join(" x ");
}

function togglePlatform(current, platform) {
  if (current.includes(platform)) {
    if (current.length <= 2) return current; // must have exactly 2
    return current.filter((p) => p !== platform);
  }
  if (current.length >= 2) {
    // Replace the first platform that isn't the one being toggled
    return [current[1], platform];
  }
  return [...current, platform];
}

/* ═══════════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════════ */

const DEFAULT_CONFIG = {
  bankroll: 1000,
  minNetArb: 0.015,
  minGrossArb: 0.025,
  slippageBuffer: 0.02,
  maxPositionPct: 0.05,
  maxStakeVig: 0.06,
  kalshiMinDepthMult: 1.5,
  kalshiTimeout: 10000,
  pollInterval: 5,
  kalshiApiBase: "https://api.elections.kalshi.com/trade-api/v2",
};

function fmt(n, d = 1) { return (n * 100).toFixed(d) + "c"; }
function ts() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }

function Dashboard() {
  // ── platforms & game ──
  const [platforms, setPlatforms] = useState(["kalshi", "polymarket"]);
  const [game, setGame] = useState("lol");

  // ── credentials ──
  const [stakeApiKey, setStakeApiKey] = useState("");
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

  // ── auto-execute ──
  const [autoExecute, setAutoExecute] = useState(true);
  const autoExecuteRef = useRef(autoExecute);
  useEffect(() => { autoExecuteRef.current = autoExecute; }, [autoExecute]);

  const intervalRef = useRef(null);
  const logEndRef = useRef(null);

  // ── derived ──
  const hasStake = platforms.includes("stake");
  const hasKalshi = platforms.includes("kalshi");
  const hasPoly = platforms.includes("polymarket");

  // ── load saved credentials from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("arbbot_creds");
      if (saved) {
        const c = JSON.parse(saved);
        if (c.stakeApiKey) setStakeApiKey(c.stakeApiKey);
        if (c.kalshiKeyId) setKalshiKeyId(c.kalshiKeyId);
        if (c.kalshiPrivateKey) setKalshiPrivateKey(c.kalshiPrivateKey);
        if (c.platforms) setPlatforms(c.platforms);
        if (c.game) setGame(c.game);
      }
      const savedCfg = localStorage.getItem("arbbot_config");
      if (savedCfg) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(savedCfg) });
    } catch {}
  }, []);

  // ── save credentials ──
  const saveCreds = useCallback(() => {
    try {
      localStorage.setItem("arbbot_creds", JSON.stringify({ stakeApiKey, kalshiKeyId, kalshiPrivateKey, platforms, game }));
      localStorage.setItem("arbbot_config", JSON.stringify(config));
    } catch {}
  }, [stakeApiKey, kalshiKeyId, kalshiPrivateKey, platforms, game, config]);

  // ── add log entry ──
  const addLog = useCallback((msg, level = "info") => {
    setLogs((prev) => [...prev.slice(-200), { time: ts(), msg, level, id: Date.now() + Math.random() }]);
  }, []);

  // auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ── hasApiKeys check based on selected platforms ──
  const hasApiKeys = (() => {
    if (hasStake && !stakeApiKey) return false;
    if (hasKalshi && (!kalshiKeyId || !kalshiPrivateKey)) return false;
    // Polymarket needs no keys
    return true;
  })();

  // ── scan cycle ──
  const runScan = useCallback(async (cycleNum) => {
    addLog(`--- Scan cycle #${cycleNum} ---`);
    try {
      // Fetch Stake data client-side if Stake is selected
      let stakeMatches = [];
      if (hasStake) {
        try {
          stakeMatches = await fetchStakeMatchesClient(stakeApiKey, game);
          addLog(`Fetched ${stakeMatches.length} Stake matches (client-side)`);
        } catch (e) {
          addLog(`Stake fetch failed: ${e.message}`, "error");
        }
      }

      const resp = await fetch("/api/trading/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms,
          game,
          stakeMatches: hasStake ? stakeMatches : undefined,
          kalshiKeyId: hasKalshi ? kalshiKeyId : undefined,
          kalshiPrivateKey: hasKalshi ? kalshiPrivateKey : undefined,
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
      if (data.stakeMatchCount !== undefined && hasStake) counts.push(`${data.stakeMatchCount} Stake matches`);
      if (data.kalshiMarketCount !== undefined && hasKalshi) counts.push(`${data.kalshiMarketCount} Kalshi markets`);
      if (data.polymarketCount !== undefined && hasPoly) counts.push(`${data.polymarketCount} Polymarket markets`);
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
  }, [platforms, hasStake, hasKalshi, hasPoly, stakeApiKey, kalshiKeyId, kalshiPrivateKey, config, addLog]);

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
          stakeApiKey: hasStake ? stakeApiKey : undefined,
          kalshiKeyId: hasKalshi ? kalshiKeyId : undefined,
          kalshiPrivateKey: hasKalshi ? kalshiPrivateKey : undefined,
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

      // update balance
      if (result.success) {
        setPaperBalance((prev) => (prev ?? config.bankroll) + profit);
        setPaperPnL((prev) => prev + profit);
        const tag = result.shadow ? "[PAPER]" : "[LIVE]";
        addLog(`${tag} Trade completed: ${opp.team} | gross=${fmt(result.actualGrossArb)} net=${fmt(result.actualNetArb)} | profit=$${profit.toFixed(2)}`, "success");
        if (result.polymarketNote) addLog(result.polymarketNote, "dim");
      } else if (!result.pending) {
        addLog(`Trade failed: ${result.error}`, "error");
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
              {/* Platform Selector */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Platforms (select 2)</p>
                <div className="flex gap-2">
                  {["stake", "kalshi", "polymarket"].map((p) => {
                    const selected = platforms.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          if (scanning) return;
                          const next = togglePlatform(platforms, p);
                          if (next.length === 2) setPlatforms(next);
                        }}
                        disabled={scanning}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                          selected
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                        } disabled:opacity-50`}
                      >
                        {PLATFORM_LABELS[p]}
                      </button>
                    );
                  })}
                </div>
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
                {hasPoly && !hasStake && !hasKalshi && (
                  <p className="text-xs text-amber-600 mt-2">Select one more platform to pair with Polymarket</p>
                )}
              </div>

              {/* API Keys */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">API Credentials</p>
                <p className="text-xs text-gray-400 mb-3">Keys are stored in your browser only. Required for both paper and live trading — all scans use real market data.</p>
                <details className="mb-3 border border-blue-100 rounded-lg bg-blue-50 overflow-hidden">
                  <summary className="px-3 py-2 text-xs font-medium text-blue-700 cursor-pointer hover:bg-blue-100">How to get your API keys</summary>
                  <div className="px-3 pb-3 text-xs text-blue-800 space-y-3">
                    {hasStake && (
                      <div>
                        <p className="font-semibold mt-2">Stake API Key</p>
                        <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-blue-700">
                          <li>Log in to <strong>stake.com</strong></li>
                          <li>Go to <strong>Settings &rarr; Security &rarr; API</strong></li>
                          <li>Click <strong>Create API Key</strong></li>
                          <li>Enable <strong>Sports Betting</strong> permissions</li>
                          <li>Copy the key and paste it above</li>
                        </ol>
                      </div>
                    )}
                    {hasKalshi && (
                      <div>
                        <p className="font-semibold mt-2">Kalshi API Key</p>
                        <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-blue-700">
                          <li>Create an account at <strong>kalshi.com</strong></li>
                          <li>Complete identity verification (KYC)</li>
                          <li>Go to <strong>Settings &rarr; API Keys</strong></li>
                          <li>Click <strong>Create API Key</strong> &mdash; this generates an RSA key pair</li>
                          <li>Copy the <strong>Key ID</strong> into the &quot;Kalshi API Key ID&quot; field</li>
                          <li>Download the <strong>Private Key</strong> (.pem file), open it, and paste the full contents into the &quot;RSA Private Key&quot; field</li>
                        </ol>
                        <p className="mt-1 text-blue-600">Note: Kalshi is US-only. You need a verified, funded account to access market data.</p>
                      </div>
                    )}
                    {hasPoly && (
                      <div>
                        <p className="font-semibold mt-2">Polymarket</p>
                        <p className="text-blue-700">No API key needed for reading market data. Polymarket&apos;s public API is used to fetch prices.</p>
                        <p className="mt-1 text-blue-600">Note: Live execution on Polymarket requires on-chain transactions and is not yet supported. Polymarket pairs are paper-trade only for execution.</p>
                      </div>
                    )}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800">
                      <p className="font-semibold">Paper Mode Safety</p>
                      <p className="mt-0.5">In Paper Trade mode, <strong>zero real orders are placed</strong>. The bot reads live market data (odds and prices) but only simulates execution locally. No bets are placed on Stake, no orders are sent to Kalshi, no on-chain transactions on Polymarket. Your accounts are read-only in paper mode.</p>
                    </div>
                  </div>
                </details>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {hasStake && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Stake API Key</label>
                      <input type="password" value={stakeApiKey} onChange={(e) => setStakeApiKey(e.target.value)}
                        placeholder="Your Stake API key" disabled={scanning}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400" />
                    </div>
                  )}
                  {hasKalshi && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Kalshi API Key ID</label>
                      <input type="password" value={kalshiKeyId} onChange={(e) => setKalshiKeyId(e.target.value)}
                        placeholder="Your Kalshi key ID" disabled={scanning}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400" />
                    </div>
                  )}
                </div>
                {hasKalshi && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 block mb-1">Kalshi RSA Private Key</label>
                    <textarea value={kalshiPrivateKey} onChange={(e) => setKalshiPrivateKey(e.target.value)}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----" disabled={scanning} rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 resize-y" />
                  </div>
                )}
                {hasPoly && !hasStake && !hasKalshi ? null : hasPoly && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500">
                      <strong>Polymarket:</strong> No API key needed for market data. Public API is used automatically.
                    </p>
                  </div>
                )}
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
                    ...(hasStake ? [{ label: "Max Vig (%)", key: "maxStakeVig", step: 0.01, min: 0, mult: 100 }] : []),
                    ...(hasKalshi ? [{ label: "Min Depth Mult", key: "kalshiMinDepthMult", step: 0.1, min: 1 }] : []),
                    { label: "Poll Interval (s)", key: "pollInterval", step: 1, min: 2 },
                    ...(hasKalshi ? [{ label: "Kalshi Timeout (ms)", key: "kalshiTimeout", step: 1000, min: 1000 }] : []),
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
              The bot exploits pricing gaps across prediction markets and sportsbooks. It supports three platforms:
              <strong> Stake</strong> (sportsbook), <strong>Kalshi</strong> (prediction market), and <strong>Polymarket</strong> (decentralized prediction market).
              Select any two, and the bot scans for arbitrage between them.
            </p>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-2">Stake + Kalshi / Stake + Polymarket</p>
                <div className="font-mono text-xs text-gray-600 space-y-1">
                  <p>gross_arb = 1.00 - devig_prob_A - market_NO_price</p>
                  <p>net_arb = gross_arb - slippage_buffer</p>
                  <p>devig_prob_A = (1/stake_odds_A) / ((1/stake_odds_A) + (1/stake_odds_B))</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">Back a team on Stake at devigged odds, buy NO on the prediction market as a hedge.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider mb-2">Kalshi + Polymarket</p>
                <div className="font-mono text-xs text-gray-600 space-y-1">
                  <p>gross_arb = 1.00 - platform1_YES - platform2_NO</p>
                  <p>net_arb = gross_arb - slippage_buffer</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">Buy YES on the cheaper platform and NO on the other. Both directions are checked automatically.</p>
              </div>
            </div>

            <p>
              <strong>Execution order matters:</strong> For Stake+Kalshi, Stake bets are irreversible and placed first; Kalshi orders are cancellable and used as the hedge.
              Polymarket execution is currently paper-only (requires on-chain transactions).
            </p>

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
