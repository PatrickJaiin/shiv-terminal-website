import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, useCallback } from "react";

const ARENA = 10000;
const KILL_RADIUS = 120;

const THEATERS = {
  kashmir: { name: "LoC Kashmir", bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 }, mapCenter: [34.0, 74.25], mapZoom: 9 },
  israel_iran: { name: "Israel-Iran", bounds: { south: 31.0, north: 33.0, west: 34.0, east: 36.0 }, mapCenter: [32.0, 35.0], mapZoom: 8 },
  ukraine_kyiv: { name: "Ukraine Kyiv", bounds: { south: 49.0, north: 51.0, west: 30.0, east: 33.0 }, mapCenter: [50.0, 31.5], mapZoom: 8 },
  taiwan_strait: { name: "Taiwan Strait", bounds: { south: 23.0, north: 26.0, west: 119.0, east: 122.0 }, mapCenter: [24.5, 120.5], mapZoom: 7 },
};

// Repriced per game economics audit (Apr 2026):
// FPV bumped from $500 → $15K to match Kamikaze interceptor cost (1:1 economics).
// 100 FPVs now costs $1.5M (5% of starting budget) vs $50K previously - prevents round-1 rush exploit.
const ATTACK_UNITS = [
  { key: "fpv", name: "FPV Drone", cost: 15000, speed: 1.5, threat: "cheap" },
  { key: "shahed", name: "Shahed-136", cost: 20000, speed: 1.0, threat: "cheap" },
  { key: "lancet", name: "Lancet-3", cost: 35000, speed: 1.8, threat: "medium" },
  { key: "mohajer", name: "Mohajer-6", cost: 500000, speed: 0.8, threat: "expensive" },
];

const DEFENSE_UNITS = [
  { key: "kamikaze", name: "Kamikaze Interceptor", cost: 15000, speed: 2.2, destroyOnKill: true },
  { key: "armed", name: "Armed Interceptor", cost: 180000, speed: 1.8, destroyOnKill: false, survivalRate: 0.73 },
];

// Rebalanced per economics audit:
// Iron Dome: 20 → 60 missiles (was $51M for 17 expected kills; now $51M for 51 expected kills, viable vs swarms)
// NASAMS: $100M → $40M, 6 → 20 missiles (was strictly worst purchase; now the long-range premium option)
const AD_SYSTEMS_1V1 = [
  { key: "iron_dome", name: "Iron Dome", cost: 50000000, range: 2000, missiles: 60, missileCost: 50000, pk: 0.85, engageRate: 3, color: "#44bbff" },
  { key: "gepard", name: "Gepard", cost: 5000000, range: 800, missiles: 680, missileCost: 100, pk: 0.2, engageRate: 1, color: "#88aa44" },
  { key: "nasams", name: "NASAMS 3", cost: 40000000, range: 2500, missiles: 20, missileCost: 500000, pk: 0.8, engageRate: 4, color: "#4488ff" },
  { key: "pantsir", name: "Pantsir-S1", cost: 15000000, range: 1500, missiles: 12, missileCost: 60000, pk: 0.65, engageRate: 3, color: "#cc8800" },
];

// Resource economy follows niche-distinction principle:
// Solar: cheap, low risk, fast payback (3-round ROI), best for early eco
// Arms: mid-tier, gives free interceptor reinforcements (tempo)
// Oil: high cost, high income (5-round ROI), highest absolute return per slot
// Hydro: very high cost, very high income, scarce nodes (only 4 per map)
//        ROI ~6 rounds. Best return-per-slot but biggest single-point-of-failure.
const RESOURCES = [
  { key: "solar", name: "Solar Farm", cost: 2000000, income: 600000, breachDmg: 4000000, color: "#44bb44", icon: "S" },
  // Arms income buffed 0.9M → 1.5M (matches solar's 30% income/cost ratio, no longer dominated)
  { key: "arms", name: "Arms Factory", cost: 5000000, income: 1500000, breachDmg: 9000000, color: "#8888cc", icon: "A" },
  { key: "oil", name: "Oil Refinery", cost: 8000000, income: 2200000, breachDmg: 16000000, color: "#cc8800", icon: "O" },
  { key: "hydro", name: "Hydropower Plant", cost: 14000000, income: 3600000, breachDmg: 22000000, color: "#44aadd", icon: "H" },
];

const AI_NAMES = ["SKYNET-7", "AEGIS_AI", "IRON_WALL", "RED_FURY", "SHADOW_NET", "VANGUARD", "CERBERUS", "TITAN_DEF"];
const STARTING_BUDGET = 30000000;
const AIRSPACE_BREACH_COST = 30; // per drone entering airspace
const PHASE = { LOBBY: "lobby", MATCHMAKING: "matchmaking", SETUP: "setup", COMBAT: "combat" };

function formatUSD(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
// Project sim coords (square ARENA × ARENA grid) to lat/lng using an ISOTROPIC projection.
// Without this, theaters with non-square geographic bounds (e.g. Kashmir 1°×1.5°) would
// stretch sim circles into ovals because 1 sim X unit and 1 sim Y unit would represent
// different real-world distances.
// Strategy: compute the larger geographic dimension in meters, use that as the arena side
// length, then map sim units to meters in BOTH x and y at the same scale.
function getProjection(b) {
  const midLat = (b.south + b.north) / 2;
  const midLng = (b.west + b.east) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const widthM = (b.east - b.west) * 111000 * cosLat;
  const heightM = (b.north - b.south) * 111000;
  const sizeM = Math.max(widthM, heightM); // square arena = bigger dimension
  const mpu = sizeM / ARENA;
  return { midLat, midLng, cosLat, mpu };
}
function simToLatLng(x, y, b) {
  const p = getProjection(b);
  const dxMeters = (x - ARENA / 2) * p.mpu;
  const dyMeters = (y - ARENA / 2) * p.mpu;
  const dLat = dyMeters / 111000;
  const dLng = dxMeters / (111000 * p.cosLat);
  return [p.midLat + dLat, p.midLng + dLng];
}
function latLngToSim(lat, lng, b) {
  const p = getProjection(b);
  const dxMeters = (lng - p.midLng) * 111000 * p.cosLat;
  const dyMeters = (lat - p.midLat) * 111000;
  return [ARENA / 2 + dxMeters / p.mpu, ARENA / 2 + dyMeters / p.mpu];
}

// Generate random resource deposit spawn points across the map.
// Modern game design: more nodes than slots forces opportunity cost decisions.
// Each map gets 10 each of solar/arms/oil + 4 hydropower (scarce, biased to map edges as "rivers").
function generateResourceDeposits() {
  const deposits = [];
  let id = 0;
  // Common resources: spread across whole map
  for (const key of ["solar", "arms", "oil"]) {
    for (let i = 0; i < 10; i++) {
      const x = 700 + Math.random() * (ARENA - 1400);
      const y = 700 + Math.random() * (ARENA - 1400);
      deposits.push({ id: id++, key, x, y, claimed: false });
    }
  }
  // Hydro: scarce, placed tight to map edges (representing rivers/coastlines).
  // Tighter bands prevent edge-0 from clashing with the AI HQ spawn area.
  for (let i = 0; i < 4; i++) {
    const edge = i % 4;
    let x, y;
    if (edge === 0) { x = 600 + Math.random() * (ARENA - 1200); y = 300 + Math.random() * 500; }
    else if (edge === 1) { x = ARENA - 400 - Math.random() * 500; y = 600 + Math.random() * (ARENA - 1200); }
    else if (edge === 2) { x = 600 + Math.random() * (ARENA - 1200); y = ARENA - 400 - Math.random() * 500; }
    else { x = 400 + Math.random() * 500; y = 600 + Math.random() * (ARENA - 1200); }
    deposits.push({ id: id++, key: "hydro", x, y, claimed: false });
  }
  return deposits;
}

function generateAISetup() {
  const hqX = 5000 + (Math.random() - 0.5) * 2000;
  const hqY = 2000 + Math.random() * 1000;
  return {
    hqX, hqY, airspace: 2500,
    resources: [
      { key: "oil", x: hqX - 600, y: hqY + 400, alive: true },
      { key: "solar", x: hqX + 600, y: hqY + 400, alive: true },
      { key: "arms", x: hqX, y: hqY + 800, alive: true },
    ],
    // 16 interceptors instead of 8, faster
    interceptors: Array.from({ length: 16 }, (_, i) => ({
      id: 5000 + i, x: hqX + (Math.random() - 0.5) * 800, y: hqY + 1200 + Math.random() * 400,
      speed: 2.4, status: "active", targetId: null, destroyOnKill: i < 12, survivalRate: 0.75,
    })),
    // Real AD coverage: Pantsir-S1 at HQ (mid range, high pK), 2 Gepards on flanks, NASAMS forward
    adUnits: [
      { key: "pantsir", x: hqX, y: hqY + 400, health: 1, ammo: 12 },
      { key: "gepard", x: hqX - 700, y: hqY + 700, health: 1, ammo: 680 },
      { key: "gepard", x: hqX + 700, y: hqY + 700, health: 1, ammo: 680 },
      { key: "nasams", x: hqX, y: hqY + 1100, health: 1, ammo: 6 },
    ],
  };
}

function generateAIAttack(round) {
  const r = round + 1;
  // Much harder scaling - exponential drone counts and earlier high-tier units
  return {
    fpv: 15 + r * 12,
    shahed: 6 + r * 6,
    ...(r > 1 ? { lancet: 2 + r * 3 } : {}),
    ...(r > 3 ? { mohajer: Math.floor(1 + r * 1.2) } : {}),
  };
}

// ── Multiplayer helpers ──
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/I/1
function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return code;
}
function getPeerId(code) { return `swarm1v1-${code}`; }

// ── Audio engine: programmatic SFX via Web Audio API (no asset files) ──
// Per visuals/sound audit: silent game is the biggest gap. Generate 5 core sounds at runtime.
let _audioCtx = null;
const _audioThrottle = {};
function _initAudio() {
  if (_audioCtx) return _audioCtx;
  if (typeof window === "undefined") return null;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { _audioCtx = null; }
  return _audioCtx;
}
function playSfx(name, throttleMs = 40) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (_audioThrottle[name] && now - _audioThrottle[name] < throttleMs) return;
  _audioThrottle[name] = now;
  const ctx = _audioCtx;
  if (!ctx) return;
  const t = ctx.currentTime;
  try {
    if (name === "ad_fire") {
      // Short laser-zap: square wave with frequency sweep down
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(800 + Math.random() * 200, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.12);
    } else if (name === "drone_kill") {
      // Pop: white noise burst with quick decay
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 0.12;
      src.connect(gain).connect(ctx.destination);
      src.start(t);
    } else if (name === "breach_alarm") {
      // Two-tone alarm ping
      [600, 800].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, t + i * 0.13);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.15);
      });
    } else if (name === "hq_destroyed") {
      // Big explosion: filtered noise burst + low rumble
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = Math.exp(-i / data.length * 4);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t);
      // Sub-bass rumble
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 1);
      og.gain.setValueAtTime(0.25, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 1);
      osc.connect(og).connect(ctx.destination);
      osc.start(t); osc.stop(t + 1);
    } else if (name === "round_start") {
      // Horn: detuned sawtooths at 220Hz with attack
      [220, 165].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
        gain.gain.setValueAtTime(0.12, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.55);
      });
    } else if (name === "ui_click") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.05);
    } else if (name === "victory") {
      // Major chord ascending
      [261, 329, 392].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.15, t + i * 0.08 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.75);
      });
    } else if (name === "defeat") {
      // Minor chord descending
      [196, 165, 130].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 1);
      });
    }
  } catch {}
}

// Create flying drones from a wave config. If `trajectory` is provided (array of {x,y}),
// drones will fly through each waypoint before falling through to their assigned target.
function spawnDrones(wave, originX, originY, targetX, targetY, idStart, trajectory = null) {
  const drones = [];
  let id = idStart;
  for (const [key, count] of Object.entries(wave)) {
    const u = ATTACK_UNITS.find((a) => a.key === key);
    if (!u) continue;
    for (let i = 0; i < count; i++) {
      const ox = originX + (Math.random() - 0.5) * 1500;
      const oy = originY + (Math.random() - 0.5) * 800;
      // If trajectory exists, head to first waypoint instead of final target
      const firstTarget = trajectory && trajectory.length > 0 ? trajectory[0] : { x: targetX, y: targetY };
      drones.push({
        id: id++, x: ox, y: oy, speed: u.speed, threat: u.threat, cost: u.cost,
        status: "active", heading: Math.atan2(firstTarget.y - oy, firstTarget.x - ox) + (Math.random() - 0.5) * 0.3,
        trajectory: trajectory && trajectory.length > 0 ? trajectory.map((w) => ({ x: w.x, y: w.y })) : null,
        waypointIdx: 0,
      });
    }
  }
  return drones;
}

