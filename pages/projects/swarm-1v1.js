import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Shared constants ──
const ARENA = 10000;
const KILL_RADIUS = 120;

const THEATERS = {
  kashmir: { name: "LoC Kashmir", bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 }, mapCenter: [34.0, 74.25], mapZoom: 9 },
  israel_iran: { name: "Israel-Iran", bounds: { south: 31.0, north: 33.0, west: 34.0, east: 36.0 }, mapCenter: [32.0, 35.0], mapZoom: 8 },
  ukraine_kyiv: { name: "Ukraine Kyiv", bounds: { south: 49.0, north: 51.0, west: 30.0, east: 33.0 }, mapCenter: [50.0, 31.5], mapZoom: 8 },
  taiwan_strait: { name: "Taiwan Strait", bounds: { south: 23.0, north: 26.0, west: 119.0, east: 122.0 }, mapCenter: [24.5, 120.5], mapZoom: 7 },
};

const ATTACK_UNITS = [
  { key: "fpv", name: "FPV Drone", cost: 500, speed: 150, threat: "cheap" },
  { key: "shahed", name: "Shahed-136", cost: 20000, speed: 185, threat: "cheap" },
  { key: "lancet", name: "Lancet-3", cost: 35000, speed: 300, threat: "medium" },
  { key: "mohajer", name: "Mohajer-6", cost: 500000, speed: 200, threat: "expensive" },
];

const DEFENSE_UNITS = [
  { key: "kamikaze", name: "Kamikaze Interceptor", cost: 15000, speed: 350, destroyOnKill: true },
  { key: "armed", name: "Armed Interceptor", cost: 180000, speed: 300, destroyOnKill: false, survivalRate: 0.73 },
];

const RESOURCES = [
  { key: "oil", name: "Oil Refinery", cost: 8000000, income: 2000000, breachDamage: 15000000, color: "#cc8800", icon: "O" },
  { key: "solar", name: "Solar Farm", cost: 3000000, income: 500000, breachDamage: 5000000, color: "#44bb44", icon: "S" },
  { key: "arms", name: "Arms Factory", cost: 6000000, income: 1000000, breachDamage: 10000000, color: "#8888cc", icon: "A", freeUnits: 2 },
];

const AI_NAMES = ["SKYNET-7", "AEGIS_AI", "IRON_WALL", "RED_FURY", "SHADOW_NET", "VANGUARD", "CERBERUS", "TITAN_DEF"];
const STARTING_BUDGET = 30000000; // $30M
const TOTAL_ROUNDS = 8;

function formatUSD(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

function simToLatLng(x, y, bounds) {
  return [bounds.south + (y / ARENA) * (bounds.north - bounds.south), bounds.west + (x / ARENA) * (bounds.east - bounds.west)];
}
function latLngToSim(lat, lng, bounds) {
  return [((lng - bounds.west) / (bounds.east - bounds.west)) * ARENA, ((lat - bounds.south) / (bounds.north - bounds.south)) * ARENA];
}

// ── AI opponent logic ──
function generateAISetup(side) {
  const hqX = side === "north" ? 5000 : 5000;
  const hqY = side === "north" ? 8000 : 2000;
  const airspace = 2500;
  const resources = [
    { key: "oil", x: hqX - 600, y: hqY + (side === "north" ? -400 : 400), alive: true },
    { key: "solar", x: hqX + 600, y: hqY + (side === "north" ? -400 : 400), alive: true },
    { key: "arms", x: hqX, y: hqY + (side === "north" ? -800 : 800), alive: true },
  ];
  const defenses = [
    { key: "kamikaze", x: hqX - 400, y: hqY + (side === "north" ? -1200 : 1200), count: 6 },
    { key: "armed", x: hqX + 400, y: hqY + (side === "north" ? -1200 : 1200), count: 2 },
  ];
  return { hqX, hqY, airspace, resources, defenses };
}

function generateAIAttack(round, budget) {
  const intensity = Math.min(round + 1, 8);
  const wave = {};
  wave.fpv = 5 + intensity * 3;
  wave.shahed = Math.floor(intensity * 1.5);
  if (round > 2) wave.lancet = Math.floor(intensity);
  if (round > 5) wave.mohajer = Math.floor(intensity * 0.3);
  // Cost check
  let cost = 0;
  for (const [k, n] of Object.entries(wave)) {
    const u = ATTACK_UNITS.find((a) => a.key === k);
    if (u) cost += u.cost * n;
  }
  if (cost > budget * 0.3) {
    // Scale down
    const scale = (budget * 0.3) / cost;
    for (const k of Object.keys(wave)) wave[k] = Math.max(1, Math.floor(wave[k] * scale));
  }
  return wave;
}

// ── Game Phases ──
const PHASE = { LOBBY: "lobby", MATCHMAKING: "matchmaking", SETUP: "setup", COMBAT: "combat", RESULTS: "results" };

// ── Simple stat bar ──
function StatBar({ label, value, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: "#888", width: 50, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, background: "#0a0a0f", borderRadius: 3, height: 6 }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color: "#666", width: 35 }}>{value}</span>
    </div>
  );
}

