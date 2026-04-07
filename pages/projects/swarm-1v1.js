import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

const ARENA = 10000;
const KILL_RADIUS = 120;

const THEATERS = {
  kashmir: { name: "LoC Kashmir", bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 }, mapCenter: [34.0, 74.25], mapZoom: 9 },
  israel_iran: { name: "Israel-Iran", bounds: { south: 31.0, north: 33.0, west: 34.0, east: 36.0 }, mapCenter: [32.0, 35.0], mapZoom: 8 },
  ukraine_kyiv: { name: "Ukraine Kyiv", bounds: { south: 49.0, north: 51.0, west: 30.0, east: 33.0 }, mapCenter: [50.0, 31.5], mapZoom: 8 },
  taiwan_strait: { name: "Taiwan Strait", bounds: { south: 23.0, north: 26.0, west: 119.0, east: 122.0 }, mapCenter: [24.5, 120.5], mapZoom: 7 },
};

const ATTACK_UNITS = [
  { key: "fpv", name: "FPV Drone", cost: 500, speed: 1.5, threat: "cheap" },
  { key: "shahed", name: "Shahed-136", cost: 20000, speed: 1.0, threat: "cheap" },
  { key: "lancet", name: "Lancet-3", cost: 35000, speed: 1.8, threat: "medium" },
  { key: "mohajer", name: "Mohajer-6", cost: 500000, speed: 0.8, threat: "expensive" },
];

const DEFENSE_UNITS = [
  { key: "kamikaze", name: "Kamikaze Interceptor", cost: 15000, speed: 2.2, destroyOnKill: true },
  { key: "armed", name: "Armed Interceptor", cost: 180000, speed: 1.8, destroyOnKill: false, survivalRate: 0.73 },
];

const AD_SYSTEMS_1V1 = [
  { key: "iron_dome", name: "Iron Dome", cost: 50000000, range: 2000, missiles: 20, missileCost: 50000, pk: 0.85, engageRate: 3, color: "#44bbff" },
  { key: "gepard", name: "Gepard", cost: 5000000, range: 800, missiles: 680, missileCost: 100, pk: 0.2, engageRate: 1, color: "#88aa44" },
  { key: "nasams", name: "NASAMS 3", cost: 100000000, range: 2500, missiles: 6, missileCost: 500000, pk: 0.8, engageRate: 4, color: "#4488ff" },
  { key: "pantsir", name: "Pantsir-S1", cost: 15000000, range: 1500, missiles: 12, missileCost: 60000, pk: 0.65, engageRate: 3, color: "#cc8800" },
];

const RESOURCES = [
  { key: "oil", name: "Oil Refinery", cost: 8000000, income: 2000000, breachDmg: 15000000, color: "#cc8800", icon: "O" },
  { key: "solar", name: "Solar Farm", cost: 3000000, income: 500000, breachDmg: 5000000, color: "#44bb44", icon: "S" },
  { key: "arms", name: "Arms Factory", cost: 6000000, income: 1000000, breachDmg: 10000000, color: "#8888cc", icon: "A" },
];

const AI_NAMES = ["SKYNET-7", "AEGIS_AI", "IRON_WALL", "RED_FURY", "SHADOW_NET", "VANGUARD", "CERBERUS", "TITAN_DEF"];
const STARTING_BUDGET = 30000000;
const TOTAL_ROUNDS = 8;
const PHASE = { LOBBY: "lobby", MATCHMAKING: "matchmaking", SETUP: "setup", COMBAT: "combat" };

function formatUSD(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function simToLatLng(x, y, b) { return [b.south + (y / ARENA) * (b.north - b.south), b.west + (x / ARENA) * (b.east - b.west)]; }
function latLngToSim(lat, lng, b) { return [((lng - b.west) / (b.east - b.west)) * ARENA, ((lat - b.south) / (b.north - b.south)) * ARENA]; }

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
    interceptors: Array.from({ length: 8 }, (_, i) => ({
      id: 5000 + i, x: hqX + (Math.random() - 0.5) * 800, y: hqY + 1200 + Math.random() * 400,
      speed: 2.0, status: "active", targetId: null, destroyOnKill: i < 6, survivalRate: 0.73,
    })),
    adUnits: [
      { key: "gepard", x: hqX, y: hqY + 600, health: 1, ammo: 680 },
      { key: "gepard", x: hqX + 500, y: hqY + 900, health: 1, ammo: 680 },
    ],
  };
}