export default function Swarm1v1() {
  const [phase, setPhase] = useState(PHASE.LOBBY);
  const [username, setUsername] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [theater, setTheater] = useState("ukraine_kyiv");
  const [matchTimer, setMatchTimer] = useState(0);

  // Player setup
  const [playerHQ, setPlayerHQ] = useState(null);
  // Phase B: additional HQs at increasing cost. Each is a fortified position with its own
  // small airspace circle, providing redundancy. Diminishing returns: 2nd costs 25M, 3rd costs 50M.
  const [playerExtraHQs, setPlayerExtraHQs] = useState([]); // [{x, y}, ...]
  const EXTRA_HQ_COSTS = [25000000, 50000000]; // cost for placing 2nd, 3rd HQ
  const [playerAirspace, setPlayerAirspace] = useState(2000);
  const [playerResources, setPlayerResources] = useState([]);
  const [playerInterceptors, setPlayerInterceptors] = useState([]);
  const [playerAD, setPlayerAD] = useState([]);
  const [playerAttack, setPlayerAttack] = useState({ fpv: 10, shahed: 3 });
  const [playerTrajectory, setPlayerTrajectory] = useState([]); // waypoints for attack drones
  const [attackPriority, setAttackPriority] = useState("hq");
  const [defPosture, setDefPosture] = useState("pursuing"); // "insane" | "pursuing" | "defensive"
  const [budgetShake, setBudgetShake] = useState(false);
  const [infoPopup, setInfoPopup] = useState(null);
  const [unitInspect, setUnitInspect] = useState(null); // { kind, key, side, ad?, res?, intGroup?, x, y } - middle-click inspector
  const [totalIncome, setTotalIncome] = useState(0);
  const [damagePopup, setDamagePopup] = useState(null);
  const [battleSpeed, setBattleSpeed] = useState(1); // 1x, 2x, 4x
  const [showADRange, setShowADRange] = useState(true);
  const [playerBudget, setPlayerBudget] = useState(STARTING_BUDGET);
  const [placingWhat, setPlacingWhat] = useState(null);

  // AI
  const [aiSetup, setAiSetup] = useState(null);
  const [aiBudget, setAiBudget] = useState(STARTING_BUDGET);

  // Resource deposits (per match, shared map)
  const [resourceDeposits, setResourceDeposits] = useState([]);

  // ── Multiplayer state ──
  const [gameMode, setGameMode] = useState("bot"); // "bot" | "host" | "guest"
  const [lobbyView, setLobbyView] = useState("main"); // "main" | "create" | "join"
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("idle"); // idle | creating | waiting | connecting | connected | error
  const [connectionError, setConnectionError] = useState("");
  const [peerLoaded, setPeerLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const intentionalCloseRef = useRef(false); // suppress "opponent disconnected" when local user tears down
  const joinTimeoutRef = useRef(null); // for join handshake timeout
  const createRetryRef = useRef(0); // retry count for unavailable-id collisions
  const createRetryTimerRef = useRef(null); // pending retry setTimeout id (so cancel can clear it)
  const gameModeRef = useRef("bot"); // mirror gameMode for use in stable callbacks
  const startGuestBattleLoopRef = useRef(null); // forward ref to break circular dep with handleNetMessage
  const launchRoundRef = useRef(null); // forward ref so timer effect can call launchRound
  // Phase 4 matchmaking
  const mmPollRef = useRef(null); // setInterval id for polling
  const mmDeadlineRef = useRef(null); // overall timeout deadline
  // Phase 2 ready handshake
  const [meReady, setMeReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Combat
  const [currentRound, setCurrentRound] = useState(0);
  const [combatLog, setCombatLog] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [battleActive, setBattleActive] = useState(false);
  const [battleDrones, setBattleDrones] = useState({ playerAttackers: [], aiAttackers: [], playerInts: [], aiInts: [] });
  // Per-turn timer: 60s prep window between rounds. Auto-launches on 0 or both ready.
  const TURN_TIMER_SECONDS = 60;
  const [turnTimer, setTurnTimer] = useState(TURN_TIMER_SECONDS);
  const turnTimerRef = useRef(null);

  // Map
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);
  const battleLayerRef = useRef(null);
  const LRef = useRef(null);
  const handleMapClickRef = useRef(null);
  const inspectClickRef = useRef(null); // forward ref for middle-click inspect handler
  const theaterRef = useRef(theater);
  const [mapReady, setMapReady] = useState(false);

  // Battle sim refs
  const battleRef = useRef(null);
  const battleSpeedRef = useRef(1);
  const showADRangeRef = useRef(true);
  const frameRef = useRef(null);

  // Reset match-level state (used by all 3 modes when a match starts)
  // NOTE: per audit fix #4, the player should NOT be defenseless on round 1.
  // Free starting interceptors are granted *after* HQ is placed, in a separate effect below.
  const resetMatchState = useCallback(() => {
    setPlayerHQ(null); setPlayerExtraHQs([]); setPlayerResources([]); setPlayerInterceptors([]); setPlayerAD([]);
    setPlayerBudget(STARTING_BUDGET); setAiBudget(STARTING_BUDGET);
    setCurrentRound(0); setCombatLog([]); setGameOver(null); setTotalIncome(0);
    setBattleActive(false); setBattleDrones({ playerAttackers: [], aiAttackers: [], playerInts: [], aiInts: [] });
    setMeReady(false); setOpponentReady(false);
    setPlayerAttack({ fpv: 10, shahed: 3 });
    setPlayerTrajectory([]);
    setPlayerAirspace(2000);
    setAttackPriority("hq");
    setDefPosture("pursuing");
    // Reset Phase 2 broadcast sentinels so a fresh match re-broadcasts current values
    if (lastBroadcastRef.current) {
      lastBroadcastRef.current.airspace = null;
      lastBroadcastRef.current.attack = null;
      lastBroadcastRef.current.priority = null;
      lastBroadcastRef.current.posture = null;
      lastBroadcastRef.current.ready = null;
    }
  }, []);

  const findMatch = useCallback(() => {
    if (!username.trim()) return;
    _initAudio(); // unlock Web Audio on first user gesture
    setGameMode("bot");
    setPhase(PHASE.MATCHMAKING);
    setOpponentName(AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)]);
    let t = 0;
    const iv = setInterval(() => {
      t++; setMatchTimer(t);
      if (t >= 3) {
        clearInterval(iv);
        setPhase(PHASE.SETUP);
        resetMatchState();
        // Generate match: deposits first, then AI setup that claims nearby deposits
        const deposits = generateResourceDeposits();
        const newAi = generateAISetup();
        // AI auto-claims one deposit of each type closest to its HQ (including hydro)
        const aiResources = [];
        for (const key of ["solar", "arms", "oil", "hydro"]) {
          const candidates = deposits
            .filter((d) => d.key === key && !d.claimed)
            .map((d) => ({ d, dist: Math.hypot(d.x - newAi.hqX, d.y - newAi.hqY) }))
            .sort((a, b) => a.dist - b.dist);
          if (candidates.length > 0) {
            const claimed = candidates[0].d;
            claimed.claimed = true;
            aiResources.push({ key, x: claimed.x, y: claimed.y, alive: true, depositId: claimed.id });
          }
        }
        newAi.resources = aiResources;
        setResourceDeposits(deposits);
        setAiSetup(newAi);
      }
    }, 1000);
  }, [username, resetMatchState]);

  // ── Multiplayer: broadcast a message to peer (no-op in bot mode) ──
  const broadcast = useCallback((msg) => {
    if (gameModeRef.current === "bot") return;
    const conn = connRef.current;
    if (conn && conn.open) {
      try { conn.send(msg); } catch {}
    }
  }, []);

  // ── Multiplayer: dispatch incoming network messages and apply to local state ──
  // The opponent's setup is mirrored into the existing aiSetup slot so that the
  // map renderer + combat code can read it just like in bot mode.
  const handleNetMessage = useCallback((msg) => {
    if (typeof msg !== "object" || !msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "deposits": {
        // Host pushes the canonical deposit list to guest on connect
        if (Array.isArray(msg.deposits)) setResourceDeposits(msg.deposits);
        break;
      }
      case "place_hq": {
        setAiSetup((prev) => ({ ...(prev || {}), hqX: msg.x, hqY: msg.y, airspace: prev?.airspace ?? 2000, resources: prev?.resources || [], interceptors: prev?.interceptors || [], adUnits: prev?.adUnits || [] }));
        break;
      }
      case "place_extra_hq": {
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] };
          next.extraHQs = [...(next.extraHQs || []), { x: msg.x, y: msg.y }];
          return next;
        });
        break;
      }
      case "airspace": {
        setAiSetup((prev) => ({ ...(prev || {}), airspace: msg.radius, hqX: prev?.hqX ?? 5000, hqY: prev?.hqY ?? 2500, resources: prev?.resources || [], interceptors: prev?.interceptors || [], adUnits: prev?.adUnits || [] }));
        break;
      }
      case "place_resource": {
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] };
          next.resources = [...(next.resources || []), { key: msg.key, x: msg.x, y: msg.y, alive: true, depositId: msg.depositId }];
          return next;
        });
        if (msg.depositId !== undefined) {
          setResourceDeposits((prev) => prev.map((d) => d.id === msg.depositId ? { ...d, claimed: true } : d));
        }
        break;
      }
      case "remove_resource": {
        setAiSetup((prev) => {
          if (!prev) return prev;
          const next = { ...prev, resources: (prev.resources || []).filter((r) => !(r.x === msg.x && r.y === msg.y)) };
          return next;
        });
        if (msg.depositId !== undefined) {
          setResourceDeposits((prev) => prev.map((d) => d.id === msg.depositId ? { ...d, claimed: false } : d));
        }
        break;
      }
      case "place_ad": {
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] };
          const sys = AD_SYSTEMS_1V1.find((s) => s.key === msg.key);
          next.adUnits = [...(next.adUnits || []), { key: msg.key, x: msg.x, y: msg.y, health: 1, ammo: sys?.missiles || 100 }];
          return next;
        });
        break;
      }
      case "remove_ad": {
        setAiSetup((prev) => {
          if (!prev) return prev;
          return { ...prev, adUnits: (prev.adUnits || []).filter((a) => !(a.x === msg.x && a.y === msg.y)) };
        });
        break;
      }
      case "place_interceptor_group": {
        // Opponent places a group of N interceptors. We expand into individual entities
        // so the existing static-draw code (which expects individual interceptors) renders them.
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] };
          const expanded = [];
          let baseId = (next.interceptors?.length || 0) + 90000;
          for (let i = 0; i < (msg.count || 4); i++) {
            expanded.push({
              id: baseId++, x: msg.x + (Math.random() - 0.5) * 200, y: msg.y + (Math.random() - 0.5) * 200,
              speed: 2.4, status: "active", targetId: null,
              destroyOnKill: msg.key === "kamikaze", survivalRate: msg.key === "armed" ? 0.73 : 0,
              groupX: msg.x, groupY: msg.y, // for remove matching
            });
          }
          next.interceptors = [...(next.interceptors || []), ...expanded];
          return next;
        });
        break;
      }
      case "remove_interceptor_group": {
        setAiSetup((prev) => {
          if (!prev) return prev;
          return { ...prev, interceptors: (prev.interceptors || []).filter((i) => !(i.groupX === msg.x && i.groupY === msg.y)) };
        });
        break;
      }
      case "attack_wave": {
        setAiSetup((prev) => ({ ...(prev || {}), _attackWave: msg.wave }));
        break;
      }
      case "attack_priority": {
        setAiSetup((prev) => ({ ...(prev || {}), _priority: msg.value }));
        break;
      }
      case "def_posture": {
        setAiSetup((prev) => ({ ...(prev || {}), _posture: msg.value }));
        break;
      }
      case "ready": {
        setOpponentReady(!!msg.ready);
        break;
      }
      case "start_combat": {
        // Host initiated combat - guest transitions to combat phase
        setPhase(PHASE.COMBAT);
        break;
      }
      case "round_start": {
        // Host launched a round. Guest sees the income log and starts the render loop.
        // From the guest's perspective, host is the "opponent" and guest is "you", so swap.
        if (msg.aIncome != null) setPlayerBudget((p) => p + msg.aIncome);
        if (msg.pIncome != null) setAiBudget((p) => p + msg.pIncome);
        if (msg.aIncome != null) setTotalIncome((p) => p + msg.aIncome);
        setCombatLog((prev) => [...prev, `Round ${(msg.round || 0) + 1}: You +$${formatUSD(msg.aIncome || 0)} | ${opponentName} +$${formatUSD(msg.pIncome || 0)}`]);
        if (startGuestBattleLoopRef.current) startGuestBattleLoopRef.current();
        break;
      }
      case "combat_snapshot": {
        // Apply incoming snapshot to battleRef. Swap p/a fields because the
        // host's "player" is the guest's "opponent" and vice versa.
        if (!battleRef.current && startGuestBattleLoopRef.current) {
          // Snapshot arrived before round_start - lazily start the loop
          startGuestBattleLoopRef.current();
        }
        const b = battleRef.current;
        if (!b) break;
        b.step = msg.step || 0;
        // Swap: host's "p" → guest's "a", host's "a" → guest's "p"
        b.aAttackers = (msg.pAtt || []).map((a) => ({ id: a.id, x: a.x, y: a.y, status: a.s, threat: "cheap" }));
        b.pAttackers = (msg.aAtt || []).map((a) => ({ id: a.id, x: a.x, y: a.y, status: a.s, threat: "cheap" }));
        b.aInts = (msg.pInt || []).map((i) => ({ id: i.id, x: i.x, y: i.y, status: i.s }));
        b.pInts = (msg.aInt || []).map((i) => ({ id: i.id, x: i.x, y: i.y, status: i.s }));
        b.aAD = (msg.pAD || []).map((a) => ({ key: a.key, x: a.x, y: a.y, health: a.h, ammo: a.ammo }));
        b.pAD = (msg.aAD || []).map((a) => ({ key: a.key, x: a.x, y: a.y, health: a.h, ammo: a.ammo }));
        b.flashes = msg.flashes || [];
        b.playerAirBreaches = msg.aAirBreaches || []; // swapped
        b.aiAirBreaches = msg.pAirBreaches || []; // swapped
        break;
      }
      case "round_end": {
        // Host computed round results. Apply to guest's local state, swapping perspectives.
        const b = battleRef.current;
        if (b) { b._guestRoundOver = true; }
        // Apply budget deltas (swap: guest's loss is host's "a" delta, etc.)
        if (msg.aBudgetDelta != null) setPlayerBudget((p) => p + msg.aBudgetDelta);
        if (msg.pBudgetDelta != null) setAiBudget((p) => p + msg.pBudgetDelta);
        // C3 fix: apply guest's surviving resources and interceptor counts from host's view
        if (Array.isArray(msg.aResourcesAfter)) setPlayerResources(msg.aResourcesAfter);
        if (Array.isArray(msg.aInterceptorsAfter)) setPlayerInterceptors(msg.aInterceptorsAfter);
        // Append log lines (already from host perspective, leave as-is for now)
        if (Array.isArray(msg.endLog)) setCombatLog((prev) => [...prev, ...msg.endLog]);
        setCurrentRound((r) => Math.max(r, (msg.round || 0) + 1));
        setBattleActive(false);
        if (battleLayerRef.current) battleLayerRef.current.clearLayers();
        if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
        // C1 fix: use role tag instead of names. winnerRole = "host" | "guest"
        if (msg.gameOver) {
          // Guest wins iff host says "guest" won
          const winnerIsMe = msg.gameOver.winnerRole === "guest";
          setGameOver({
            winner: winnerIsMe ? username : opponentName,
            reason: msg.gameOver.reason || "Match ended",
          });
        }
        break;
      }
      default:
        // Unknown message types are ignored (forward compat)
        break;
    }
  }, [opponentName, username]);

  // ── Multiplayer: cleanup peer & connection ──
  // intentional=true suppresses the "opponent disconnected" message in handleDisconnect
  const teardownPeer = useCallback((intentional = false) => {
    intentionalCloseRef.current = !!intentional;
    if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
    if (createRetryTimerRef.current) { clearTimeout(createRetryTimerRef.current); createRetryTimerRef.current = null; }
    if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
    mmDeadlineRef.current = null;
    if (connRef.current) { try { connRef.current.close(); } catch {} connRef.current = null; }
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }
  }, []);

  const handleDisconnect = useCallback(() => {
    const wasIntentional = intentionalCloseRef.current;
    intentionalCloseRef.current = false;
    teardownPeer();
    setConnectionStatus("idle");
    if (!wasIntentional) setConnectionError("Opponent disconnected");
    setRoomCode(""); setJoinCode(""); setLobbyView("main");
    setGameMode("bot");
    setCopied(false);
    createRetryRef.current = 0;
    // H1 fix: cancel any in-flight battle render loop
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (battleRef.current) { battleRef.current._guestRoundOver = true; battleRef.current = null; }
    resetMatchState();
    setPhase(PHASE.LOBBY);
    setMapReady(false);
    if (mapInstanceRef.current) { try { mapInstanceRef.current.remove(); } catch {} mapInstanceRef.current = null; layerRef.current = null; battleLayerRef.current = null; LRef.current = null; }
  }, [teardownPeer, resetMatchState]);

  const cancelConnection = useCallback(() => {
    teardownPeer(true); // intentional - don't flash "opponent disconnected"
    setConnectionStatus("idle");
    setConnectionError("");
    setRoomCode(""); setJoinCode("");
    setLobbyView("main");
    setGameMode("bot");
    createRetryRef.current = 0;
  }, [teardownPeer]);

  // ── Multiplayer: create room (host) ──
  const createRoom = useCallback(() => {
    if (!username.trim()) return;
    if (typeof window === "undefined" || !window.Peer) {
      setConnectionError("Network library not loaded yet, try again in a moment");
      setConnectionStatus("error");
      return;
    }
    _initAudio(); // unlock Web Audio on first user gesture
    teardownPeer(true);
    const code = generateRoomCode();
    setRoomCode(code);
    setJoinCode("");
    setConnectionError("");
    setConnectionStatus("creating");
    setGameMode("host");
    setLobbyView("create");

    const peer = new window.Peer(getPeerId(code), { debug: 0 });
    const thisPeer = peer; // captured for stale-closure guards
    peerRef.current = peer;

    peer.on("open", () => {
      if (peerRef.current !== thisPeer) return; // user cancelled or replaced
      createRetryRef.current = 0; // success: reset retry counter
      setConnectionStatus("waiting");
    });
    peer.on("connection", (conn) => {
      if (peerRef.current !== thisPeer) { try { conn.close(); } catch {} return; }
      // C3: reject second incoming connection - we already have one
      if (connRef.current) { try { conn.close(); } catch {} return; }
      connRef.current = conn;
      conn.on("open", () => {
        if (connRef.current !== conn) return;
        setConnectionStatus("connected");
        setOpponentName("Player 2");
        setPhase(PHASE.SETUP);
        resetMatchState();
        setMeReady(false); setOpponentReady(false);
        // Host generates the canonical deposit list and broadcasts it to guest
        const deposits = generateResourceDeposits();
        setResourceDeposits(deposits);
        // Empty opponent placeholder (filled via guest's messages)
        setAiSetup({ hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] });
        // Send deposits to guest as soon as conn is open
        try { conn.send({ type: "deposits", deposits }); } catch {}
      });
      conn.on("close", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("error", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("data", handleNetMessage);
    });
    peer.on("error", (err) => {
      if (peerRef.current !== thisPeer) return;
      // H3: auto-retry on code collision (very rare but possible)
      if (err?.type === "unavailable-id" && createRetryRef.current < 3) {
        createRetryRef.current++;
        try { peer.destroy(); } catch {}
        peerRef.current = null;
        // try again with a new code (cancellable via teardownPeer/cancelConnection)
        if (createRetryTimerRef.current) clearTimeout(createRetryTimerRef.current);
        createRetryTimerRef.current = setTimeout(() => { createRetryTimerRef.current = null; createRoom(); }, 50);
        return;
      }
      // Friendlier messages for common error types
      let msg = err?.message || String(err) || "Connection error";
      if (err?.type === "network") msg = "Network error - check your connection";
      else if (err?.type === "server-error") msg = "PeerJS broker unavailable - try again";
      setConnectionError(msg);
      setConnectionStatus("error");
      // H2: clean up the failed peer
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    });
  }, [username, teardownPeer, resetMatchState, handleNetMessage, handleDisconnect]);

  // ── Multiplayer: join room (guest) ──
  const joinRoom = useCallback(() => {
    if (!username.trim() || !joinCode.trim() || joinCode.length !== 5) return;
    if (typeof window === "undefined" || !window.Peer) {
      setConnectionError("Network library not loaded yet, try again in a moment");
      setConnectionStatus("error");
      return;
    }
    _initAudio(); // unlock Web Audio on first user gesture
    teardownPeer(true);
    setConnectionError("");
    setConnectionStatus("connecting");
    setGameMode("guest");
    setLobbyView("join");

    const peer = new window.Peer({ debug: 0 });
    const thisPeer = peer;
    peerRef.current = peer;

    // H4: 10s timeout for the whole handshake
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = setTimeout(() => {
      if (peerRef.current !== thisPeer) return;
      setConnectionError("Connection timed out - check the code or try again");
      setConnectionStatus("error");
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    }, 10000);

    peer.on("open", () => {
      if (peerRef.current !== thisPeer) return;
      const conn = peer.connect(getPeerId(joinCode), { reliable: true });
      connRef.current = conn;
      conn.on("open", () => {
        if (connRef.current !== conn) return;
        if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
        setConnectionStatus("connected");
        setOpponentName("Host");
        setPhase(PHASE.SETUP);
        resetMatchState();
        // Deposits will arrive from host in Phase 2; empty for now
        setResourceDeposits([]);
        setAiSetup({ hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] });
      });
      conn.on("close", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("error", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("data", handleNetMessage);
    });
    peer.on("error", (err) => {
      if (peerRef.current !== thisPeer) return;
      if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
      let msg = err?.message || String(err) || "Connection error";
      if (err?.type === "peer-unavailable") msg = "Room not found - check the code";
      else if (err?.type === "network") msg = "Network error - check your connection";
      else if (err?.type === "server-error") msg = "PeerJS broker unavailable - try again";
      setConnectionError(msg);
      setConnectionStatus("error");
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    });
  }, [username, joinCode, teardownPeer, resetMatchState, handleNetMessage, handleDisconnect]);

  // ── Phase 4: Cancel matchmaking polling and remove from server queue ──
  const cancelMatchmaking = useCallback(() => {
    if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
    mmDeadlineRef.current = null;
    // Best-effort: remove from server queue
    const myPeerId = peerRef.current?.id;
    if (myPeerId) {
      try { fetch(`/api/match/check?peerId=${encodeURIComponent(myPeerId)}`, { method: "DELETE" }).catch(() => {}); } catch {}
    }
  }, []);

  // ── Phase 4: Find a random online match via Vercel Edge + Upstash Redis ──
  const findOnlineMatch = useCallback(() => {
    if (!username.trim()) return;
    if (typeof window === "undefined" || !window.Peer) {
      setConnectionError("Network library not loaded yet, try again in a moment");
      setConnectionStatus("error");
      return;
    }
    teardownPeer(true);
    setConnectionError("");
    setRoomCode("");
    setJoinCode("");
    setLobbyView("matchmaking");
    setConnectionStatus("creating"); // we'll progress: creating → waiting → connecting → connected

    // Create our peer with a random ID (PeerJS generates one)
    const peer = new window.Peer({ debug: 0 });
    const thisPeer = peer;
    peerRef.current = peer;

    let myPeerId = null;
    let role = null; // "host" | "guest" - decided after queue response
    let pollDeadline = Date.now() + 60000; // 60s overall timeout
    mmDeadlineRef.current = pollDeadline;

    const finishAsHost = () => {
      // Host: stay registered with PeerJS, accept incoming connection from guest.
      // Existing peer.on("connection") handler is wired below.
      setGameMode("host");
      setConnectionStatus("waiting");
    };

    const finishAsGuest = (opponentPeerId) => {
      // Guest: connect to opponent's peer ID via PeerJS
      setGameMode("guest");
      setConnectionStatus("connecting");
      const conn = peer.connect(opponentPeerId, { reliable: true });
      connRef.current = conn;
      // H1 fix: 10s timeout for the WebRTC handshake
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = setTimeout(() => {
        if (peerRef.current !== thisPeer || connRef.current !== conn) return;
        setConnectionError("Opponent went offline before connection - try again");
        setConnectionStatus("error");
        try { peer.destroy(); } catch {}
        if (peerRef.current === thisPeer) peerRef.current = null;
      }, 10000);
      conn.on("open", () => {
        if (connRef.current !== conn) return;
        if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
        setConnectionStatus("connected");
        setOpponentName("Opponent");
        setPhase(PHASE.SETUP);
        resetMatchState();
        setResourceDeposits([]);
        setAiSetup({ hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] });
      });
      conn.on("close", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("error", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("data", handleNetMessage);
    };

    peer.on("open", async (id) => {
      if (peerRef.current !== thisPeer) return;
      myPeerId = id;
      // Wire the host-side connection handler in case we end up as host
      // This must be done BEFORE the queue request so we don't miss an incoming connection
      peer.on("connection", (conn) => {
        if (peerRef.current !== thisPeer) { try { conn.close(); } catch {} return; }
        if (connRef.current) { try { conn.close(); } catch {} return; }
        connRef.current = conn;
        conn.on("open", () => {
          if (connRef.current !== conn) return;
          setConnectionStatus("connected");
          setOpponentName("Opponent");
          setPhase(PHASE.SETUP);
          resetMatchState();
          setMeReady(false); setOpponentReady(false);
          const deposits = generateResourceDeposits();
          setResourceDeposits(deposits);
          setAiSetup({ hqX: 5000, hqY: 2500, airspace: 2000, resources: [], interceptors: [], adUnits: [] });
          try { conn.send({ type: "deposits", deposits }); } catch {}
        });
        conn.on("close", () => { if (connRef.current === conn) handleDisconnect(); });
        conn.on("error", () => { if (connRef.current === conn) handleDisconnect(); });
        conn.on("data", handleNetMessage);
      });

      // POST to queue endpoint
      let queueResp;
      try {
        const r = await fetch("/api/match/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId: myPeerId }),
        });
        queueResp = await r.json();
        if (r.status === 503 && queueResp?.configured === false) {
          setConnectionError("Matchmaking is not configured on the server. Use Create/Join Room instead.");
          setConnectionStatus("error");
          try { peer.destroy(); } catch {}
          if (peerRef.current === thisPeer) peerRef.current = null;
          return;
        }
      } catch (e) {
        setConnectionError("Could not reach matchmaking server: " + (e?.message || "network"));
        setConnectionStatus("error");
        try { peer.destroy(); } catch {}
        if (peerRef.current === thisPeer) peerRef.current = null;
        return;
      }

      if (peerRef.current !== thisPeer) return;

      if (queueResp?.matched && queueResp.role === "guest" && queueResp.opponent) {
        role = "guest";
        finishAsGuest(queueResp.opponent);
        return;
      }
      // Otherwise we're queued - poll for match
      role = "host"; // we'll be the one accepting an incoming connection
      finishAsHost();
      // H2 fix: reset deadline now that polling actually starts (don't burn budget on broker latency)
      pollDeadline = Date.now() + 60000;
      mmDeadlineRef.current = pollDeadline;
      const poll = async () => {
        if (peerRef.current !== thisPeer) return;
        if (Date.now() > pollDeadline) {
          if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
          setConnectionError("No match found in 60 seconds. Try again or use Create/Join Room.");
          setConnectionStatus("error");
          try { peer.destroy(); } catch {}
          if (peerRef.current === thisPeer) peerRef.current = null;
          return;
        }
        try {
          const r = await fetch(`/api/match/check?peerId=${encodeURIComponent(myPeerId)}`);
          if (peerRef.current !== thisPeer) return;
          const data = await r.json();
          if (data?.matched && data.role === "host") {
            // We're matched - just wait for incoming PeerJS connection
            if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
            setConnectionStatus("waiting");
            // H3 fix: 20s timeout for the guest's incoming PeerJS connection. If the guest crashed
            // between matching and dialing, this surfaces an error instead of hanging forever.
            if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
            joinTimeoutRef.current = setTimeout(() => {
              if (peerRef.current !== thisPeer) return;
              if (connRef.current) return; // already connected
              setConnectionError("Opponent never connected - try again");
              setConnectionStatus("error");
              try { peer.destroy(); } catch {}
              if (peerRef.current === thisPeer) peerRef.current = null;
            }, 20000);
          }
        } catch {}
      };
      // Poll every 2s
      mmPollRef.current = setInterval(poll, 2000);
      poll(); // immediate first check
    });

    peer.on("error", (err) => {
      if (peerRef.current !== thisPeer) return;
      let msg = err?.message || String(err) || "Connection error";
      if (err?.type === "peer-unavailable") msg = "Opponent disconnected before match could start";
      else if (err?.type === "network") msg = "Network error - check your connection";
      else if (err?.type === "server-error") msg = "PeerJS broker unavailable - try again";
      setConnectionError(msg);
      setConnectionStatus("error");
      if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    });
  }, [username, teardownPeer, resetMatchState, handleNetMessage, handleDisconnect]);

  // ── Cleanup peer on unmount only (intentionally omit deps to avoid mid-match cleanup if teardownPeer ref changes) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { teardownPeer(true); }, []);

  // Attack wave cost (computed live for display, deducted on launch)
  const attackWaveCost = Object.entries(playerAttack).reduce((s, [k, n]) => {
    const u = ATTACK_UNITS.find((a) => a.key === k);
    return s + (u ? u.cost * n : 0);
  }, 0);
  const remaining = playerBudget; // budget is already deducted at purchase time

  // Budget shake animation
  const triggerShake = useCallback(() => {
    setBudgetShake(true);
    setTimeout(() => setBudgetShake(false), 500);
  }, []);

  // Screen shake on the map container - per visuals audit, the cheapest juice tool ever invented
  const shakeMap = useCallback((intensity = 6, frames = 8) => {
    const el = mapRef.current;
    if (!el) return;
    let f = 0;
    const step = () => {
      if (!el || f++ >= frames) { if (el) el.style.transform = ""; return; }
      const k = 1 - f / frames;
      const dx = (Math.random() - 0.5) * intensity * k;
      const dy = (Math.random() - 0.5) * intensity * k;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(step);
    };
    step();
  }, []);

  // Check if cost would exceed budget
  const canAfford = useCallback((cost) => {
    return (playerBudget - cost) >= 0;
  }, [playerBudget]);

  // Map click - multi-place (stays in mode), budget checked
  const handleMapClick = useCallback((x, y) => {
    if ((phase !== PHASE.SETUP && phase !== PHASE.COMBAT) || !placingWhat) return;
    if (battleActive && placingWhat !== "hq") return; // block all placement during battle
    if (battleActive && (placingWhat === "sell" || placingWhat === "delete")) return;

    if (placingWhat === "hq") {
      // Prevent placing HQ inside enemy airspace + buffer for player's own min airspace (1000)
      if (aiSetup) {
        const enemyDist = dist({ x, y }, { x: aiSetup.hqX, y: aiSetup.hqY });
        const minSafeDist = (aiSetup.airspace || 2500) + 1000 + 400; // enemy airspace + min player airspace + buffer
        if (enemyDist < minSafeDist) {
          setInfoPopup({ text: `HQ too close to enemy airspace. Place at least ${Math.round(minSafeDist)}m away.` });
          setTimeout(() => setInfoPopup(null), 2500);
          return;
        }
      }
      setPlayerHQ({ x, y }); setPlacingWhat(null);
      broadcast({ type: "place_hq", x, y });
    } else if (placingWhat === "extra_hq") {
      // Additional HQ - costs 25M for 2nd, 50M for 3rd. Max 3 total.
      if (playerExtraHQs.length >= 2) { setPlacingWhat(null); return; }
      const cost = EXTRA_HQ_COSTS[playerExtraHQs.length] || 50000000;
      if (!canAfford(cost)) { triggerShake(); return; }
      // Must be at least 1500 units from existing HQ to spread out coverage
      if (playerHQ && dist({ x, y }, playerHQ) < 1500) {
        setInfoPopup({ text: "Place additional HQ at least 1500m from your main HQ" });
        setTimeout(() => setInfoPopup(null), 2500);
        return;
      }
      for (const eh of playerExtraHQs) {
        if (dist({ x, y }, eh) < 1500) {
          setInfoPopup({ text: "Place additional HQ at least 1500m from other HQs" });
          setTimeout(() => setInfoPopup(null), 2500);
          return;
        }
      }
      // Also block placement inside enemy airspace
      if (aiSetup) {
        const enemyDist = dist({ x, y }, { x: aiSetup.hqX, y: aiSetup.hqY });
        if (enemyDist < (aiSetup.airspace || 2500) + 800) {
          setInfoPopup({ text: "Cannot place HQ inside enemy airspace" });
          setTimeout(() => setInfoPopup(null), 2500);
          return;
        }
      }
      setPlayerBudget((p) => p - cost);
      setPlayerExtraHQs((prev) => [...prev, { x, y }]);
      broadcast({ type: "place_extra_hq", x, y });
      // Stay in placement mode if more can be added (so user can quickly place 2nd then 3rd)
      if (playerExtraHQs.length + 1 >= 2) setPlacingWhat(null);
    } else if (placingWhat === "trajectory") {
      // Add a waypoint to the attack drone trajectory. Stay in placement mode for chaining waypoints.
      setPlayerTrajectory((prev) => [...prev, { x, y }]);
    } else if (placingWhat === "sell") {
      // Sell: find closest unit within 200 and remove with 42% refund
      let bestD = 200, bestType = null, bestIdx = -1;
      playerResources.forEach((r, i) => { if (r.alive) { const d2 = dist({ x, y }, r); if (d2 < bestD) { bestD = d2; bestType = "res"; bestIdx = i; } } });
      playerInterceptors.forEach((d, i) => { const d2 = dist({ x, y }, d); if (d2 < bestD) { bestD = d2; bestType = "int"; bestIdx = i; } });
      playerAD.forEach((ad, i) => { if (ad.health > 0) { const d2 = dist({ x, y }, ad); if (d2 < bestD) { bestD = d2; bestType = "ad"; bestIdx = i; } } });
      if (bestType === "res") {
        const r = playerResources[bestIdx]; const res = RESOURCES.find((rr) => rr.key === r.key);
        setPlayerBudget((p) => p + Math.floor((res?.cost || 0) * 0.42));
        if (r.depositId !== undefined) {
          setResourceDeposits((prev) => prev.map((d) => d.id === r.depositId ? { ...d, claimed: false } : d));
        }
        setPlayerResources((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_resource", x: r.x, y: r.y, depositId: r.depositId });
      } else if (bestType === "int") {
        const d = playerInterceptors[bestIdx]; const def = DEFENSE_UNITS.find((dd) => dd.key === d.key);
        setPlayerBudget((p) => p + Math.floor((def?.cost || 0) * d.count * 0.42));
        setPlayerInterceptors((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_interceptor_group", x: d.x, y: d.y });
      } else if (bestType === "ad") {
        const ad = playerAD[bestIdx]; const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        setPlayerBudget((p) => p + Math.floor((sys?.cost || 0) * 0.42));
        setPlayerAD((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_ad", x: ad.x, y: ad.y });
      }
    } else if (placingWhat === "delete") {
      // Delete during prep: full refund, find closest
      let bestD = 200, bestType = null, bestIdx = -1;
      playerResources.forEach((r, i) => { if (r.alive) { const d2 = dist({ x, y }, r); if (d2 < bestD) { bestD = d2; bestType = "res"; bestIdx = i; } } });
      playerInterceptors.forEach((d, i) => { const d2 = dist({ x, y }, d); if (d2 < bestD) { bestD = d2; bestType = "int"; bestIdx = i; } });
      playerAD.forEach((ad, i) => { if (ad.health > 0) { const d2 = dist({ x, y }, ad); if (d2 < bestD) { bestD = d2; bestType = "ad"; bestIdx = i; } } });
      if (bestType === "res") {
        const r = playerResources[bestIdx];
        if (r.depositId !== undefined) {
          setResourceDeposits((prev) => prev.map((d) => d.id === r.depositId ? { ...d, claimed: false } : d));
        }
        setPlayerResources((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_resource", x: r.x, y: r.y, depositId: r.depositId });
      } else if (bestType === "int") {
        const d = playerInterceptors[bestIdx];
        setPlayerInterceptors((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_interceptor_group", x: d.x, y: d.y });
      } else if (bestType === "ad") {
        const ad = playerAD[bestIdx];
        setPlayerAD((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_ad", x: ad.x, y: ad.y });
      }
    } else if (placingWhat.startsWith("def_")) {
      const defKey = placingWhat.replace("def_", "");
      if (!playerHQ || dist({ x, y }, playerHQ) > playerAirspace + 500) return;
      const def = DEFENSE_UNITS.find((dd) => dd.key === defKey);
      const defCost = (def?.cost || 0) * 4;
      if (!canAfford(defCost)) { triggerShake(); return; }
      setPlayerBudget((p) => p - defCost);
      setPlayerInterceptors((prev) => [...prev, { key: defKey, x, y, count: 4 }]);
      broadcast({ type: "place_interceptor_group", key: defKey, x, y, count: 4 });
    } else if (placingWhat.startsWith("ad_")) {
      const adKey = placingWhat.replace("ad_", "");
      if (!playerHQ || dist({ x, y }, playerHQ) > playerAirspace + 300) return;
      const sys = AD_SYSTEMS_1V1.find((s) => s.key === adKey);
      if (!sys || !canAfford(sys.cost)) { triggerShake(); return; }
      setPlayerBudget((p) => p - sys.cost);
      setPlayerAD((prev) => [...prev, { key: adKey, x, y, health: 1, ammo: sys.missiles }]);
      broadcast({ type: "place_ad", key: adKey, x, y });
    } else {
      // Resource placement: snap to nearest unclaimed matching deposit within tolerance
      if (!playerHQ) return;
      const res = RESOURCES.find((rr) => rr.key === placingWhat);
      if (!res) return;
      // Find nearest unclaimed deposit of this type within click tolerance
      const SNAP_DIST = 600;
      let bestD = SNAP_DIST, bestDeposit = null;
      for (const dep of resourceDeposits) {
        if (dep.key !== placingWhat || dep.claimed) continue;
        const d2 = dist({ x, y }, dep);
        if (d2 < bestD) { bestD = d2; bestDeposit = dep; }
      }
      if (!bestDeposit) {
        setInfoPopup({ text: `No unclaimed ${res.name.toLowerCase()} deposit nearby. Click on a glowing ${res.icon} marker.` });
        setTimeout(() => setInfoPopup(null), 2500);
        return;
      }
      if (dist(bestDeposit, playerHQ) > playerAirspace) {
        setInfoPopup({ text: `Deposit is outside your airspace. Expand airspace or pick another deposit.` });
        setTimeout(() => setInfoPopup(null), 2500);
        return;
      }
      if (!canAfford(res.cost)) { triggerShake(); return; }
      setPlayerBudget((p) => p - res.cost);
      setResourceDeposits((prev) => prev.map((d) => d.id === bestDeposit.id ? { ...d, claimed: true } : d));
      setPlayerResources((prev) => [...prev, { key: placingWhat, x: bestDeposit.x, y: bestDeposit.y, alive: true, depositId: bestDeposit.id }]);
      broadcast({ type: "place_resource", key: placingWhat, x: bestDeposit.x, y: bestDeposit.y, depositId: bestDeposit.id });
    }
  }, [phase, placingWhat, playerHQ, playerExtraHQs, playerAirspace, battleActive, playerResources, playerInterceptors, playerAD, resourceDeposits, canAfford, triggerShake, broadcast]);

  handleMapClickRef.current = handleMapClick;

  // Middle-click inspect: hit-test all units within radius and show stats popup
  const handleInspect = useCallback((x, y) => {
    const HIT_RADIUS = 250;
    let best = null, bestD = HIT_RADIUS;
    // Player HQs (main + extras)
    if (playerHQ) {
      const d = dist({ x, y }, playerHQ);
      if (d < bestD) { bestD = d; best = { kind: "hq", side: "player", x: playerHQ.x, y: playerHQ.y }; }
    }
    for (const eh of playerExtraHQs) {
      const d = dist({ x, y }, eh);
      if (d < bestD) { bestD = d; best = { kind: "hq_extra", side: "player", x: eh.x, y: eh.y }; }
    }
    // Enemy HQ
    if (aiSetup) {
      const d = dist({ x, y }, { x: aiSetup.hqX, y: aiSetup.hqY });
      if (d < bestD) { bestD = d; best = { kind: "hq", side: "enemy", x: aiSetup.hqX, y: aiSetup.hqY }; }
    }
    // Player AD
    for (const ad of playerAD) {
      const d = dist({ x, y }, ad);
      if (d < bestD) { bestD = d; best = { kind: "ad", side: "player", key: ad.key, ad }; }
    }
    // Enemy AD
    for (const ad of (aiSetup?.adUnits || [])) {
      const d = dist({ x, y }, ad);
      if (d < bestD) { bestD = d; best = { kind: "ad", side: "enemy", key: ad.key, ad }; }
    }
    // Player resources
    for (const r of playerResources) {
      const d = dist({ x, y }, r);
      if (d < bestD) { bestD = d; best = { kind: "resource", side: "player", key: r.key, res: r }; }
    }
    // Enemy resources
    for (const r of (aiSetup?.resources || [])) {
      const d = dist({ x, y }, r);
      if (d < bestD) { bestD = d; best = { kind: "resource", side: "enemy", key: r.key, res: r }; }
    }
    // Player interceptor groups
    for (const ig of playerInterceptors) {
      const d = dist({ x, y }, ig);
      if (d < bestD) { bestD = d; best = { kind: "interceptor", side: "player", key: ig.key, intGroup: ig }; }
    }
    if (best) setUnitInspect(best);
  }, [playerHQ, playerExtraHQs, aiSetup, playerAD, playerResources, playerInterceptors]);
  inspectClickRef.current = handleInspect;
  theaterRef.current = theater;
  battleSpeedRef.current = battleSpeed;
  showADRangeRef.current = showADRange;
  gameModeRef.current = gameMode;

  // ── Phase 2: broadcast state changes for fields not handled by handleMapClick ──
  // Skip broadcast on first render via a "mounted" sentinel per field.
  const lastBroadcastRef = useRef({ airspace: null, attack: null, priority: null, posture: null, ready: null });
  useEffect(() => {
    if (gameMode === "bot") return;
    if (lastBroadcastRef.current.airspace === playerAirspace) return;
    lastBroadcastRef.current.airspace = playerAirspace;
    if (connRef.current?.open) broadcast({ type: "airspace", radius: playerAirspace });
  }, [playerAirspace, gameMode, broadcast]);
  useEffect(() => {
    if (gameMode === "bot") return;
    const json = JSON.stringify(playerAttack);
    if (lastBroadcastRef.current.attack === json) return;
    lastBroadcastRef.current.attack = json;
    if (connRef.current?.open) broadcast({ type: "attack_wave", wave: playerAttack });
  }, [playerAttack, gameMode, broadcast]);
  useEffect(() => {
    if (gameMode === "bot") return;
    if (lastBroadcastRef.current.priority === attackPriority) return;
    lastBroadcastRef.current.priority = attackPriority;
    if (connRef.current?.open) broadcast({ type: "attack_priority", value: attackPriority });
  }, [attackPriority, gameMode, broadcast]);
  useEffect(() => {
    if (gameMode === "bot") return;
    if (lastBroadcastRef.current.posture === defPosture) return;
    lastBroadcastRef.current.posture = defPosture;
    if (connRef.current?.open) broadcast({ type: "def_posture", value: defPosture });
  }, [defPosture, gameMode, broadcast]);
  useEffect(() => {
    if (gameMode === "bot") return;
    if (lastBroadcastRef.current.ready === meReady) return;
    lastBroadcastRef.current.ready = meReady;
    if (connRef.current?.open) broadcast({ type: "ready", ready: meReady });
  }, [meReady, gameMode, broadcast]);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || phase === PHASE.LOBBY || phase === PHASE.MATCHMAKING) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L.default || L;
      const Leaf = LRef.current;
      if (mapInstanceRef.current) { mapInstanceRef.current.setView(THEATERS[theater].mapCenter, THEATERS[theater].mapZoom); return; }
      const th = THEATERS[theater];
      // preferCanvas: true forces Leaflet to render circleMarkers via Canvas instead of SVG nodes.
      // 5-10x speedup for high-entity-count battle frames per visuals audit.
      const map = Leaf.map(mapRef.current, { center: th.mapCenter, zoom: th.mapZoom, zoomControl: true, preferCanvas: true });
      mapInstanceRef.current = map;
      Leaf.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(map);
      Leaf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, opacity: 0.3 }).addTo(map);
      layerRef.current = Leaf.layerGroup().addTo(map);
      battleLayerRef.current = Leaf.layerGroup().addTo(map);
      map.on("click", (e) => {
        // Force recalculate map size before converting coordinates
        map.invalidateSize({ animate: false });
        const fn = handleMapClickRef.current;
        if (!fn) return;
        const th2 = THEATERS[theaterRef.current];
        if (!th2) return;
        // Use containerPointToLatLng for accurate conversion
        const rect = map.getContainer().getBoundingClientRect();
        const px = e.originalEvent.clientX - rect.left;
        const py = e.originalEvent.clientY - rect.top;
        const latlng = map.containerPointToLatLng([px, py]);
        const b = th2.bounds;
        const simX = ((latlng.lng - b.west) / (b.east - b.west)) * ARENA;
        const simY = ((latlng.lat - b.south) / (b.north - b.south)) * ARENA;
        fn(simX, simY); // no clamping - allow placement anywhere visible
      });
      // Right click for unit info (uses refs for fresh state)
      const infoRef = { setInfoPopup };
      map.on("contextmenu", (e) => {
        e.originalEvent.preventDefault();
        const t2 = THEATERS[theaterRef.current];
        let [cx, cy] = latLngToSim(e.latlng.lat, e.latlng.lng, t2.bounds);
        infoRef.setInfoPopup({ text: `Coordinates: (${Math.round(cx)}, ${Math.round(cy)})` });
        setTimeout(() => infoRef.setInfoPopup(null), 3000);
      });
      // Middle-click hit test: shows unit inspector popup
      mapRef.current.addEventListener("mousedown", (ev) => {
        if (ev.button !== 1) return; // middle button only
        ev.preventDefault();
        const fn = inspectClickRef.current;
        if (!fn) return;
        const rect = map.getContainer().getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const latlng = map.containerPointToLatLng([px, py]);
        const t2 = THEATERS[theaterRef.current];
        if (!t2) return;
        const b = t2.bounds;
        const simX = ((latlng.lng - b.west) / (b.east - b.west)) * ARENA;
        const simY = ((latlng.lat - b.south) / (b.north - b.south)) * ARENA;
        fn(simX, simY);
      });
      setMapReady(true);
      // Fix map sizing after render - multiple attempts
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 500);
      // Watch for container resizes
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapRef.current);
    })();
    return () => { cancelled = true; };
  }, [phase, theater]);

  // Draw static elements
  useEffect(() => {
    const L = LRef.current; const layer = layerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    const th = THEATERS[theater]; const mpu = getProjection(th.bounds).mpu;
    const toLL = (x, y) => simToLatLng(x, y, th.bounds);

    // Divider
    L.polyline([toLL(0, 5000), toLL(ARENA, 5000)], { color: "#fff", weight: 1, opacity: 0.15, dashArray: "8 8", interactive: false }).addTo(layer);

    // Resource deposits - shown as faint icons. Highlighted when in matching placement mode.
    // Perf: skip deposit redraws during combat (they don't change mid-battle and the
    // render effect re-runs ~60Hz from battleDrones updates).
    if (!battleActive) for (const dep of resourceDeposits) {
      if (dep.claimed) continue;
      const res = RESOURCES.find((rr) => rr.key === dep.key);
      if (!res) continue;
      const isHighlighted = placingWhat === dep.key;
      const inPlayerAirspace = playerHQ && dist(dep, playerHQ) <= playerAirspace;
      const inAiAirspace = aiSetup && dist(dep, { x: aiSetup.hqX, y: aiSetup.hqY }) <= aiSetup.airspace;
      // Draw deposit as triangle outline (matches the resource shape it'll become)
      const sz = isHighlighted ? 18 : 14;
      const halfsz = sz / 2;
      const op = isHighlighted ? 1 : 0.5;
      const fillOp = isHighlighted ? 0.5 : 0.15;
      L.marker(toLL(dep.x, dep.y), {
        icon: L.divIcon({
          className: "", iconSize: [sz, sz], iconAnchor: [halfsz, halfsz],
          html: `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><polygon points="${halfsz},1 ${sz - 1},${sz - 1} 1,${sz - 1}" fill="${res.color}" fill-opacity="${fillOp}" stroke="${isHighlighted ? '#ffffff' : res.color}" stroke-width="${isHighlighted ? 2 : 1}" stroke-opacity="${op}" stroke-linejoin="round"/><text x="${halfsz}" y="${sz - 3}" text-anchor="middle" font-size="${isHighlighted ? 10 : 8}" font-weight="800" font-family="monospace" fill="${isHighlighted ? '#fff' : res.color}" opacity="${op}">${res.icon}</text></svg>`,
        }),
        interactive: false,
      }).addTo(layer);
    }

    // Player attack trajectory waypoints (only shown during setup/between rounds)
    if (playerTrajectory.length > 0 && playerHQ) {
      const pathPts = [toLL(playerHQ.x, playerHQ.y - 500)];
      for (const wp of playerTrajectory) pathPts.push(toLL(wp.x, wp.y));
      // Final segment to AI HQ if known (visualizes the full intended path)
      if (aiSetup) pathPts.push(toLL(aiSetup.hqX, aiSetup.hqY));
      L.polyline(pathPts, { color: "#00ddff", weight: 2.5, opacity: 0.7, dashArray: "8 6", interactive: false }).addTo(layer);
      playerTrajectory.forEach((wp, idx) => {
        L.circleMarker(toLL(wp.x, wp.y), { radius: 6, color: "#ffffff", fillColor: "#00ddff", fillOpacity: 0.9, weight: 2 }).addTo(layer);
        L.marker(toLL(wp.x, wp.y), {
          icon: L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8],
            html: `<div style="color:#fff;font-size:9px;font-weight:800;font-family:monospace;text-align:center;line-height:16px">${idx + 1}</div>` }),
          interactive: false,
        }).addTo(layer);
      });
    }

    // Player airspace with breach gaps
    if (playerHQ) {
      const breachAngles = battleRef.current?.playerAirBreaches || [];
      if (breachAngles.length === 0) {
        L.circle(toLL(playerHQ.x, playerHQ.y), { radius: playerAirspace * mpu, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.04, weight: 1.5, opacity: 0.5, dashArray: "10 6" }).addTo(layer);
      } else {
        const SEG = 24; const segArc = (Math.PI * 2) / SEG; const GAP = 0.15;
        for (let i = 0; i < SEG; i++) {
          const mid = -Math.PI + (i + 0.5) * segArc;
          const inGap = breachAngles.some((ba) => { let d = mid - ba; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) < GAP; });
          if (inGap) continue;
          const pts = [];
          for (let j = 0; j <= 3; j++) { const a = -Math.PI + i * segArc + (j / 3) * segArc; pts.push(toLL(playerHQ.x + Math.cos(a) * playerAirspace, playerHQ.y + Math.sin(a) * playerAirspace)); }
          L.polyline(pts, { color: "#4a9eff", weight: 1.5, opacity: 0.5, dashArray: "10 6", interactive: false }).addTo(layer);
        }
        for (const ba of breachAngles) {
          const bll = toLL(playerHQ.x + Math.cos(ba) * playerAirspace, playerHQ.y + Math.sin(ba) * playerAirspace);
          L.circleMarker(bll, { radius: 4, color: "#888", fillColor: "#555", fillOpacity: 0.9, weight: 2 }).addTo(layer);
        }
      }
      // HQ: bigger square (per UX request)
      L.marker(toLL(playerHQ.x, playerHQ.y), {
        icon: L.divIcon({
          className: "", iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;background:#4a9eff;border:2.5px solid #fff;box-sizing:border-box;box-shadow:0 0 6px rgba(74,158,255,0.7)"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    // Additional player HQs (slightly smaller to indicate "secondary")
    for (const eh of playerExtraHQs) {
      // Each extra HQ has its own small airspace bubble (60% of main airspace radius)
      const ehRadius = playerAirspace * 0.6;
      L.circle(toLL(eh.x, eh.y), { radius: ehRadius * mpu, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.04, weight: 1.5, opacity: 0.4, dashArray: "8 4", interactive: false }).addTo(layer);
      L.marker(toLL(eh.x, eh.y), {
        icon: L.divIcon({
          className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;background:#4a9eff;border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 5px rgba(74,158,255,0.6)"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    // Player resources: triangle (per UX request)
    for (const r of playerResources) {
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (!res) continue;
      const fill = r.alive ? res.color : "#333";
      const stroke = r.alive ? "#ffffff" : "#444";
      L.marker(toLL(r.x, r.y), {
        icon: L.divIcon({
          className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,1 17,16 1,16" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    for (const d of playerInterceptors) L.circleMarker(toLL(d.x, d.y), { radius: 4, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.6, weight: 1 }).addTo(layer);
    for (const ad of playerAD) {
      const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
      if (!sys) continue;
      // Range circle
      if (ad.health > 0) {
        L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.06, weight: 1.5, opacity: 0.4, dashArray: "6 4", interactive: false }).addTo(layer);
      }
      // White-bordered fill (player ownership), size 7 to match new battle layer
      L.circleMarker(toLL(ad.x, ad.y), { radius: 7, color: ad.health > 0 ? "#ffffff" : "#444", fillColor: ad.health > 0 ? sys.color : "#333", fillOpacity: 0.9, weight: 2.5 }).addTo(layer);
    }

    // AI - show full enemy intel: HQ, airspace, resources, AD systems with range, interceptor positions
    if (aiSetup) {
      // Airspace
      const airBreaches = battleRef.current?.aiAirBreaches || [];
      if (airBreaches.length === 0) {
        L.circle(toLL(aiSetup.hqX, aiSetup.hqY), { radius: aiSetup.airspace * mpu, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.04, weight: 1, opacity: 0.4, dashArray: "10 6" }).addTo(layer);
      } else {
        const SEG = 24; const segArc = (Math.PI * 2) / SEG; const GAP = 0.15;
        for (let i = 0; i < SEG; i++) {
          const mid = -Math.PI + (i + 0.5) * segArc;
          const inGap = airBreaches.some((ba) => { let d = mid - ba; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) < GAP; });
          if (inGap) continue;
          const pts = [];
          for (let j = 0; j <= 3; j++) { const a = -Math.PI + i * segArc + (j / 3) * segArc; pts.push(toLL(aiSetup.hqX + Math.cos(a) * aiSetup.airspace, aiSetup.hqY + Math.sin(a) * aiSetup.airspace)); }
          L.polyline(pts, { color: "#ff5555", weight: 1, opacity: 0.4, dashArray: "10 6", interactive: false }).addTo(layer);
        }
      }
      // Enemy HQ: bigger square
      L.marker(toLL(aiSetup.hqX, aiSetup.hqY), {
        icon: L.divIcon({
          className: "", iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;background:#ff5555;border:2.5px solid #fff;box-sizing:border-box;box-shadow:0 0 6px rgba(255,85,85,0.7)"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
      // Enemy resources: triangle (slightly dimmer)
      for (const r of aiSetup.resources) {
        const res = RESOURCES.find((rr) => rr.key === r.key);
        if (!res) continue;
        const fill = r.alive ? res.color : "#333";
        const stroke = r.alive ? "#ff7777" : "#444";
        L.marker(toLL(r.x, r.y), {
          icon: L.divIcon({
            className: "", iconSize: [16, 16], iconAnchor: [8, 8],
            html: `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 15,14 1,14" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" opacity="0.8"/></svg>`,
          }),
          interactive: false,
        }).addTo(layer);
      }
      // Enemy AD systems with range circles
      // Use the system's own color for the fill (so player can identify the AD type),
      // but with a red border to indicate enemy ownership (vs player's white border).
      for (const ad of (aiSetup.adUnits || [])) {
        const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        if (!sys) continue;
        if (ad.health > 0) {
          L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: "#ff5555", fillOpacity: 0.04, weight: 1.5, opacity: 0.45, dashArray: "6 4", interactive: false }).addTo(layer);
        }
        L.circleMarker(toLL(ad.x, ad.y), { radius: 7, color: ad.health > 0 ? "#ff3333" : "#444", fillColor: ad.health > 0 ? sys.color : "#333", fillOpacity: 0.9, weight: 2.5 }).addTo(layer);
      }
      // Enemy interceptors at base
      for (const i of (aiSetup.interceptors || [])) {
        if (i.status !== "active") continue;
        L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.55, weight: 1 }).addTo(layer);
      }
    }
  }, [mapReady, theater, playerHQ, playerExtraHQs, playerAirspace, playerResources, playerInterceptors, playerAD, aiSetup, phase, battleDrones, resourceDeposits, placingWhat, playerTrajectory]);

  // ── Phase 3: Render battle frame to leaflet (used by host tick + guest render loop) ──
  const renderBattleFrame = useCallback((b) => {
    const L = LRef.current; const bl = battleLayerRef.current;
    if (!L || !bl || !b) return;
    bl.clearLayers();
    const th = THEATERS[theaterRef.current]; if (!th) return;
    const toLL = (x, y) => simToLatLng(x, y, th.bounds);
    const mpu = getProjection(th.bounds).mpu;
    if (showADRangeRef.current) {
      for (const ad of (b.pAD || [])) {
        if (ad.health <= 0) continue;
        const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.06, weight: 1.5, opacity: 0.4, dashArray: "6 4", interactive: false }).addTo(bl);
      }
      for (const ad of (b.aAD || [])) {
        if (ad.health <= 0) continue;
        const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.04, weight: 1.5, opacity: 0.3, dashArray: "6 4", interactive: false }).addTo(bl);
      }
    }
    // Helper: draw an AD marker with type color, side-indicating border, and reload arc
    const drawAdMarker = (ad, sideColor, labelColor) => {
      const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
      if (!sys) return;
      const alive = ad.health > 0;
      // Outer ring: side color (white for player, red for enemy)
      L.circleMarker(toLL(ad.x, ad.y), { radius: 9, color: alive ? sideColor : "#222", fillColor: alive ? sys.color : "#1a1a1a", fillOpacity: alive ? 0.95 : 0.3, weight: 2.5 }).addTo(bl);
      // Inner crosshair
      L.circleMarker(toLL(ad.x, ad.y), { radius: 2, color: "#ffffff", fillColor: "#ffffff", fillOpacity: alive ? 1 : 0.3, weight: 0 }).addTo(bl);
      // Reload arc: shows cooldown progress as a thin colored ring around the AD.
      // Reload completes when (b.step - lastFired) >= cooldown. Empty ring = ready, filling = reloading.
      if (alive && ad.lastFired !== undefined) {
        const cooldown = Math.max(3, Math.round(sys.engageRate * 5));
        const elapsed = b.step - ad.lastFired;
        if (elapsed < cooldown) {
          // Reloading - draw a faint ring whose opacity grows as reload completes
          const reloadPct = Math.min(1, elapsed / cooldown);
          L.circleMarker(toLL(ad.x, ad.y), {
            radius: 13, color: "#ffaa00", fillColor: "transparent",
            opacity: 0.3 + reloadPct * 0.5, weight: 2,
          }).addTo(bl);
        } else if (ad.ammo > 0) {
          // Ready to fire - bright green ring
          L.circleMarker(toLL(ad.x, ad.y), {
            radius: 13, color: "#4caf50", fillColor: "transparent",
            opacity: 0.7, weight: 1.5,
          }).addTo(bl);
        }
      }
      // Label with name + ammo count
      if (alive) {
        L.marker(toLL(ad.x, ad.y - 180), {
          icon: L.divIcon({
            className: "", iconSize: [60, 14], iconAnchor: [30, 7],
            html: `<div style="color:${labelColor};font-size:9px;font-weight:700;font-family:monospace;text-align:center;text-shadow:0 0 4px #000;white-space:nowrap">${sys.name.split(" ")[0]} ${ad.ammo}</div>`
          }),
          interactive: false,
        }).addTo(bl);
      }
    };
    for (const ad of (b.pAD || [])) drawAdMarker(ad, "#ffffff", AD_SYSTEMS_1V1.find((s) => s.key === ad.key)?.color || "#fff");
    for (const ad of (b.aAD || [])) drawAdMarker(ad, "#ff3333", "#ff7777");
    for (const a of (b.aAttackers || [])) { if (a.status === "active") L.circleMarker(toLL(a.x, a.y), { radius: 3, color: "#ff4444", fillColor: "#ff4444", fillOpacity: 0.9, weight: 0 }).addTo(bl); }
    for (const a of (b.pAttackers || [])) { if (a.status === "active") L.circleMarker(toLL(a.x, a.y), { radius: 3, color: "#00ddff", fillColor: "#00ddff", fillOpacity: 0.9, weight: 0 }).addTo(bl); }
    for (const i of (b.pInts || [])) {
      if (i.status === "active") L.circleMarker(toLL(i.x, i.y), { radius: 5, color: "#ffffff", fillColor: "#4a9eff", fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
      else if (i.status === "landed") L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#336699", fillColor: "#336699", fillOpacity: 0.5, weight: 1 }).addTo(bl);
    }
    for (const i of (b.aInts || [])) {
      if (i.status === "active") L.circleMarker(toLL(i.x, i.y), { radius: 5, color: "#880000", fillColor: "#ff5555", fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
      else if (i.status === "landed") L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#663333", fillColor: "#663333", fillOpacity: 0.5, weight: 1 }).addTo(bl);
    }
    if (b.flashes) {
      // Per visuals audit: use wall-clock time for VFX decay so 16x speed doesn't hide flashes.
      // Each flash carries wallTime (creation timestamp). Aging is computed in milliseconds, not sim steps.
      const nowMs = performance.now();
      b.flashes = b.flashes.filter((f) => {
        const ageMs = nowMs - (f.wallTime || 0);
        return ageMs < (f.type === "dmgtext" ? 2000 : 500);
      });
      for (const f of b.flashes) {
        const ageMs = nowMs - (f.wallTime || 0);
        const maxAgeMs = f.type === "dmgtext" ? 2000 : 500;
        const p = Math.min(1, ageMs / maxAgeMs);
        const age = ageMs / 16; // legacy "frame age" for compatibility with existing math
        const ll = toLL(f.x, f.y);
        if (f.type === "adshot") {
          if (ageMs < 333) {
            const ll2 = toLL(f.x2, f.y2);
            const fade = 1 - ageMs / 333;
            L.polyline([ll, ll2], { color: "#ffffff", weight: 4, opacity: fade * 0.3, interactive: false }).addTo(bl);
            L.polyline([ll, ll2], { color: f.color || "#ffaa00", weight: 2, opacity: fade * 0.9, interactive: false }).addTo(bl);
            L.circleMarker(ll, { radius: 4 * fade, color: "#ffffff", fillColor: "#ffffff", fillOpacity: fade * 0.6, weight: 0 }).addTo(bl);
            L.circleMarker(ll2, { radius: 4 * fade, color: f.color || "#ffaa00", fillColor: f.color || "#ffaa00", fillOpacity: fade * 0.8, weight: 0 }).addTo(bl);
          }
        } else if (f.type === "dmgtext") {
          // Drift up over time - 1px every 16ms = 60px/sec
          const drift = ageMs / 16 * 3;
          const driftLL = toLL(f.x, f.y + drift);
          L.marker(driftLL, { icon: L.divIcon({ className: "", iconSize: [80, 16], iconAnchor: [40, 8], html: `<div style="color:${f.color || "#ff5555"};font-size:12px;font-weight:800;font-family:monospace;text-align:center;text-shadow:0 0 6px #000;opacity:${1 - p}">${f.text}</div>` }), interactive: false }).addTo(bl);
        } else if (f.type === "kill") {
          // Ease-out: explodes fast, settles slow (per visuals audit)
          const eased = 1 - Math.pow(1 - p, 3);
          L.circleMarker(ll, { radius: 5 + eased * 14, color: "#ffffff", fillColor: "#ff8800", fillOpacity: (1 - p) * 0.6, weight: 2, opacity: 1 - p }).addTo(bl);
        } else if (f.type === "breach") {
          const eased = 1 - Math.pow(1 - p, 3);
          L.circleMarker(ll, { radius: 6 + eased * 12, color: "#ff0040", fillColor: "#ff0040", fillOpacity: (1 - p) * 0.7, weight: 2.5, opacity: 1 - p }).addTo(bl);
        }
      }
    }
  }, []);

  // ── Phase 3: Serialize battle state for network transmission (~10Hz) ──
  const serializeBattleSnapshot = useCallback((b) => ({
    type: "combat_snapshot",
    step: b.step,
    pAtt: b.pAttackers.map((a) => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), s: a.status })),
    aAtt: b.aAttackers.map((a) => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), s: a.status })),
    pInt: b.pInts.map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), s: i.status })),
    aInt: b.aInts.map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), s: i.status })),
    pAD: b.pAD.map((a) => ({ key: a.key, x: a.x, y: a.y, h: a.health, ammo: a.ammo })),
    aAD: b.aAD.map((a) => ({ key: a.key, x: a.x, y: a.y, h: a.health, ammo: a.ammo })),
    flashes: (b.flashes || []).slice(-30),
    pAirBreaches: b.playerAirBreaches || [],
    aAirBreaches: b.aiAirBreaches || [],
  }), []);

  // ── Phase 3: Guest render-only loop (host streams snapshots, guest renders them) ──
  const startGuestBattleLoop = useCallback(() => {
    // Initialize empty battleRef - filled by combat_snapshot messages
    battleRef.current = {
      pAttackers: [], aAttackers: [], pInts: [], aInts: [], pAD: [], aAD: [],
      step: 0, flashes: [], playerAirBreaches: [], aiAirBreaches: [],
      pKills: 0, aKills: 0, pBreaches: 0, aBreaches: 0,
      _guestRoundOver: false,
    };
    setBattleActive(true);
    setPlacingWhat(null);
    function guestTick() {
      const b = battleRef.current;
      if (!b || b._guestRoundOver) return;
      renderBattleFrame(b);
      setBattleDrones({
        playerAttackers: [...(b.pAttackers || [])],
        aiAttackers: [...(b.aAttackers || [])],
        playerInts: [...(b.pInts || [])],
        aiInts: [...(b.aInts || [])],
      });
      frameRef.current = requestAnimationFrame(guestTick);
    }
    frameRef.current = requestAnimationFrame(guestTick);
  }, [renderBattleFrame]);

  // Wire forward ref so handleNetMessage (defined earlier) can call into us
  startGuestBattleLoopRef.current = startGuestBattleLoop;

  // ── Launch round with animated battle ──
  const launchRound = useCallback(() => {
    if (!playerHQ || !aiSetup || gameOver || battleActive) return;
    // Guest never initiates the sim - only host does (or bot mode)
    if (gameMode === "guest") return;
    // Deduct attack wave cost
    const waveCost = Object.entries(playerAttack).reduce((s, [k, n]) => { const u = ATTACK_UNITS.find((a) => a.key === k); return s + (u ? u.cost * n : 0); }, 0);
    if (waveCost > playerBudget) { triggerShake(); return; }
    setPlayerBudget((p) => p - waveCost);

    setBattleActive(true);
    setPlacingWhat(null);
    const round = currentRound;
    const log = [];

    // Income: airspace base income + resource income
    const airspaceIncome = Math.floor(playerAirspace * 200); // $200 per meter of radius per round
    const aiAirspaceIncome = Math.floor(aiSetup.airspace * 200);
    let pIncome = airspaceIncome, aIncome = aiAirspaceIncome;
    for (const r of playerResources) { if (r.alive) { const res = RESOURCES.find((rr) => rr.key === r.key); if (res) pIncome += res.income; } }
    for (const r of aiSetup.resources) { if (r.alive) { const res = RESOURCES.find((rr) => rr.key === r.key); if (res) aIncome += res.income; } }
    setPlayerBudget((p) => p + pIncome);
    setAiBudget((p) => p + aIncome);
    setTotalIncome((p) => p + pIncome);
    log.push(`Round ${round + 1}: You +$${formatUSD(pIncome)} | ${opponentName} +$${formatUSD(aIncome)}`);

    // In MP host mode, broadcast round-start so guest enters battle phase
    if (gameMode === "host") {
      broadcast({ type: "round_start", round, pIncome, aIncome });
    }
    // Audio: round start horn
    playSfx("round_start", 0);

    // Spawn player's attack drones flying toward AI HQ (via trajectory waypoints if defined)
    const pAttackers = spawnDrones(playerAttack, playerHQ.x, playerHQ.y - 500, aiSetup.hqX, aiSetup.hqY, 10000 + round * 1000, playerTrajectory.length > 0 ? playerTrajectory : null);
    // In MP host mode, opponent's attack wave comes from network (aiSetup._attackWave)
    // In bot mode, generate via AI logic
    const aiWave = gameMode === "host" && aiSetup._attackWave
      ? aiSetup._attackWave
      : generateAIAttack(round);
    const aAttackers = spawnDrones(aiWave, aiSetup.hqX, aiSetup.hqY + 500, playerHQ.x, playerHQ.y, 20000 + round * 1000);

    // Player interceptors with spawn positions for RTB
    const pInts = [];
    for (const d of playerInterceptors) {
      const def = DEFENSE_UNITS.find((dd) => dd.key === d.key);
      for (let i = 0; i < d.count; i++) {
        const sx = d.x + (Math.random() - 0.5) * 300;
        const sy = d.y + (Math.random() - 0.5) * 300;
        pInts.push({
          id: 30000 + pInts.length, x: sx, y: sy, spawnX: sx, spawnY: sy,
          speed: def?.speed || 2.0, status: "active", targetId: null,
          destroyOnKill: def?.destroyOnKill !== false, survivalRate: def?.survivalRate || 0,
        });
      }
    }
    // AI interceptors with spawn positions
    const aInts = aiSetup.interceptors.filter((i) => i.status === "active").map((i) => ({ ...i, spawnX: i.x, spawnY: i.y }));

    log.push(`You sent ${pAttackers.length} drones | ${opponentName} sent ${aAttackers.length} drones`);
    setCombatLog((prev) => [...prev, ...log]);

    // Copy AD state for battle
    const pAD = playerAD.map((a) => ({ ...a }));
    const aAD = aiSetup.adUnits.map((a) => ({ ...a }));

    // Snapshot all of player's HQs (main + extras) into battleRef so the sim can read them
    const allPlayerHQs = [{ x: playerHQ.x, y: playerHQ.y }, ...playerExtraHQs.map((h) => ({ x: h.x, y: h.y }))];
    // Dynamic HQ overwhelm threshold per economics audit fix #2:
    // overwhelm at max(8, 20% of wave size) prevents "tiny breach % of giant wave = insta-loss" degeneracy.
    // Each HQ adds +6 to threshold to make multi-HQ feel meaningful.
    const aOverwhelmThreshold = Math.max(8, Math.floor(aAttackers.length * 0.2)) + (allPlayerHQs.length - 1) * 6;
    const pOverwhelmThreshold = Math.max(8, Math.floor(pAttackers.length * 0.2));
    battleRef.current = { pAttackers, aAttackers, pInts, aInts, pAD, aAD, step: 0, pKills: 0, aKills: 0, pBreaches: 0, aBreaches: 0, flashes: [], playerAirBreaches: [], aiAirBreaches: [], playerHQs: allPlayerHQs, aOverwhelmThreshold, pOverwhelmThreshold };

    // Animate
    function tick() {
      const b = battleRef.current;
      if (!b) return;
      const spd = battleSpeedRef.current || 1;
      for (let si = 0; si < spd; si++) {
      b.step++;

      // Move AI attackers - medium/expensive target player AD first
      for (const a of b.aAttackers) {
        if (a.status !== "active") continue;
        // Find nearest player HQ (main + extras)
        let nearestHQ = playerHQ;
        if (b.playerHQs && b.playerHQs.length > 1) {
          let bestD = Infinity;
          for (const h of b.playerHQs) { const d2 = dist(a, h); if (d2 < bestD) { bestD = d2; nearestHQ = h; } }
        }
        let tx = nearestHQ.x, ty = nearestHQ.y;
        // Medium/expensive AI drones hunt player ground AD
        if ((a.threat === "medium" || a.threat === "expensive") && b.pAD.some((ad) => ad.health > 0)) {
          const alive = b.pAD.filter((ad) => ad.health > 0);
          const closest = alive.reduce((best, ad) => dist(a, ad) < dist(a, best) ? ad : best, alive[0]);
          if (dist(a, closest) < 2500) {
            tx = closest.x; ty = closest.y;
            if (dist(a, closest) < 80) {
              const adSys = AD_SYSTEMS_1V1.find((s2) => s2.key === closest.key);
              closest.health = 0; closest.ammo = 0; a.status = "expended";
              b.flashes.push({ x: a.x, y: a.y, time: b.step, type: "kill" });
              b.flashes.push({ x: a.x, y: a.y + 100, time: b.step, type: "dmgtext", text: `AD destroyed!`, color: "#ff3333" });
              continue;
            }
          }
        }
        const dx = tx - a.x, dy = ty - a.y;
        let diff = Math.atan2(dy, dx) - a.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.heading += diff * 0.06;
        a.x += Math.cos(a.heading) * a.speed;
        a.y += Math.sin(a.heading) * a.speed;
        // Breach if drone is within 200 of ANY player HQ (main or extras)
        let breachedHQ = null;
        const hqList = b.playerHQs || [playerHQ];
        for (const h of hqList) { if (dist(a, h) < 200) { breachedHQ = h; break; } }
        if (breachedHQ) {
          a.status = "breached"; b.aBreaches++;
          const breachCost = Math.max(100000, (a.cost || 500000) * 2);
          b.aBreachDmg = (b.aBreachDmg || 0) + breachCost;
          b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "breach" });
          b.flashes.push({ x: a.x, y: a.y + 100, time: b.step, wallTime: performance.now(), type: "dmgtext", text: `-$${breachCost >= 1e6 ? (breachCost / 1e6).toFixed(1) + "M" : (breachCost / 1e3).toFixed(0) + "K"}`, color: "#ff5555" });
          playSfx("breach_alarm", 250);
          shakeMap(4, 6);
          if (b.aBreaches > (b.aOverwhelmThreshold || 8) && !b.hqOverwhelmDeclared) {
            b.hqOverwhelmDeclared = true;
            const go = { winnerRole: gameMode === "host" ? "guest" : "ai", winner: opponentName, reason: "HQ overwhelmed" };
            setGameOver(go);
            setDamagePopup({ text: "HQ DESTROYED", color: "#ff0000" });
            setTimeout(() => setDamagePopup(null), 3000);
            playSfx("hq_destroyed", 0);
            playSfx("defeat", 0);
            shakeMap(20, 16);
          }
        }
      }
      // Move player attackers - follow trajectory waypoints first, then target by priority
      for (const a of b.pAttackers) {
        if (a.status !== "active") continue;
        // Trajectory waypoint following: head to current waypoint until close, then advance
        if (a.trajectory && a.waypointIdx < a.trajectory.length) {
          const wp = a.trajectory[a.waypointIdx];
          const tx = wp.x, ty = wp.y;
          if (dist(a, wp) < 180) { a.waypointIdx++; }
          const dx = tx - a.x, dy = ty - a.y;
          let diff = Math.atan2(dy, dx) - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += diff * 0.06;
          a.x += Math.cos(a.heading) * a.speed;
          a.y += Math.sin(a.heading) * a.speed;
          continue;
        }
        let tx = aiSetup.hqX, ty = aiSetup.hqY;
        if (attackPriority === "ad" && b.aAD.some((ad) => ad.health > 0)) {
          const alive = b.aAD.filter((ad) => ad.health > 0);
          const closest = alive.reduce((best, ad) => dist(a, ad) < dist(a, best) ? ad : best, alive[0]);
          tx = closest.x; ty = closest.y;
          if (dist(a, closest) < 100) {
            closest.health = 0; closest.ammo = 0; a.status = "expended";
            b.flashes.push({ x: a.x, y: a.y, time: b.step, type: "kill" });
            b.flashes.push({ x: a.x, y: a.y + 100, time: b.step, type: "dmgtext", text: "AD hit!", color: "#ff3333" });
            continue;
          }
        } else if (attackPriority === "resources") {
          const alive = aiSetup.resources.filter((r) => r.alive);
          if (alive.length > 0) {
            const closest = alive.reduce((best, r) => dist(a, r) < dist(a, best) ? r : best, alive[0]);
            tx = closest.x; ty = closest.y;
            if (dist(a, closest) < 100) {
              const res2 = RESOURCES.find((rr) => rr.key === closest.key);
              closest.alive = false; a.status = "expended"; b.pBreaches++;
              b.flashes.push({ x: a.x, y: a.y, time: b.step, type: "kill" });
              b.flashes.push({ x: a.x, y: a.y - 100, time: b.step, type: "dmgtext", text: `${res2?.name || "Resource"} hit!`, color: "#ff9800" });
              continue;
            }
          }
        } else if (attackPriority === "interceptors" && b.aInts.some((i) => i.status === "active")) {
          const alive = b.aInts.filter((i) => i.status === "active");
          const closest = alive.reduce((best, i) => dist(a, i) < dist(a, best) ? i : best, alive[0]);
          tx = closest.x; ty = closest.y;
          if (dist(a, closest) < KILL_RADIUS) { closest.status = "expended"; a.status = "expended"; continue; }
        }
        const dx = tx - a.x, dy = ty - a.y;
        let diff = Math.atan2(dy, dx) - a.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.heading += diff * 0.06;
        a.x += Math.cos(a.heading) * a.speed;
        a.y += Math.sin(a.heading) * a.speed;
        if (dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) < 200) {
          a.status = "breached"; b.pBreaches++;
          const breachCost = Math.max(100000, (a.cost || 500000) * 2);
          b.pBreachDmg = (b.pBreachDmg || 0) + breachCost;
          b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "breach" });
          b.flashes.push({ x: a.x, y: a.y - 100, time: b.step, wallTime: performance.now(), type: "dmgtext", text: `-$${breachCost >= 1e6 ? (breachCost / 1e6).toFixed(1) + "M" : (breachCost / 1e3).toFixed(0) + "K"}`, color: "#ff5555" });
          if (b.pBreaches > (b.pOverwhelmThreshold || 8) && !b.enemyOverwhelmDeclared) {
            b.enemyOverwhelmDeclared = true;
            const go = { winnerRole: gameMode === "host" ? "host" : "player", winner: username, reason: "Enemy HQ overwhelmed" };
            setGameOver(go);
            setDamagePopup({ text: "ENEMY HQ DESTROYED", color: "#4caf50" });
            setTimeout(() => setDamagePopup(null), 3000);
            playSfx("hq_destroyed", 0);
            playSfx("victory", 0);
            shakeMap(15, 12);
          }
        }
      }

      // Track airspace breaches (enemy entering player airspace) with arc breaks
      for (const a of b.aAttackers) {
        if (a.status !== "active" || a.enteredAirspace) continue;
        if (playerHQ && dist(a, playerHQ) < playerAirspace) {
          a.enteredAirspace = true;
          b.airspaceCost = (b.airspaceCost || 0) + AIRSPACE_BREACH_COST;
          const angle = Math.atan2(a.y - playerHQ.y, a.x - playerHQ.x);
          b.playerAirBreaches.push(angle);
          // Popup at the drone's position where it crossed
          b.flashes.push({ x: a.x, y: a.y, time: b.step, type: "dmgtext", text: "-$" + AIRSPACE_BREACH_COST, color: "#ff9800" });
          // Small breach flash on the border
          b.flashes.push({ x: playerHQ.x + Math.cos(angle) * playerAirspace, y: playerHQ.y + Math.sin(angle) * playerAirspace, time: b.step, type: "breach" });
        }
      }
      // Track player drones entering AI airspace
      for (const a of b.pAttackers) {
        if (a.status !== "active" || a.enteredAirspace) continue;
        if (dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) < aiSetup.airspace) {
          a.enteredAirspace = true;
          b.aiAirspaceCost = (b.aiAirspaceCost || 0) + AIRSPACE_BREACH_COST;
          const angle = Math.atan2(a.y - aiSetup.hqY, a.x - aiSetup.hqX);
          b.aiAirBreaches.push(angle);
          // Popup at the drone's position
          b.flashes.push({ x: a.x, y: a.y, time: b.step, type: "dmgtext", text: "-$" + AIRSPACE_BREACH_COST, color: "#ff9800" });
        }
      }

      // Player interceptors chase AI attackers (posture-aware)
      for (const int of b.pInts) {
        if (int.status !== "active") continue;
        // Posture check: filter targets based on posture
        let activeA = b.aAttackers.filter((a) => a.status === "active");
        if (defPosture === "defensive") {
          // Only engage targets inside player airspace
          activeA = activeA.filter((a) => playerHQ && dist(a, playerHQ) < playerAirspace);
        } else if (defPosture === "pursuing") {
          // Chase but don't enter enemy airspace circle
          activeA = activeA.filter((a) => dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) > aiSetup.airspace);
        }
        // "insane" = no filter, chase anywhere
        let tgt = activeA.find((a) => a.id === int.targetId);
        if (!tgt) { let best = null, bd = Infinity; for (const a of activeA) { const d2 = dist(int, a); if (d2 < bd) { bd = d2; best = a; } } if (best) { int.targetId = best.id; tgt = best; } }
        if (tgt) {
          int.heading = Math.atan2(tgt.y - int.y, tgt.x - int.x);
          const nx = int.x + Math.cos(int.heading) * int.speed;
          const ny = int.y + Math.sin(int.heading) * int.speed;
          // Posture boundary check before moving
          if (defPosture === "pursuing" && dist({ x: nx, y: ny }, { x: aiSetup.hqX, y: aiSetup.hqY }) < aiSetup.airspace) {
            int.targetId = null; // give up this target
          } else if (defPosture === "defensive" && playerHQ && dist({ x: nx, y: ny }, playerHQ) > playerAirspace) {
            int.targetId = null;
          } else {
            int.x = nx; int.y = ny;
            if (dist(int, tgt) < KILL_RADIUS) {
              tgt.status = "destroyed"; b.aKills++; int.targetId = null;
              b.flashes.push({ x: tgt.x, y: tgt.y, time: b.step, type: "kill" });
              if (int.destroyOnKill) int.status = "expended";
              else if (Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
            }
          }
        }
      }
      // AI interceptors chase player attackers
      for (const int of b.aInts) {
        if (int.status !== "active") continue;
        const activeA = b.pAttackers.filter((a) => a.status === "active");
        let tgt = activeA.find((a) => a.id === int.targetId);
        if (!tgt) { let best = null, bd = Infinity; for (const a of activeA) { const d2 = dist(int, a); if (d2 < bd) { bd = d2; best = a; } } if (best) { int.targetId = best.id; tgt = best; } }
        if (tgt) {
          int.heading = Math.atan2(tgt.y - int.y, tgt.x - int.x);
          int.x += Math.cos(int.heading) * int.speed;
          int.y += Math.sin(int.heading) * int.speed;
          if (dist(int, tgt) < KILL_RADIUS) {
            tgt.status = "destroyed"; b.pKills++; int.targetId = null;
            b.flashes.push({ x: tgt.x, y: tgt.y, time: b.step, type: "kill" });
            if (int.destroyOnKill) int.status = "expended";
            else if (Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
          }
        }
      }

      // AD units fire with reload cooldown.
      // Target priority: enemy attackers first (existential threat), then enemy interceptors (air-to-air).
      // Player AD targets enemy attackers + enemy interceptors
      for (const ad of b.pAD) {
        if (ad.health <= 0 || ad.ammo <= 0) continue;
        const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        if (!sys) continue;
        const cooldown = Math.max(3, Math.round(sys.engageRate * 5));
        if (ad.lastFired && b.step - ad.lastFired < cooldown) continue;
        let target = null;
        for (const a of b.aAttackers) {
          if (a.status !== "active") continue;
          if (dist(ad, a) < sys.range) { target = a; break; }
        }
        if (!target) {
          for (const i of b.aInts) {
            if (i.status !== "active") continue;
            if (dist(ad, i) < sys.range) { target = i; break; }
          }
        }
        if (target) {
          ad.ammo--; ad.lastFired = b.step;
          b.flashes.push({ x: ad.x, y: ad.y, x2: target.x, y2: target.y, time: b.step, wallTime: performance.now(), type: "adshot", color: sys.color });
          playSfx("ad_fire", 50);
          if (Math.random() < sys.pk) {
            target.status = "destroyed";
            b.aKills++;
            b.flashes.push({ x: target.x, y: target.y, time: b.step, wallTime: performance.now(), type: "kill" });
            playSfx("drone_kill", 60);
          }
        }
      }
      // Enemy AD targets player attackers + player interceptors
      for (const ad of b.aAD) {
        if (ad.health <= 0 || ad.ammo <= 0) continue;
        const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
        if (!sys) continue;
        const cooldown = Math.max(3, Math.round(sys.engageRate * 5));
        if (ad.lastFired && b.step - ad.lastFired < cooldown) continue;
        let target = null;
        for (const a of b.pAttackers) {
          if (a.status !== "active") continue;
          if (dist(ad, a) < sys.range) { target = a; break; }
        }
        if (!target) {
          for (const i of b.pInts) {
            if (i.status !== "active") continue;
            if (dist(ad, i) < sys.range) { target = i; break; }
          }
        }
        if (target) {
          ad.ammo--; ad.lastFired = b.step;
          b.flashes.push({ x: ad.x, y: ad.y, x2: target.x, y2: target.y, time: b.step, type: "adshot", color: sys.color });
          if (Math.random() < sys.pk) {
            target.status = "destroyed";
            b.pKills++;
            b.flashes.push({ x: target.x, y: target.y, time: b.step, type: "kill" });
          }
        }
      }

      } // end speed loop

      // Phase 3: host streams combat snapshots to guest at 10Hz (wall-clock, not step-based,
      // so high-speedup modes don't accidentally fire 60+ snapshots/sec)
      if (gameModeRef.current === "host") {
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        if (!b.lastSnapshotTs || now - b.lastSnapshotTs >= 100) {
          b.lastSnapshotTs = now;
          broadcast(serializeBattleSnapshot(b));
        }
      }

      // Draw battle - distinct visuals per drone type
      const L = LRef.current; const bl = battleLayerRef.current;
      if (L && bl) {
        bl.clearLayers();
        const th = THEATERS[theaterRef.current]; const toLL = (x, y) => simToLatLng(x, y, th.bounds);
        const mpu = getProjection(th.bounds).mpu;
        // AD range circles during battle (toggleable)
        if (showADRangeRef.current) {
          for (const ad of b.pAD) {
            if (ad.health <= 0) continue;
            const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
            if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.06, weight: 1.5, opacity: 0.4, dashArray: "6 4", interactive: false }).addTo(bl);
          }
          for (const ad of b.aAD) {
            if (ad.health <= 0) continue;
            const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
            if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.04, weight: 1.5, opacity: 0.3, dashArray: "6 4", interactive: false }).addTo(bl);
          }
        }
        // AD unit markers - drawn prominently so you can see the source of tracers
        for (const ad of b.pAD) {
          const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
          if (!sys) continue;
          const alive = ad.health > 0;
          // Outer ring (square-ish look via large weight)
          L.circleMarker(toLL(ad.x, ad.y), { radius: 9, color: alive ? "#ffffff" : "#222", fillColor: alive ? sys.color : "#1a1a1a", fillOpacity: alive ? 0.95 : 0.3, weight: 2.5 }).addTo(bl);
          // Inner crosshair dot
          L.circleMarker(toLL(ad.x, ad.y), { radius: 2, color: "#ffffff", fillColor: "#ffffff", fillOpacity: alive ? 1 : 0.3, weight: 0 }).addTo(bl);
          // Ammo indicator label
          if (alive) {
            L.marker(toLL(ad.x, ad.y - 180), {
              icon: L.divIcon({ className: "", iconSize: [60, 14], iconAnchor: [30, 7],
                html: `<div style="color:${sys.color};font-size:9px;font-weight:700;font-family:monospace;text-align:center;text-shadow:0 0 4px #000;white-space:nowrap">${sys.name.split(" ")[0]} ${ad.ammo}</div>` }),
              interactive: false,
            }).addTo(bl);
          }
        }
        for (const ad of b.aAD) {
          const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
          if (!sys) continue;
          const alive = ad.health > 0;
          L.circleMarker(toLL(ad.x, ad.y), { radius: 9, color: alive ? "#ff7777" : "#222", fillColor: alive ? "#cc4444" : "#1a1a1a", fillOpacity: alive ? 0.95 : 0.3, weight: 2.5 }).addTo(bl);
          L.circleMarker(toLL(ad.x, ad.y), { radius: 2, color: "#ffffff", fillColor: "#ffffff", fillOpacity: alive ? 1 : 0.3, weight: 0 }).addTo(bl);
          if (alive) {
            L.marker(toLL(ad.x, ad.y - 180), {
              icon: L.divIcon({ className: "", iconSize: [60, 14], iconAnchor: [30, 7],
                html: `<div style="color:#ff7777;font-size:9px;font-weight:700;font-family:monospace;text-align:center;text-shadow:0 0 4px #000;white-space:nowrap">${sys.name.split(" ")[0]} ${ad.ammo}</div>` }),
              interactive: false,
            }).addTo(bl);
          }
        }

        // Enemy attack drones
        for (const a of b.aAttackers) { if (a.status === "active") L.circleMarker(toLL(a.x, a.y), { radius: 3, color: "#ff4444", fillColor: "#ff4444", fillOpacity: 0.9, weight: 0 }).addTo(bl); }
        // Your attack drones: cyan small (heading north->south)
        for (const a of b.pAttackers) { if (a.status === "active") L.circleMarker(toLL(a.x, a.y), { radius: 3, color: "#00ddff", fillColor: "#00ddff", fillOpacity: 0.9, weight: 0 }).addTo(bl); }
        // Your interceptors: blue with white border (active), dimmer when returning/landed
        for (const i of b.pInts) {
          if (i.status === "active") L.circleMarker(toLL(i.x, i.y), { radius: 5, color: "#ffffff", fillColor: "#4a9eff", fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
          else if (i.status === "landed") L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#336699", fillColor: "#336699", fillOpacity: 0.5, weight: 1 }).addTo(bl);
        }
        // Enemy interceptors
        for (const i of b.aInts) {
          if (i.status === "active") L.circleMarker(toLL(i.x, i.y), { radius: 5, color: "#880000", fillColor: "#ff5555", fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
          else if (i.status === "landed") L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#663333", fillColor: "#663333", fillOpacity: 0.5, weight: 1 }).addTo(bl);
        }
        // Kill, breach, and AD shot flashes
        b.flashes = b.flashes.filter((f) => b.step - f.time < (f.type === "dmgtext" ? 120 : 30));
        for (const f of b.flashes) {
          const age = b.step - f.time;
          const maxAge = f.type === "dmgtext" ? 120 : 30;
          const p = age / maxAge;
          const ll = toLL(f.x, f.y);
          if (f.type === "adshot") {
            // Bright tracer line from AD to target
            if (age < 20) {
              const ll2 = toLL(f.x2, f.y2);
              const fade = 1 - age / 20;
              // Outer glow
              L.polyline([ll, ll2], { color: "#ffffff", weight: 4, opacity: fade * 0.3, interactive: false }).addTo(bl);
              // Core tracer
              L.polyline([ll, ll2], { color: f.color || "#ffaa00", weight: 2, opacity: fade * 0.9, interactive: false }).addTo(bl);
              // Muzzle flash at AD
              L.circleMarker(ll, { radius: 4 * fade, color: "#ffffff", fillColor: "#ffffff", fillOpacity: fade * 0.6, weight: 0 }).addTo(bl);
              // Impact at target
              L.circleMarker(ll2, { radius: 4 * fade, color: f.color || "#ffaa00", fillColor: f.color || "#ffaa00", fillOpacity: fade * 0.8, weight: 0 }).addTo(bl);
            }
          } else if (f.type === "dmgtext") {
            // Floating damage text that drifts up slowly
            const drift = age * 3;
            const driftLL = toLL(f.x, f.y + drift);
            L.marker(driftLL, {
              icon: L.divIcon({ className: "", iconSize: [80, 16], iconAnchor: [40, 8],
                html: `<div style="color:${f.color || "#ff5555"};font-size:12px;font-weight:800;font-family:monospace;text-align:center;text-shadow:0 0 6px #000;opacity:${1 - p}">${f.text}</div>` }),
              interactive: false,
            }).addTo(bl);
          } else if (f.type === "kill") {
            L.circleMarker(ll, { radius: 5 + p * 12, color: "#ff8800", fillColor: "#ff8800", fillOpacity: (1 - p) * 0.5, weight: 1.5, opacity: 1 - p }).addTo(bl);
          } else if (f.type === "breach") {
            L.circleMarker(ll, { radius: 6 + p * 10, color: "#ff0000", fillColor: "#ff0000", fillOpacity: (1 - p) * 0.6, weight: 2, opacity: 1 - p }).addTo(bl);
          }
        }
      }

      setBattleDrones({ playerAttackers: [...b.pAttackers], aiAttackers: [...b.aAttackers], playerInts: [...b.pInts], aiInts: [...b.aInts] });

      // RTB phase: interceptors only RTB when ALL attackers on BOTH sides are gone
      const aAtk = b.aAttackers.filter((a) => a.status === "active").length;
      const pAtk = b.pAttackers.filter((a) => a.status === "active").length;
      const allAttackersGone = aAtk === 0 && pAtk === 0;

      if (allAttackersGone) {
        // Instant RTB - no animation, drones snap home and land immediately.
        // Animation was pointless filler since combat is over.
        for (const int of b.pInts) {
          if (int.status !== "active") continue;
          int.x = int.spawnX; int.y = int.spawnY; int.status = "landed"; int.targetId = null;
        }
        for (const int of b.aInts) {
          if (int.status !== "active") continue;
          int.x = int.spawnX; int.y = int.spawnY; int.status = "landed"; int.targetId = null;
        }
      }

      // Check if battle is over: all attackers gone AND all interceptors landed/expended
      const pIntsActive = b.pInts.filter((i) => i.status === "active").length;
      const aIntsActive = b.aInts.filter((i) => i.status === "active").length;
      const allDone = allAttackersGone && pIntsActive === 0 && aIntsActive === 0;
      if ((allDone && b.step > 100) || b.step > 30000) {
        // Battle ended
        const endLog = [];
        endLog.push(`Battle ${round + 1} done: You killed ${b.aKills}, lost ${b.pBreaches} breaches | AI killed ${b.pKills}, lost ${b.aBreaches} breaches`);

        // Apply breach damage (per audit fix #3: cost-scaled, accumulated during sim)
        let pDmg = 0, aDmg = 0;
        // C2 fix: collect all gameOver candidates locally so they're broadcast to guest
        let earlyGameOver = null;
        if (b.aBreaches > 0) {
          pDmg = b.aBreachDmg || (b.aBreaches * 500000); // use accumulated damage
          for (let i = 0; i < Math.min(b.aBreaches, 3); i++) {
            const alive = playerResources.filter((r) => r.alive);
            if (alive.length > 0 && Math.random() < 0.35) {
              const t2 = alive[Math.floor(Math.random() * alive.length)];
              t2.alive = false; const res = RESOURCES.find((rr) => rr.key === t2.key);
              pDmg += res?.breachDmg || 5000000;
              endLog.push(`Your ${res?.name} destroyed!`);
            }
          }
          if (b.aBreaches > (b.aOverwhelmThreshold || 8)) { earlyGameOver = { winnerRole: gameMode === "host" ? "guest" : "ai", winner: opponentName, reason: "HQ overwhelmed" }; endLog.push("YOUR HQ DESTROYED!"); }
        }
        if (b.pBreaches > 0) {
          aDmg = b.pBreachDmg || (b.pBreaches * 500000);
          for (let i = 0; i < Math.min(b.pBreaches, 3); i++) {
            const alive = aiSetup.resources.filter((r) => r.alive);
            if (alive.length > 0 && Math.random() < 0.35) {
              const t2 = alive[Math.floor(Math.random() * alive.length)];
              t2.alive = false;
              const res = RESOURCES.find((rr) => rr.key === t2.key);
              aDmg += res?.breachDmg || 5000000;
              endLog.push(`Enemy ${res?.name} destroyed!`);
            }
          }
          if (b.pBreaches > (b.pOverwhelmThreshold || 8)) { earlyGameOver = { winnerRole: gameMode === "host" ? "host" : "player", winner: username, reason: "Enemy HQ overwhelmed" }; endLog.push("ENEMY HQ DESTROYED!"); }
        }
        if (earlyGameOver) setGameOver(earlyGameOver);

        const pAirCost = b.airspaceCost || 0;
        const aAirCost = b.aiAirspaceCost || 0;
        if (pAirCost > 0) endLog.push(`Airspace breach cost: $${formatUSD(pAirCost)}`);
        if (aAirCost > 0) endLog.push(`Enemy airspace breach cost: $${formatUSD(aAirCost)}`);
        const totalPLoss = pDmg + pAirCost;
        const totalALoss = aDmg + aAirCost;
        setPlayerBudget((p) => p - totalPLoss);
        setAiBudget((p) => p - totalALoss);
        if (totalPLoss > 0) {
          setDamagePopup({ text: `-$${formatUSD(totalPLoss)}`, color: "#ff5555" });
          setTimeout(() => setDamagePopup(null), 2500);
        }

        // Update surviving interceptors
        setPlayerInterceptors((prev) => prev.map((d) => {
          const surviving = b.pInts.filter((i) => (i.status === "active" || i.status === "landed") && dist(i, d) < 1500).length;
          return { ...d, count: Math.max(0, surviving) };
        }));
        aiSetup.interceptors = b.aInts.filter((i) => i.status === "active");

        // Persist AD damage between rounds: destroyed ADs stay destroyed, ammo carries over.
        // Match by position since the battle copies are separate references from the originals.
        setPlayerAD((prev) => prev.map((ad) => {
          const battleAd = b.pAD.find((ba) => ba.x === ad.x && ba.y === ad.y && ba.key === ad.key);
          if (!battleAd) return ad;
          return { ...ad, health: battleAd.health, ammo: battleAd.ammo };
        }).filter((ad) => ad.health > 0));
        // Mirror for AI's AD systems
        if (aiSetup && Array.isArray(aiSetup.adUnits)) {
          aiSetup.adUnits = aiSetup.adUnits.map((ad) => {
            const battleAd = b.aAD.find((ba) => ba.x === ad.x && ba.y === ad.y && ba.key === ad.key);
            if (!battleAd) return ad;
            return { ...ad, health: battleAd.health, ammo: battleAd.ammo };
          }).filter((ad) => ad.health > 0);
        }

        // Arms factory bonus
        for (const r of playerResources) {
          if (r.alive && r.key === "arms") {
            setPlayerInterceptors((prev) => prev.length > 0 ? prev.map((d, i) => i === 0 ? { ...d, count: d.count + 2 } : d) : prev);
          }
        }

        setCombatLog((prev) => [...prev, ...endLog]);
        setCurrentRound(round + 1);
        setBattleActive(false);
        if (battleLayerRef.current) battleLayerRef.current.clearLayers();

        // Game over if either budget goes below -$50M
        let endGameOver = earlyGameOver;
        if (!gameOver && !endGameOver) {
          const pFinal = playerBudget - pDmg - pAirCost;
          const aFinal = aiBudget - aDmg - aAirCost;
          if (pFinal < -50000000) endGameOver = { winnerRole: gameMode === "host" ? "guest" : "ai", winner: opponentName, reason: "You went bankrupt" };
          else if (aFinal < -50000000) endGameOver = { winnerRole: gameMode === "host" ? "host" : "player", winner: username, reason: "Enemy went bankrupt" };
          if (endGameOver) setGameOver(endGameOver);
        }

        // Phase 3: host broadcasts the round-end results to guest
        if (gameModeRef.current === "host") {
          // Send a final snapshot so guest sees the last frame, then results
          broadcast(serializeBattleSnapshot(b));
          // C3 fix: send guest's surviving resources and interceptor counts (host's view of "ai" side)
          // The host's aiSetup.resources/interceptors have been mutated by the sim. Translate to a
          // playerResources/playerInterceptors-shaped payload so guest can apply directly.
          const aResourcesAfter = (aiSetup.resources || []).map((r) => ({ key: r.key, x: r.x, y: r.y, alive: r.alive, depositId: r.depositId }));
          // Group surviving aInts back into the per-group structure the guest knows about.
          // Each guest interceptor placement created a group at (groupX, groupY). Recount survivors per group.
          const groupCounts = new Map();
          for (const i of (b.aInts || [])) {
            if (i.status !== "active" && i.status !== "landed") continue;
            const key = `${i.groupX || i.spawnX},${i.groupY || i.spawnY}`;
            groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
          }
          // Reconstruct via the guest's existing playerInterceptors order is impossible from host side,
          // so just send the groups as fresh entries. Guest will replace its full list.
          const aInterceptorsAfter = [];
          for (const [key, count] of groupCounts.entries()) {
            const [gx, gy] = key.split(",").map(Number);
            // Look up the original key (kamikaze/armed) by finding any aInt at this group
            const sample = (b.aInts || []).find((i) => (i.groupX === gx && i.groupY === gy));
            const intKey = sample?.destroyOnKill ? "kamikaze" : "armed";
            aInterceptorsAfter.push({ key: intKey, x: gx, y: gy, count });
          }
          broadcast({
            type: "round_end",
            round,
            pKills: b.pKills, aKills: b.aKills,
            pBreaches: b.pBreaches, aBreaches: b.aBreaches,
            pDmg, aDmg, pAirCost, aAirCost,
            pBudgetDelta: -(pDmg + pAirCost),
            aBudgetDelta: -(aDmg + aAirCost),
            aResourcesAfter,
            aInterceptorsAfter,
            endLog,
            gameOver: endGameOver,
          });
        }
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
  }, [playerHQ, playerExtraHQs, aiSetup, currentRound, playerResources, playerInterceptors, playerAD, playerAttack, playerTrajectory, playerBudget, aiBudget, gameOver, battleActive, username, opponentName, attackPriority, defPosture, playerAirspace, gameMode, broadcast, serializeBattleSnapshot]);

  // Wire forward ref so the per-turn timer effect can call into us without a TDZ issue
  launchRoundRef.current = launchRound;

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  // ── Auto-clamp playerAirspace so it can never overlap enemy airspace ──
  // Triggered whenever playerHQ or aiSetup changes (e.g. HQ placed, enemy setup arrives).
  useEffect(() => {
    if (!playerHQ || !aiSetup) return;
    const enemyDist = dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY });
    const maxSafe = Math.floor(enemyDist - (aiSetup.airspace || 2500) - 400);
    if (maxSafe < 1000) return; // HQ placement validation should have prevented this
    if (playerAirspace > maxSafe) setPlayerAirspace(maxSafe);
  }, [playerHQ, aiSetup, playerAirspace]);

  // ── Audit fix #4: grant free starting kamikaze interceptors after HQ placement ──
  // Player gets 10 free kamikazes positioned just south of their HQ so round 1 isn't an auto-loss.
  // Only fires once per match (when going from no HQ → HQ placed and no interceptors yet).
  const startingDronesGrantedRef = useRef(false);
  useEffect(() => {
    if (!playerHQ || phase === PHASE.LOBBY) return;
    if (startingDronesGrantedRef.current) return;
    if (playerInterceptors.length > 0) { startingDronesGrantedRef.current = true; return; }
    startingDronesGrantedRef.current = true;
    setPlayerInterceptors([{ key: "kamikaze", x: playerHQ.x, y: playerHQ.y + 600, count: 10 }]);
  }, [playerHQ, phase, playerInterceptors.length]);
  // Reset the grant flag when match resets
  useEffect(() => {
    if (phase === PHASE.LOBBY) startingDronesGrantedRef.current = false;
  }, [phase]);

  // ── Per-turn timer: counts down between rounds, auto-launches on 0 ──
  // Active only when in COMBAT phase, not battling, no game over.
  // Guest doesn't auto-launch (host controls round flow); guest's timer is informational.
  useEffect(() => {
    if (turnTimerRef.current) { clearInterval(turnTimerRef.current); turnTimerRef.current = null; }
    if (phase !== PHASE.COMBAT || battleActive || gameOver) return;
    setTurnTimer(TURN_TIMER_SECONDS);
    turnTimerRef.current = setInterval(() => {
      setTurnTimer((t) => {
        if (t <= 1) {
          // Time's up - auto-launch (host or bot only; guest waits for host)
          if (turnTimerRef.current) { clearInterval(turnTimerRef.current); turnTimerRef.current = null; }
          if (gameModeRef.current !== "guest" && launchRoundRef.current) {
            try { launchRoundRef.current(); } catch {}
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (turnTimerRef.current) { clearInterval(turnTimerRef.current); turnTimerRef.current = null; } };
  }, [phase, battleActive, gameOver, currentRound]);

  const inputStyle = { padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13 };
  const btnStyle = { padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "2px solid" };

  return (
    <>
      <Head>
        <title>Swarm 1v1 - Shiv Gupta</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </Head>
      <Script
        src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"
        strategy="afterInteractive"
        onLoad={() => setPeerLoaded(true)}
        onError={() => setConnectionError("Failed to load network library - reload the page")}
      />
      <style jsx global>{`
        .leaflet-container { background: #0a0a0f; }
        /* Per visuals audit: dim ONLY the satellite tile layer so unit colors pop.
           Markers, popups, range circles, and SVG overlays render on separate panes
           and stay at full brightness. */
        .leaflet-tile-pane { filter: brightness(0.65) contrast(1.05) saturate(0.7); }
        @keyframes fadeUp { 0% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; transform: translate(-50%, -120%); } }
      `}</style>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/projects/swarm-interception" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>&larr; Simulation</Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#ff6688", letterSpacing: 0.5, margin: 0 }}>SWARM 1v1</h1>
          </div>
          {phase !== PHASE.LOBBY && phase !== PHASE.MATCHMAKING && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11 }}>
              <span style={{ color: "#4a9eff" }}>{username}: ${formatUSD(Math.max(0, playerBudget))}</span>
              <span style={{ color: "#666" }}>vs</span>
              <span style={{ color: "#ff5555" }}>{opponentName}: ${formatUSD(Math.max(0, aiBudget))}</span>
              {phase === PHASE.COMBAT && <span style={{ color: "#888" }}>Round {currentRound}</span>}
            </div>
          )}
        </div>

        {/* Lobby */}
        {phase === PHASE.LOBBY && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 420, width: "100%", padding: 16 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#ff6688", marginBottom: 8 }}>SWARM 1v1</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>Defend your base. Destroy theirs.</div>

              {lobbyView === "main" && (
                <>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter callsign..."
                    style={{ ...inputStyle, width: "100%", fontSize: 16, textAlign: "center", marginBottom: 12 }}
                    onKeyDown={(e) => e.key === "Enter" && findMatch()} />
                  <select value={theater} onChange={(e) => setTheater(e.target.value)}
                    style={{ ...inputStyle, width: "100%", marginBottom: 16 }}>
                    {Object.entries(THEATERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>

                  <button onClick={findMatch} disabled={!username.trim()}
                    style={{ ...btnStyle, width: "100%", marginBottom: 8, background: username.trim() ? "#1a2a4a" : "#1a1a24", borderColor: username.trim() ? "#4a9eff" : "#333", color: username.trim() ? "#4a9eff" : "#555" }}>
                    Play vs Bot
                  </button>

                  <button onClick={createRoom} disabled={!username.trim() || !peerLoaded}
                    style={{ ...btnStyle, width: "100%", marginBottom: 8, background: username.trim() && peerLoaded ? "#4a1a2a" : "#1a1a24", borderColor: username.trim() && peerLoaded ? "#ff6688" : "#333", color: username.trim() && peerLoaded ? "#ff6688" : "#555" }}>
                    Create Room
                  </button>

                  <button onClick={() => { setLobbyView("join"); setConnectionError(""); }} disabled={!username.trim() || !peerLoaded}
                    style={{ ...btnStyle, width: "100%", marginBottom: 8, background: username.trim() && peerLoaded ? "#2a1a4a" : "#1a1a24", borderColor: username.trim() && peerLoaded ? "#aa88ff" : "#333", color: username.trim() && peerLoaded ? "#aa88ff" : "#555" }}>
                    Join Room
                  </button>

                  <button onClick={findOnlineMatch} disabled={!username.trim() || !peerLoaded}
                    style={{ ...btnStyle, width: "100%", background: username.trim() && peerLoaded ? "#1a4a2a" : "#1a1a24", borderColor: username.trim() && peerLoaded ? "#4caf50" : "#333", color: username.trim() && peerLoaded ? "#4caf50" : "#555" }}>
                    Find Match (random)
                  </button>

                  {!peerLoaded && (
                    <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>Loading network library...</div>
                  )}
                </>
              )}

              {lobbyView === "create" && (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Your Room Code</div>
                  <div style={{ fontSize: 56, fontWeight: 800, color: "#ff6688", marginBottom: 4, fontFamily: "monospace", letterSpacing: 6, userSelect: "all" }}>
                    {roomCode || "....."}
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 16 }}>Share this code with your friend</div>
                  <button onClick={() => {
                    if (!roomCode) return;
                    try {
                      const p = navigator.clipboard?.writeText(roomCode);
                      if (p && typeof p.then === "function") {
                        p.then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
                      } else {
                        setCopied(true); setTimeout(() => setCopied(false), 1500);
                      }
                    } catch {}
                  }}
                    style={{ ...inputStyle, width: "100%", marginBottom: 12, cursor: "pointer", textAlign: "center", fontSize: 12, color: copied ? "#4caf50" : undefined }}>
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                  <div style={{ fontSize: 12, color: connectionStatus === "connected" ? "#4caf50" : connectionStatus === "error" ? "#ff5555" : "#ff9800", marginBottom: 16, padding: 12, background: "rgba(255,152,0,0.08)", border: "1px solid rgba(255,152,0,0.25)", borderRadius: 6 }}>
                    {connectionStatus === "creating" && "Initializing..."}
                    {connectionStatus === "waiting" && "Waiting for opponent to join..."}
                    {connectionStatus === "connected" && "Connected. Loading match..."}
                    {connectionStatus === "error" && `Error: ${connectionError}`}
                  </div>
                  <button onClick={cancelConnection}
                    style={{ ...inputStyle, width: "100%", cursor: "pointer", textAlign: "center", fontSize: 12, color: "#888" }}>
                    Cancel
                  </button>
                </>
              )}

              {lobbyView === "join" && (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Enter Room Code</div>
                  <input value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 5))}
                    placeholder="ABCDE" maxLength={5}
                    onKeyDown={(e) => { if (e.key === "Enter" && joinCode.length === 5) joinRoom(); }}
                    style={{ ...inputStyle, width: "100%", fontSize: 32, textAlign: "center", letterSpacing: 8, fontFamily: "monospace", marginBottom: 12, padding: "16px 12px" }} />
                  <button onClick={joinRoom} disabled={joinCode.length !== 5 || connectionStatus === "connecting"}
                    style={{ ...btnStyle, width: "100%", marginBottom: 8, background: joinCode.length === 5 && connectionStatus !== "connecting" ? "#2a1a4a" : "#1a1a24", borderColor: joinCode.length === 5 && connectionStatus !== "connecting" ? "#aa88ff" : "#333", color: joinCode.length === 5 && connectionStatus !== "connecting" ? "#aa88ff" : "#555" }}>
                    {connectionStatus === "connecting" ? "Connecting..." : connectionStatus === "connected" ? "Connected" : "Join"}
                  </button>
                  {connectionStatus === "error" && (
                    <div style={{ fontSize: 11, color: "#ff5555", marginBottom: 8 }}>{connectionError}</div>
                  )}
                  <button onClick={cancelConnection}
                    style={{ ...inputStyle, width: "100%", cursor: "pointer", textAlign: "center", fontSize: 12, color: "#888" }}>
                    Back
                  </button>
                </>
              )}

              {lobbyView === "matchmaking" && (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Finding Opponent</div>
                  <div style={{ fontSize: 56, marginBottom: 16, color: "#4caf50" }}>
                    {connectionStatus === "error" ? "✕" : "⟳"}
                  </div>
                  <div style={{ fontSize: 12, color: connectionStatus === "connected" ? "#4caf50" : connectionStatus === "error" ? "#ff5555" : "#4caf50", marginBottom: 16, padding: 12, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.25)", borderRadius: 6 }}>
                    {connectionStatus === "creating" && "Initializing..."}
                    {connectionStatus === "waiting" && "Waiting for an opponent..."}
                    {connectionStatus === "connecting" && "Opponent found! Connecting..."}
                    {connectionStatus === "connected" && "Connected. Loading match..."}
                    {connectionStatus === "error" && (connectionError || "Error")}
                  </div>
                  <button onClick={() => { cancelMatchmaking(); cancelConnection(); }}
                    style={{ ...inputStyle, width: "100%", cursor: "pointer", textAlign: "center", fontSize: 12, color: "#888" }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Matchmaking */}
        {phase === PHASE.MATCHMAKING && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, color: "#ff6688", marginBottom: 16 }}>DEPLOYING TO {THEATERS[theater]?.name.toUpperCase()}...</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#ff6688" }}>{matchTimer}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 16 }}>{matchTimer >= 2 ? `Opponent: ${opponentName}` : "Initializing..."}</div>
            </div>
          </div>
        )}

        {/* Setup + Combat */}
        {(phase === PHASE.SETUP || phase === PHASE.COMBAT) && (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>

              {phase === PHASE.SETUP && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff6688", marginBottom: 8 }}>Setup Phase</div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Place HQ anywhere on the map, add resources, defenses, ground AD, then design your attack wave.</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 8, transition: "transform 0.1s", transform: budgetShake ? `translateX(${Math.random() > 0.5 ? 4 : -4}px)` : "none" }}>
                    Budget: <span style={{ color: remaining >= 0 ? "#4caf50" : "#ff5555", fontWeight: 600 }}>${formatUSD(Math.max(0, remaining))}</span>
                    <span style={{ color: "#555", fontSize: 9 }}> / ${formatUSD(playerBudget)}</span>
                  </div>

                  <button onClick={() => setPlacingWhat("hq")} disabled={!!playerHQ}
                    style={{ ...inputStyle, width: "100%", marginBottom: 6, cursor: playerHQ ? "not-allowed" : "pointer", opacity: playerHQ ? 0.4 : 1, textAlign: "center", fontSize: 11, border: placingWhat === "hq" ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                    {playerHQ ? "HQ Placed" : placingWhat === "hq" ? "Click on map..." : "Place HQ"}
                  </button>

                  {playerHQ && playerExtraHQs.length < 2 && (
                    <button onClick={() => setPlacingWhat(placingWhat === "extra_hq" ? null : "extra_hq")}
                      style={{ ...inputStyle, width: "100%", marginBottom: 6, cursor: "pointer", textAlign: "center", fontSize: 10,
                        border: placingWhat === "extra_hq" ? "1px solid #4a9eff" : "1px solid #2a2a35",
                        color: placingWhat === "extra_hq" ? "#4a9eff" : "#888" }}>
                      {placingWhat === "extra_hq"
                        ? `Click map (${formatUSD(EXTRA_HQ_COSTS[playerExtraHQs.length])})...`
                        : `+ Add HQ #${playerExtraHQs.length + 2} ($${formatUSD(EXTRA_HQ_COSTS[playerExtraHQs.length])})`}
                    </button>
                  )}
                  {playerHQ && playerExtraHQs.length > 0 && (
                    <div style={{ fontSize: 9, color: "#666", marginBottom: 6 }}>
                      Extra HQs: {playerExtraHQs.length} (each adds 60% airspace coverage at its location)
                    </div>
                  )}

                  {playerHQ && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: "#888" }}>Airspace:</span>
                        <input type="range" min="1000" max={playerHQ && aiSetup ? Math.max(1000, Math.floor(dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY }) - aiSetup.airspace - 400)) : 4000} step="200" value={playerAirspace} onChange={(e) => setPlayerAirspace(parseInt(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: "#4a9eff" }}>{playerAirspace}m</span>
                      </div>
                      {(() => {
                        const airIncome = Math.floor(playerAirspace * 200);
                        const resIncome = playerResources.filter((r) => r.alive).reduce((s, r) => { const res = RESOURCES.find((rr) => rr.key === r.key); return s + (res?.income || 0); }, 0);
                        const totalIncome = airIncome + resIncome;
                        const armsCount = playerResources.filter((r) => r.alive && r.key === "arms").length;
                        return (
                          <div style={{ fontSize: 9, color: "#666", marginBottom: 8 }}>
                            <div>Airspace income: <span style={{ color: "#4a9eff" }}>${formatUSD(airIncome)}/rnd</span></div>
                            {resIncome > 0 && <div>Resource income: <span style={{ color: "#cc8800" }}>${formatUSD(resIncome)}/rnd</span></div>}
                            <div>Total: <span style={{ color: "#4caf50", fontWeight: 600 }}>${formatUSD(totalIncome)}/rnd</span>
                            {armsCount > 0 && <span style={{ color: "#8888cc" }}> + {armsCount * 2} drones</span>}</div>
                            <div style={{ marginTop: 2 }}>Airspace: <span style={{ color: playerAirspace > 3000 ? "#ff9800" : "#4caf50" }}>{playerAirspace > 3000 ? "large - hard to defend" : playerAirspace > 2000 ? "medium" : "compact - easy to defend"}</span></div>
                          </div>
                        );
                      })()}

                      {/* Sell / Delete tools */}
                      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                        {phase === PHASE.SETUP && (
                          <button onClick={() => setPlacingWhat(placingWhat === "delete" ? null : "delete")}
                            style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "4px", textAlign: "center", cursor: "pointer",
                              border: placingWhat === "delete" ? "1px solid #ff9800" : "1px solid #2a2a35",
                              color: placingWhat === "delete" ? "#ff9800" : "#666" }}>
                            Remove (full refund)
                          </button>
                        )}
                        <button onClick={() => setPlacingWhat(placingWhat === "sell" ? null : "sell")}
                          style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "4px", textAlign: "center", cursor: "pointer",
                            border: placingWhat === "sell" ? "1px solid #ff5555" : "1px solid #2a2a35",
                            color: placingWhat === "sell" ? "#ff5555" : "#666" }}>
                          Sell (42% back)
                        </button>
                      </div>

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#cc8800", margin: "4px 0 4px" }}>Resources</div>
                      {RESOURCES.map((r) => (
                        <button key={r.key} onClick={() => setPlacingWhat(r.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === r.key ? `1px solid ${r.color}` : "1px solid #2a2a35" }}>
                          <span style={{ color: r.color }}>{r.icon}</span> {r.name} ${formatUSD(r.cost)} (+${formatUSD(r.income)}/rnd)
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#4a9eff", margin: "8px 0 4px" }}>Interceptor Drones</div>
                      {DEFENSE_UNITS.map((d) => (
                        <button key={d.key} onClick={() => setPlacingWhat("def_" + d.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === "def_" + d.key ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                          {d.name} x4 ${formatUSD(d.cost * 4)} {d.destroyOnKill ? "(kamikaze)" : `(${Math.round(d.survivalRate * 100)}% survive)`}
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#22aa22", margin: "8px 0 4px" }}>Ground AD</div>
                      {AD_SYSTEMS_1V1.map((s) => (
                        <button key={s.key} onClick={() => setPlacingWhat("ad_" + s.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === "ad_" + s.key ? `1px solid ${s.color}` : "1px solid #2a2a35" }}>
                          {s.name} ${formatUSD(s.cost)} | {s.missiles} rds | Pk {Math.round(s.pk * 100)}%
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#ff5555", margin: "8px 0 4px" }}>Your Attack Wave</div>
                      {ATTACK_UNITS.map((a) => (
                        <div key={a.key} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#ff6666", marginBottom: 1 }}>
                            <span>{a.name}</span><span>{playerAttack[a.key] || 0} (${formatUSD((playerAttack[a.key] || 0) * a.cost)})</span>
                          </div>
                          <input type="range" value={playerAttack[a.key] || 0} min="0" max="100" step="1"
                            onChange={(e) => setPlayerAttack((p) => ({ ...p, [a.key]: parseInt(e.target.value) }))}
                            style={{ width: "100%", height: 14, margin: 0, padding: 0 }} />
                        </div>
                      ))}
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#00ddff", margin: "8px 0 4px" }}>
                        Attack Trajectory {playerTrajectory.length > 0 && <span style={{ color: "#666" }}>({playerTrajectory.length} waypoints)</span>}
                      </div>
                      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                        <button onClick={() => setPlacingWhat(placingWhat === "trajectory" ? null : "trajectory")}
                          style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "5px 4px", textAlign: "center", cursor: "pointer",
                            border: placingWhat === "trajectory" ? "1px solid #00ddff" : "1px solid #2a2a35",
                            color: placingWhat === "trajectory" ? "#00ddff" : "#666" }}>
                          {placingWhat === "trajectory" ? "Click map to add..." : "Plan Trajectory"}
                        </button>
                        {playerTrajectory.length > 0 && (
                          <button onClick={() => { setPlayerTrajectory([]); if (placingWhat === "trajectory") setPlacingWhat(null); }}
                            style={{ ...inputStyle, fontSize: 9, padding: "5px 8px", textAlign: "center", cursor: "pointer", color: "#ff5555" }}>
                            Clear
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                        Drones fly through your waypoints in order, then attack the priority target.
                      </div>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#ff9800", margin: "8px 0 4px" }}>Attack Priority</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                        {[["hq", "HQ"], ["ad", "Ground AD"], ["resources", "Resources"], ["interceptors", "Interceptors"]].map(([k, label]) => (
                          <button key={k} onClick={() => setAttackPriority(k)}
                            style={{ ...inputStyle, fontSize: 9, padding: "5px 4px", textAlign: "center", cursor: "pointer",
                              border: attackPriority === k ? "1px solid #ff9800" : "1px solid #2a2a35",
                              color: attackPriority === k ? "#ff9800" : "#666",
                              background: attackPriority === k ? "rgba(255,152,0,0.1)" : "#1a1a24" }}>
                            {label}
                          </button>
                        ))}
                      </div>

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#aa88ff", margin: "8px 0 4px" }}>Defense Posture</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 4 }}>
                        {[["insane", "Insane"], ["pursuing", "Pursuing"], ["defensive", "Defensive"]].map(([k, label]) => (
                          <button key={k} onClick={() => setDefPosture(k)}
                            style={{ ...inputStyle, fontSize: 9, padding: "5px 2px", textAlign: "center", cursor: "pointer",
                              border: defPosture === k ? "1px solid #aa88ff" : "1px solid #2a2a35",
                              color: defPosture === k ? "#aa88ff" : "#555",
                              background: defPosture === k ? "rgba(170,136,255,0.1)" : "#1a1a24" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 8, color: "#555", marginBottom: 6 }}>
                        {defPosture === "insane" ? "Chase anywhere including enemy airspace" : defPosture === "pursuing" ? "Chase but won't enter enemy airspace" : "Stay inside your airspace only"}
                      </div>

                      {placingWhat && placingWhat !== "hq" && (
                        <button onClick={() => setPlacingWhat(null)}
                          style={{ ...inputStyle, width: "100%", marginTop: 2, textAlign: "center", fontSize: 10, cursor: "pointer", border: "1px solid #666", color: "#ff9800" }}>
                          Stop Placing ({placingWhat.replace("def_", "").replace("ad_", "")})
                        </button>
                      )}

                      {gameMode === "bot" ? (
                        <button onClick={() => { setPlacingWhat(null); setPhase(PHASE.COMBAT); }} disabled={remaining < 0}
                          style={{ ...btnStyle, width: "100%", marginTop: 8, background: remaining >= 0 ? "#4a1a2a" : "#1a1a24", borderColor: remaining >= 0 ? "#ff6688" : "#333", color: remaining >= 0 ? "#ff6688" : "#555", fontSize: 12 }}>
                          READY FOR BATTLE
                        </button>
                      ) : (
                        <>
                          <button onClick={() => {
                            if (remaining < 0) return;
                            setPlacingWhat(null);
                            setMeReady((r) => !r);
                          }} disabled={remaining < 0}
                            style={{ ...btnStyle, width: "100%", marginTop: 8, background: meReady ? "#1a4a2a" : (remaining >= 0 ? "#4a1a2a" : "#1a1a24"), borderColor: meReady ? "#4caf50" : (remaining >= 0 ? "#ff6688" : "#333"), color: meReady ? "#4caf50" : (remaining >= 0 ? "#ff6688" : "#555"), fontSize: 12 }}>
                            {meReady ? "✓ READY (click to unready)" : "MARK READY"}
                          </button>
                          <div style={{ fontSize: 9, color: "#888", marginTop: 4, textAlign: "center" }}>
                            You: <span style={{ color: meReady ? "#4caf50" : "#666" }}>{meReady ? "Ready" : "Not ready"}</span>
                            {" | "}
                            {opponentName}: <span style={{ color: opponentReady ? "#4caf50" : "#666" }}>{opponentReady ? "Ready" : "Not ready"}</span>
                          </div>
                          {gameMode === "host" && meReady && opponentReady && (
                            <button onClick={() => { broadcast({ type: "start_combat" }); setPhase(PHASE.COMBAT); }}
                              style={{ ...btnStyle, width: "100%", marginTop: 6, background: "#1a4a2a", borderColor: "#4caf50", color: "#4caf50", fontSize: 12 }}>
                              START COMBAT
                            </button>
                          )}
                          {gameMode === "guest" && meReady && opponentReady && (
                            <div style={{ fontSize: 10, color: "#4caf50", marginTop: 6, textAlign: "center" }}>
                              Both ready - waiting for host to start...
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {phase === PHASE.COMBAT && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff6688", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{gameOver ? "GAME OVER" : battleActive ? "BATTLE IN PROGRESS" : `Round ${currentRound + 1}`}</span>
                    {!gameOver && !battleActive && (
                      <span style={{
                        fontSize: 14, fontWeight: 800, fontFamily: "monospace",
                        color: turnTimer <= 10 ? "#ff5555" : turnTimer <= 20 ? "#ff9800" : "#4caf50",
                        textShadow: turnTimer <= 10 ? "0 0 8px rgba(255,85,85,0.6)" : "none",
                      }}>
                        {Math.floor(turnTimer / 60)}:{String(turnTimer % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Interceptors: {playerInterceptors.reduce((s, d) => s + d.count, 0)} | AD: {playerAD.filter((a) => a.health > 0).length}</div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Resources: {playerResources.filter((r) => r.alive).length} alive</div>
                  <div style={{ fontSize: 10, color: playerBudget >= attackWaveCost ? "#4caf50" : "#ff5555", marginBottom: 2, transition: "transform 0.1s", transform: budgetShake ? `translateX(${Math.random() > 0.5 ? 4 : -4}px)` : "none" }}>
                    Available: ${formatUSD(Math.max(0, playerBudget))}
                    {attackWaveCost > 0 && <span style={{ color: "#ff9800", fontSize: 9 }}> (wave: -${formatUSD(attackWaveCost)})</span>}
                  </div>
                  <div style={{ fontSize: 9, color: "#666", marginBottom: 4 }}>Total earned: ${formatUSD(totalIncome + STARTING_BUDGET)}</div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                    <button onClick={() => setPlacingWhat(placingWhat === "sell" ? null : "sell")}
                      style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "3px", textAlign: "center", cursor: "pointer",
                        border: placingWhat === "sell" ? "1px solid #ff5555" : "1px solid #2a2a35", color: placingWhat === "sell" ? "#ff5555" : "#666" }}>
                      Sell (42%)
                    </button>
                    {placingWhat && (
                      <button onClick={() => setPlacingWhat(null)}
                        style={{ ...inputStyle, flex: 1, fontSize: 9, padding: "3px", textAlign: "center", cursor: "pointer", border: "1px solid #666", color: "#888" }}>
                        Stop Placing
                      </button>
                    )}
                  </div>

                  {/* Between-round buying - same as setup */}
                  {!gameOver && !battleActive && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: "#888" }}>Airspace:</span>
                        <input type="range" min="1000" max={playerHQ && aiSetup ? Math.max(1000, Math.floor(dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY }) - aiSetup.airspace - 400)) : 4000} step="200" value={playerAirspace} onChange={(e) => setPlayerAirspace(parseInt(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontSize: 9, color: "#4a9eff" }}>{playerAirspace}m</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#4caf50", marginBottom: 6 }}>+${formatUSD(Math.floor(playerAirspace * 200))}/rnd from airspace</div>

                      <div style={{ fontSize: 9, textTransform: "uppercase", color: "#aa88ff", marginBottom: 3 }}>Defense Posture</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, marginBottom: 6 }}>
                        {[["insane", "Insane"], ["pursuing", "Pursuing"], ["defensive", "Defensive"]].map(([k, label]) => (
                          <button key={k} onClick={() => setDefPosture(k)}
                            style={{ ...inputStyle, fontSize: 8, padding: "4px 2px", textAlign: "center", cursor: "pointer",
                              border: defPosture === k ? "1px solid #aa88ff" : "1px solid #2a2a35",
                              color: defPosture === k ? "#aa88ff" : "#555",
                              background: defPosture === k ? "rgba(170,136,255,0.1)" : "#1a1a24" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 8, color: "#555", marginBottom: 6 }}>
                        {defPosture === "insane" ? "Interceptors chase anywhere including enemy airspace" : defPosture === "pursuing" ? "Interceptors chase but won't enter enemy airspace" : "Interceptors stay inside your airspace only"}
                      </div>

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#cc8800", margin: "4px 0 4px" }}>Build Resources</div>
                      {RESOURCES.map((r) => (
                        <button key={r.key} onClick={() => setPlacingWhat(r.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 9,
                            border: placingWhat === r.key ? `1px solid ${r.color}` : "1px solid #2a2a35" }}>
                          <span style={{ color: r.color }}>{r.icon}</span> {r.name} ${formatUSD(r.cost)} (+${formatUSD(r.income)}/rnd)
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#4a9eff", margin: "4px 0 4px" }}>Buy Interceptors</div>
                      {DEFENSE_UNITS.map((d) => (
                        <button key={d.key} onClick={() => setPlacingWhat("def_" + d.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 9,
                            border: placingWhat === "def_" + d.key ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                          {d.name} x4 ${formatUSD(d.cost * 4)}
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#22aa22", margin: "4px 0 4px" }}>Buy Ground AD</div>
                      {AD_SYSTEMS_1V1.map((s) => (
                        <button key={s.key} onClick={() => setPlacingWhat("ad_" + s.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 9,
                            border: placingWhat === "ad_" + s.key ? `1px solid ${s.color}` : "1px solid #2a2a35" }}>
                          {s.name} ${formatUSD(s.cost)}
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#ff5555", margin: "4px 0 4px" }}>Attack Wave (cost: ${formatUSD(attackWaveCost)})</div>
                      {ATTACK_UNITS.map((a) => (
                        <div key={a.key} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#ff6666", marginBottom: 1 }}>
                            <span>{a.name}</span><span>{playerAttack[a.key] || 0} (${formatUSD((playerAttack[a.key] || 0) * a.cost)})</span>
                          </div>
                          <input type="range" value={playerAttack[a.key] || 0} min="0" max="100" step="1"
                            onChange={(e) => setPlayerAttack((p) => ({ ...p, [a.key]: parseInt(e.target.value) }))}
                            style={{ width: "100%", height: 14, margin: 0, padding: 0 }} />
                        </div>
                      ))}
                      <div style={{ fontSize: 9, textTransform: "uppercase", color: "#00ddff", margin: "6px 0 3px" }}>
                        Trajectory {playerTrajectory.length > 0 && <span style={{ color: "#666" }}>({playerTrajectory.length})</span>}
                      </div>
                      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                        <button onClick={() => setPlacingWhat(placingWhat === "trajectory" ? null : "trajectory")}
                          style={{ ...inputStyle, flex: 1, fontSize: 8, padding: "4px 3px", textAlign: "center", cursor: "pointer",
                            border: placingWhat === "trajectory" ? "1px solid #00ddff" : "1px solid #2a2a35",
                            color: placingWhat === "trajectory" ? "#00ddff" : "#666" }}>
                          {placingWhat === "trajectory" ? "Click map..." : "Plan Trajectory"}
                        </button>
                        {playerTrajectory.length > 0 && (
                          <button onClick={() => { setPlayerTrajectory([]); if (placingWhat === "trajectory") setPlacingWhat(null); }}
                            style={{ ...inputStyle, fontSize: 8, padding: "4px 6px", textAlign: "center", cursor: "pointer", color: "#ff5555" }}>
                            Clear
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 9, textTransform: "uppercase", color: "#ff9800", margin: "4px 0 3px" }}>Priority Target</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, marginBottom: 6 }}>
                        {[["hq", "HQ"], ["ad", "Ground AD"], ["resources", "Resources"], ["interceptors", "Interceptors"]].map(([k, label]) => (
                          <button key={k} onClick={() => setAttackPriority(k)}
                            style={{ ...inputStyle, fontSize: 8, padding: "4px 3px", textAlign: "center", cursor: "pointer",
                              border: attackPriority === k ? "1px solid #ff9800" : "1px solid #2a2a35",
                              color: attackPriority === k ? "#ff9800" : "#666",
                              background: attackPriority === k ? "rgba(255,152,0,0.1)" : "#1a1a24" }}>
                            {label}
                          </button>
                        ))}
                      </div>

                      <button onClick={launchRound}
                        style={{ ...btnStyle, width: "100%", marginTop: 4, background: "#4a1a2a", borderColor: "#ff6688", color: "#ff6688", fontSize: 12 }}>
                        LAUNCH ROUND {currentRound + 1}
                      </button>
                    </>
                  )}

                  {battleActive && (
                    <div style={{ padding: 8, background: "#1a1a24", borderRadius: 6, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#ff9800", marginBottom: 6 }}>Battle in progress...</div>
                      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                        {[1, 2, 4, 8, 16].map((s) => (
                          <button key={s} onClick={() => setBattleSpeed(s)}
                            style={{ flex: 1, padding: "4px", fontSize: 10, borderRadius: 3, cursor: "pointer",
                              border: battleSpeed === s ? "1px solid #ff9800" : "1px solid #2a2a35",
                              background: battleSpeed === s ? "rgba(255,152,0,0.15)" : "#111118",
                              color: battleSpeed === s ? "#ff9800" : "#666" }}>
                            {s}x
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setShowADRange((p) => !p)}
                        style={{ width: "100%", padding: "3px", fontSize: 9, borderRadius: 3, cursor: "pointer",
                          border: "1px solid #2a2a35", background: "#111118",
                          color: showADRange ? "#4a9eff" : "#444" }}>
                        {showADRange ? "Hide AD Range" : "Show AD Range"}
                      </button>
                      <div style={{ fontSize: 9, color: "#4a9eff" }}>Your attack: {battleDrones.playerAttackers.filter((a) => a.status === "active").length} active</div>
                      <div style={{ fontSize: 9, color: "#ff5555" }}>Enemy attack: {battleDrones.aiAttackers.filter((a) => a.status === "active").length} active</div>
                      <div style={{ fontSize: 9, color: "#66ccff" }}>Your defense: {battleDrones.playerInts.filter((i) => i.status === "active").length} active</div>
                      <div style={{ fontSize: 9, color: "#ff8888" }}>Enemy defense: {battleDrones.aiInts.filter((i) => i.status === "active").length} active</div>
                    </div>
                  )}

                  {gameOver && (
                    <div style={{
                      padding: 16, borderRadius: 8, textAlign: "center", marginBottom: 12,
                      background: gameOver.winner === username ? "rgba(76,175,80,0.15)" : "rgba(255,85,85,0.15)",
                      border: `2px solid ${gameOver.winner === username ? "#4caf50" : "#ff5555"}`,
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: gameOver.winner === username ? "#4caf50" : "#ff5555" }}>
                        {gameOver.winner === username ? "VICTORY" : "DEFEAT"}
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{gameOver.reason}</div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>
                        You: ${formatUSD(Math.max(0, playerBudget))} | {opponentName}: ${formatUSD(Math.max(0, aiBudget))}
                      </div>
                      {gameMode === "bot" && (
                        <button onClick={() => {
                          // Replay: tear down map, then start a new bot match with same theater/username
                          setPhase(PHASE.LOBBY); setMapReady(false);
                          if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; layerRef.current = null; battleLayerRef.current = null; LRef.current = null; }
                          setTimeout(() => findMatch(), 50);
                        }} style={{ ...inputStyle, marginTop: 12, cursor: "pointer", fontSize: 11, color: "#4caf50", borderColor: "#4caf50" }}>
                          ↻ Replay Match
                        </button>
                      )}
                      <button onClick={() => {
                        if (gameMode !== "bot") teardownPeer(true);
                        setPhase(PHASE.LOBBY); setMapReady(false);
                        setGameMode("bot"); setLobbyView("main");
                        if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; layerRef.current = null; battleLayerRef.current = null; LRef.current = null; }
                      }} style={{ ...inputStyle, marginTop: 8, cursor: "pointer", fontSize: 11 }}>
                        Back to Lobby
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: 10, textTransform: "uppercase", color: "#666", margin: "8px 0 4px" }}>Battle Log</div>
                  <div style={{ maxHeight: 250, overflowY: "auto" }}>
                    {combatLog.slice().reverse().map((msg, i) => (
                      <div key={i} style={{ fontSize: 9, color: msg.includes("destroyed") || msg.includes("HQ") ? "#ff5555" : msg.includes("killed") ? "#4caf50" : "#555", marginBottom: 2, lineHeight: 1.4 }}>
                        {msg}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <div ref={mapRef} style={{ width: "100%", height: "100%", cursor: placingWhat ? "crosshair" : "grab", transition: "transform 0.05s" }} />
              {infoPopup && (
                <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(17,17,24,0.95)", border: "1px solid #4a9eff", borderRadius: 6, padding: "8px 16px", fontSize: 11, color: "#e0e0e0", zIndex: 500, maxWidth: 400, textAlign: "center" }}>
                  {infoPopup.text}
                </div>
              )}
              {unitInspect && (() => {
                const u = unitInspect;
                let title = "", subtitle = "", stats = [], color = "#4a9eff", svg = null;
                if (u.kind === "hq" || u.kind === "hq_extra") {
                  title = u.side === "player" ? (u.kind === "hq_extra" ? "Your Forward HQ" : "Your HQ") : "Enemy HQ";
                  subtitle = "Command Center";
                  color = u.side === "player" ? "#4a9eff" : "#ff5555";
                  stats = [["Type", u.kind === "hq_extra" ? "Secondary" : "Primary"], ["Defense", "8+ breaches in one round = destroyed"]];
                  svg = `<svg width="60" height="60" viewBox="0 0 60 60"><rect x="10" y="10" width="40" height="40" fill="${color}" stroke="#fff" stroke-width="3"/><rect x="20" y="20" width="6" height="6" fill="#fff"/><rect x="34" y="20" width="6" height="6" fill="#fff"/><rect x="20" y="34" width="6" height="6" fill="#fff"/><rect x="34" y="34" width="6" height="6" fill="#fff"/></svg>`;
                } else if (u.kind === "ad") {
                  const sys = AD_SYSTEMS_1V1.find((s) => s.key === u.key);
                  if (sys) {
                    title = sys.name;
                    subtitle = u.side === "player" ? "Your Ground AD" : "Enemy Ground AD";
                    color = sys.color;
                    stats = [
                      ["Cost", `$${formatUSD(sys.cost)}`],
                      ["Range", `${sys.range}m`],
                      ["Missiles", `${u.ad?.ammo ?? sys.missiles} / ${sys.missiles}`],
                      ["Pk", `${Math.round(sys.pk * 100)}%`],
                      ["Reload", `${sys.engageRate}s`],
                      ["Health", u.ad?.health > 0 ? "Operational" : "DESTROYED"],
                    ];
                    svg = `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${color}" stroke="${u.side === 'player' ? '#fff' : '#ff3333'}" stroke-width="3"/><circle cx="30" cy="30" r="4" fill="#fff"/><line x1="30" y1="8" x2="30" y2="20" stroke="#fff" stroke-width="2"/><line x1="30" y1="40" x2="30" y2="52" stroke="#fff" stroke-width="2"/><line x1="8" y1="30" x2="20" y2="30" stroke="#fff" stroke-width="2"/><line x1="40" y1="30" x2="52" y2="30" stroke="#fff" stroke-width="2"/></svg>`;
                  }
                } else if (u.kind === "resource") {
                  const res = RESOURCES.find((r) => r.key === u.key);
                  if (res) {
                    title = res.name;
                    subtitle = u.side === "player" ? "Your Resource" : "Enemy Resource";
                    color = res.color;
                    stats = [
                      ["Cost", `$${formatUSD(res.cost)}`],
                      ["Income", `$${formatUSD(res.income)}/round`],
                      ["ROI", `${(res.cost / res.income).toFixed(1)} rounds`],
                      ["Breach loss", `$${formatUSD(res.breachDmg)}`],
                      ["Status", u.res?.alive ? "Online" : "DESTROYED"],
                    ];
                    svg = `<svg width="60" height="60" viewBox="0 0 60 60"><polygon points="30,8 52,50 8,50" fill="${color}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><text x="30" y="44" text-anchor="middle" font-size="20" font-weight="800" font-family="monospace" fill="#fff">${res.icon}</text></svg>`;
                  }
                } else if (u.kind === "interceptor") {
                  const def = DEFENSE_UNITS.find((d) => d.key === u.key);
                  if (def) {
                    title = def.name;
                    subtitle = `Group of ${u.intGroup?.count || 0}`;
                    color = "#4a9eff";
                    stats = [
                      ["Cost (each)", `$${formatUSD(def.cost)}`],
                      ["Speed", `${def.speed} u/tick`],
                      ["Type", def.destroyOnKill ? "Kamikaze (one-shot)" : "Armed (reusable)"],
                      ["Survival", def.destroyOnKill ? "0%" : `${Math.round((def.survivalRate || 0) * 100)}%`],
                    ];
                    svg = `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="${color}" stroke="#fff" stroke-width="2.5"/><polygon points="30,12 38,40 30,32 22,40" fill="#fff"/></svg>`;
                  }
                }
                if (!title) return null;
                return (
                  <div style={{ position: "absolute", top: 50, right: 12, width: 260, background: "rgba(17,17,24,0.96)", border: `2px solid ${color}`, borderRadius: 8, padding: 14, color: "#e0e0e0", zIndex: 700, boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
                    <button onClick={() => setUnitInspect(null)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", padding: 0 }}>✕</button>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                      <div dangerouslySetInnerHTML={{ __html: svg || "" }} style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
                        <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{subtitle}</div>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #2a2a35", paddingTop: 8 }}>
                      {stats.map(([k, v], i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                          <span style={{ color: "#888" }}>{k}</span>
                          <span style={{ color: "#e0e0e0", fontFamily: "monospace" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: "#555", marginTop: 8, textAlign: "center" }}>Middle-click any unit to inspect</div>
                  </div>
                );
              })()}
              {damagePopup && (
                <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 600, fontSize: 32, fontWeight: 800, color: damagePopup.color, textShadow: "0 0 20px rgba(0,0,0,0.8)", animation: "fadeUp 2.5s ease-out forwards", pointerEvents: "none" }}>
                  {damagePopup.text}
                </div>
              )}
              {battleActive && (
                <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(17,17,24,0.9)", border: "1px solid #2a2a35", borderRadius: 6, padding: "8px 12px", fontSize: 9, zIndex: 500, lineHeight: 1.8 }}>
                  <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#00ddff", marginRight: 4 }} />Your attack</div>
                  <div><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ff4444", marginRight: 4 }} />Enemy attack</div>
                  <div><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#4a9eff", border: "1.5px solid #fff", marginRight: 4 }} />Your defense</div>
                  <div><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#ff5555", border: "1.5px solid #880000", marginRight: 4 }} />Enemy defense</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