export default function Swarm1v1() {
  const [phase, setPhase] = useState(PHASE.LOBBY);
  const [username, setUsername] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [theater, setTheater] = useState("ukraine_kyiv");
  const [matchTimer, setMatchTimer] = useState(0);

  // Player setup
  const [playerHQ, setPlayerHQ] = useState(null); // {x, y}
  const [playerAirspace, setPlayerAirspace] = useState(2000);
  const [playerResources, setPlayerResources] = useState([]);
  const [playerDefenses, setPlayerDefenses] = useState([]);
  const [playerAttack, setPlayerAttack] = useState({ fpv: 10, shahed: 3 });
  const [playerBudget, setPlayerBudget] = useState(STARTING_BUDGET);
  const [placingWhat, setPlacingWhat] = useState(null); // "hq" | "oil" | "solar" | "arms" | "def_kamikaze" | "def_armed"

  // AI setup
  const [aiSetup, setAiSetup] = useState(null);
  const [aiBudget, setAiBudget] = useState(STARTING_BUDGET);

  // Combat state
  const [currentRound, setCurrentRound] = useState(0);
  const [combatLog, setCombatLog] = useState([]);
  const [combatRunning, setCombatRunning] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(null); // null | { winner, reason }

  // Map
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // ── Matchmaking ──
  const findMatch = useCallback(() => {
    if (!username.trim()) return;
    setPhase(PHASE.MATCHMAKING);
    setOpponentName(AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)]);
    const theaterKeys = Object.keys(THEATERS);
    setTheater(theaterKeys[Math.floor(Math.random() * theaterKeys.length)]);
    let t = 0;
    const iv = setInterval(() => {
      t++;
      setMatchTimer(t);
      if (t >= 3) {
        clearInterval(iv);
        setPhase(PHASE.SETUP);
        setPlayerHQ(null);
        setPlayerResources([]);
        setPlayerDefenses([]);
        setPlayerBudget(STARTING_BUDGET);
        setAiBudget(STARTING_BUDGET);
        setCurrentRound(0);
        setCombatLog([]);
        setGameOver(null);
        // AI sets up on south side
        setAiSetup(generateAISetup("south"));
      }
    }, 1000);
  }, [username]);

  // ── Budget calculation ──
  const spentBudget = useCallback(() => {
    let spent = 0;
    for (const r of playerResources) {
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (res) spent += res.cost;
    }
    for (const d of playerDefenses) {
      const def = DEFENSE_UNITS.find((dd) => dd.key === d.key);
      if (def) spent += def.cost * d.count;
    }
    // Attack wave cost
    for (const [k, n] of Object.entries(playerAttack)) {
      const u = ATTACK_UNITS.find((a) => a.key === k);
      if (u) spent += u.cost * n;
    }
    return spent;
  }, [playerResources, playerDefenses, playerAttack]);

  // ── Map click handler ──
  const handleMapClick = useCallback((x, y) => {
    if (phase !== PHASE.SETUP || !placingWhat) return;
    if (placingWhat === "hq") {
      // HQ must be in north half
      if (y < 5500) return;
      setPlayerHQ({ x, y });
      setPlacingWhat(null);
    } else if (placingWhat.startsWith("def_")) {
      const defKey = placingWhat.replace("def_", "");
      if (!playerHQ) return;
      if (dist({ x, y }, playerHQ) > playerAirspace + 500) return;
      setPlayerDefenses((prev) => [...prev, { key: defKey, x, y, count: 4 }]);
      setPlacingWhat(null);
    } else {
      // Resource placement
      if (!playerHQ) return;
      if (dist({ x, y }, playerHQ) > playerAirspace) return;
      setPlayerResources((prev) => [...prev, { key: placingWhat, x, y, alive: true }]);
      setPlacingWhat(null);
    }
  }, [phase, placingWhat, playerHQ, playerAirspace]);

  // ── Init Leaflet ──
  useEffect(() => {
    if (typeof window === "undefined" || phase === PHASE.LOBBY || phase === PHASE.MATCHMAKING) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L.default || L;
      const Leaf = LRef.current;
      if (mapInstanceRef.current) {
        const th = THEATERS[theater];
        mapInstanceRef.current.setView(th.mapCenter, th.mapZoom);
        return;
      }
      const th = THEATERS[theater];
      const map = Leaf.map(mapRef.current, { center: th.mapCenter, zoom: th.mapZoom, zoomControl: true, preferCanvas: true });
      mapInstanceRef.current = map;
      Leaf.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(map);
      Leaf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, opacity: 0.3 }).addTo(map);
      layerRef.current = Leaf.layerGroup().addTo(map);

      map.on("click", (e) => {
        const th2 = THEATERS[theater];
        let [cx, cy] = latLngToSim(e.latlng.lat, e.latlng.lng, th2.bounds);
        cx = Math.max(0, Math.min(ARENA, cx));
        cy = Math.max(0, Math.min(ARENA, cy));
        handleMapClick(cx, cy);
      });
      setMapReady(true);
    })();
    return () => { cancelled = true; };
  }, [phase, theater]);

  // ── Draw map ──
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    const th = THEATERS[theater];
    const mpu = ((th.bounds.north - th.bounds.south) * 111000) / ARENA;
    const toLL = (x, y) => simToLatLng(x, y, th.bounds);

    // Dividing line (equator)
    L.polyline([toLL(0, 5000), toLL(ARENA, 5000)], { color: "#ffffff", weight: 1, opacity: 0.2, dashArray: "8 8", interactive: false }).addTo(layer);
    L.marker(toLL(200, 5100), { icon: L.divIcon({ className: "", iconSize: [60, 14], iconAnchor: [0, 0], html: '<div style="color:#888;font-size:9px;font-family:monospace">NORTH</div>' }), interactive: false }).addTo(layer);
    L.marker(toLL(200, 4800), { icon: L.divIcon({ className: "", iconSize: [60, 14], iconAnchor: [0, 14], html: '<div style="color:#888;font-size:9px;font-family:monospace">SOUTH (AI)</div>' }), interactive: false }).addTo(layer);

    // Player HQ + airspace
    if (playerHQ) {
      L.circle(toLL(playerHQ.x, playerHQ.y), { radius: playerAirspace * mpu, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.05, weight: 1, opacity: 0.5, dashArray: "10 6" }).addTo(layer);
      L.circleMarker(toLL(playerHQ.x, playerHQ.y), { radius: 8, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 1, weight: 2 }).addTo(layer);
    }

    // Player resources
    for (const r of playerResources) {
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (!res) continue;
      L.circleMarker(toLL(r.x, r.y), { radius: 6, color: r.alive ? res.color : "#444", fillColor: r.alive ? res.color : "#333", fillOpacity: 0.8, weight: 2 }).addTo(layer);
    }

    // Player defenses
    for (const d of playerDefenses) {
      L.circleMarker(toLL(d.x, d.y), { radius: 5, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.6, weight: 1 }).addTo(layer);
    }

    // AI base (always visible)
    if (aiSetup) {
      L.circle(toLL(aiSetup.hqX, aiSetup.hqY), { radius: aiSetup.airspace * mpu, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.05, weight: 1, opacity: 0.5, dashArray: "10 6" }).addTo(layer);
      L.circleMarker(toLL(aiSetup.hqX, aiSetup.hqY), { radius: 8, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 1, weight: 2 }).addTo(layer);
      for (const r of aiSetup.resources) {
        const res = RESOURCES.find((rr) => rr.key === r.key);
        if (!res) continue;
        L.circleMarker(toLL(r.x, r.y), { radius: 5, color: r.alive ? res.color : "#444", fillColor: r.alive ? res.color : "#333", fillOpacity: 0.6, weight: 1 }).addTo(layer);
      }
    }
  }, [mapReady, theater, playerHQ, playerAirspace, playerResources, playerDefenses, aiSetup, phase]);

  // ── Run combat round ──
  const runRound = useCallback(() => {
    if (!playerHQ || !aiSetup || gameOver) return;
    setCombatRunning(true);
    const round = currentRound;
    const log = [];

    // Player income from resources
    let playerIncome = 0;
    for (const r of playerResources) {
      if (!r.alive) continue;
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (res) playerIncome += res.income;
    }
    // AI income
    let aiIncome = 0;
    for (const r of aiSetup.resources) {
      if (!r.alive) continue;
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (res) aiIncome += res.income;
    }

    setPlayerBudget((prev) => prev + playerIncome);
    setAiBudget((prev) => prev + aiIncome);
    log.push(`Round ${round + 1}: You earned $${formatUSD(playerIncome)}, ${opponentName} earned $${formatUSD(aiIncome)}`);

    // AI generates attack
    const aiAttack = generateAIAttack(round, aiBudget);

    // Simulate AI attacking player
    let playerDmg = 0;
    let playerKills = 0;
    const totalAIAttackers = Object.values(aiAttack).reduce((s, n) => s + n, 0);
    const playerDefCount = playerDefenses.reduce((s, d) => s + d.count, 0);
    const intercepted = Math.min(totalAIAttackers, Math.floor(playerDefCount * 0.7 + Math.random() * playerDefCount * 0.3));
    const breached = totalAIAttackers - intercepted;
    playerKills = intercepted;

    // Check if breached drones hit resources or HQ
    if (breached > 0) {
      for (let i = 0; i < Math.min(breached, 3); i++) {
        const aliveRes = playerResources.filter((r) => r.alive);
        if (aliveRes.length > 0 && Math.random() < 0.4) {
          const target = aliveRes[Math.floor(Math.random() * aliveRes.length)];
          target.alive = false;
          const res = RESOURCES.find((rr) => rr.key === target.key);
          playerDmg += res ? res.breachDamage : 5000000;
          log.push(`Your ${res?.name || "resource"} was destroyed!`);
        }
      }
      if (breached > 5 && Math.random() < 0.15 * (breached - 5)) {
        setGameOver({ winner: opponentName, reason: "HQ destroyed" });
        log.push(`YOUR HQ WAS HIT! ${opponentName} wins!`);
      }
      playerDmg += breached * 200000;
    }
    log.push(`${opponentName} sent ${totalAIAttackers} drones. You intercepted ${intercepted}, ${breached} breached. Damage: $${formatUSD(playerDmg)}`);

    // Simulate player attacking AI
    const totalPlayerAttackers = Object.values(playerAttack).reduce((s, n) => s + n, 0);
    const aiDefCount = aiSetup.defenses.reduce((s, d) => s + d.count, 0);
    const aiIntercepted = Math.min(totalPlayerAttackers, Math.floor(aiDefCount * 0.6 + Math.random() * aiDefCount * 0.3));
    const aiBreached = totalPlayerAttackers - aiIntercepted;
    let aiDmg = 0;

    if (aiBreached > 0) {
      for (let i = 0; i < Math.min(aiBreached, 3); i++) {
        const aliveRes = aiSetup.resources.filter((r) => r.alive);
        if (aliveRes.length > 0 && Math.random() < 0.4) {
          const target = aliveRes[Math.floor(Math.random() * aliveRes.length)];
          target.alive = false;
          const res = RESOURCES.find((rr) => rr.key === target.key);
          aiDmg += res ? res.breachDamage : 5000000;
          log.push(`Enemy ${res?.name || "resource"} destroyed!`);
        }
      }
      if (aiBreached > 5 && Math.random() < 0.15 * (aiBreached - 5)) {
        setGameOver({ winner: username, reason: "Enemy HQ destroyed" });
        log.push(`ENEMY HQ DESTROYED! You win!`);
      }
      aiDmg += aiBreached * 200000;
    }
    log.push(`You sent ${totalPlayerAttackers} drones. AI intercepted ${aiIntercepted}, ${aiBreached} breached. Damage: $${formatUSD(aiDmg)}`);

    setPlayerBudget((prev) => prev - playerDmg);
    setAiBudget((prev) => prev - aiDmg);
    setPlayerResources([...playerResources]);
    setAiSetup({ ...aiSetup, resources: [...aiSetup.resources] });

    // Reduce defense counts (attrition)
    setPlayerDefenses((prev) => prev.map((d) => ({ ...d, count: Math.max(0, d.count - Math.floor(Math.random() * 2)) })));
    aiSetup.defenses = aiSetup.defenses.map((d) => ({ ...d, count: Math.max(0, d.count - Math.floor(Math.random() * 2)) }));

    // Arms factory bonus
    for (const r of playerResources) {
      if (r.alive && r.key === "arms") {
        setPlayerDefenses((prev) => {
          if (prev.length > 0) return prev.map((d, i) => i === 0 ? { ...d, count: d.count + 2 } : d);
          return prev;
        });
      }
    }

    setCombatLog((prev) => [...prev, ...log]);
    setRoundResult({ playerKills, breached, aiBreached });
    setCurrentRound(round + 1);
    setCombatRunning(false);

    // Check game end
    if (round + 1 >= TOTAL_ROUNDS && !gameOver) {
      setTimeout(() => {
        setGameOver({ winner: playerBudget > aiBudget ? username : opponentName, reason: "Final score" });
      }, 500);
    }
  }, [playerHQ, aiSetup, currentRound, playerResources, playerDefenses, playerAttack, playerBudget, aiBudget, gameOver, username, opponentName]);

  const remaining = playerBudget - spentBudget();

  const inputStyle = { padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13 };
  const btnStyle = { padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "2px solid" };

  return (
    <>
      <Head>
        <title>Swarm 1v1 - Shiv Gupta</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </Head>
      <style jsx global>{`.leaflet-container { background: #0a0a0f; }`}</style>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/projects/swarm-interception" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>&larr; Simulation</Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#ff6688", letterSpacing: 0.5, margin: 0 }}>SWARM 1v1</h1>
          </div>
          {phase !== PHASE.LOBBY && phase !== PHASE.MATCHMAKING && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
              <span style={{ color: "#4a9eff" }}>{username}: ${formatUSD(playerBudget)}</span>
              <span style={{ color: "#666" }}>vs</span>
              <span style={{ color: "#ff5555" }}>{opponentName}: ${formatUSD(aiBudget)}</span>
            </div>
          )}
        </div>

        {/* Lobby */}
        {phase === PHASE.LOBBY && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 400 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#ff6688", marginBottom: 8 }}>SWARM 1v1</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 32 }}>Defend your base. Destroy theirs.</div>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter callsign..."
                style={{ ...inputStyle, width: "100%", fontSize: 16, textAlign: "center", marginBottom: 16 }}
                onKeyDown={(e) => e.key === "Enter" && findMatch()} />
              <button onClick={findMatch} disabled={!username.trim()}
                style={{ ...btnStyle, width: "100%", background: username.trim() ? "#4a1a2a" : "#1a1a24", borderColor: username.trim() ? "#ff6688" : "#333", color: username.trim() ? "#ff6688" : "#555" }}>
                FIND MATCH
              </button>
            </div>
          </div>
        )}

        {/* Matchmaking */}
        {phase === PHASE.MATCHMAKING && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, color: "#ff6688", marginBottom: 16 }}>SEARCHING FOR OPPONENT...</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#ff6688" }}>{matchTimer}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
                {matchTimer >= 2 ? `Found: ${opponentName}` : "Scanning networks..."}
              </div>
              <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
                Theater: {THEATERS[theater]?.name}
              </div>
            </div>
          </div>
        )}

        {/* Setup + Combat + Results */}
        {(phase === PHASE.SETUP || phase === PHASE.COMBAT || phase === PHASE.RESULTS) && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Left panel */}
            <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
              {phase === PHASE.SETUP && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff6688", marginBottom: 8 }}>Setup Phase</div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Place your HQ in the north half, then add resources and defenses.</div>

                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Budget: <span style={{ color: remaining >= 0 ? "#4caf50" : "#ff5555", fontWeight: 600 }}>${formatUSD(remaining)}</span> / ${formatUSD(STARTING_BUDGET)}</div>

                  <button onClick={() => setPlacingWhat("hq")} disabled={!!playerHQ}
                    style={{ ...inputStyle, width: "100%", marginBottom: 6, cursor: playerHQ ? "not-allowed" : "pointer", opacity: playerHQ ? 0.4 : 1, textAlign: "center", fontSize: 11, border: placingWhat === "hq" ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                    {playerHQ ? "HQ Placed" : placingWhat === "hq" ? "Click north half..." : "Place HQ"}
                  </button>

                  {playerHQ && (
                    <>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 8, marginBottom: 4 }}>Airspace (bigger = more income area, more to defend)</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <input type="range" min="1000" max="4000" step="200" value={playerAirspace}
                          onChange={(e) => setPlayerAirspace(parseInt(e.target.value))}
                          style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, color: "#4a9eff" }}>{playerAirspace}m</span>
                      </div>

                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#cc8800", margin: "12px 0 6px" }}>Resources</div>
                      {RESOURCES.map((r) => (
                        <button key={r.key} onClick={() => setPlacingWhat(r.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 4, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === r.key ? `1px solid ${r.color}` : "1px solid #2a2a35" }}>
                          <span style={{ color: r.color }}>{r.icon}</span> {r.name} - ${formatUSD(r.cost)} (+${formatUSD(r.income)}/round)
                        </button>
                      ))}

                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#4a9eff", margin: "12px 0 6px" }}>Defenses</div>
                      {DEFENSE_UNITS.map((d) => (
                        <button key={d.key} onClick={() => setPlacingWhat("def_" + d.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 4, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === "def_" + d.key ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                          {d.name} x4 - ${formatUSD(d.cost * 4)} {d.destroyOnKill ? "(kamikaze)" : `(${Math.round(d.survivalRate * 100)}% survive)`}
                        </button>
                      ))}

                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff5555", margin: "12px 0 6px" }}>Attack Wave</div>
                      {ATTACK_UNITS.map((a) => (
                        <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ flex: 1, fontSize: 10, color: "#ff6666" }}>{a.name} (${formatUSD(a.cost)})</span>
                          <input type="number" value={playerAttack[a.key] || 0} min="0" max="100"
                            onChange={(e) => setPlayerAttack((prev) => ({ ...prev, [a.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            style={{ width: 45, ...inputStyle, fontSize: 10, textAlign: "center", padding: "3px 4px" }} />
                        </div>
                      ))}

                      <button onClick={() => { setPhase(PHASE.COMBAT); }}
                        disabled={!playerHQ || remaining < 0}
                        style={{ ...btnStyle, width: "100%", marginTop: 12, background: remaining >= 0 ? "#1a4a2a" : "#1a1a24", borderColor: remaining >= 0 ? "#4caf50" : "#333", color: remaining >= 0 ? "#4caf50" : "#555", fontSize: 12 }}>
                        START BATTLE ({TOTAL_ROUNDS} rounds)
                      </button>
                    </>
                  )}
                </>
              )}

              {(phase === PHASE.COMBAT || phase === PHASE.RESULTS) && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff6688", marginBottom: 8 }}>
                    {gameOver ? "GAME OVER" : `Round ${currentRound} / ${TOTAL_ROUNDS}`}
                  </div>

                  <StatBar label="You" value={Math.max(0, playerBudget)} max={STARTING_BUDGET * 2} color="#4a9eff" />
                  <StatBar label="AI" value={Math.max(0, aiBudget)} max={STARTING_BUDGET * 2} color="#ff5555" />

                  <div style={{ fontSize: 10, color: "#666", margin: "8px 0 4px" }}>Your resources: {playerResources.filter((r) => r.alive).length} alive</div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Your defenses: {playerDefenses.reduce((s, d) => s + d.count, 0)} units</div>

                  {!gameOver && currentRound < TOTAL_ROUNDS && (
                    <button onClick={runRound} disabled={combatRunning}
                      style={{ ...btnStyle, width: "100%", background: "#4a1a2a", borderColor: "#ff6688", color: "#ff6688", fontSize: 12, marginBottom: 12 }}>
                      {combatRunning ? "Running..." : `LAUNCH ROUND ${currentRound + 1}`}
                    </button>
                  )}

                  {gameOver && (
                    <div style={{
                      padding: "12px", borderRadius: 8, textAlign: "center", marginBottom: 12,
                      background: gameOver.winner === username ? "rgba(76,175,80,0.1)" : "rgba(255,85,85,0.1)",
                      border: `1px solid ${gameOver.winner === username ? "#2a6a3a" : "#6a2a2a"}`,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: gameOver.winner === username ? "#4caf50" : "#ff5555" }}>
                        {gameOver.winner === username ? "VICTORY" : "DEFEAT"}
                      </div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{gameOver.reason}</div>
                      <button onClick={() => { setPhase(PHASE.LOBBY); setMapReady(false); if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; layerRef.current = null; LRef.current = null; } }}
                        style={{ ...inputStyle, marginTop: 8, cursor: "pointer", fontSize: 11 }}>
                        Back to Lobby
                      </button>
                    </div>
                  )}

                  {/* Combat log */}
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#666", margin: "8px 0 4px" }}>Battle Log</div>
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    {combatLog.slice().reverse().map((msg, i) => (
                      <div key={i} style={{ fontSize: 10, color: msg.includes("destroyed") || msg.includes("HIT") ? "#ff5555" : msg.includes("intercepted") ? "#4caf50" : "#555", marginBottom: 3, lineHeight: 1.4 }}>
                        {msg}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Map */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <div ref={mapRef} style={{ width: "100%", height: "100%", cursor: placingWhat ? "crosshair" : "grab" }} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