function generateAIAttack(round) {
  const r = round + 1;
  return {
    fpv: 8 + r * 5,
    shahed: 3 + r * 3,
    ...(r > 2 ? { lancet: r * 2 } : {}),
    ...(r > 4 ? { mohajer: Math.floor(r * 0.8) } : {}),
  };
}

// Create flying drones from a wave config
function spawnDrones(wave, originX, originY, targetX, targetY, idStart) {
  const drones = [];
  let id = idStart;
  for (const [key, count] of Object.entries(wave)) {
    const u = ATTACK_UNITS.find((a) => a.key === key);
    if (!u) continue;
    for (let i = 0; i < count; i++) {
      const ox = originX + (Math.random() - 0.5) * 1500;
      const oy = originY + (Math.random() - 0.5) * 800;
      drones.push({
        id: id++, x: ox, y: oy, speed: u.speed, threat: u.threat, cost: u.cost,
        status: "active", heading: Math.atan2(targetY - oy, targetX - ox) + (Math.random() - 0.5) * 0.3,
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
  const [playerAirspace, setPlayerAirspace] = useState(2000);
  const [playerResources, setPlayerResources] = useState([]);
  const [playerInterceptors, setPlayerInterceptors] = useState([]);
  const [playerAD, setPlayerAD] = useState([]);
  const [playerAttack, setPlayerAttack] = useState({ fpv: 10, shahed: 3 });
  const [attackPriority, setAttackPriority] = useState("hq"); // "hq" | "ad" | "resources" | "interceptors"
  const [playerBudget, setPlayerBudget] = useState(STARTING_BUDGET);
  const [placingWhat, setPlacingWhat] = useState(null);

  // AI
  const [aiSetup, setAiSetup] = useState(null);
  const [aiBudget, setAiBudget] = useState(STARTING_BUDGET);

  // Combat
  const [currentRound, setCurrentRound] = useState(0);
  const [combatLog, setCombatLog] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [battleActive, setBattleActive] = useState(false);
  const [battleDrones, setBattleDrones] = useState({ playerAttackers: [], aiAttackers: [], playerInts: [], aiInts: [] });

  // Map
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);
  const battleLayerRef = useRef(null);
  const LRef = useRef(null);
  const handleMapClickRef = useRef(null);
  const theaterRef = useRef(theater);
  const [mapReady, setMapReady] = useState(false);

  // Battle sim refs
  const battleRef = useRef(null);
  const frameRef = useRef(null);

  const findMatch = useCallback(() => {
    if (!username.trim()) return;
    setPhase(PHASE.MATCHMAKING);
    setOpponentName(AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)]);
    let t = 0;
    const iv = setInterval(() => {
      t++; setMatchTimer(t);
      if (t >= 3) {
        clearInterval(iv);
        setPhase(PHASE.SETUP);
        setPlayerHQ(null); setPlayerResources([]); setPlayerInterceptors([]); setPlayerAD([]);
        setPlayerBudget(STARTING_BUDGET); setAiBudget(STARTING_BUDGET);
        setCurrentRound(0); setCombatLog([]); setGameOver(null);
        setBattleActive(false); setBattleDrones({ playerAttackers: [], aiAttackers: [], playerInts: [], aiInts: [] });
        setAiSetup(generateAISetup());
      }
    }, 1000);
  }, [username]);

  // Budget spent
  const spent = (() => {
    let s = 0;
    for (const r of playerResources) { const res = RESOURCES.find((rr) => rr.key === r.key); if (res) s += res.cost; }
    for (const d of playerInterceptors) { const def = DEFENSE_UNITS.find((dd) => dd.key === d.key); if (def) s += def.cost * d.count; }
    for (const ad of playerAD) { const sys = AD_SYSTEMS_1V1.find((ss) => ss.key === ad.key); if (sys) s += sys.cost; }
    for (const [k, n] of Object.entries(playerAttack)) { const u = ATTACK_UNITS.find((a) => a.key === k); if (u) s += u.cost * n; }
    return s;
  })();
  const remaining = playerBudget - spent;

  // Map click
  const handleMapClick = useCallback((x, y) => {
    if ((phase !== PHASE.SETUP && phase !== PHASE.COMBAT) || !placingWhat || battleActive) return;
    if (placingWhat === "hq") {
      if (y < 5500) return;
      setPlayerHQ({ x, y }); setPlacingWhat(null);
    } else if (placingWhat.startsWith("def_")) {
      const defKey = placingWhat.replace("def_", "");
      if (!playerHQ || dist({ x, y }, playerHQ) > playerAirspace + 500) return;
      setPlayerInterceptors((prev) => [...prev, { key: defKey, x, y, count: 4 }]); setPlacingWhat(null);
    } else if (placingWhat.startsWith("ad_")) {
      const adKey = placingWhat.replace("ad_", "");
      if (!playerHQ || dist({ x, y }, playerHQ) > playerAirspace + 300) return;
      const sys = AD_SYSTEMS_1V1.find((s) => s.key === adKey);
      if (sys) setPlayerAD((prev) => [...prev, { key: adKey, x, y, health: 1, ammo: sys.missiles }]);
      setPlacingWhat(null);
    } else {
      if (!playerHQ || dist({ x, y }, playerHQ) > playerAirspace) return;
      setPlayerResources((prev) => [...prev, { key: placingWhat, x, y, alive: true }]); setPlacingWhat(null);
    }
  }, [phase, placingWhat, playerHQ, playerAirspace]);

  handleMapClickRef.current = handleMapClick;
  theaterRef.current = theater;

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
      const map = Leaf.map(mapRef.current, { center: th.mapCenter, zoom: th.mapZoom, zoomControl: true, preferCanvas: true });
      mapInstanceRef.current = map;
      Leaf.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(map);
      Leaf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, opacity: 0.3 }).addTo(map);
      layerRef.current = Leaf.layerGroup().addTo(map);
      battleLayerRef.current = Leaf.layerGroup().addTo(map);
      map.on("click", (e) => {
        const fn = handleMapClickRef.current;
        if (!fn) return;
        const t2 = THEATERS[theaterRef.current];
        let [cx, cy] = latLngToSim(e.latlng.lat, e.latlng.lng, t2.bounds);
        fn(Math.max(0, Math.min(ARENA, cx)), Math.max(0, Math.min(ARENA, cy)));
      });
      setMapReady(true);
    })();
    return () => { cancelled = true; };
  }, [phase, theater]);

  // Draw static elements
  useEffect(() => {
    const L = LRef.current; const layer = layerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    const th = THEATERS[theater]; const mpu = ((th.bounds.north - th.bounds.south) * 111000) / ARENA;
    const toLL = (x, y) => simToLatLng(x, y, th.bounds);

    // Divider
    L.polyline([toLL(0, 5000), toLL(ARENA, 5000)], { color: "#fff", weight: 1, opacity: 0.15, dashArray: "8 8", interactive: false }).addTo(layer);

    // Player
    if (playerHQ) {
      L.circle(toLL(playerHQ.x, playerHQ.y), { radius: playerAirspace * mpu, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.04, weight: 1, opacity: 0.4, dashArray: "10 6" }).addTo(layer);
      L.circleMarker(toLL(playerHQ.x, playerHQ.y), { radius: 8, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 1, weight: 2 }).addTo(layer);
    }
    for (const r of playerResources) {
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (res) L.circleMarker(toLL(r.x, r.y), { radius: 6, color: r.alive ? res.color : "#444", fillColor: r.alive ? res.color : "#333", fillOpacity: 0.8, weight: 2 }).addTo(layer);
    }
    for (const d of playerInterceptors) L.circleMarker(toLL(d.x, d.y), { radius: 4, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.6, weight: 1 }).addTo(layer);
    for (const ad of playerAD) {
      const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
      if (sys) L.circleMarker(toLL(ad.x, ad.y), { radius: 6, color: ad.health > 0 ? sys.color : "#444", fillColor: ad.health > 0 ? sys.color : "#333", fillOpacity: 0.8, weight: 2 }).addTo(layer);
    }

    // AI
    if (aiSetup) {
      L.circle(toLL(aiSetup.hqX, aiSetup.hqY), { radius: aiSetup.airspace * mpu, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.04, weight: 1, opacity: 0.4, dashArray: "10 6" }).addTo(layer);
      L.circleMarker(toLL(aiSetup.hqX, aiSetup.hqY), { radius: 8, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 1, weight: 2 }).addTo(layer);
      for (const r of aiSetup.resources) {
        const res = RESOURCES.find((rr) => rr.key === r.key);
        if (res) L.circleMarker(toLL(r.x, r.y), { radius: 5, color: r.alive ? res.color : "#444", fillColor: r.alive ? res.color : "#333", fillOpacity: 0.6, weight: 1 }).addTo(layer);
      }
    }
  }, [mapReady, theater, playerHQ, playerAirspace, playerResources, playerInterceptors, playerAD, aiSetup, phase]);

  // ── Launch round with animated battle ──
  const launchRound = useCallback(() => {
    if (!playerHQ || !aiSetup || gameOver || battleActive) return;
    setBattleActive(true);
    const round = currentRound;
    const log = [];

    // Income
    let pIncome = 0, aIncome = 0;
    for (const r of playerResources) { if (r.alive) { const res = RESOURCES.find((rr) => rr.key === r.key); if (res) pIncome += res.income; } }
    for (const r of aiSetup.resources) { if (r.alive) { const res = RESOURCES.find((rr) => rr.key === r.key); if (res) aIncome += res.income; } }
    setPlayerBudget((p) => p + pIncome);
    setAiBudget((p) => p + aIncome);
    log.push(`Round ${round + 1}: You +$${formatUSD(pIncome)} | ${opponentName} +$${formatUSD(aIncome)}`);

    // Spawn player's attack drones flying toward AI HQ
    const pAttackers = spawnDrones(playerAttack, playerHQ.x, playerHQ.y - 500, aiSetup.hqX, aiSetup.hqY, 10000 + round * 1000);
    // Spawn AI's attack drones flying toward player HQ
    const aiWave = generateAIAttack(round);
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

    battleRef.current = { pAttackers, aAttackers, pInts, aInts, pAD, aAD, step: 0, pKills: 0, aKills: 0, pBreaches: 0, aBreaches: 0 };

    // Animate
    function tick() {
      const b = battleRef.current;
      if (!b) return;
      b.step++;

      // Move AI attackers toward player HQ, player interceptors chase them
      for (const a of b.aAttackers) {
        if (a.status !== "active") continue;
        const dx = playerHQ.x - a.x, dy = playerHQ.y - a.y;
        let diff = Math.atan2(dy, dx) - a.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.heading += diff * 0.06;
        a.x += Math.cos(a.heading) * a.speed;
        a.y += Math.sin(a.heading) * a.speed;
        if (dist(a, playerHQ) < 200) { a.status = "breached"; b.aBreaches++; }
      }
      // Move player attackers - target based on priority
      for (const a of b.pAttackers) {
        if (a.status !== "active") continue;
        let tx = aiSetup.hqX, ty = aiSetup.hqY;
        if (attackPriority === "ad" && b.aAD.some((ad) => ad.health > 0)) {
          const alive = b.aAD.filter((ad) => ad.health > 0);
          const closest = alive.reduce((best, ad) => dist(a, ad) < dist(a, best) ? ad : best, alive[0]);
          tx = closest.x; ty = closest.y;
          if (dist(a, closest) < 100) { closest.health = 0; closest.ammo = 0; a.status = "expended"; continue; }
        } else if (attackPriority === "resources") {
          const alive = aiSetup.resources.filter((r) => r.alive);
          if (alive.length > 0) {
            const closest = alive.reduce((best, r) => dist(a, r) < dist(a, best) ? r : best, alive[0]);
            tx = closest.x; ty = closest.y;
            if (dist(a, closest) < 100) { closest.alive = false; a.status = "expended"; b.pBreaches++; continue; }
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
        if (dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) < 200) { a.status = "breached"; b.pBreaches++; }
      }

      // Player interceptors chase AI attackers
      for (const int of b.pInts) {
        if (int.status !== "active") continue;
        const activeA = b.aAttackers.filter((a) => a.status === "active");
        let tgt = activeA.find((a) => a.id === int.targetId);
        if (!tgt) { let best = null, bd = Infinity; for (const a of activeA) { const d2 = dist(int, a); if (d2 < bd) { bd = d2; best = a; } } if (best) { int.targetId = best.id; tgt = best; } }
        if (tgt) {
          int.heading = Math.atan2(tgt.y - int.y, tgt.x - int.x);
          int.x += Math.cos(int.heading) * int.speed;
          int.y += Math.sin(int.heading) * int.speed;
          if (dist(int, tgt) < KILL_RADIUS) {
            tgt.status = "destroyed"; b.aKills++; int.targetId = null;
            if (int.destroyOnKill) int.status = "expended";
            else if (Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
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
            if (int.destroyOnKill) int.status = "expended";
            else if (Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
          }
        }
      }

      // AD units fire
      if (b.step % 10 === 0) {
        for (const ad of b.pAD) {
          if (ad.health <= 0 || ad.ammo <= 0) continue;
          const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
          if (!sys) continue;
          for (const a of b.aAttackers) {
            if (a.status !== "active") continue;
            if (dist(ad, a) < sys.range) { ad.ammo--; if (Math.random() < sys.pk) { a.status = "destroyed"; b.aKills++; } break; }
          }
        }
        for (const ad of b.aAD) {
          if (ad.health <= 0 || ad.ammo <= 0) continue;
          const sys = AD_SYSTEMS_1V1.find((s) => s.key === ad.key);
          if (!sys) continue;
          for (const a of b.pAttackers) {
            if (a.status !== "active") continue;
            if (dist(ad, a) < sys.range) { ad.ammo--; if (Math.random() < sys.pk) { a.status = "destroyed"; b.pKills++; } break; }
          }
        }
      }

      // Draw battle - distinct visuals per drone type
      const L = LRef.current; const bl = battleLayerRef.current;
      if (L && bl) {
        bl.clearLayers();
        const th = THEATERS[theaterRef.current]; const toLL = (x, y) => simToLatLng(x, y, th.bounds);
        // Enemy attack drones: red small triangles (heading south->north)
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
      }

      setBattleDrones({ playerAttackers: [...b.pAttackers], aiAttackers: [...b.aAttackers], playerInts: [...b.pInts], aiInts: [...b.aInts] });

      // RTB phase: when no active attackers remain, interceptors fly home
      const aAtk = b.aAttackers.filter((a) => a.status === "active").length;
      const pAtk = b.pAttackers.filter((a) => a.status === "active").length;
      if (aAtk === 0) {
        for (const int of b.pInts) {
          if (int.status !== "active") continue;
          const dx = int.spawnX - int.x, dy = int.spawnY - int.y;
          if (Math.sqrt(dx * dx + dy * dy) < 30) { int.status = "landed"; continue; }
          int.heading = Math.atan2(dy, dx);
          int.x += Math.cos(int.heading) * int.speed;
          int.y += Math.sin(int.heading) * int.speed;
          int.targetId = null;
        }
      }
      if (pAtk === 0) {
        for (const int of b.aInts) {
          if (int.status !== "active") continue;
          const dx = int.spawnX - int.x, dy = int.spawnY - int.y;
          if (Math.sqrt(dx * dx + dy * dy) < 30) { int.status = "landed"; continue; }
          int.heading = Math.atan2(dy, dx);
          int.x += Math.cos(int.heading) * int.speed;
          int.y += Math.sin(int.heading) * int.speed;
          int.targetId = null;
        }
      }

      // Check if battle is over: all attackers gone AND all interceptors landed/expended
      const pIntsActive = b.pInts.filter((i) => i.status === "active").length;
      const aIntsActive = b.aInts.filter((i) => i.status === "active").length;
      const allDone = aAtk === 0 && pAtk === 0 && pIntsActive === 0 && aIntsActive === 0;
      if (allDone || b.step > 3000) {
        // Battle ended
        const endLog = [];
        endLog.push(`Battle ${round + 1} done: You killed ${b.aKills}, lost ${b.pBreaches} breaches | AI killed ${b.pKills}, lost ${b.aBreaches} breaches`);

        // Apply breach damage
        let pDmg = 0, aDmg = 0;
        if (b.aBreaches > 0) {
          pDmg = b.aBreaches * 500000;
          for (let i = 0; i < Math.min(b.aBreaches, 3); i++) {
            const alive = playerResources.filter((r) => r.alive);
            if (alive.length > 0 && Math.random() < 0.35) {
              const t2 = alive[Math.floor(Math.random() * alive.length)];
              t2.alive = false; const res = RESOURCES.find((rr) => rr.key === t2.key);
              pDmg += res?.breachDmg || 5000000;
              endLog.push(`Your ${res?.name} destroyed!`);
            }
          }
          if (b.aBreaches > 8) { setGameOver({ winner: opponentName, reason: "HQ overwhelmed" }); endLog.push("YOUR HQ DESTROYED!"); }
        }
        if (b.pBreaches > 0) {
          aDmg = b.pBreaches * 500000;
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
          if (b.pBreaches > 8) { setGameOver({ winner: username, reason: "Enemy HQ overwhelmed" }); endLog.push("ENEMY HQ DESTROYED!"); }
        }

        setPlayerBudget((p) => p - pDmg);
        setAiBudget((p) => p - aDmg);

        // Update surviving interceptors
        setPlayerInterceptors((prev) => prev.map((d) => {
          const surviving = b.pInts.filter((i) => (i.status === "active" || i.status === "landed") && dist(i, d) < 1500).length;
          return { ...d, count: Math.max(0, surviving) };
        }));
        aiSetup.interceptors = b.aInts.filter((i) => i.status === "active");

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

        if (round + 1 >= TOTAL_ROUNDS && !gameOver) {
          setGameOver({ winner: playerBudget - pDmg > aiBudget - aDmg ? username : opponentName, reason: "Final score" });
        }
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
  }, [playerHQ, aiSetup, currentRound, playerResources, playerInterceptors, playerAD, playerAttack, playerBudget, aiBudget, gameOver, battleActive, username, opponentName, attackPriority]);

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

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
              {phase === PHASE.COMBAT && <span style={{ color: "#888" }}>Round {currentRound}/{TOTAL_ROUNDS}</span>}
            </div>
          )}
        </div>

        {/* Lobby */}
        {phase === PHASE.LOBBY && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", maxWidth: 400 }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#ff6688", marginBottom: 8 }}>SWARM 1v1</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>Defend your base. Destroy theirs.</div>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 24 }}>vs AI opponent</div>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter callsign..."
                style={{ ...inputStyle, width: "100%", fontSize: 16, textAlign: "center", marginBottom: 12 }}
                onKeyDown={(e) => e.key === "Enter" && findMatch()} />
              <select value={theater} onChange={(e) => setTheater(e.target.value)}
                style={{ ...inputStyle, width: "100%", marginBottom: 16 }}>
                {Object.entries(THEATERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
              <button onClick={findMatch} disabled={!username.trim()}
                style={{ ...btnStyle, width: "100%", background: username.trim() ? "#4a1a2a" : "#1a1a24", borderColor: username.trim() ? "#ff6688" : "#333", color: username.trim() ? "#ff6688" : "#555" }}>
                START vs AI
              </button>
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
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Place HQ in the north half, add resources, defenses, ground AD, then design your attack wave and launch.</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Budget: <span style={{ color: remaining >= 0 ? "#4caf50" : "#ff5555", fontWeight: 600 }}>${formatUSD(remaining)}</span></div>

                  <button onClick={() => setPlacingWhat("hq")} disabled={!!playerHQ}
                    style={{ ...inputStyle, width: "100%", marginBottom: 6, cursor: playerHQ ? "not-allowed" : "pointer", opacity: playerHQ ? 0.4 : 1, textAlign: "center", fontSize: 11, border: placingWhat === "hq" ? "1px solid #4a9eff" : "1px solid #2a2a35" }}>
                    {playerHQ ? "HQ Placed" : placingWhat === "hq" ? "Click north half..." : "Place HQ"}
                  </button>

                  {playerHQ && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 10, color: "#888" }}>Airspace:</span>
                        <input type="range" min="1000" max="4000" step="200" value={playerAirspace} onChange={(e) => setPlayerAirspace(parseInt(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: "#4a9eff" }}>{playerAirspace}m</span>
                      </div>

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#cc8800", margin: "8px 0 4px" }}>Resources</div>
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
                        <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <span style={{ flex: 1, fontSize: 10, color: "#ff6666" }}>{a.name} ${formatUSD(a.cost)}</span>
                          <input type="number" value={playerAttack[a.key] || 0} min="0" max="200"
                            onChange={(e) => setPlayerAttack((p) => ({ ...p, [a.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            style={{ width: 45, ...inputStyle, fontSize: 10, textAlign: "center", padding: "2px 4px" }} />
                        </div>
                      ))}
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

                      <button onClick={() => { setPhase(PHASE.COMBAT); }} disabled={remaining < 0}
                        style={{ ...btnStyle, width: "100%", marginTop: 12, background: remaining >= 0 ? "#4a1a2a" : "#1a1a24", borderColor: remaining >= 0 ? "#ff6688" : "#333", color: remaining >= 0 ? "#ff6688" : "#555", fontSize: 12 }}>
                        READY FOR BATTLE
                      </button>
                    </>
                  )}
                </>
              )}

              {phase === PHASE.COMBAT && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#ff6688", marginBottom: 8 }}>
                    {gameOver ? "GAME OVER" : battleActive ? "BATTLE IN PROGRESS" : `Round ${currentRound + 1} / ${TOTAL_ROUNDS}`}
                  </div>

                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Interceptors: {playerInterceptors.reduce((s, d) => s + d.count, 0)} | AD: {playerAD.filter((a) => a.health > 0).length}</div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Resources: {playerResources.filter((r) => r.alive).length} alive</div>
                  <div style={{ fontSize: 10, color: remaining >= 0 ? "#4caf50" : "#ff5555", marginBottom: 8 }}>Available: ${formatUSD(Math.max(0, playerBudget - spent))}</div>

                  {/* Between-round buying */}
                  {!gameOver && !battleActive && currentRound < TOTAL_ROUNDS && (
                    <>
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

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#ff5555", margin: "4px 0 4px" }}>Attack Wave</div>
                      {ATTACK_UNITS.map((a) => (
                        <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <span style={{ flex: 1, fontSize: 9, color: "#ff6666" }}>{a.name}</span>
                          <input type="number" value={playerAttack[a.key] || 0} min="0" max="200"
                            onChange={(e) => setPlayerAttack((p) => ({ ...p, [a.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            style={{ width: 40, ...inputStyle, fontSize: 9, textAlign: "center", padding: "2px" }} />
                        </div>
                      ))}
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
                      <div style={{ fontSize: 11, color: "#ff9800", marginBottom: 4 }}>Battle in progress...</div>
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
                      <button onClick={() => {
                        setPhase(PHASE.LOBBY); setMapReady(false);
                        if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; layerRef.current = null; battleLayerRef.current = null; LRef.current = null; }
                      }} style={{ ...inputStyle, marginTop: 12, cursor: "pointer", fontSize: 11 }}>
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
              <div ref={mapRef} style={{ width: "100%", height: "100%", cursor: placingWhat ? "crosshair" : "grab" }} />
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
