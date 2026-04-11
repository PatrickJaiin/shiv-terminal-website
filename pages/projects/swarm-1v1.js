import Head from "next/head";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";

const ARENA = 10000;
// Kill radius in real-world meters. Converted to sim units per theater via mpu.
const KILL_RADIUS_M = 2500;

// Theaters scaled to real-world geography. Bigger theaters mean each sim unit covers
// more meters, so AD ranges shrink in sim units (but stay correct in km on the map).
// ukraine_russia is the flagship large theater - one player deploys in Ukraine (south),
// the other in Russia (north). Smaller theaters like Taiwan keep tighter bounds.
// Each theater has:
// - airspace: [default, min, max] in sim units, scaled to ~130km real coverage
// - zones: lat/lng centers for each player's deployment area, placed on real geography
//   (e.g. Ukraine zone around Kyiv, Russia zone near Moscow approaches)
const THEATERS = {
  ukraine_russia: {
    name: "Ukraine - Russia",
    bounds: { south: 46, north: 56.5, west: 25, east: 41 },
    mapCenter: [51.2, 33], mapZoom: 5,
    airspace: [1000, 400, 1250],
    zones: {
      player:   { lat: 49.0, lng: 31.0, label: "BLUE SIDE" },   // Kyiv-Dnipro area
      opponent: { lat: 54.5, lng: 37.0, label: "RED SIDE" },     // Moscow approaches
    },
  },
  kashmir: {
    name: "India-Pakistan LoC",
    bounds: { south: 32, north: 36, west: 72, east: 77 },
    mapCenter: [34, 74.5], mapZoom: 7,
    airspace: [1000, 400, 1250],
    zones: {
      player:   { lat: 32.8, lng: 74.8, label: "BLUE SIDE" },      // Jammu side
      opponent: { lat: 35.0, lng: 73.5, label: "RED SIDE" },     // Central Pakistan side
    },
  },
  israel_iran: {
    name: "Israel-Iran",
    bounds: { south: 27, north: 37, west: 34, east: 55 },
    mapCenter: [32, 44], mapZoom: 5,
    airspace: [1000, 400, 1250],
    zones: {
      player:   { lat: 31.5, lng: 35.0, label: "BLUE SIDE" },     // Central Israel
      opponent: { lat: 34.5, lng: 51.5, label: "RED SIDE" },        // Tehran area
    },
  },
  taiwan_strait: {
    name: "Taiwan Strait",
    bounds: { south: 21.5, north: 26.5, west: 117, east: 123 },
    mapCenter: [24, 120], mapZoom: 6,
    airspace: [1000, 400, 1250],
    zones: {
      player:   { lat: 24.0, lng: 121.0, label: "BLUE SIDE" },    // Western Taiwan
      opponent: { lat: 24.5, lng: 118.5, label: "RED SIDE" },      // Fujian coast
    },
  },
};

// Repriced per game economics audit (Apr 2026):
// FPV bumped from $500 → $15K to match Kamikaze interceptor cost (1:1 economics).
// HP added per threat tier so cheap ADs need more shots vs expensive drones.
// HP values are tuned so the Gepard (dmg 1, pk 0.5) needs ~hp*2 attempts on average to
// kill each drone. FPV nerfed to hp 2 → ~4 Gepard attempts (so it 2-shots on hits).
// Other drones rebalanced relative to FPV: shahed slightly tankier, lancet medium,
// mohajer the heavy that needs sustained fire to take down.
// Speeds reflect real-world ratios (normalized so Shahed at 180km/h = 2.0 sim units/tick).
// FPV: 130km/h racing drone repurposed for combat. Lancet: 100km/h slow loitering munition.
// Mohajer: 175km/h fast MALE UAV. These ratios match reality unlike the old arbitrary values.
const ATTACK_UNITS = [
  { key: "fpv", name: "FPV Drone", cost: 21000, speed: 1.5, threat: "cheap", hp: 2, speed_kmh: 130 },
  { key: "shahed", name: "Shahed-136", cost: 28000, speed: 2.0, threat: "cheap", hp: 3, speed_kmh: 180 },
  { key: "lancet", name: "Lancet-3", cost: 50000, speed: 1.1, threat: "medium", hp: 5, speed_kmh: 100 },
  { key: "mohajer", name: "Mohajer-6", cost: 710000, speed: 1.9, threat: "expensive", hp: 12, speed_kmh: 175 },
];

const DEFENSE_UNITS = [
  { key: "kamikaze", name: "Kamikaze Interceptor", cost: 15000, speed: 2.2, destroyOnKill: true },
  { key: "armed", name: "Armed Interceptor", cost: 180000, speed: 1.8, destroyOnKill: false, survivalRate: 0.73 },
];

// AD damage system (Apr 2026 rebalance):
// Each AD does `dmg` HP per hit. Drone HP varies by threat tier (1/1/3/8).
// Gepard does 1 dmg → kills cheap drones in 1 shot but burns through ammo on Mohajer (8 shots).
// NASAMS does 100 dmg → one-shots everything regardless of HP.
// pK is now "hit chance"; on hit we deduct dmg from target.hp; drone dies at hp <= 0.
// AD ranges are stored in real-world meters (range_m). Converted to sim units per theater
// inside the component via getProjection(theater.bounds).mpu. This means Iron Dome covers
// 70km on all theaters but that's a bigger fraction of a small map (Taiwan) vs a large one
// (Ukraine-Russia). range field is kept as a fallback and used for display formatting.
const AD_SYSTEMS_1V1 = [
  { key: "iron_dome", name: "Iron Dome", cost: 50000000, range_m: 105000, missiles: 60, missileCost: 50000, pk: 0.9, engageRate: 3, dmg: 3, color: "#44bbff" },
  { key: "gepard", name: "Gepard", cost: 5000000, range_m: 7500, missiles: 680, missileCost: 100, pk: 0.5, engageRate: 1, dmg: 1, color: "#88aa44" },
  { key: "nasams", name: "NASAMS 3", cost: 30000000, range_m: 75000, missiles: 20, missileCost: 500000, pk: 0.95, engageRate: 4, dmg: 100, color: "#4488ff" },
  { key: "pantsir", name: "Pantsir-S1", cost: 15000000, range_m: 30000, missiles: 12, missileCost: 60000, pk: 0.8, engageRate: 3, dmg: 2, color: "#cc8800" },
];

// Resource economy follows niche-distinction principle:
// Resource ROI improves with cost - expensive resources reward the risk/investment.
// Solar: 25% return (4-round ROI), cheap safe early eco
// Arms: 30% return (3.3-round ROI), mid-tier
// Oil: 35% return (2.9-round ROI), strong but costly
// Hydro: 40% return (2.5-round ROI), best return but scarce nodes, biggest loss if breached
const RESOURCES = [
  { key: "solar", name: "Solar Farm", cost: 2000000, income: 500000, breachDmg: 4000000, color: "#44bb44", icon: "S" },
  { key: "arms", name: "Arms Factory", cost: 5000000, income: 1500000, breachDmg: 9000000, color: "#8888cc", icon: "A" },
  { key: "oil", name: "Oil Refinery", cost: 8000000, income: 2800000, breachDmg: 16000000, color: "#cc8800", icon: "O" },
  { key: "hydro", name: "Hydropower Plant", cost: 14000000, income: 5600000, breachDmg: 22000000, color: "#44aadd", icon: "H" },
];

// Unit sketches for the inspector preview popup. AD systems use real reference photos
// from Wikimedia Commons (CC-licensed, downloaded to /public/images/units/). Resources
// keep their inline SVG silhouettes (the simulator's "industrial building" stylized
// shapes) since they're abstract gameplay elements without specific real-world referents.
// Interceptors stay as inline SVG since the kamikaze/armed types are fictional gameplay
// units rather than specific real platforms.
const UNIT_IMG_PATH = "/images/units/";
const UNIT_SKETCHES = {
  ad: {
    iron_dome: `<img src="${UNIT_IMG_PATH}iron_dome.jpg" alt="Iron Dome" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    gepard: `<img src="${UNIT_IMG_PATH}gepard.jpg" alt="Flakpanzer Gepard" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    nasams: `<img src="${UNIT_IMG_PATH}nasams.jpg" alt="NASAMS" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    pantsir: `<img src="${UNIT_IMG_PATH}pantsir.jpg" alt="Pantsir-S1" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
  },
  resource: {
    solar: `<svg width="80" height="60" viewBox="0 0 80 60"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#66dd66"/><stop offset="100%" stop-color="#228822"/></linearGradient></defs><rect x="8" y="10" width="28" height="20" rx="1" fill="url(#sg)" stroke="#fff" stroke-width="1.5"/><rect x="44" y="10" width="28" height="20" rx="1" fill="url(#sg)" stroke="#fff" stroke-width="1.5"/><rect x="8" y="34" width="28" height="20" rx="1" fill="url(#sg)" stroke="#fff" stroke-width="1.5"/><rect x="44" y="34" width="28" height="20" rx="1" fill="url(#sg)" stroke="#fff" stroke-width="1.5"/><line x1="22" y1="10" x2="22" y2="30" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="58" y1="10" x2="58" y2="30" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="22" y1="34" x2="22" y2="54" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="58" y1="34" x2="58" y2="54" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="8" y1="20" x2="36" y2="20" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="44" y1="20" x2="72" y2="20" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="8" y1="44" x2="36" y2="44" stroke="#fff" stroke-width="0.5" opacity="0.6"/><line x1="44" y1="44" x2="72" y2="44" stroke="#fff" stroke-width="0.5" opacity="0.6"/><circle cx="40" cy="4" r="3" fill="#ffdd44" opacity="0.8"/><line x1="40" y1="7" x2="40" y2="10" stroke="#ffdd44" stroke-width="0.8" opacity="0.5"/></svg>`,
    arms: `<svg width="80" height="60" viewBox="0 0 80 60"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9999dd"/><stop offset="100%" stop-color="#555588"/></linearGradient></defs><rect x="6" y="30" width="68" height="24" rx="2" fill="url(#ag)" stroke="#fff" stroke-width="1.5"/><path d="M 6 30 L 22 18 L 38 30" fill="#7777bb" stroke="#fff" stroke-width="1.5"/><path d="M 38 30 L 54 20 L 68 30" fill="#6666aa" stroke="#fff" stroke-width="1.5"/><rect x="14" y="38" width="8" height="10" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="0.8"/><rect x="26" y="38" width="8" height="10" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="0.8"/><rect x="38" y="38" width="8" height="10" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="0.8"/><rect x="50" y="38" width="8" height="10" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="0.8"/><rect x="62" y="12" width="10" height="22" rx="1" fill="#8888cc" stroke="#fff" stroke-width="1.5"/><circle cx="67" cy="8" r="2.5" fill="#aaa" opacity="0.5"/><circle cx="65" cy="4" r="1.5" fill="#999" opacity="0.3"/></svg>`,
    oil: `<svg width="80" height="60" viewBox="0 0 80 60"><defs><linearGradient id="og" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ee9900"/><stop offset="100%" stop-color="#885500"/></linearGradient></defs><rect x="28" y="6" width="24" height="44" rx="3" fill="url(#og)" stroke="#fff" stroke-width="1.5"/><rect x="18" y="18" width="44" height="5" rx="1" fill="#cc8800" stroke="#fff" stroke-width="1"/><rect x="18" y="32" width="44" height="5" rx="1" fill="#cc8800" stroke="#fff" stroke-width="1"/><rect x="4" y="42" width="28" height="14" rx="2" fill="#cc8800" stroke="#fff" stroke-width="1.5"/><rect x="48" y="42" width="28" height="14" rx="2" fill="#cc8800" stroke="#fff" stroke-width="1.5"/><line x1="40" y1="6" x2="40" y2="2" stroke="#fff" stroke-width="2"/><circle cx="40" cy="2" r="2" fill="#ff6600"/><path d="M 36 2 Q 38 -2 40 2 Q 42 -2 44 2" fill="none" stroke="#ff4400" stroke-width="0.8" opacity="0.7"/></svg>`,
    hydro: `<svg width="80" height="60" viewBox="0 0 80 60"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#55bbee"/><stop offset="100%" stop-color="#226688"/></linearGradient></defs><path d="M 4 14 L 4 50 Q 4 54 8 54 L 72 54 Q 76 54 76 50 L 76 14 L 70 8 L 10 8 Z" fill="url(#hg)" stroke="#fff" stroke-width="1.5"/><rect x="22" y="18" width="8" height="28" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="1"/><rect x="36" y="18" width="8" height="28" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="1"/><rect x="50" y="18" width="8" height="28" rx="1" fill="#1a1a24" stroke="#fff" stroke-width="1"/><path d="M 22 50 Q 24 54 20 58" fill="none" stroke="#88ddff" stroke-width="1" opacity="0.6"/><path d="M 36 50 Q 38 54 34 58" fill="none" stroke="#88ddff" stroke-width="1" opacity="0.6"/><path d="M 50 50 Q 52 54 48 58" fill="none" stroke="#88ddff" stroke-width="1" opacity="0.6"/><path d="M 28 50 Q 30 55 26 58" fill="none" stroke="#88ddff" stroke-width="0.8" opacity="0.4"/></svg>`,
  },
  interceptor: {
    kamikaze: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><circle cx="30" cy="30" r="6" fill="#fff"/><line x1="30" y1="8" x2="30" y2="18" stroke="#fff" stroke-width="2"/><line x1="30" y1="42" x2="30" y2="52" stroke="#fff" stroke-width="2"/><line x1="8" y1="30" x2="18" y2="30" stroke="#fff" stroke-width="2"/><line x1="42" y1="30" x2="52" y2="30" stroke="#fff" stroke-width="2"/></svg>`,
    armed: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><polygon points="30,8 44,46 30,38 16,46" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`,
  },
};

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

// Deployment zones: two circles on geographically correct positions where players build.
// Zone centers are defined in lat/lng per theater, converted to sim coords at runtime.
const ZONE_RADIUS = 2500;

// Convert a theater's lat/lng zone definitions to sim coordinates.
// Enforces a minimum gap so a HQ on the zone edge with max airspace can't
// reach enemy territory: dist >= 2*ZONE_RADIUS + maxAirspace + buffer.
function getZones(theater) {
  const th = THEATERS[theater];
  if (!th || !th.zones) return { p1: { x: ARENA * 0.35, y: ARENA * 0.3 }, p2: { x: ARENA * 0.65, y: ARENA * 0.7 } };
  const toSim = (lat, lng) => latLngToSim(lat, lng, th.bounds);
  const r1 = toSim(th.zones.player.lat, th.zones.player.lng);
  const r2 = toSim(th.zones.opponent.lat, th.zones.opponent.lng);
  const clamp = (v) => Math.max(ZONE_RADIUS, Math.min(ARENA - ZONE_RADIUS, v));
  let p1 = { x: clamp(r1[0]), y: clamp(r1[1]) };
  let p2 = { x: clamp(r2[0]), y: clamp(r2[1]) };
  // Push zones apart if too close. minGap = both zone radii + max airspace + 500 buffer.
  const maxAir = (th.airspace || [2000, 500, 4000])[2];
  const minGap = ZONE_RADIUS * 2 + maxAir + 500;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < minGap && d > 0) {
    const scale = minGap / d;
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    p1 = { x: clamp(mx - dx / 2 * scale), y: clamp(my - dy / 2 * scale) };
    p2 = { x: clamp(mx + dx / 2 * scale), y: clamp(my + dy / 2 * scale) };
  }
  return { p1, p2 };
}

function randInCircle(cx, cy, r) {
  const angle = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r; // sqrt for uniform area distribution
  return { x: cx + Math.cos(angle) * d, y: cy + Math.sin(angle) * d };
}

// Generate resource deposits distributed across two deployment zones + contested middle.
function generateResourceDeposits(theater) {
  const th = THEATERS[theater];
  const mpu = th ? getProjection(th.bounds).mpu : 22;
  const scale = Math.max(1, Math.round(Math.sqrt(mpu / 22)));
  const zones = getZones(theater);
  const deposits = [];
  let id = 0;

  // Per-zone deposits: each zone gets solar/arms/oil nodes inside and nearby
  for (const zone of [zones.p1, zones.p2]) {
    for (const key of ["solar", "arms", "oil"]) {
      const count = Math.round(4 * scale);
      for (let i = 0; i < count; i++) {
        const p = randInCircle(zone.x, zone.y, ZONE_RADIUS * 1.1);
        const x = Math.max(300, Math.min(ARENA - 300, p.x));
        const y = Math.max(300, Math.min(ARENA - 300, p.y));
        deposits.push({ id: id++, key, x, y, claimed: false });
      }
    }
    // Hydro near zone edges (rivers at the periphery)
    for (let i = 0; i < scale; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Math.max(300, Math.min(ARENA - 300, zone.x + Math.cos(angle) * ZONE_RADIUS * 0.9));
      const y = Math.max(300, Math.min(ARENA - 300, zone.y + Math.sin(angle) * ZONE_RADIUS * 0.9));
      deposits.push({ id: id++, key: "hydro", x, y, claimed: false });
    }
  }

  // Contested middle: high-value nodes between the two zones that either player can claim.
  // Placed at the midpoint between the two zone centers with random scatter.
  const midX = (zones.p1.x + zones.p2.x) / 2;
  const midY = (zones.p1.y + zones.p2.y) / 2;
  for (const key of ["oil", "hydro", "arms"]) {
    const count = Math.round(2 * scale);
    for (let i = 0; i < count; i++) {
      const x = Math.max(300, Math.min(ARENA - 300, midX + (Math.random() - 0.5) * ZONE_RADIUS * 1.5));
      const y = Math.max(300, Math.min(ARENA - 300, midY + (Math.random() - 0.5) * ZONE_RADIUS * 1.0));
      deposits.push({ id: id++, key, x, y, claimed: false });
    }
  }

  return deposits;
}

function generateAISetup(theater) {
  // AI spawns in the opponent zone, jittered within the zone radius
  const zones = getZones(theater);
  const hqX = zones.p2.x + (Math.random() - 0.5) * ZONE_RADIUS * 0.6;
  const hqY = zones.p2.y + (Math.random() - 0.5) * ZONE_RADIUS * 0.4;
  const th = THEATERS[theater];
  const aiAirspace = th ? Math.round((th.airspace[0] + th.airspace[2]) / 2) : 2000;
  return {
    hqX, hqY, airspace: aiAirspace,
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

// AI spends accumulated budget on defenses between rounds.
// Priorities: (1) replace destroyed AD, (2) top up interceptors, (3) upgrade AD over time,
// (4) claim more deposits if budget is huge.
function aiSpendBudget(aiSetup, deposits, currentBudget, round) {
  let budget = currentBudget;
  const newAdUnits = [...(aiSetup.adUnits || [])];
  const newInterceptors = [...(aiSetup.interceptors || [])];
  const newResources = [...(aiSetup.resources || [])];
  const newDeposits = [...deposits];

  // Priority 1: replace destroyed AD systems back up to 4 baseline ADs
  while (newAdUnits.length < 4 && budget >= 5000000) {
    budget -= 5000000;
    newAdUnits.push({
      key: "gepard",
      x: aiSetup.hqX + (Math.random() - 0.5) * 1500,
      y: aiSetup.hqY + 600 + Math.random() * 600,
      health: 1, ammo: 680,
    });
  }

  // Priority 2: top up interceptors if active count is low
  const activeCount = newInterceptors.filter((i) => i.status === "active").length;
  const targetInts = 12 + round * 2;
  if (activeCount < targetInts && budget >= 60000) {
    const toBuy = Math.min(8, targetInts - activeCount);
    budget -= 15000 * toBuy;
    for (let i = 0; i < toBuy; i++) {
      newInterceptors.push({
        id: 5000 + Date.now() + i,
        x: aiSetup.hqX + (Math.random() - 0.5) * 800,
        y: aiSetup.hqY + 1200 + Math.random() * 400,
        speed: 2.4, status: "active", targetId: null,
        destroyOnKill: true, survivalRate: 0.75,
      });
    }
  }

  // Priority 3: upgrade AD - add a Pantsir every 2 rounds, NASAMS at round 5+
  if (round >= 2 && round % 2 === 0 && budget >= 15000000 && newAdUnits.filter((a) => a.key === "pantsir").length < 2) {
    budget -= 15000000;
    newAdUnits.push({
      key: "pantsir",
      x: aiSetup.hqX + (Math.random() - 0.5) * 1000,
      y: aiSetup.hqY + 400 + Math.random() * 400,
      health: 1, ammo: 12,
    });
  }
  if (round >= 5 && budget >= 40000000 && !newAdUnits.some((a) => a.key === "nasams")) {
    budget -= 40000000;
    newAdUnits.push({
      key: "nasams",
      x: aiSetup.hqX + (Math.random() - 0.5) * 800,
      y: aiSetup.hqY + 800 + Math.random() * 600,
      health: 1, ammo: 20,
    });
  }

  // Priority 4: claim more resources if there's budget headroom
  for (const key of ["solar", "arms", "oil", "hydro"]) {
    const res = RESOURCES.find((r) => r.key === key);
    if (!res || budget < res.cost * 1.5) continue;
    // Already claimed 2+ of this type? Skip.
    if (newResources.filter((r) => r.key === key && r.alive).length >= 2) continue;
    // Find a deposit near AI HQ that isn't claimed
    const candidates = newDeposits
      .filter((d) => d.key === key && !d.claimed && Math.hypot(d.x - aiSetup.hqX, d.y - aiSetup.hqY) < (aiSetup.airspace || 2500))
      .map((d) => ({ d, dist: Math.hypot(d.x - aiSetup.hqX, d.y - aiSetup.hqY) }))
      .sort((a, b) => a.dist - b.dist);
    if (candidates.length > 0) {
      const claimed = candidates[0].d;
      const idx = newDeposits.findIndex((dd) => dd.id === claimed.id);
      if (idx >= 0) newDeposits[idx] = { ...newDeposits[idx], claimed: true };
      newResources.push({ key, x: claimed.x, y: claimed.y, alive: true, depositId: claimed.id });
      budget -= res.cost;
    }
  }

  return { budget, adUnits: newAdUnits, interceptors: newInterceptors, resources: newResources, deposits: newDeposits };
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
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { _audioCtx = null; }
  }
  // Browsers create AudioContext in "suspended" state until a user gesture calls resume().
  // Without this, every playSfx() call is silently dropped. Safe to call repeatedly -
  // resume() is idempotent on running contexts. iOS Safari also re-suspends on tab hide,
  // so the global pointerdown/keydown listener below acts as a re-arm safety net.
  if (_audioCtx && _audioCtx.state === "suspended") {
    try { _audioCtx.resume(); } catch {}
  }
  return _audioCtx;
}
function playSfx(name, throttleMs = 40) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  if (_audioThrottle[name] && now - _audioThrottle[name] < throttleMs) return;
  _audioThrottle[name] = now;
  const ctx = _audioCtx;
  // ctx.state can be "suspended" / "running" / "closed". Only "running" produces sound;
  // calling oscillator methods on a suspended context schedules them but they don't fire,
  // so we'd get silent "ghost" sfx instead of bailing out.
  if (!ctx || ctx.state !== "running") return;
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

// PeerJS ICE config: STUN servers for NAT traversal + TURN relay fetched from /api/match/turn.
// STUN handles ~85% of NAT configs. For symmetric NAT (common on mobile/corporate networks),
// TURN relay credentials are fetched from metered.ca via our API route at match start.
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];
const STUN_ONLY_CONFIG = { iceServers: STUN_SERVERS };
// Cached TURN credentials (refreshed every ~5 min via the API's Cache-Control).
let _turnCache = { servers: null, fetchedAt: 0 };
async function getIceConfig() {
  // Re-fetch if cache is older than 4 min (API caches for 5 min)
  if (_turnCache.servers && Date.now() - _turnCache.fetchedAt < 240_000) {
    return { iceServers: [...STUN_SERVERS, ..._turnCache.servers] };
  }
  try {
    const r = await fetch("/api/match/turn");
    if (!r.ok) return STUN_ONLY_CONFIG;
    const data = await r.json();
    if (data.iceServers && data.iceServers.length > 0) {
      _turnCache = { servers: data.iceServers, fetchedAt: Date.now() };
      return { iceServers: [...STUN_SERVERS, ..._turnCache.servers] };
    }
  } catch {}
  return STUN_ONLY_CONFIG;
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
        hp: u.hp || 1, maxHp: u.hp || 1,
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
  const [theater, setTheater] = useState("ukraine_russia");
  const [selectedTheaters, setSelectedTheaters] = useState(() => Object.keys(THEATERS));
  const [matchTimer, setMatchTimer] = useState(0);

  // Theater-dependent scaling: AD ranges and kill radius in sim units, computed from
  // real-world meters divided by this theater's meters-per-unit. Big theaters (Ukraine-Russia
  // at ~1200km) have smaller sim-unit ranges than small theaters (Taiwan at ~600km), but
  // the km values on the map are always accurate.
  const theaterScale = useMemo(() => {
    const th = THEATERS[theater];
    if (!th) return { mpu: 100, killRadius: 25, ad: AD_SYSTEMS_1V1 };
    const mpu = getProjection(th.bounds).mpu;
    return {
      mpu,
      killRadius: Math.max(8, Math.round(KILL_RADIUS_M / mpu)),
      ad: AD_SYSTEMS_1V1.map((s) => ({ ...s, range: Math.max(40, Math.round(s.range_m / mpu)) })),
    };
  }, [theater]);

  // Player setup
  const [playerHQ, setPlayerHQ] = useState(null);
  // Which geographic side the player deploys on: "blue" (p1 zone) or "red" (p2 zone).
  // Determined when HQ is placed based on proximity to zone centers. Fixed for the match.
  // Colors are geographic, not perspective-based - a player in the red zone IS red.
  const [playerSide, setPlayerSide] = useState("blue");
  const playerColor = playerSide === "red" ? "#ff5555" : "#4a9eff";
  const opponentColor = playerSide === "red" ? "#4a9eff" : "#ff5555";
  // Phase B: additional HQs at increasing cost. Each is a fortified position with its own
  // small airspace circle, providing redundancy. Diminishing returns: 2nd costs 25M, 3rd costs 50M.
  const [playerExtraHQs, setPlayerExtraHQs] = useState([]); // [{x, y}, ...]
  const EXTRA_HQ_COSTS = [25000000, 50000000]; // cost for placing 2nd, 3rd HQ
  const [playerAirspace, setPlayerAirspace] = useState(() => (THEATERS[theater]?.airspace || [2000])[0] || 2000);
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
  const [peerLoaded, setPeerLoaded] = useState(() => typeof window !== "undefined" && !!window.Peer);
  // Fallback: if the Script onLoad doesn't fire (Next.js race condition) or unpkg is slow,
  // poll for window.Peer every 500ms. After 4s, try loading from jsdelivr CDN.
  useEffect(() => {
    if (peerLoaded) return;
    let fallbackFired = false;
    const iv = setInterval(() => {
      if (typeof window !== "undefined" && window.Peer) { setPeerLoaded(true); clearInterval(iv); }
    }, 500);
    const fallbackTimer = setTimeout(() => {
      if (peerLoaded || (typeof window !== "undefined" && window.Peer)) return;
      fallbackFired = true;
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
      s.onload = () => setPeerLoaded(true);
      document.head.appendChild(s);
    }, 4000);
    return () => { clearInterval(iv); clearTimeout(fallbackTimer); };
  }, [peerLoaded]);
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
  const [mmElapsed, setMmElapsed] = useState(0); // seconds since matchmaking started
  const [mmStats, setMmStats] = useState({ queueing: 0, inMatchPlayers: 0 }); // global counts
  const mmStartedAtRef = useRef(0); // timestamp when matchmaking started
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
  const theaterScaleRef = useRef(theaterScale);
  theaterScaleRef.current = theaterScale;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const opponentColorRef = useRef(opponentColor);
  opponentColorRef.current = opponentColor;
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
    setPlayerAirspace((THEATERS[theaterRef.current]?.airspace || [2000])[0]);
    setAttackPriority("hq");
    setDefPosture("pursuing");
    // Also clear opponent setup and deposits. Without this, going Lobby -> Create Room
    // carries aiSetup from a previous match forward into the static-draw effect's first
    // render of the new map, painting a stale "pre-placed" enemy base on the new match's
    // map until the next setAiSetup call overwrites it. Clearing here means the default
    // state is guaranteed empty.
    setAiSetup(null);
    setResourceDeposits([]);
    // Reset Phase 2 broadcast sentinels so a fresh match re-broadcasts current values
    if (lastBroadcastRef.current) {
      lastBroadcastRef.current.airspace = null;
      lastBroadcastRef.current.attack = null;
      lastBroadcastRef.current.priority = null;
      lastBroadcastRef.current.posture = null;
      lastBroadcastRef.current.ready = null;
      lastBroadcastRef.current.trajectory = null;
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
        const deposits = generateResourceDeposits(theaterRef.current);
        const newAi = generateAISetup(theaterRef.current);
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
      case "theater_sync": {
        // Host tells guest which theater to use (for private rooms)
        if (msg.theater && THEATERS[msg.theater]) {
          setTheater(msg.theater);
          theaterRef.current = msg.theater;
        }
        break;
      }
      case "deposits": {
        // Host pushes the canonical deposit list to guest on connect
        if (Array.isArray(msg.deposits)) setResourceDeposits(msg.deposits);
        break;
      }
      case "place_hq": {
        setAiSetup((prev) => ({ ...(prev || {}), hqX: msg.x, hqY: msg.y, airspace: prev?.airspace ?? (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: prev?.resources || [], interceptors: prev?.interceptors || [], adUnits: prev?.adUnits || [] }));
        break;
      }
      case "place_extra_hq": {
        setAiSetup((prev) => {
          // Null HQ default is CRITICAL: the previous hardcoded `{ hqX: 5000, hqY: 2500 }`
          // default painted a phantom enemy HQ in the center of the map before the guest
          // had actually placed one. Any message arriving before place_hq would trigger it.
          const next = prev ? { ...prev } : { hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] };
          next.extraHQs = [...(next.extraHQs || []), { x: msg.x, y: msg.y }];
          return next;
        });
        break;
      }
      case "airspace": {
        // Same null-default fix: nullish-coalescing prev.hqX with 5000 was triggering
        // the moment prev.hqX was null (which it always is pre-place_hq), so the airspace
        // broadcast from conn-open-resync was spawning a phantom HQ at center-map.
        setAiSetup((prev) => ({ ...(prev || {}), airspace: msg.radius, hqX: prev?.hqX ?? null, hqY: prev?.hqY ?? null, resources: prev?.resources || [], interceptors: prev?.interceptors || [], adUnits: prev?.adUnits || [] }));
        break;
      }
      case "place_resource": {
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] };
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
          const next = prev ? { ...prev } : { hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] };
          const sys = theaterScaleRef.current.ad.find((s) => s.key === msg.key);
          next.adUnits = [...(next.adUnits || []), { key: msg.key, x: msg.x, y: msg.y, health: 1, ammo: sys?.missiles || 100, priority: "all" }];
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
      case "ad_priority": {
        setAiSetup((prev) => {
          if (!prev) return prev;
          const adUnits = (prev.adUnits || []).map((a) =>
            a.x === msg.x && a.y === msg.y ? { ...a, priority: msg.priority } : a
          );
          return { ...prev, adUnits };
        });
        break;
      }
      case "place_interceptor_group": {
        // Opponent places a group of N interceptors. We expand into individual entities
        // so the existing static-draw code (which expects individual interceptors) renders them.
        setAiSetup((prev) => {
          const next = prev ? { ...prev } : { hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] };
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
      case "trajectory": {
        // Guest sent updated trajectory waypoints. Stash on aiSetup so launchRound can
        // pass them to spawnDrones when generating the guest's attackers.
        setAiSetup((prev) => ({ ...(prev || {}), _trajectory: Array.isArray(msg.waypoints) ? msg.waypoints : [] }));
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
        // Drop late snapshots arriving after round_end. The host emits a final combat_snapshot
        // immediately before round_end and on a laggy link these can swap order. Without this
        // guard, the snapshot merges into a stopped guestTick (battleRef still truthy but
        // _guestRoundOver=true) and the next round_start re-uses the polluted ref - guest's
        // view freezes until round_start recreates everything.
        if (b._guestRoundOver) break;
        // Observed step rate: compute actual host sim-steps-per-ms from the gap between
        // this snapshot and the previous one. Much more accurate than assuming 60fps *
        // battleSpeed (which can be wrong if the host's requestAnimationFrame isn't
        // hitting 60fps, which it doesn't at high battleSpeed due to sim work per frame).
        // This is what drove the 'RTB drones shake on guest' jitter - the assumption was
        // that the host always ran at exactly 60*speed sims/sec but in practice at 16x
        // it was more like 40x effective, so the guest extrapolation overshot and kept
        // snapping back.
        const nowMs = performance.now();
        const prevStep = b.step || 0;
        const prevTime = b._lastSnapshotTime;
        const newStep = msg.step || 0;
        // Only update the observed rate when we have a real previous timestamp to
        // measure against. The first snapshot per round has no prior reference, so
        // computing observed from a 1ms floor would give a wildly inflated rate
        // and the very first interpolated tick would overshoot. Leave the rate
        // null on snapshot #1; guestTick already short-circuits when the rate is
        // missing, so no extrapolation happens until snapshot #2 establishes dt.
        if (prevTime != null) {
          const dtMs = Math.max(1, nowMs - prevTime);
          const stepsDelta = Math.max(0, newStep - prevStep);
          const observed = stepsDelta / dtMs;
          // EMA blend so a single missed/delayed snapshot doesn't swing the rate.
          const prevRate = b._obsHostStepsPerMs;
          b._obsHostStepsPerMs = prevRate == null ? observed : prevRate * 0.6 + observed * 0.4;
        }
        b.step = newStep;
        // Track snapshot interval (EMA-smoothed) for lerp-based interpolation.
        if (prevTime != null) {
          const gap = nowMs - prevTime;
          b._snapshotInterval = b._snapshotInterval ? b._snapshotInterval * 0.7 + gap * 0.3 : gap;
        }
        b._lastSnapshotTime = nowMs;
        // Swap: host's "p" -> guest's "a", host's "a" -> guest's "p"
        // Save previous snapshot positions (_prevX/_prevY) for lerp interpolation.
        // This replaces heading+speed extrapolation which caused visible jitter on
        // straight-line paths (especially RTB) due to rate estimation drift.
        const lerpMap = (arr, msgArr) => (msgArr || []).map((item) => {
          const old = arr.find((o) => o.id === item.id);
          return { id: item.id, x: item.x, y: item.y, _prevX: old ? old.x : item.x, _prevY: old ? old.y : item.y, status: item.s, threat: item.threat || "cheap", heading: item.hd, speed: item.spd };
        });
        const lerpMapInt = (arr, msgArr) => (msgArr || []).map((item) => {
          const old = arr.find((o) => o.id === item.id);
          return { id: item.id, x: item.x, y: item.y, _prevX: old ? old.x : item.x, _prevY: old ? old.y : item.y, status: item.s, heading: item.hd, speed: item.spd };
        });
        b.aAttackers = lerpMap(b.aAttackers, msg.pAtt);
        b.pAttackers = lerpMap(b.pAttackers, msg.aAtt);
        b.aInts = lerpMapInt(b.aInts, msg.pInt);
        b.pInts = lerpMapInt(b.pInts, msg.aInt);
        b.aAD = (msg.pAD || []).map((a) => ({ key: a.key, x: a.x, y: a.y, health: a.h, ammo: a.ammo, lastFired: a.lf }));
        b.pAD = (msg.aAD || []).map((a) => ({ key: a.key, x: a.x, y: a.y, health: a.h, ammo: a.ammo, lastFired: a.lf }));
        // Flashes carry wallTime from the HOST's performance.now() which is per-page-load
        // and unrelated to the guest's clock. If we trust host wallTime, the guest's age
        // calculation is wildly off: lasers either get filtered out instantly (host loaded
        // earlier - their clock is ahead) or never expire and accumulate (host loaded later -
        // their clock is behind). Both manifest as bugs the user sees. Fix: dedup by host
        // wallTime as an ID, re-stamp wallTime to guest-local performance.now() once per
        // unique flash, and merge into b.flashes so they age normally on the guest's clock.
        if (Array.isArray(msg.flashes) && msg.flashes.length > 0) {
          if (!b._seenFlashIds) b._seenFlashIds = new Set();
          if (!Array.isArray(b.flashes)) b.flashes = [];
          const guestNow = performance.now();
          for (const f of msg.flashes) {
            const id = f.wallTime; // host's wallTime as a stable per-flash ID
            if (id == null || b._seenFlashIds.has(id)) continue;
            b._seenFlashIds.add(id);
            b.flashes.push({ ...f, wallTime: guestNow });
            // Guest-side audio: playSfx lives only inside the host's tick, so the guest
            // never hears any sound from their own units. Route flash types to sfx here so
            // the guest gets the full audio experience. Throttling inside playSfx prevents
            // sound spam at high battle speeds. Skip dmgtext (visual only).
            if (f.type === "adshot") playSfx("ad_fire", 50);
            else if (f.type === "kill") playSfx("drone_kill", 60);
            else if (f.type === "drone_clash") playSfx("drone_kill", 60);
            else if (f.type === "ad_explosion") playSfx("hq_destroyed", 200);
            else if (f.type === "resource_explosion") playSfx("hq_destroyed", 200);
            else if (f.type === "breach") playSfx("breach_alarm", 250);
          }
          // Cap the seen set so it doesn't grow unbounded across long rounds.
          if (b._seenFlashIds.size > 2000) {
            // Drop the oldest half by recreating the set from the most recent.
            const arr = Array.from(b._seenFlashIds);
            b._seenFlashIds = new Set(arr.slice(arr.length / 2));
          }
        }
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

  // ── Helper: wire broker-resilience on a freshly created PeerJS peer ──
  // The free public PeerJS broker drops websocket connections often, especially over
  // high-latency / international links. PeerJS fires "disconnected" (NOT "error") when
  // the broker drops us; the peer object is still alive and peer.reconnect() re-registers
  // it under the same id. Without this, the host silently goes offline mid-lobby and the
  // guest hangs until our handshake timeout fires.
  const wirePeerResilience = (peer, getActive) => {
    let reconnectAttempts = 0;
    const MAX_ATTEMPTS = 10;
    // Listen for successful reconnect via the "open" event. PeerJS DOES re-fire
    // "open" after a successful reconnect() call (tested with PeerJS 1.5.x).
    // Reset the attempt counter so a single success restores the full retry budget.
    peer.on("open", () => {
      if (reconnectAttempts > 0) {
        reconnectAttempts = 0;
        setConnectionError("");
      }
    });
    peer.on("disconnected", () => {
      console.log("[PeerJS] disconnected event fired, active:", getActive(), "destroyed:", peer.destroyed, "attempt:", reconnectAttempts + 1);
      if (!getActive()) return;
      if (peer.destroyed) return;
      if (reconnectAttempts >= MAX_ATTEMPTS) {
        setConnectionError("Lost connection to signaling server after 10 retries. Try: 1) refresh and re-enter the match, 2) different network/wifi, or 3) wait a minute and retry.");
        setConnectionStatus("error");
        return;
      }
      reconnectAttempts++;
      const backoffMs = Math.min(8000, 500 * Math.pow(1.5, reconnectAttempts - 1));
      setConnectionError(`Reconnecting to signaling server (attempt ${reconnectAttempts}/${MAX_ATTEMPTS})...`);
      console.log("[PeerJS] scheduling reconnect in", backoffMs, "ms");
      setTimeout(() => {
        if (!getActive() || peer.destroyed) {
          console.log("[PeerJS] reconnect aborted: active:", getActive(), "destroyed:", peer.destroyed);
          return;
        }
        console.log("[PeerJS] calling peer.reconnect()");
        try { peer.reconnect(); } catch (e) { console.error("[PeerJS] reconnect() threw:", e); }
      }, backoffMs);
    });
  };

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

  // Read gameOver via a ref so handleDisconnect always sees the LATEST value, not the
  // one captured when conn.on("close") was first registered. Without this, an opponent
  // disconnecting AFTER the game-over screen appears would still bounce the user back
  // to lobby because the close handler closure was captured with gameOver === null.
  const gameOverRef = useRef(null);
  gameOverRef.current = gameOver;
  const handleDisconnect = useCallback(() => {
    const wasIntentional = intentionalCloseRef.current;
    intentionalCloseRef.current = false;
    teardownPeer();
    setConnectionStatus("idle");
    if (!wasIntentional) setConnectionError("Opponent disconnected");
    // If the match is already over, let the user stay on the results screen instead
    // of bouncing them back to the lobby. They can click "Back to Lobby" themselves.
    // Only the connection bookkeeping is reset; gameMode/phase/gameOver stay intact.
    if (gameOverRef.current) return;
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
  const createRoom = useCallback(async () => {
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

    const iceConfig = await getIceConfig();
    const peer = new window.Peer(getPeerId(code), { debug: 0, config: iceConfig });
    const thisPeer = peer; // captured for stale-closure guards
    peerRef.current = peer;
    wirePeerResilience(peer, () => peerRef.current === thisPeer);

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
        const deposits = generateResourceDeposits(theaterRef.current);
        setResourceDeposits(deposits);
        // Empty opponent placeholder (filled via guest's messages)
        // Start with null HQ coords so we don't draw a placeholder enemy base before they place.
setAiSetup({ hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] });
        // Send theater + deposits to guest so they switch to the same map
        try { conn.send({ type: "theater_sync", theater: theaterRef.current }); } catch {}
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
      // Non-fatal errors: peer is still recoverable (e.g. broker blip). Don't destroy -
      // wirePeerResilience() will reconnect us. Show a transient warning instead of
      // tearing down the lobby and stranding the guest mid-handshake.
      const NON_FATAL = new Set(["network", "disconnected", "peer-unavailable"]);
      if (NON_FATAL.has(err?.type) && !peer.destroyed) {
        setConnectionError(msg + " (retrying...)");
        return; // keep peer alive, do NOT destroy
      }
      setConnectionError(msg);
      setConnectionStatus("error");
      // Fatal error: PeerJS already destroyed; this is just bookkeeping.
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    });
  }, [username, teardownPeer, resetMatchState, handleNetMessage, handleDisconnect]);

  // ── Multiplayer: join room (guest) ──
  const joinRoom = useCallback(async () => {
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

    const iceConfig = await getIceConfig();
    const peer = new window.Peer({ debug: 0, config: iceConfig });
    const thisPeer = peer;
    peerRef.current = peer;
    wirePeerResilience(peer, () => peerRef.current === thisPeer);

    // H4: 45s timeout for the whole handshake. Long enough for transcontinental
    // WebRTC (ICE gathering + TURN relay over high-latency links) without hanging forever.
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = setTimeout(() => {
      if (peerRef.current !== thisPeer) return;
      setConnectionError("Connection timed out - check the code or try again");
      setConnectionStatus("error");
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    }, 45000);

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
        // Start with null HQ coords so we don't draw a placeholder enemy base before they place.
setAiSetup({ hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] });
      });
      conn.on("close", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("error", () => { if (connRef.current === conn) handleDisconnect(); });
      conn.on("data", handleNetMessage);
    });
    peer.on("error", (err) => {
      if (peerRef.current !== thisPeer) return;
      let msg = err?.message || String(err) || "Connection error";
      if (err?.type === "peer-unavailable") msg = "Room not found - check the code";
      else if (err?.type === "network") msg = "Network error - check your connection";
      else if (err?.type === "server-error") msg = "PeerJS broker unavailable - try again";
      // peer-unavailable IS fatal here (specific code lookup failed). network/disconnected
      // are recoverable - keep the peer alive so wirePeerResilience can reconnect.
      const RECOVERABLE = new Set(["network", "disconnected"]);
      if (RECOVERABLE.has(err?.type) && !peer.destroyed) {
        setConnectionError(msg + " (retrying...)");
        return;
      }
      if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
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
  const findOnlineMatch = useCallback(async () => {
    if (!username.trim()) return;
    if (typeof window === "undefined" || !window.Peer) {
      setConnectionError("Network library not loaded yet, try again in a moment");
      setConnectionStatus("error");
      return;
    }
    _initAudio(); // unlock Web Audio on first user gesture
    teardownPeer(true);
    setConnectionError("");
    setRoomCode("");
    setJoinCode("");
    setLobbyView("matchmaking");
    setConnectionStatus("creating"); // we'll progress: creating → waiting → connecting → connected

    // Fetch TURN relay credentials (falls back to STUN-only if unavailable)
    const iceConfig = await getIceConfig();
    // Create our peer with a random ID (PeerJS generates one)
    const peer = new window.Peer({ debug: 0, config: iceConfig });
    const thisPeer = peer;
    peerRef.current = peer;
    wirePeerResilience(peer, () => peerRef.current === thisPeer);

    let myPeerId = null;
    let role = null; // "host" | "guest" - decided after queue response
    const MM_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes - long enough that the user really wants to give up
    let pollDeadline = Date.now() + MM_TIMEOUT_MS;
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
      // H1 fix: 45s timeout for the WebRTC handshake (transcontinental friendly)
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = setTimeout(() => {
        if (peerRef.current !== thisPeer || connRef.current !== conn) return;
        setConnectionError("Opponent went offline before connection - try again");
        setConnectionStatus("error");
        try { peer.destroy(); } catch {}
        if (peerRef.current === thisPeer) peerRef.current = null;
      }, 45000);
      conn.on("open", () => {
        if (connRef.current !== conn) return;
        if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
        setConnectionStatus("connected");
        setOpponentName("Opponent");
        setPhase(PHASE.SETUP);
        resetMatchState();
        setResourceDeposits([]);
        // Start with null HQ coords so we don't draw a placeholder enemy base before they place.
setAiSetup({ hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] });
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
          const deposits = generateResourceDeposits(theaterRef.current);
          setResourceDeposits(deposits);
          // Start with null HQ coords so we don't draw a placeholder enemy base before they place.
setAiSetup({ hqX: null, hqY: null, airspace: (THEATERS[theaterRef.current]?.airspace || [2000])[0], resources: [], interceptors: [], adUnits: [] });
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
          body: JSON.stringify({ peerId: myPeerId, theaters: selectedTheaters }),
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
        if (queueResp.theater && THEATERS[queueResp.theater]) {
          setTheater(queueResp.theater);
          theaterRef.current = queueResp.theater;
        }
        finishAsGuest(queueResp.opponent);
        return;
      }
      // Otherwise we're queued - poll for match
      role = "host"; // we'll be the one accepting an incoming connection
      finishAsHost();
      // H2 fix: reset deadline now that polling actually starts (don't burn budget on broker latency)
      pollDeadline = Date.now() + MM_TIMEOUT_MS;
      mmDeadlineRef.current = pollDeadline;
      const poll = async () => {
        if (peerRef.current !== thisPeer) return;
        if (Date.now() > pollDeadline) {
          if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
          setConnectionError("No match found after 12 minutes. Try again or use Create/Join Room.");
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
            // We're matched - set the theater from the match record
            if (data.theater && THEATERS[data.theater]) {
              setTheater(data.theater);
              theaterRef.current = data.theater;
            }
            if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
            setConnectionStatus("waiting");
            // H3 fix: 60s timeout for the guest's incoming PeerJS connection. Long enough
            // for transcontinental WebRTC handshakes (ICE + TURN over high-latency links)
            // without hanging forever if the guest crashed between matching and dialing.
            if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
            joinTimeoutRef.current = setTimeout(() => {
              if (peerRef.current !== thisPeer) return;
              if (connRef.current) return; // already connected
              setConnectionError("Opponent never connected - try again");
              setConnectionStatus("error");
              try { peer.destroy(); } catch {}
              if (peerRef.current === thisPeer) peerRef.current = null;
            }, 60000);
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
      // Recoverable: keep peer alive so wirePeerResilience can reconnect us instead of
      // bouncing the user back to the lobby on every broker hiccup.
      const RECOVERABLE = new Set(["network", "disconnected"]);
      if (RECOVERABLE.has(err?.type) && !peer.destroyed) {
        setConnectionError(msg + " (retrying...)");
        return;
      }
      setConnectionError(msg);
      setConnectionStatus("error");
      if (mmPollRef.current) { clearInterval(mmPollRef.current); mmPollRef.current = null; }
      try { peer.destroy(); } catch {}
      if (peerRef.current === thisPeer) peerRef.current = null;
    });
  }, [username, selectedTheaters, teardownPeer, resetMatchState, handleNetMessage, handleDisconnect]);

  // ── Cleanup peer on unmount only (intentionally omit deps to avoid mid-match cleanup if teardownPeer ref changes) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { teardownPeer(true); }, []);

  // ── Audio safety net: unlock Web Audio on ANY user gesture ──
  // Not every entry path hits createRoom/joinRoom/findOnlineMatch (e.g. hot-reload, returning
  // from a tab switch, bot mode entry), and iOS Safari re-suspends the AudioContext on tab
  // hide. Listen for any gesture and resume the context whenever it gets suspended.
  useEffect(() => {
    const unlock = () => { _initAudio(); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // ── Matchmaking elapsed timer + stats poll ──
  // Runs while user is on the matchmaking lobby view. Polls /api/match/stats every 3s
  // for global counts. Increments local elapsed counter every second for the timer display.
  useEffect(() => {
    if (lobbyView !== "matchmaking") return;
    mmStartedAtRef.current = Date.now();
    setMmElapsed(0);
    const tickIv = setInterval(() => {
      setMmElapsed(Math.floor((Date.now() - mmStartedAtRef.current) / 1000));
    }, 1000);
    const fetchStats = async () => {
      try {
        const r = await fetch("/api/match/stats");
        if (!r.ok) return;
        const data = await r.json();
        if (data && typeof data === "object") {
          setMmStats({
            queueing: data.queueing || 0,
            inMatchPlayers: data.inMatchPlayers || 0,
          });
        }
      } catch {}
    };
    fetchStats();
    const statsIv = setInterval(fetchStats, 10000);
    return () => { clearInterval(tickIv); clearInterval(statsIv); };
  }, [lobbyView]);

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

  // Live shake whenever the attack-wave cost slider crosses the budget into overspend.
  // Only fires on the transition (not-overspending -> overspending) so dragging deeper
  // into red doesn't constantly re-shake. Resets when the user pulls back under budget.
  // Skipped during COMBAT - the wave cost was already paid at launch, so the comparison
  // is meaningless and we'd shake spuriously.
  const wasAttackOverspendRef = useRef(false);
  useEffect(() => {
    if (phase === PHASE.COMBAT) { wasAttackOverspendRef.current = false; return; }
    const isOver = attackWaveCost > playerBudget;
    if (isOver && !wasAttackOverspendRef.current) triggerShake();
    wasAttackOverspendRef.current = isOver;
  }, [attackWaveCost, playerBudget, triggerShake, phase]);

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
      // Prevent placing HQ inside enemy airspace + buffer (only check if enemy has placed)
      if (aiSetup && aiSetup.hqX != null) {
        const enemyDist = dist({ x, y }, { x: aiSetup.hqX, y: aiSetup.hqY });
        const minSafeDist = (aiSetup.airspace || 2500) + 1000 + 400;
        if (enemyDist < minSafeDist) {
          setInfoPopup({ text: `HQ too close to enemy airspace. Place at least ${Math.round(minSafeDist)}m away.` });
          setTimeout(() => setInfoPopup(null), 2500);
          return;
        }
      }
      setPlayerHQ({ x, y }); setPlacingWhat(null);
      // Determine which geographic side the player chose based on zone proximity
      const zones = getZones(theaterRef.current);
      const distP1 = dist({ x, y }, zones.p1);
      const distP2 = dist({ x, y }, zones.p2);
      setPlayerSide(distP1 <= distP2 ? "blue" : "red");
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
      // Also block placement inside enemy airspace (skip if not yet placed)
      if (aiSetup && aiSetup.hqX != null) {
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
        const ad = playerAD[bestIdx]; const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        setPlayerBudget((p) => p + Math.floor((sys?.cost || 0) * 0.42));
        setPlayerAD((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_ad", x: ad.x, y: ad.y });
      }
    } else if (placingWhat === "delete") {
      // Delete during prep: FULL refund (100% of cost), find closest
      let bestD = 200, bestType = null, bestIdx = -1;
      playerResources.forEach((r, i) => { if (r.alive) { const d2 = dist({ x, y }, r); if (d2 < bestD) { bestD = d2; bestType = "res"; bestIdx = i; } } });
      playerInterceptors.forEach((d, i) => { const d2 = dist({ x, y }, d); if (d2 < bestD) { bestD = d2; bestType = "int"; bestIdx = i; } });
      playerAD.forEach((ad, i) => { if (ad.health > 0) { const d2 = dist({ x, y }, ad); if (d2 < bestD) { bestD = d2; bestType = "ad"; bestIdx = i; } } });
      if (bestType === "res") {
        const r = playerResources[bestIdx];
        const res = RESOURCES.find((rr) => rr.key === r.key);
        setPlayerBudget((p) => p + (res?.cost || 0));
        if (r.depositId !== undefined) {
          setResourceDeposits((prev) => prev.map((d) => d.id === r.depositId ? { ...d, claimed: false } : d));
        }
        setPlayerResources((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_resource", x: r.x, y: r.y, depositId: r.depositId });
      } else if (bestType === "int") {
        const d = playerInterceptors[bestIdx];
        const def = DEFENSE_UNITS.find((dd) => dd.key === d.key);
        setPlayerBudget((p) => p + (def?.cost || 0) * (d.count || 0));
        setPlayerInterceptors((prev) => prev.filter((_, i) => i !== bestIdx));
        broadcast({ type: "remove_interceptor_group", x: d.x, y: d.y });
      } else if (bestType === "ad") {
        const ad = playerAD[bestIdx];
        const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        setPlayerBudget((p) => p + (sys?.cost || 0));
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
      const sys = theaterScaleRef.current.ad.find((s) => s.key === adKey);
      if (!sys || !canAfford(sys.cost)) { triggerShake(); return; }
      setPlayerBudget((p) => p - sys.cost);
      setPlayerAD((prev) => [...prev, { key: adKey, x, y, health: 1, ammo: sys.missiles, priority: "all" }]);
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
    // Enemy HQ (only if placed)
    if (aiSetup && aiSetup.hqX != null) {
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
  const lastBroadcastRef = useRef({ airspace: null, attack: null, priority: null, posture: null, ready: null, trajectory: null });
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
  // Phase 2 fix: broadcast guest's trajectory waypoints to host. Without this, the host
  // (which runs the authoritative sim) spawns the guest's drones with no trajectory and
  // they beeline to the priority target, ignoring every waypoint the guest placed.
  useEffect(() => {
    if (gameMode === "bot") return;
    const json = JSON.stringify(playerTrajectory);
    if (lastBroadcastRef.current.trajectory === json) return;
    lastBroadcastRef.current.trajectory = json;
    if (connRef.current?.open) broadcast({ type: "trajectory", waypoints: playerTrajectory });
  }, [playerTrajectory, gameMode, broadcast]);

  // ── Auto-advance on mutual ready (1v1 mode only) ──
  // When both players mark themselves ready, the round should start automatically
  // without any extra button press. Host drives the transition (SETUP->COMBAT) and the
  // round launch. Critically, on the FIRST ready (still in SETUP phase) we ALSO launch
  // round 1 immediately - otherwise users had to click ready twice (once to leave SETUP,
  // once to start round 1). The combined transition + launch keeps the flow to one click.
  const readyAdvanceGuardRef = useRef(false);
  useEffect(() => {
    if (gameMode !== "host" && gameMode !== "bot") return;
    if (!(meReady && opponentReady)) { readyAdvanceGuardRef.current = false; return; }
    if (battleActive || gameOver) return;
    if (readyAdvanceGuardRef.current) return; // fire once per ready-pair
    readyAdvanceGuardRef.current = true;
    if (phase === PHASE.SETUP) {
      try { broadcast({ type: "start_combat" }); } catch {}
      setPhase(PHASE.COMBAT);
    }
    setMeReady(false);
    setOpponentReady(false);
    // Delay launch slightly so React can process the state updates above
    // (meReady/opponentReady=false, phase=COMBAT) before launchRound runs.
    // Without this, launchRound could see stale battleActive=true from the
    // previous render and bail, causing round 2+ to never start.
    setTimeout(() => {
      if (launchRoundRef.current) {
        try { launchRoundRef.current(); } catch {}
      }
    }, 50);
  }, [meReady, opponentReady, phase, battleActive, gameOver, gameMode, broadcast]);

  // Reset ready flags when a round ends so both players can re-ready for the next round.
  // Watches battleActive transitioning from true to false during COMBAT phase.
  const prevBattleActiveRef = useRef(false);
  useEffect(() => {
    const was = prevBattleActiveRef.current;
    prevBattleActiveRef.current = battleActive;
    if (was && !battleActive && phase === PHASE.COMBAT && !gameOver) {
      setMeReady(false);
      setOpponentReady(false);
      // Belt-and-braces: also clear the auto-advance guard so the next ready pair can
      // fire even if some other effect path managed to leave it stuck. Without this,
      // round 3+ could observe a stale guardRef true from round 2 and refuse to auto-
      // launch even though both players are ready.
      readyAdvanceGuardRef.current = false;
    }
  }, [battleActive, phase, gameOver]);

  // Connection-open re-sync: each per-field broadcast effect above guards on
  // connRef.current?.open at runtime - but connRef is a ref, not a dep, so if a state
  // value was set BEFORE the connection opened (or right at the moment of open before
  // the conn fully wired), the broadcast is silently dropped and never re-attempted.
  // This effect fires once when connectionStatus transitions to "connected" and
  // re-broadcasts every piece of guest state at that moment.
  // Latest values are read via syncStateRef (updated every render) so the effect
  // doesn't need to list state values in deps and capture stale closures.
  const syncStateRef = useRef({});
  syncStateRef.current = { playerAirspace, playerAttack, attackPriority, defPosture, meReady, playerTrajectory };
  useEffect(() => {
    if (gameMode === "bot") return;
    if (connectionStatus !== "connected") return;
    if (!connRef.current?.open) return;
    const s = syncStateRef.current;
    try {
      broadcast({ type: "airspace", radius: s.playerAirspace });
      broadcast({ type: "attack_wave", wave: s.playerAttack });
      broadcast({ type: "attack_priority", value: s.attackPriority });
      broadcast({ type: "def_posture", value: s.defPosture });
      broadcast({ type: "ready", ready: s.meReady });
      broadcast({ type: "trajectory", waypoints: s.playerTrajectory });
    } catch {}
    // Reset dedup so subsequent value changes still pass through normally.
    lastBroadcastRef.current.airspace = s.playerAirspace;
    lastBroadcastRef.current.attack = JSON.stringify(s.playerAttack);
    lastBroadcastRef.current.priority = s.attackPriority;
    lastBroadcastRef.current.posture = s.defPosture;
    lastBroadcastRef.current.ready = s.meReady;
    lastBroadcastRef.current.trajectory = JSON.stringify(s.playerTrajectory);
  }, [connectionStatus, gameMode, broadcast]);

  // Init map
  useEffect(() => {
    if (typeof window === "undefined" || phase === PHASE.LOBBY || phase === PHASE.MATCHMAKING) return;
    let cancelled = false;
    // Capture handler and observer references in closure scope so the effect cleanup
    // can tear them down on theater change. Without this, every theater change adds
    // another mousedown listener and ResizeObserver to the same map div.
    let middleClickHandler = null;
    let resizeObserver = null;
    let attachedEl = null;
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
        const [simX, simY] = latLngToSim(latlng.lat, latlng.lng, th2.bounds);
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
      // Double-click hit test: shows unit inspector popup. Switched from middle-click
      // because middle button isn't accessible on most laptop trackpads. dblclick is
      // also Leaflet's "zoom in" gesture, so we preventDefault + disable doubleClickZoom
      // to suppress the zoom behavior when the user is trying to inspect a unit.
      map.doubleClickZoom.disable();
      middleClickHandler = (ev) => {
        ev.preventDefault();
        const fn = inspectClickRef.current;
        if (!fn) return;
        const rect = map.getContainer().getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const latlng = map.containerPointToLatLng([px, py]);
        const t2 = THEATERS[theaterRef.current];
        if (!t2) return;
        const [simX, simY] = latLngToSim(latlng.lat, latlng.lng, t2.bounds);
        fn(simX, simY);
      };
      attachedEl = mapRef.current;
      attachedEl.addEventListener("dblclick", middleClickHandler);
      setMapReady(true);
      // Fix map sizing after render - multiple attempts
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 500);
      // Watch for container resizes
      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(mapRef.current);
    })();
    return () => {
      cancelled = true;
      if (middleClickHandler && attachedEl) {
        try { attachedEl.removeEventListener("dblclick", middleClickHandler); } catch {}
      }
      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch {}
      }
    };
  }, [phase, theater]);

  // Draw static elements
  useEffect(() => {
    const L = LRef.current; const layer = layerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();
    const th = THEATERS[theater]; const mpu = getProjection(th.bounds).mpu;
    const toLL = (x, y) => simToLatLng(x, y, th.bounds);

    // Deployment zones: two large circles at geographically correct positions.
    // Player zone in blue, opponent zone in red. Labels show country names.
    const zones = getZones(theater);
    const zoneLabels = th.zones || { player: { label: "BLUE SIDE" }, opponent: { label: "RED SIDE" } };
    // Zone circles fade to barely visible once HQ is placed (initial placement is done)
    const zoneOp = playerHQ ? 0.1 : 0.4;
    const zoneFill = playerHQ ? 0.01 : 0.04;
    const zoneWeight = playerHQ ? 1 : 2;
    L.circle(toLL(zones.p1.x, zones.p1.y), { radius: ZONE_RADIUS * mpu, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: zoneFill, weight: zoneWeight, opacity: zoneOp, dashArray: "12 8", interactive: false }).addTo(layer);
    L.circle(toLL(zones.p2.x, zones.p2.y), { radius: ZONE_RADIUS * mpu, color: "#ff5555", fillColor: "#ff5555", fillOpacity: zoneFill, weight: zoneWeight, opacity: zoneOp, dashArray: "12 8", interactive: false }).addTo(layer);
    // Zone labels - prominent before HQ placed, faded after
    const labelOp = playerHQ ? 0.25 : 1;
    L.marker(toLL(zones.p1.x, zones.p1.y), { icon: L.divIcon({ className: "", iconSize: [160, 24], iconAnchor: [80, 12], html: `<div style="color:#4a9eff;font-size:12px;font-weight:700;text-align:center;text-shadow:0 0 8px #000,0 0 16px #000;letter-spacing:3px;opacity:${labelOp}">${zoneLabels.player.label}</div>` }), interactive: false }).addTo(layer);
    L.marker(toLL(zones.p2.x, zones.p2.y), { icon: L.divIcon({ className: "", iconSize: [160, 24], iconAnchor: [80, 12], html: `<div style="color:#ff5555;font-size:12px;font-weight:700;text-align:center;text-shadow:0 0 8px #000,0 0 16px #000;letter-spacing:3px;opacity:${labelOp}">${zoneLabels.opponent.label}</div>` }), interactive: false }).addTo(layer);
    // Divider at midpoint between the two zones
    const midZoneY = (zones.p1.y + zones.p2.y) / 2;
    L.polyline([toLL(0, midZoneY), toLL(ARENA, midZoneY)], { color: "#fff", weight: 1, opacity: 0.15, dashArray: "8 8", interactive: false }).addTo(layer);

    // Resource deposits - shown as faint icons. Highlighted when in matching placement mode.
    // Perf: skip deposit redraws during combat (they don't change mid-battle and the
    // render effect re-runs ~60Hz from battleDrones updates).
    if (!battleActive) for (const dep of resourceDeposits) {
      if (dep.claimed) continue;
      const res = RESOURCES.find((rr) => rr.key === dep.key);
      if (!res) continue;
      const isHighlighted = placingWhat === dep.key;
      const inPlayerAirspace = playerHQ && dist(dep, playerHQ) <= playerAirspace;
      const inAiAirspace = aiSetup && aiSetup.hqX != null && dist(dep, { x: aiSetup.hqX, y: aiSetup.hqY }) <= aiSetup.airspace;
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
      // Final segment ends at the actual priority target the drones will hit, not always HQ
      if (aiSetup && aiSetup.hqX != null) {
        const lastWp = playerTrajectory[playerTrajectory.length - 1] || { x: playerHQ.x, y: playerHQ.y - 500 };
        let finalTarget = { x: aiSetup.hqX, y: aiSetup.hqY }; // default = HQ
        if (attackPriority === "ad" && Array.isArray(aiSetup.adUnits)) {
          const alive = aiSetup.adUnits.filter((a) => a.health > 0);
          if (alive.length > 0) {
            finalTarget = alive.reduce((best, a) => dist(lastWp, a) < dist(lastWp, best) ? a : best, alive[0]);
          }
        } else if (attackPriority === "resources" && Array.isArray(aiSetup.resources)) {
          const alive = aiSetup.resources.filter((r) => r.alive);
          if (alive.length > 0) {
            finalTarget = alive.reduce((best, r) => dist(lastWp, r) < dist(lastWp, best) ? r : best, alive[0]);
          }
        } else if (attackPriority === "interceptors" && Array.isArray(aiSetup.interceptors)) {
          const alive = aiSetup.interceptors.filter((i) => i.status === "active");
          if (alive.length > 0) {
            finalTarget = alive.reduce((best, i) => dist(lastWp, i) < dist(lastWp, best) ? i : best, alive[0]);
          }
        }
        pathPts.push(toLL(finalTarget.x, finalTarget.y));
      }
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

    // Player airspace with breach gaps. Bumped opacity/weight for visibility per UX
    // request - the previous values were too washed out against the satellite tiles.
    if (playerHQ) {
      const breachAngles = battleRef.current?.playerAirBreaches || [];
      if (breachAngles.length === 0) {
        L.circle(toLL(playerHQ.x, playerHQ.y), { radius: playerAirspace * mpu, color: playerColor, fillColor: playerColor, fillOpacity: 0.1, weight: 3, opacity: 0.9, dashArray: "10 6" }).addTo(layer);
      } else {
        const SEG = 24; const segArc = (Math.PI * 2) / SEG; const GAP = 0.15;
        for (let i = 0; i < SEG; i++) {
          const mid = -Math.PI + (i + 0.5) * segArc;
          const inGap = breachAngles.some((ba) => { let d = mid - ba; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) < GAP; });
          if (inGap) continue;
          const pts = [];
          for (let j = 0; j <= 3; j++) { const a = -Math.PI + i * segArc + (j / 3) * segArc; pts.push(toLL(playerHQ.x + Math.cos(a) * playerAirspace, playerHQ.y + Math.sin(a) * playerAirspace)); }
          L.polyline(pts, { color: playerColor, weight: 3, opacity: 0.9, dashArray: "10 6", interactive: false }).addTo(layer);
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
          html: `<div style="width:22px;height:22px;background:${playerColor};border:2.5px solid #fff;box-sizing:border-box;box-shadow:0 0 6px ${playerColor}99"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    // Additional player HQs (slightly smaller to indicate "secondary")
    for (const eh of playerExtraHQs) {
      // Each extra HQ has its own small airspace bubble (60% of main airspace radius)
      const ehRadius = playerAirspace * 0.6;
      L.circle(toLL(eh.x, eh.y), { radius: ehRadius * mpu, color: playerColor, fillColor: playerColor, fillOpacity: 0.08, weight: 2.5, opacity: 0.85, dashArray: "8 4", interactive: false }).addTo(layer);
      L.marker(toLL(eh.x, eh.y), {
        icon: L.divIcon({
          className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<div style="width:18px;height:18px;background:${playerColor};border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 5px ${playerColor}99"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    // Player resources: triangle (per UX request). Destroyed resources are REMOVED
    // from the map entirely - no greyed-out placeholder, just gone.
    for (const r of playerResources) {
      if (!r.alive) continue;
      const res = RESOURCES.find((rr) => rr.key === r.key);
      if (!res) continue;
      L.marker(toLL(r.x, r.y), {
        icon: L.divIcon({
          className: "", iconSize: [18, 18], iconAnchor: [9, 9],
          html: `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,1 17,16 1,16" fill="${res.color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    // Player interceptor groups (placed during setup). Distinct shapes per type:
    // kamikaze = filled circle with white border (the classic interceptor symbol),
    // armed = chevron/dart pointing up (reusable shooter platform with weapon pods).
    for (const d of playerInterceptors) {
      const isKamikaze = d.key === "kamikaze";
      const html = isKamikaze
        // Filled circle - default interceptor look
        ? `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="#4a9eff" stroke="#ffffff" stroke-width="2"/></svg>`
        // Chevron/dart - distinct armed/shooter look
        : `<svg width="20" height="20" viewBox="0 0 20 20"><polygon points="10,2 18,17 10,13 2,17" fill="#4a9eff" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      L.marker(toLL(d.x, d.y), {
        icon: L.divIcon({ className: "", iconSize: [20, 20], iconAnchor: [10, 10], html }),
        interactive: false,
      }).addTo(layer);
    }
    for (const ad of playerAD) {
      // Destroyed AD is REMOVED from the map entirely - no greyed-out marker.
      if (ad.health <= 0) continue;
      const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
      if (!sys) continue;
      L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.12, weight: 2.5, opacity: 0.85, dashArray: "6 4", interactive: false }).addTo(layer);
      L.circleMarker(toLL(ad.x, ad.y), { radius: 7, color: "#ffffff", fillColor: sys.color, fillOpacity: 0.9, weight: 2.5 }).addTo(layer);
    }

    // AI - show full enemy intel: HQ, airspace, resources, AD systems with range, interceptor positions
    // In MP mode, hqX/hqY are null until the opponent places their HQ - skip rendering until then
    if (aiSetup && aiSetup.hqX != null && aiSetup.hqY != null) {
      // Airspace - bumped opacity/weight for visibility
      const airBreaches = battleRef.current?.aiAirBreaches || [];
      if (airBreaches.length === 0) {
        L.circle(toLL(aiSetup.hqX, aiSetup.hqY), { radius: aiSetup.airspace * mpu, color: opponentColor, fillColor: opponentColor, fillOpacity: 0.1, weight: 3, opacity: 0.9, dashArray: "10 6" }).addTo(layer);
      } else {
        const SEG = 24; const segArc = (Math.PI * 2) / SEG; const GAP = 0.15;
        for (let i = 0; i < SEG; i++) {
          const mid = -Math.PI + (i + 0.5) * segArc;
          const inGap = airBreaches.some((ba) => { let d = mid - ba; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) < GAP; });
          if (inGap) continue;
          const pts = [];
          for (let j = 0; j <= 3; j++) { const a = -Math.PI + i * segArc + (j / 3) * segArc; pts.push(toLL(aiSetup.hqX + Math.cos(a) * aiSetup.airspace, aiSetup.hqY + Math.sin(a) * aiSetup.airspace)); }
          L.polyline(pts, { color: opponentColor, weight: 3, opacity: 0.9, dashArray: "10 6", interactive: false }).addTo(layer);
        }
      }
      // Enemy HQ: bigger square
      L.marker(toLL(aiSetup.hqX, aiSetup.hqY), {
        icon: L.divIcon({
          className: "", iconSize: [22, 22], iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;background:${opponentColor};border:2.5px solid #fff;box-sizing:border-box;box-shadow:0 0 6px ${opponentColor}99"></div>`,
        }),
        interactive: false,
      }).addTo(layer);
      // Enemy resources: triangle. Destroyed resources are REMOVED entirely.
      for (const r of aiSetup.resources) {
        if (!r.alive) continue;
        const res = RESOURCES.find((rr) => rr.key === r.key);
        if (!res) continue;
        L.marker(toLL(r.x, r.y), {
          icon: L.divIcon({
            className: "", iconSize: [16, 16], iconAnchor: [8, 8],
            html: `<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 15,14 1,14" fill="${res.color}" stroke="#ff7777" stroke-width="1.5" stroke-linejoin="round" opacity="0.8"/></svg>`,
          }),
          interactive: false,
        }).addTo(layer);
      }
      // Enemy AD systems with range circles. Destroyed AD is REMOVED entirely.
      for (const ad of (aiSetup.adUnits || [])) {
        if (ad.health <= 0) continue;
        const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        if (!sys) continue;
        L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: "#ff5555", fillOpacity: 0.1, weight: 2.5, opacity: 0.85, dashArray: "6 4", interactive: false }).addTo(layer);
        L.circleMarker(toLL(ad.x, ad.y), { radius: 7, color: "#ff3333", fillColor: sys.color, fillOpacity: 0.9, weight: 2.5 }).addTo(layer);
      }
      // Enemy interceptors at base. Same shape distinction as player but red-tinted:
      // kamikaze = filled circle (default interceptor), armed = chevron (shooter).
      for (const i of (aiSetup.interceptors || [])) {
        if (i.status !== "active") continue;
        const isKamikaze = i.destroyOnKill !== false;
        const html = isKamikaze
          ? `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#ff5555" stroke="#ff7777" stroke-width="1.5" opacity="0.85"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,2 16,15 9,12 2,15" fill="#ff5555" stroke="#ff7777" stroke-width="1.2" stroke-linejoin="round" opacity="0.85"/></svg>`;
        L.marker(toLL(i.x, i.y), {
          icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html }),
          interactive: false,
        }).addTo(layer);
      }
    }
  }, [mapReady, theater, playerHQ, playerExtraHQs, playerAirspace, playerResources, playerInterceptors, playerAD, aiSetup, phase, battleDrones, resourceDeposits, placingWhat, playerTrajectory, attackPriority]);

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
        const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.12, weight: 2.5, opacity: 0.85, dashArray: "6 4", interactive: false }).addTo(bl);
      }
      for (const ad of (b.aAD || [])) {
        if (ad.health <= 0) continue;
        const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        if (sys) L.circle(toLL(ad.x, ad.y), { radius: sys.range * mpu, color: sys.color, fillColor: sys.color, fillOpacity: 0.1, weight: 2.5, opacity: 0.75, dashArray: "6 4", interactive: false }).addTo(bl);
      }
    }
    // Helper: pie-chart SVG that fills clockwise from 12 o'clock as reloadPct goes 0 → 1.
    // Uses stroke-dasharray on a circle so the fill grows around the perimeter.
    const reloadPieSvg = (pct, color, ringOpacity = 0.9) => {
      const r = 13;
      const circumference = 2 * Math.PI * r;
      const filled = pct * circumference;
      const empty = circumference - filled;
      // Center at 16,16 in a 32x32 box. Rotate -90 to start at top.
      return `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(-90deg)"><circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${filled} ${empty}" opacity="${ringOpacity}"/></svg>`;
    };
    // Helper: draw an AD marker with type color, side-indicating border, and pie-chart reload.
    // Destroyed AD (health <= 0) is skipped entirely - no greyed-out placeholder on the map.
    const drawAdMarker = (ad, sideColor, labelColor) => {
      const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
      if (!sys) return;
      const alive = ad.health > 0;
      if (!alive) return;
      // Outer ring: side color (white for player, red for enemy)
      L.circleMarker(toLL(ad.x, ad.y), { radius: 9, color: sideColor, fillColor: sys.color, fillOpacity: 0.95, weight: 2.5 }).addTo(bl);
      // Inner crosshair
      L.circleMarker(toLL(ad.x, ad.y), { radius: 2, color: "#ffffff", fillColor: "#ffffff", fillOpacity: 1, weight: 0 }).addTo(bl);
      // Reload pie chart: fills clockwise as cooldown progresses. Solid green when ready.
      if (alive && ad.ammo > 0) {
        // engageRate is in seconds. Multiply by 60 (sim steps per second at 60fps)
        // so reload is visually meaningful. Old value of *5 made ADs fire almost instantly.
        const cooldown = Math.max(15, Math.round(sys.engageRate * 60));
        const elapsed = ad.lastFired != null ? b.step - ad.lastFired : cooldown;
        const reloadPct = Math.min(1, elapsed / cooldown);
        // Only draw the reload pie chart while ACTUALLY reloading. Idle/ready ADs got rendered
        // as solid green rings before, which made the screen look green when many ADs were
        // placed but had no targets. The colored AD marker (line ~1855) already conveys "ready".
        if (reloadPct < 1) {
          L.marker(toLL(ad.x, ad.y), {
            icon: L.divIcon({
              className: "", iconSize: [32, 32], iconAnchor: [16, 16],
              html: reloadPieSvg(reloadPct, "#ffaa00", 0.85),
            }),
            interactive: false,
          }).addTo(bl);
        }
      } else if (alive && ad.ammo === 0) {
        // Out of ammo - red ring with X icon
        L.marker(toLL(ad.x, ad.y), {
          icon: L.divIcon({
            className: "", iconSize: [32, 32], iconAnchor: [16, 16],
            html: `<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="#ff3333" stroke-width="2" stroke-dasharray="3 3"/></svg>`,
          }),
          interactive: false,
        }).addTo(bl);
      }
      // Label with name + LIVE ammo count (renderBattleFrame is called every frame so this updates)
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
    for (const ad of (b.pAD || [])) drawAdMarker(ad, "#ffffff", theaterScaleRef.current.ad.find((s) => s.key === ad.key)?.color || "#fff");
    for (const ad of (b.aAD || [])) drawAdMarker(ad, "#ff3333", "#ff7777");
    // Use _renderX/_renderY (dead-reckoning extrapolation) when set by guestTick, else raw x/y.
    // This keeps the host's render path unchanged (host never sets _renderX) while making the
    // guest's drones glide smoothly between 15Hz snapshots instead of teleporting.
    const dx = (d) => d._renderX ?? d.x;
    const dy = (d) => d._renderY ?? d.y;
    const pc = playerColorRef.current;
    const oc = opponentColorRef.current;
    for (const a of (b.aAttackers || [])) { if (a.status === "active") L.circleMarker(toLL(dx(a), dy(a)), { radius: 3, color: oc, fillColor: oc, fillOpacity: 0.9, weight: 0 }).addTo(bl); }
    for (const a of (b.pAttackers || [])) { if (a.status === "active") L.circleMarker(toLL(dx(a), dy(a)), { radius: 3, color: pc, fillColor: pc, fillOpacity: 0.9, weight: 0 }).addTo(bl); }
    // Interceptors during battle. Kamikaze = filled circle (default look), armed =
    // ring with center pip (the more distinctive "shooter platform" look).
    for (const i of (b.pInts || [])) {
      if (i.status === "active") {
        const isKam = i.destroyOnKill !== false;
        if (isKam) {
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 5, color: "#ffffff", fillColor: pc, fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
        } else {
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 7, color: "#ffffff", fillColor: "transparent", fillOpacity: 0, weight: 2 }).addTo(bl);
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 2, color: pc, fillColor: pc, fillOpacity: 1, weight: 0 }).addTo(bl);
        }
      } else if (i.status === "landed") {
        L.circleMarker(toLL(i.x, i.y), { radius: 4, color: pc, fillColor: pc, fillOpacity: 0.4, weight: 1 }).addTo(bl);
      }
    }
    for (const i of (b.aInts || [])) {
      if (i.status === "active") {
        const isKam = i.destroyOnKill !== false;
        if (isKam) {
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 5, color: oc, fillColor: oc, fillOpacity: 0.9, weight: 1.5 }).addTo(bl);
        } else {
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 7, color: oc, fillColor: "transparent", fillOpacity: 0, weight: 2 }).addTo(bl);
          L.circleMarker(toLL(dx(i), dy(i)), { radius: 2, color: oc, fillColor: oc, fillOpacity: 1, weight: 0 }).addTo(bl);
        }
      } else if (i.status === "landed") {
        L.circleMarker(toLL(i.x, i.y), { radius: 4, color: "#663333", fillColor: "#663333", fillOpacity: 0.5, weight: 1 }).addTo(bl);
      }
    }
    if (b.flashes) {
      // Per visuals audit: use wall-clock time for VFX decay so 16x speed doesn't hide flashes.
      // Each flash carries wallTime (creation timestamp). Aging is computed in milliseconds.
      // PERF: backfill missing wallTime so legacy flash creation sites don't get culled instantly,
      // and CAP the total count so high-speed combat can't accumulate thousands of DOM elements.
      const nowMs = performance.now();
      for (const f of b.flashes) { if (!f.wallTime) f.wallTime = nowMs; }
      const EXPLOSION_TYPES = new Set(["ad_explosion", "resource_explosion"]);
      b.flashes = b.flashes.filter((f) => {
        const ageMs = nowMs - f.wallTime;
        const maxMs = f.type === "dmgtext" ? 2000 : EXPLOSION_TYPES.has(f.type) ? 900 : 500;
        return ageMs < maxMs;
      });
      // Cap: keep only the most recent 200 flashes total. Prevents lag spikes during 16x combat
      // when many AD shots + kills + damage popups can pile up faster than they decay.
      if (b.flashes.length > 200) b.flashes = b.flashes.slice(-200);
      // Guest-side shake: trigger shakeMap for explosion flashes received via snapshot.
      // Track seen flash IDs to avoid re-triggering shake on already-processed flashes.
      if (!b._seenShakeIds) b._seenShakeIds = new Set();
      for (const f of b.flashes) {
        if (f.shake && f.wallTime && !b._seenShakeIds.has(f.wallTime)) {
          b._seenShakeIds.add(f.wallTime);
          shakeMap(f.shake, Math.round(f.shake * 1.25));
        }
      }
      for (const f of b.flashes) {
        const ageMs = nowMs - (f.wallTime || 0);
        const maxAgeMs = f.type === "dmgtext" ? 2000 : EXPLOSION_TYPES.has(f.type) ? 900 : 500;
        const p = Math.min(1, ageMs / maxAgeMs);
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
          const drift = ageMs / 16 * 3;
          const driftLL = toLL(f.x, f.y + drift);
          L.marker(driftLL, { icon: L.divIcon({ className: "", iconSize: [80, 16], iconAnchor: [40, 8], html: `<div style="color:${f.color || "#ff5555"};font-size:12px;font-weight:800;font-family:monospace;text-align:center;text-shadow:0 0 6px #000;opacity:${1 - p}">${f.text}</div>` }), interactive: false }).addTo(bl);
        } else if (f.type === "ad_explosion") {
          // Large multi-ring explosion: AD system destroyed by a kamikaze drone strike.
          // Outer white shockwave ring, inner orange fireball, debris sparkles.
          const eased = 1 - Math.pow(1 - p, 3);
          // Outer shockwave (white ring expanding fast)
          L.circleMarker(ll, { radius: 10 + eased * 30, color: "#ffffff", fillColor: "transparent", fillOpacity: 0, weight: 3, opacity: (1 - p) * 0.7 }).addTo(bl);
          // Inner fireball (orange → dark red)
          L.circleMarker(ll, { radius: 6 + eased * 18, color: "#ff4400", fillColor: "#ff8800", fillOpacity: (1 - p) * 0.8, weight: 2, opacity: 1 - p }).addTo(bl);
          // Hot core
          if (p < 0.5) {
            L.circleMarker(ll, { radius: 4 + eased * 6, color: "#ffcc00", fillColor: "#ffee88", fillOpacity: (1 - p * 2) * 0.9, weight: 0 }).addTo(bl);
          }
          // 4 debris sparkles drifting outward
          for (let di = 0; di < 4; di++) {
            const angle = (di / 4) * Math.PI * 2 + 0.3;
            const dr = eased * 250;
            const dll = toLL(f.x + Math.cos(angle) * dr, f.y + Math.sin(angle) * dr);
            L.circleMarker(dll, { radius: 2, color: "#ffaa00", fillColor: "#ffaa00", fillOpacity: (1 - p) * 0.8, weight: 0 }).addTo(bl);
          }
        } else if (f.type === "resource_explosion") {
          // Medium explosion: resource building destroyed. Orange/amber fireball + ring.
          const eased = 1 - Math.pow(1 - p, 3);
          // Shockwave ring
          L.circleMarker(ll, { radius: 8 + eased * 22, color: "#ffffff", fillColor: "transparent", fillOpacity: 0, weight: 2.5, opacity: (1 - p) * 0.6 }).addTo(bl);
          // Fireball
          L.circleMarker(ll, { radius: 5 + eased * 14, color: "#ff6600", fillColor: "#ff9800", fillOpacity: (1 - p) * 0.7, weight: 2, opacity: 1 - p }).addTo(bl);
          // 3 debris
          for (let di = 0; di < 3; di++) {
            const angle = (di / 3) * Math.PI * 2 + 0.5;
            const dr = eased * 180;
            const dll = toLL(f.x + Math.cos(angle) * dr, f.y + Math.sin(angle) * dr);
            L.circleMarker(dll, { radius: 2, color: "#ff9800", fillColor: "#ff9800", fillOpacity: (1 - p) * 0.7, weight: 0 }).addTo(bl);
          }
        } else if (f.type === "drone_clash") {
          // Interceptor vs attacker drone: quick blue-orange burst with crossing sparks.
          const eased = 1 - Math.pow(1 - p, 3);
          // Blue-white center (interceptor)
          L.circleMarker(ll, { radius: 4 + eased * 10, color: "#4a9eff", fillColor: "#88ccff", fillOpacity: (1 - p) * 0.7, weight: 1.5, opacity: 1 - p }).addTo(bl);
          // Orange ring (attacker)
          L.circleMarker(ll, { radius: 6 + eased * 12, color: "#ff8800", fillColor: "transparent", fillOpacity: 0, weight: 2, opacity: (1 - p) * 0.6 }).addTo(bl);
          // 2 crossing sparks
          if (p < 0.6) {
            const spk = eased * 120;
            L.circleMarker(toLL(f.x - spk, f.y + spk * 0.5), { radius: 1.5, color: "#ffffff", fillColor: "#ffffff", fillOpacity: (1 - p) * 0.9, weight: 0 }).addTo(bl);
            L.circleMarker(toLL(f.x + spk, f.y - spk * 0.5), { radius: 1.5, color: "#ffffff", fillColor: "#ffffff", fillOpacity: (1 - p) * 0.9, weight: 0 }).addTo(bl);
          }
        } else if (f.type === "kill") {
          const eased = 1 - Math.pow(1 - p, 3);
          L.circleMarker(ll, { radius: 5 + eased * 14, color: "#ffffff", fillColor: "#ff8800", fillOpacity: (1 - p) * 0.6, weight: 2, opacity: 1 - p }).addTo(bl);
        } else if (f.type === "breach") {
          const eased = 1 - Math.pow(1 - p, 3);
          L.circleMarker(ll, { radius: 6 + eased * 12, color: "#ff0040", fillColor: "#ff0040", fillOpacity: (1 - p) * 0.7, weight: 2.5, opacity: 1 - p }).addTo(bl);
        }
      }
    }
  }, [shakeMap]);

  // ── Phase 3: Serialize battle state for network transmission (~15Hz) ──
  const serializeBattleSnapshot = useCallback((b) => ({
    type: "combat_snapshot",
    step: b.step,
    // bs = host's battleSpeed multiplier (1/2/4/8/16). The guest uses this to scale
    // its dead-reckoning extrapolation so drones/interceptors glide at the same
    // effective rate the host is simulating them. Without this, at 16x speed the guest
    // would only interpolate 1/16th of the actual distance between snapshots, making
    // all movement (especially RTB at high speeds) look jerky and wrong.
    bs: battleSpeedRef.current || 1,
    // hd = heading (radians), spd = speed. Needed by guest for dead-reckoning extrapolation
    // between snapshots so drones glide smoothly instead of teleporting every 67ms.
    pAtt: b.pAttackers.map((a) => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), s: a.status, hd: a.heading, spd: a.speed })),
    aAtt: b.aAttackers.map((a) => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), s: a.status, hd: a.heading, spd: a.speed })),
    pInt: b.pInts.map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), s: i.status, hd: i.heading, spd: i.speed })),
    aInt: b.aInts.map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), s: i.status, hd: i.heading, spd: i.speed })),
    // lf = lastFired step. Required for the guest's reload pie chart to cycle correctly
    // (without it, ad.lastFired is undefined → reloadPct stays at 1 → pie chart is stuck green).
    pAD: b.pAD.map((a) => ({ key: a.key, x: a.x, y: a.y, h: a.health, ammo: a.ammo, lf: a.lastFired })),
    aAD: b.aAD.map((a) => ({ key: a.key, x: a.x, y: a.y, h: a.health, ammo: a.ammo, lf: a.lastFired })),
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
      // Lerp interpolation: smoothly blend from the previous snapshot position (_prevX/_prevY)
      // to the current snapshot position (x, y) based on elapsed time vs snapshot interval.
      // This replaces the old heading+speed extrapolation which caused visible jitter on
      // predictable paths (especially RTB). Interpolation can never overshoot because t is
      // clamped - the render position always stays between the two known good positions.
      // At t >= 1.0 (snapshot overdue), we hold at the current position rather than guessing.
      if (b._lastSnapshotTime && b._snapshotInterval) {
        const elapsed = performance.now() - b._lastSnapshotTime;
        const t = Math.min(elapsed / b._snapshotInterval, 1.5);
        for (const list of [b.pAttackers, b.aAttackers, b.pInts, b.aInts]) {
          for (const d of list) {
            if (d.status !== "active") continue;
            d._renderX = d._prevX + (d.x - d._prevX) * t;
            d._renderY = d._prevY + (d.y - d._prevY) * t;
          }
        }
      }
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
    setTotalIncome((p) => p + pIncome);

    // ── Bot mode: AI spends accumulated budget on defenses + pays for attack wave ──
    let aiBudgetWorking = aiBudget + aIncome;
    let aiWave;
    // Fresh interceptors/AD arrays for battle - in bot mode these come from aiSpendBudget
    // (since setAiSetup hasn't flushed yet). In MP mode, use aiSetup directly.
    let aiIntsForBattle = aiSetup.interceptors;
    let aiADForBattle = aiSetup.adUnits;
    if (gameMode === "bot") {
      const spent = aiSpendBudget(aiSetup, resourceDeposits, aiBudgetWorking, round);
      aiBudgetWorking = spent.budget;
      aiIntsForBattle = spent.interceptors;
      aiADForBattle = spent.adUnits;
      setAiSetup((prev) => ({ ...prev, adUnits: spent.adUnits, interceptors: spent.interceptors, resources: spent.resources }));
      if (spent.deposits !== resourceDeposits) setResourceDeposits(spent.deposits);
      // Build attack wave and pay for it. If broke, scale down.
      aiWave = generateAIAttack(round);
      let waveCostAi = Object.entries(aiWave).reduce((s, [k, n]) => { const u = ATTACK_UNITS.find((a) => a.key === k); return s + (u ? u.cost * n : 0); }, 0);
      if (waveCostAi > aiBudgetWorking) {
        const scale = Math.max(0.1, aiBudgetWorking / waveCostAi);
        for (const k of Object.keys(aiWave)) aiWave[k] = Math.max(0, Math.floor(aiWave[k] * scale));
        waveCostAi = Object.entries(aiWave).reduce((s, [k, n]) => { const u = ATTACK_UNITS.find((a) => a.key === k); return s + (u ? u.cost * n : 0); }, 0);
      }
      aiBudgetWorking -= waveCostAi;
    } else {
      // MP host mode: opponent's wave comes from the network
      aiWave = (gameMode === "host" && aiSetup._attackWave) ? aiSetup._attackWave : generateAIAttack(round);
    }
    setAiBudget(aiBudgetWorking);
    log.push(`Round ${round + 1}: You +$${formatUSD(pIncome)} | ${opponentName} +$${formatUSD(aIncome)}`);

    // In MP host mode, broadcast round-start so guest enters battle phase
    if (gameMode === "host") {
      broadcast({ type: "round_start", round, pIncome, aIncome });
    }
    // Audio: round start horn
    playSfx("round_start", 0);

    // Spawn player's attack drones flying toward AI HQ (via trajectory waypoints if defined)
    const pAttackers = spawnDrones(playerAttack, playerHQ.x, playerHQ.y - 500, aiSetup.hqX, aiSetup.hqY, 10000 + round * 1000, playerTrajectory.length > 0 ? playerTrajectory : null);
    // Guest's trajectory arrives via the "trajectory" net message and is stashed at aiSetup._trajectory.
    // Without this, host-spawned guest drones ignore the waypoints the guest placed locally.
    const aiTrajectory = (gameMode === "host" && Array.isArray(aiSetup._trajectory) && aiSetup._trajectory.length > 0) ? aiSetup._trajectory : null;
    const aAttackers = spawnDrones(aiWave, aiSetup.hqX, aiSetup.hqY + 500, playerHQ.x, playerHQ.y, 20000 + round * 1000, aiTrajectory);

    // Player interceptors with spawn positions for RTB.
    // Tag each entity with groupIdx so the round-end survival count only counts its own group
    // (prevents the "doubling" bug when multiple groups overlapped within 1500m).
    const pInts = [];
    playerInterceptors.forEach((d, groupIdx) => {
      const def = DEFENSE_UNITS.find((dd) => dd.key === d.key);
      const count = d.count || 4;
      for (let i = 0; i < count; i++) {
        // Spawn jittered around the placement marker for visual spread, but RTB to a
        // FIXED slot in a small ring around the EXACT placement position so they always
        // land at the marker (not at the random initial scatter point). Each interceptor
        // gets its own slot on the ring so they don't all overlap when landed.
        const sx = d.x + (Math.random() - 0.5) * 300;
        const sy = d.y + (Math.random() - 0.5) * 300;
        const slotAngle = (i / count) * Math.PI * 2;
        const slotRadius = 25; // small ring so they cluster tightly at the placement marker
        const homeX = d.x + Math.cos(slotAngle) * slotRadius;
        const homeY = d.y + Math.sin(slotAngle) * slotRadius;
        pInts.push({
          id: 30000 + pInts.length, x: sx, y: sy, spawnX: homeX, spawnY: homeY,
          speed: def?.speed || 2.0, status: "active", targetId: null,
          destroyOnKill: def?.destroyOnKill !== false, survivalRate: def?.survivalRate || 0,
          groupIdx,
        });
      }
    });
    // AI interceptors with spawn positions. Uses aiIntsForBattle which is either the
    // fresh array from aiSpendBudget (bot mode) or aiSetup.interceptors (MP mode).
    const aInts = (aiIntsForBattle || []).filter((i) => i.status === "active").map((i) => ({ ...i, spawnX: i.groupX ?? i.x, spawnY: i.groupY ?? i.y }));

    log.push(`You sent ${pAttackers.length} drones | ${opponentName} sent ${aAttackers.length} drones`);
    setCombatLog((prev) => [...prev, ...log]);

    // Copy AD state for battle
    const pAD = playerAD.map((a) => ({ ...a }));
    const aAD = (aiADForBattle || []).map((a) => ({ ...a }));

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
        // Trajectory waypoint following: guest drones get assigned a trajectory from
        // aiSetup._trajectory in launchRound. This loop previously ignored it and only
        // targeted the nearest HQ, so the guest's waypoints were silently dropped.
        // Head to current waypoint until close, then advance to the next.
        if (a.trajectory && a.waypointIdx < a.trajectory.length) {
          const wp = a.trajectory[a.waypointIdx];
          const wx = wp.x, wy = wp.y;
          if (dist(a, wp) < 180) { a.waypointIdx++; }
          const wdx = wx - a.x, wdy = wy - a.y;
          let wdiff = Math.atan2(wdy, wdx) - a.heading;
          while (wdiff > Math.PI) wdiff -= Math.PI * 2;
          while (wdiff < -Math.PI) wdiff += Math.PI * 2;
          a.heading += wdiff * 0.06;
          a.x += Math.cos(a.heading) * a.speed;
          a.y += Math.sin(a.heading) * a.speed;
          continue;
        }
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
              const adSys = theaterScaleRef.current.ad.find((s2) => s2.key === closest.key);
              closest.health = 0; closest.ammo = 0; a.status = "expended";
              b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "ad_explosion", shake: 8 });
              b.flashes.push({ x: a.x, y: a.y + 100, time: b.step, wallTime: performance.now(), type: "dmgtext", text: `${adSys?.name || "AD"} destroyed!`, color: "#ff3333" });
              shakeMap(8, 10);
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
        const breachDist = theaterScaleRef.current.killRadius * 2;
        for (const h of hqList) { if (dist(a, h) < breachDist) { breachedHQ = h; break; } }
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
            const adSys = theaterScaleRef.current.ad.find((s2) => s2.key === closest.key);
            closest.health = 0; closest.ammo = 0; a.status = "expended";
            b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "ad_explosion", shake: 8 });
            b.flashes.push({ x: a.x, y: a.y + 100, time: b.step, wallTime: performance.now(), type: "dmgtext", text: `${adSys?.name || "AD"} destroyed!`, color: "#ff3333" });
            shakeMap(8, 10);
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
              b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "resource_explosion", shake: 6 });
              b.flashes.push({ x: a.x, y: a.y - 100, time: b.step, wallTime: performance.now(), type: "dmgtext", text: `${res2?.name || "Resource"} destroyed!`, color: "#ff9800" });
              shakeMap(6, 8);
              continue;
            }
          }
        } else if (attackPriority === "interceptors" && b.aInts.some((i) => i.status === "active")) {
          const alive = b.aInts.filter((i) => i.status === "active");
          const closest = alive.reduce((best, i) => dist(a, i) < dist(a, best) ? i : best, alive[0]);
          tx = closest.x; ty = closest.y;
          if (dist(a, closest) < theaterScaleRef.current.killRadius) {
            closest.status = "expended"; a.status = "expended";
            b.flashes.push({ x: a.x, y: a.y, time: b.step, wallTime: performance.now(), type: "drone_clash" });
            continue;
          }
        }
        const dx = tx - a.x, dy = ty - a.y;
        let diff = Math.atan2(dy, dx) - a.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        a.heading += diff * 0.06;
        a.x += Math.cos(a.heading) * a.speed;
        a.y += Math.sin(a.heading) * a.speed;
        if (dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) < theaterScaleRef.current.killRadius * 2) {
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
          activeA = activeA.filter((a) => aiSetup.hqX != null && dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) > aiSetup.airspace);
        }
        // "insane" = no filter, chase anywhere
        let tgt = activeA.find((a) => a.id === int.targetId);
        if (!tgt) { let best = null, bd = Infinity; for (const a of activeA) { const d2 = dist(int, a); if (d2 < bd) { bd = d2; best = a; } } if (best) { int.targetId = best.id; tgt = best; } }
        if (tgt) {
          int.heading = Math.atan2(tgt.y - int.y, tgt.x - int.x);
          const nx = int.x + Math.cos(int.heading) * int.speed;
          const ny = int.y + Math.sin(int.heading) * int.speed;
          // Posture boundary check: block the move if the new position would violate the
          // posture rule AND we're not actively moving toward the allowed region. Without
          // the "moving toward allowed" escape clause, an interceptor that's already inside
          // the forbidden zone (e.g. via switching posture mid-combat) would be permanently
          // trapped inside, because every move stays inside.
          let blocked = false;
          if (defPosture === "pursuing" && aiSetup.hqX != null) {
            const curDist = dist(int, { x: aiSetup.hqX, y: aiSetup.hqY });
            const newDist = dist({ x: nx, y: ny }, { x: aiSetup.hqX, y: aiSetup.hqY });
            if (newDist < aiSetup.airspace && newDist <= curDist) blocked = true;
          } else if (defPosture === "defensive" && playerHQ) {
            const curDist = dist(int, playerHQ);
            const newDist = dist({ x: nx, y: ny }, playerHQ);
            if (newDist > playerAirspace && newDist >= curDist) blocked = true;
          }
          if (blocked) {
            int.targetId = null; // give up this target
          } else {
            int.x = nx; int.y = ny;
            if (dist(int, tgt) < theaterScaleRef.current.killRadius) {
              tgt.status = "destroyed"; b.aKills++; int.targetId = null;
              b.flashes.push({ x: tgt.x, y: tgt.y, time: b.step, wallTime: performance.now(), type: "drone_clash" });
              // Kamikaze interceptors survive FPV kills (FPVs are small/light enough
              // that the interceptor can disable them without self-destructing).
              // Against heavier drones (shahed/lancet/mohajer), kamikaze still expends.
              const tgtIsFpv = tgt.threat === "cheap" && (tgt.hp ?? 1) <= 2;
              if (int.destroyOnKill && !tgtIsFpv) int.status = "expended";
              else if (!int.destroyOnKill && Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
            }
          }
        }
      }
      // AI interceptors chase player attackers (posture-aware via guest's broadcast)
      // Previously had no posture check at all - guest's interceptors ignored the guest's
      // posture setting entirely because the host only applied its own defPosture to pInts.
      // The guest's posture lives in aiSetup._posture (set by the "def_posture" message handler).
      // Mirror the pInts filter/boundary logic with playerHQ as aInts' enemy HQ.
      const aiPosture = (aiSetup && aiSetup._posture) || "insane";
      for (const int of b.aInts) {
        if (int.status !== "active") continue;
        let activeP = b.pAttackers.filter((a) => a.status === "active");
        if (aiPosture === "defensive") {
          activeP = activeP.filter((a) => aiSetup.hqX != null && dist(a, { x: aiSetup.hqX, y: aiSetup.hqY }) < aiSetup.airspace);
        } else if (aiPosture === "pursuing") {
          activeP = activeP.filter((a) => playerHQ && dist(a, playerHQ) > playerAirspace);
        }
        let tgt = activeP.find((a) => a.id === int.targetId);
        if (!tgt) { let best = null, bd = Infinity; for (const a of activeP) { const d2 = dist(int, a); if (d2 < bd) { bd = d2; best = a; } } if (best) { int.targetId = best.id; tgt = best; } }
        if (tgt) {
          int.heading = Math.atan2(tgt.y - int.y, tgt.x - int.x);
          const nx = int.x + Math.cos(int.heading) * int.speed;
          const ny = int.y + Math.sin(int.heading) * int.speed;
          let blocked = false;
          if (aiPosture === "pursuing" && playerHQ) {
            const curDist = dist(int, playerHQ);
            const newDist = dist({ x: nx, y: ny }, playerHQ);
            if (newDist < playerAirspace && newDist <= curDist) blocked = true;
          } else if (aiPosture === "defensive" && aiSetup.hqX != null) {
            const curDist = dist(int, { x: aiSetup.hqX, y: aiSetup.hqY });
            const newDist = dist({ x: nx, y: ny }, { x: aiSetup.hqX, y: aiSetup.hqY });
            if (newDist > aiSetup.airspace && newDist >= curDist) blocked = true;
          }
          if (blocked) {
            int.targetId = null;
          } else {
            int.x = nx; int.y = ny;
            if (dist(int, tgt) < theaterScaleRef.current.killRadius) {
              tgt.status = "destroyed"; b.pKills++; int.targetId = null;
              b.flashes.push({ x: tgt.x, y: tgt.y, time: b.step, wallTime: performance.now(), type: "drone_clash" });
              const tgtIsFpv = tgt.threat === "cheap" && (tgt.hp ?? 1) <= 2;
              if (int.destroyOnKill && !tgtIsFpv) int.status = "expended";
              else if (Math.random() > (int.survivalRate || 0.73)) int.status = "expended";
            }
          }
        }
      }

      // AD units fire with reload cooldown.
      // pK = hit chance, dmg = HP removed on hit. Drone dies when hp <= 0.
      // Gepard (1 dmg) burns through ammo on Mohajer (8 hp) but kills FPV (1 hp) in one shot.
      // NASAMS (100 dmg) one-shots everything.
      const fireAd = (ad, attackerList, intList, killCounterKey) => {
        if (ad.health <= 0 || ad.ammo <= 0) return;
        const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
        if (!sys) return;
        // engageRate is in seconds. Multiply by 60 (sim steps per second at 60fps)
        // so reload is visually meaningful. Old value of *5 made ADs fire almost instantly.
        const cooldown = Math.max(15, Math.round(sys.engageRate * 60));
        if (ad.lastFired && b.step - ad.lastFired < cooldown) return;
        // Per-AD targeting priority: "all" (default), "cheap", "expensive".
        // Lets the player assign expensive NASAMS to expensive targets and cheap Gepards to FPV swarms.
        const prio = ad.priority || "all";
        const matchesPrio = (a) => prio === "all" || a.threat === prio || (prio === "expensive" && a.threat === "medium");
        let target = null;
        for (const a of attackerList) {
          if (a.status !== "active" || !matchesPrio(a)) continue;
          if (dist(ad, a) < sys.range) { target = a; break; }
        }
        // Fallback: if no priority match in range, try any target (don't waste opportunity)
        if (!target && prio !== "all") {
          for (const a of attackerList) {
            if (a.status !== "active") continue;
            if (dist(ad, a) < sys.range) { target = a; break; }
          }
        }
        if (!target) {
          for (const i of intList) {
            if (i.status !== "active") continue;
            if (dist(ad, i) < sys.range) { target = i; break; }
          }
        }
        if (target) {
          ad.ammo--; ad.lastFired = b.step;
          b.flashes.push({ x: ad.x, y: ad.y, x2: target.x, y2: target.y, time: b.step, wallTime: performance.now(), type: "adshot", color: sys.color });
          if (killCounterKey === "aKills") playSfx("ad_fire", 50);
          if (Math.random() < sys.pk) {
            // Hit: deduct damage from target HP
            target.hp = (target.hp ?? 1) - sys.dmg;
            if (target.hp <= 0) {
              target.status = "destroyed";
              b[killCounterKey]++;
              b.flashes.push({ x: target.x, y: target.y, time: b.step, wallTime: performance.now(), type: "kill" });
              if (killCounterKey === "aKills") playSfx("drone_kill", 60);
            } else {
              // Hit but not killed - small impact flash
              b.flashes.push({ x: target.x, y: target.y, time: b.step, wallTime: performance.now(), type: "kill" });
            }
          }
        }
      };
      for (const ad of b.pAD) fireAd(ad, b.aAttackers, b.aInts, "aKills");
      for (const ad of b.aAD) fireAd(ad, b.pAttackers, b.pInts, "pKills");

      // RTB phase: when all attackers are gone, active interceptors fly back to their
      // spawn point at normal speed. The round does NOT end until every interceptor has
      // either landed (arrived within 30 units of its spawn) or expended. This gives the
      // player/opponent time to see the result of the engagement before the round cuts.
      // This runs INSIDE the speed-loop (si loop) so at 16x speed the RTB completes
      // ~16x faster in wall-clock time, matching the rest of the sim's time dilation.
      // Previously this block was accidentally placed OUTSIDE the speed loop - the step
      // counter advanced by `spd` per frame but RTB interceptors only moved once, so the
      // guest's dead-reckoning extrapolation (based on observed step rate) overshot by
      // `battleSpeed`x, causing visible jitter/shake on the guest's screen.
      // Drones use their normal int.speed - no separate "RTB speed" field, avoiding the
      // old bug where interceptors flew home at a completely different speed than combat.
      const aAtk = b.aAttackers.filter((a) => a.status === "active").length;
      const pAtk = b.pAttackers.filter((a) => a.status === "active").length;
      const allAttackersGone = aAtk === 0 && pAtk === 0;

      if (allAttackersGone) {
        const rtbInterceptor = (int) => {
          if (int.status !== "active") return;
          int.targetId = null; // RTB mode - no combat targeting
          const dxh = int.spawnX - int.x;
          const dyh = int.spawnY - int.y;
          const dh = Math.sqrt(dxh * dxh + dyh * dyh);
          if (dh < 30 || dh < int.speed) {
            // Within one step of spawn - snap home and land.
            int.x = int.spawnX;
            int.y = int.spawnY;
            int.status = "landed";
            return;
          }
          // Move toward spawn at int.speed (same speed as combat - no RTB-specific bugs).
          int.heading = Math.atan2(dyh, dxh);
          int.x += Math.cos(int.heading) * int.speed;
          int.y += Math.sin(int.heading) * int.speed;
        };
        for (const int of b.pInts) rtbInterceptor(int);
        for (const int of b.aInts) rtbInterceptor(int);
      }

      } // end speed loop

      // Phase 3: host streams combat snapshots to guest at ~15Hz (wall-clock, not step-based,
      // so high-speedup modes don't accidentally fire 60+ snapshots/sec)
      if (gameModeRef.current === "host") {
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        if (!b.lastSnapshotTs || now - b.lastSnapshotTs >= 67) {
          b.lastSnapshotTs = now;
          broadcast(serializeBattleSnapshot(b));
        }
      }

      // Draw battle via the shared render path. Using renderBattleFrame here (instead of
      // a duplicate inline render block) keeps host and guest visuals identical - including
      // the reload pie chart on AD units, which previously only existed on the guest's path.
      renderBattleFrame(b);

      setBattleDrones({ playerAttackers: [...b.pAttackers], aiAttackers: [...b.aAttackers], playerInts: [...b.pInts], aiInts: [...b.aInts] });

      // Check if battle is over: all attackers gone AND all interceptors landed/expended
      const pIntsActive = b.pInts.filter((i) => i.status === "active").length;
      const aIntsActive = b.aInts.filter((i) => i.status === "active").length;
      const allAttGone = b.aAttackers.filter((a) => a.status === "active").length === 0 && b.pAttackers.filter((a) => a.status === "active").length === 0;
      const allDone = allAttGone && pIntsActive === 0 && aIntsActive === 0;
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

        // Update surviving interceptors using groupIdx (not distance) so overlapping
        // groups don't share/double their survivor counts.
        setPlayerInterceptors((prev) => prev.map((d, idx) => {
          const surviving = b.pInts.filter((i) => (i.status === "active" || i.status === "landed") && i.groupIdx === idx).length;
          return { ...d, count: Math.max(0, surviving) };
        }));
        const survivingAiInts = b.aInts.filter((i) => i.status === "active");

        // Persist AD damage between rounds + auto-reload (charges player for missing missiles).
        // Destroyed ADs stay destroyed; surviving ADs that fired refill to max if affordable.
        let pReloadCost = 0;
        const updatedPlayerAD = playerAD.map((ad) => {
          const battleAd = b.pAD.find((ba) => ba.x === ad.x && ba.y === ad.y && ba.key === ad.key);
          if (!battleAd || battleAd.health <= 0) return { ...ad, health: 0 };
          const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
          const missing = (sys?.missiles || 0) - battleAd.ammo;
          const reloadCost = missing * (sys?.missileCost || 0);
          pReloadCost += reloadCost;
          return { ...ad, health: battleAd.health, ammo: sys?.missiles || battleAd.ammo, _justReloaded: missing > 0 };
        }).filter((ad) => ad.health > 0);
        if (pReloadCost > 0) {
          setPlayerBudget((p) => p - pReloadCost);
          endLog.push(`AD reload: -$${formatUSD(pReloadCost)} (${updatedPlayerAD.filter((a) => a._justReloaded).length} systems refilled)`);
        }
        setPlayerAD(updatedPlayerAD);
        // Same for AI: auto-reload up to max if AI has budget
        if (aiSetup && Array.isArray(aiSetup.adUnits)) {
          let aReloadCost = 0;
          const updatedAiAd = aiSetup.adUnits.map((ad) => {
            const battleAd = b.aAD.find((ba) => ba.x === ad.x && ba.y === ad.y && ba.key === ad.key);
            if (!battleAd || battleAd.health <= 0) return { ...ad, health: 0 };
            const sys = theaterScaleRef.current.ad.find((s) => s.key === ad.key);
            const missing = (sys?.missiles || 0) - battleAd.ammo;
            const cost = missing * (sys?.missileCost || 0);
            aReloadCost += cost;
            return { ...ad, health: battleAd.health, ammo: sys?.missiles || battleAd.ammo };
          }).filter((ad) => ad.health > 0);
          if (aReloadCost > 0) setAiBudget((p) => p - aReloadCost);
          // Persist all AI state changes via setAiSetup instead of mutating directly.
          // Direct mutation caused interceptors/AD to silently disappear between rounds
          // because React didn't know the state changed and skipped re-renders.
          setAiSetup((prev) => ({
            ...prev,
            interceptors: survivingAiInts,
            adUnits: updatedAiAd,
            resources: (prev.resources || []).map((r) => {
              // Sync alive status from the battle sim's mutations
              const battleRes = aiSetup.resources.find((br) => br.x === r.x && br.y === r.y && br.key === r.key);
              return battleRes ? { ...r, alive: battleRes.alive } : r;
            }),
          }));
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
  }, [playerHQ, playerExtraHQs, aiSetup, currentRound, playerResources, playerInterceptors, playerAD, playerAttack, playerTrajectory, playerBudget, aiBudget, gameOver, battleActive, username, opponentName, attackPriority, defPosture, playerAirspace, gameMode, broadcast, serializeBattleSnapshot, renderBattleFrame]);

  // Wire forward ref so the per-turn timer effect can call into us without a TDZ issue
  launchRoundRef.current = launchRound;

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  // ── Auto-clamp playerAirspace so it can never overlap enemy airspace ──
  useEffect(() => {
    if (!playerHQ || !aiSetup || aiSetup.hqX == null) return;
    const enemyDist = dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY });
    const maxSafe = Math.floor(enemyDist - (aiSetup.airspace || 2500) - 400);
    const minAirspace = (THEATERS[theater]?.airspace || [2000, 500])[1];
    if (maxSafe < minAirspace) return;
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
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      </Head>
      <Script
        src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"
        strategy="afterInteractive"
        onLoad={() => setPeerLoaded(true)}
        onError={() => {
          // Retry from jsdelivr CDN if unpkg fails
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
          s.onload = () => setPeerLoaded(true);
          s.onerror = () => setConnectionError("Failed to load network library - reload the page");
          document.head.appendChild(s);
        }}
      />
      <style jsx global>{`
        .leaflet-container { background: #0a0a0f; }
        /* Per visuals audit: dim ONLY the satellite tile layer so unit colors pop. */
        .leaflet-tile-pane { filter: brightness(0.65) contrast(1.05) saturate(0.7); }
        @keyframes fadeUp { 0% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; transform: translate(-50%, -120%); } }
        @keyframes mmSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 56, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/projects/swarm-interception" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>&larr; Simulation</Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#ff6688", letterSpacing: 0.5, margin: 0 }}>SWARM 1v1</h1>
          </div>
          {phase !== PHASE.LOBBY && phase !== PHASE.MATCHMAKING && (() => {
            // Top-right budget panel: shows AVAILABLE money (playerBudget - pending
            // attackWaveCost) so the user sees the live impact of their wave-size
            // sliders. Goes red and shakes when the pending wave costs more than what
            // they have. Same budgetShake state the left-panel budget uses, plus a
            // dedicated transition to red border on overspend that doesn't depend on
            // a click - the shake fires the moment the slider goes past the budget.
            // IMPORTANT: only subtract the pending wave cost OUTSIDE of COMBAT. During
            // combat the wave cost was already paid at launch (setPlayerBudget(p - cost))
            // so subtracting again would double-count and show the wrong "available".
            const pendingWave = phase === PHASE.COMBAT ? 0 : attackWaveCost;
            const availablePlayer = playerBudget - pendingWave;
            const overspend = availablePlayer < 0;
            const showShake = budgetShake || overspend;
            return (
              <div style={{
                display: "flex", gap: 14, alignItems: "center",
                background: "rgba(17, 17, 24, 0.95)",
                border: `2px solid ${showShake ? "#ff5555" : "#2a2a35"}`,
                borderRadius: 8,
                padding: "10px 18px",
                transition: showShake ? "none" : "border-color 0.3s",
                transform: budgetShake ? `translateX(${Math.random() > 0.5 ? 6 : -6}px)` : "none",
                boxShadow: showShake ? "0 0 14px rgba(255,85,85,0.55)" : "0 0 8px rgba(0,0,0,0.3)",
              }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>{username} avail</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: overspend ? "#ff5555" : "#4a9eff", fontFamily: "monospace", lineHeight: 1.05 }}>
                    {overspend ? "-" : ""}${formatUSD(Math.abs(availablePlayer))}
                  </div>
                  {pendingWave > 0 && (
                    <div style={{ fontSize: 9, color: overspend ? "#ff8888" : "#ff9800", marginTop: 1, fontFamily: "monospace" }}>
                      wave: -${formatUSD(pendingWave)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 14, color: "#666", fontWeight: 700 }}>VS</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>{opponentName}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#ff5555", fontFamily: "monospace", lineHeight: 1.05 }}>
                    ${formatUSD(Math.max(0, aiBudget))}
                  </div>
                </div>
                {phase === PHASE.COMBAT && (
                  <div style={{ marginLeft: 8, paddingLeft: 12, borderLeft: "1px solid #2a2a35", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Round</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#ff9800", fontFamily: "monospace", lineHeight: 1.05 }}>{currentRound + 1}</div>
                  </div>
                )}
              </div>
            );
          })()}
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
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Theaters (select maps you want to play)</div>
                    {Object.entries(THEATERS).map(([k, v]) => (
                      <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer", fontSize: 12, color: selectedTheaters.includes(k) ? "#e0e0e0" : "#555" }}>
                        <input type="checkbox" checked={selectedTheaters.includes(k)} onChange={() => {
                          setSelectedTheaters((prev) => {
                            const next = prev.includes(k) ? prev.filter((t) => t !== k) : [...prev, k];
                            return next.length === 0 ? [k] : next; // at least one must be selected
                          });
                        }} style={{ accentColor: "#4a9eff" }} />
                        {v.name}
                      </label>
                    ))}
                  </div>

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
                  {/* Spinner: SVG ring instead of Unicode ⟳ glyph because text glyphs have
                      asymmetric metrics and wobble eccentrically when CSS-rotated. SVG is
                      geometrically centered so it spins cleanly. */}
                  <div style={{ fontSize: 64, marginBottom: 8, color: connectionStatus === "error" ? "#ff5555" : "#4caf50", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, height: 64 }}>
                    {connectionStatus === "error" ? (
                      <span>✕</span>
                    ) : connectionStatus === "connected" ? (
                      <span>✓</span>
                    ) : (
                      <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: "mmSpin 1.2s linear infinite", display: "block" }}>
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#4caf50" strokeOpacity="0.18" strokeWidth="5" />
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#4caf50" strokeWidth="5" strokeLinecap="round" strokeDasharray="40 138" />
                      </svg>
                    )}
                  </div>
                  {/* Elapsed timer */}
                  {connectionStatus !== "error" && connectionStatus !== "connected" && (
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#4caf50", fontFamily: "monospace", marginBottom: 12, letterSpacing: 2 }}>
                      {Math.floor(mmElapsed / 60).toString().padStart(2, "0")}:{(mmElapsed % 60).toString().padStart(2, "0")}
                    </div>
                  )}
                  {/* Status message */}
                  <div style={{ fontSize: 12, color: connectionStatus === "connected" ? "#4caf50" : connectionStatus === "error" ? "#ff5555" : "#4caf50", marginBottom: 12, padding: 12, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.25)", borderRadius: 6 }}>
                    {connectionStatus === "creating" && "Initializing..."}
                    {connectionStatus === "waiting" && "Waiting for an opponent..."}
                    {connectionStatus === "connecting" && "Opponent found! Connecting..."}
                    {connectionStatus === "connected" && "Connected. Loading match..."}
                    {connectionStatus === "error" && (connectionError || "Error")}
                  </div>
                  {/* Live global stats */}
                  {connectionStatus !== "error" && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1, padding: "10px 8px", background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 6, textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#4a9eff", lineHeight: 1 }}>{mmStats.queueing}</div>
                        <div style={{ fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>In queue</div>
                      </div>
                      <div style={{ flex: 1, padding: "10px 8px", background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 6, textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#ff6688", lineHeight: 1 }}>{mmStats.inMatchPlayers}</div>
                        <div style={{ fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>Players in game</div>
                      </div>
                    </div>
                  )}
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
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Place HQ in the blue zone, add resources, defenses, ground AD, then design your attack wave.</div>
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
                        <input type="range" min={(THEATERS[theater]?.airspace || [2000, 500])[1]} max={playerHQ && aiSetup && aiSetup.hqX != null ? Math.max((THEATERS[theater]?.airspace || [2000, 500])[1], Math.floor(dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY }) - aiSetup.airspace - 400)) : (THEATERS[theater]?.airspace || [2000, 500, 4000])[2]} step="100" value={playerAirspace} onChange={(e) => setPlayerAirspace(parseInt(e.target.value))} style={{ flex: 1 }} />
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
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === "def_" + d.key ? "1px solid #4a9eff" : "1px solid #2a2a35", display: "flex", alignItems: "center", gap: 8 }}>
                          {/* Inline icon matching the placement marker shape so users see what they're buying */}
                          <span dangerouslySetInnerHTML={{ __html: d.destroyOnKill
                            ? `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#4a9eff" stroke="#ffffff" stroke-width="1.5"/></svg>`
                            : `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,2 16,15 9,12 2,15" fill="#4a9eff" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/></svg>` }} />
                          <span>{d.name} x4 ${formatUSD(d.cost * 4)} {d.destroyOnKill ? "(kamikaze)" : `(${Math.round(d.survivalRate * 100)}% survive)`}</span>
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#22aa22", margin: "8px 0 4px" }}>Ground AD</div>
                      {theaterScale.ad.map((s) => (
                        <button key={s.key} onClick={() => setPlacingWhat("ad_" + s.key)}
                          style={{ ...inputStyle, width: "100%", marginBottom: 3, cursor: "pointer", textAlign: "left", fontSize: 10, border: placingWhat === "ad_" + s.key ? `1px solid ${s.color}` : "1px solid #2a2a35" }}>
                          {s.name} ${formatUSD(s.cost)} | {s.range_m / 1000}km | {s.missiles} rds | Pk {Math.round(s.pk * 100)}%
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#ff5555", margin: "8px 0 4px" }}>Your Attack Wave</div>
                      {ATTACK_UNITS.map((a) => (
                        <div key={a.key} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#ff6666", marginBottom: 1 }}>
                            <span>{a.name}</span><span>{playerAttack[a.key] || 0} (${formatUSD((playerAttack[a.key] || 0) * a.cost)})</span>
                          </div>
                          <input type="range" value={playerAttack[a.key] || 0} min="0" max="150" step="1"
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
                          {meReady && opponentReady && (
                            <div style={{ fontSize: 10, color: "#4caf50", marginTop: 6, textAlign: "center" }}>
                              Both ready - starting combat...
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
                        <input type="range" min={(THEATERS[theater]?.airspace || [2000, 500])[1]} max={playerHQ && aiSetup && aiSetup.hqX != null ? Math.max((THEATERS[theater]?.airspace || [2000, 500])[1], Math.floor(dist(playerHQ, { x: aiSetup.hqX, y: aiSetup.hqY }) - aiSetup.airspace - 400)) : (THEATERS[theater]?.airspace || [2000, 500, 4000])[2]} step="100" value={playerAirspace} onChange={(e) => setPlayerAirspace(parseInt(e.target.value))} style={{ flex: 1 }} />
                        <span style={{ fontSize: 9, color: "#4a9eff" }}>{playerAirspace}m</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#4caf50", marginBottom: 6 }}>+${formatUSD(Math.floor(playerAirspace * 200))}/rnd from airspace</div>

                      {/* + Add HQ button (mid-match) - same as setup phase, costs 25M / 50M */}
                      {playerHQ && playerExtraHQs.length < 2 && (
                        <button onClick={() => setPlacingWhat(placingWhat === "extra_hq" ? null : "extra_hq")}
                          style={{ ...inputStyle, width: "100%", marginBottom: 6, cursor: "pointer", textAlign: "center", fontSize: 9,
                            border: placingWhat === "extra_hq" ? "1px solid #4a9eff" : "1px solid #2a2a35",
                            color: placingWhat === "extra_hq" ? "#4a9eff" : "#888" }}>
                          {placingWhat === "extra_hq"
                            ? `Click map ($${formatUSD(EXTRA_HQ_COSTS[playerExtraHQs.length])})...`
                            : `+ Add HQ #${playerExtraHQs.length + 2} ($${formatUSD(EXTRA_HQ_COSTS[playerExtraHQs.length])})`}
                        </button>
                      )}

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
                            border: placingWhat === "def_" + d.key ? "1px solid #4a9eff" : "1px solid #2a2a35", display: "flex", alignItems: "center", gap: 8 }}>
                          <span dangerouslySetInnerHTML={{ __html: d.destroyOnKill
                            ? `<svg width="16" height="16" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#4a9eff" stroke="#ffffff" stroke-width="1.5"/></svg>`
                            : `<svg width="16" height="16" viewBox="0 0 18 18"><polygon points="9,2 16,15 9,12 2,15" fill="#4a9eff" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/></svg>` }} />
                          <span>{d.name} x4 ${formatUSD(d.cost * 4)}</span>
                        </button>
                      ))}

                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#22aa22", margin: "4px 0 4px" }}>Buy Ground AD</div>
                      {theaterScale.ad.map((s) => (
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
                          <input type="range" value={playerAttack[a.key] || 0} min="0" max="150" step="1"
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

                      {gameMode === "bot" ? (
                        <button onClick={launchRound}
                          style={{ ...btnStyle, width: "100%", marginTop: 4, background: "#4a1a2a", borderColor: "#ff6688", color: "#ff6688", fontSize: 12 }}>
                          LAUNCH ROUND {currentRound + 1}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => { setPlacingWhat(null); setMeReady((r) => !r); }}
                            style={{ ...btnStyle, width: "100%", marginTop: 4, background: meReady ? "#1a4a2a" : "#4a1a2a", borderColor: meReady ? "#4caf50" : "#ff6688", color: meReady ? "#4caf50" : "#ff6688", fontSize: 12 }}>
                            {meReady ? `✓ READY FOR ROUND ${currentRound + 1}` : `MARK READY - ROUND ${currentRound + 1}`}
                          </button>
                          <div style={{ fontSize: 9, color: "#888", marginTop: 4, textAlign: "center" }}>
                            You: <span style={{ color: meReady ? "#4caf50" : "#666" }}>{meReady ? "Ready" : "Not ready"}</span>
                            {" | "}
                            {opponentName}: <span style={{ color: opponentReady ? "#4caf50" : "#666" }}>{opponentReady ? "Ready" : "Not ready"}</span>
                          </div>
                          {meReady && opponentReady && (
                            <div style={{ fontSize: 10, color: "#4caf50", marginTop: 4, textAlign: "center" }}>
                              Both ready - launching round...
                            </div>
                          )}
                        </>
                      )}
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

                  {gameOver && (() => {
                    const youWon = gameOver.winner === username;
                    return (
                    <div style={{
                      padding: 16, borderRadius: 8, textAlign: "center", marginBottom: 12,
                      background: youWon ? "rgba(76,175,80,0.15)" : "rgba(255,85,85,0.15)",
                      border: `2px solid ${youWon ? "#4caf50" : "#ff5555"}`,
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: youWon ? "#4caf50" : "#ff5555" }}>
                        {youWon ? "VICTORY" : "DEFEAT"}
                      </div>
                      <div style={{ fontSize: 13, color: youWon ? "#66bb6a" : "#ff8888", marginTop: 4, fontWeight: 600 }}>
                        {gameOver.reason}
                      </div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>
                        Winner: {gameOver.winner}
                      </div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                        You: ${formatUSD(playerBudget)} | {opponentName}: ${formatUSD(aiBudget)}
                      </div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                        Rounds played: {currentRound}
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
                  );})()}

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
                // Look up LIVE data each render so combat state (ammo, health) updates in the popup.
                // unitInspect stores identifiers (kind, side, key, x, y); the ammo/health are read fresh.
                const liveAd = u.kind === "ad"
                  ? (u.side === "player" ? playerAD : (aiSetup?.adUnits || [])).find((a) => a.key === u.key && a.x === u.x && a.y === u.y)
                  : null;
                // Also pull live battle ammo if combat is active (battleRef has the most recent values)
                const battleLiveAd = (battleActive && battleRef.current && u.kind === "ad")
                  ? (u.side === "player" ? battleRef.current.pAD : battleRef.current.aAD)?.find((a) => a.key === u.key && a.x === u.x && a.y === u.y)
                  : null;
                const adData = battleLiveAd || liveAd || u.ad;
                const liveRes = u.kind === "resource"
                  ? (u.side === "player" ? playerResources : (aiSetup?.resources || [])).find((r) => r.key === u.key && r.x === u.x && r.y === u.y)
                  : null;
                let title = "", subtitle = "", stats = [], color = "#4a9eff", svg = null;
                if (u.kind === "hq" || u.kind === "hq_extra") {
                  title = u.side === "player" ? (u.kind === "hq_extra" ? "Your Forward HQ" : "Your HQ") : "Enemy HQ";
                  subtitle = "Command Center";
                  color = u.side === "player" ? "#4a9eff" : "#ff5555";
                  stats = [["Type", u.kind === "hq_extra" ? "Secondary" : "Primary"], ["Defense", "8+ breaches in one round = destroyed"]];
                  svg = `<svg width="60" height="60" viewBox="0 0 60 60"><rect x="10" y="10" width="40" height="40" fill="${color}" stroke="#fff" stroke-width="3"/><rect x="20" y="20" width="6" height="6" fill="#fff"/><rect x="34" y="20" width="6" height="6" fill="#fff"/><rect x="20" y="34" width="6" height="6" fill="#fff"/><rect x="34" y="34" width="6" height="6" fill="#fff"/></svg>`;
                } else if (u.kind === "ad") {
                  const sys = theaterScaleRef.current.ad.find((s) => s.key === u.key);
                  if (sys) {
                    title = sys.name;
                    subtitle = u.side === "player" ? "Your Ground AD" : "Enemy Ground AD";
                    color = sys.color;
                    const liveAmmo = adData?.ammo ?? sys.missiles;
                    const liveHealth = adData?.health ?? 1;
                    const adPrio = adData?.priority || "all";
                    stats = [
                      ["Cost", `$${formatUSD(sys.cost)}`],
                      ["Range", `${sys.range_m >= 1000 ? (sys.range_m / 1000) + "km" : sys.range_m + "m"}`],
                      ["Missiles", `${liveAmmo} / ${sys.missiles}`],
                      ["Hit chance", `${Math.round(sys.pk * 100)}%`],
                      ["Damage/hit", `${sys.dmg}`],
                      ["Reload", `${sys.engageRate}s`],
                      ["Priority", adPrio === "all" ? "All targets" : adPrio === "cheap" ? "Cheap drones first" : "Expensive drones first"],
                      ["Status", liveHealth > 0 ? (liveAmmo === 0 ? "OUT OF AMMO" : "Operational") : "DESTROYED"],
                    ];
                    // Per-system sci-fi sketch from UNIT_SKETCHES, fall back to a generic
                    // crosshair if a new AD system is added without a sketch.
                    svg = UNIT_SKETCHES.ad[u.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${color}" stroke="${u.side === 'player' ? '#fff' : '#ff3333'}" stroke-width="3"/><circle cx="30" cy="30" r="4" fill="#fff"/><line x1="30" y1="8" x2="30" y2="20" stroke="#fff" stroke-width="2"/><line x1="30" y1="40" x2="30" y2="52" stroke="#fff" stroke-width="2"/><line x1="8" y1="30" x2="20" y2="30" stroke="#fff" stroke-width="2"/><line x1="40" y1="30" x2="52" y2="30" stroke="#fff" stroke-width="2"/></svg>`;
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
                      ["Status", (liveRes ?? u.res)?.alive ? "Online" : "DESTROYED"],
                    ];
                    // Per-resource sci-fi sketch (solar panels, factory, refinery, dam).
                    svg = UNIT_SKETCHES.resource[u.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><polygon points="30,8 52,50 8,50" fill="${color}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><text x="30" y="44" text-anchor="middle" font-size="20" font-weight="800" font-family="monospace" fill="#fff">${res.icon}</text></svg>`;
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
                    // Distinct sketches: kamikaze = crosshair targeting (default look),
                    // armed = chevron/dart (the new "shooter" look).
                    svg = UNIT_SKETCHES.interceptor[u.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg>`;
                  }
                }
                if (!title) return null;
                return (
                  <div style={{ position: "absolute", top: 50, right: 12, width: 260, background: "rgba(17,17,24,0.96)", border: `2px solid ${color}`, borderRadius: 8, padding: 14, color: "#e0e0e0", zIndex: 700, boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
                    <button onClick={() => setUnitInspect(null)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer", padding: 0 }}>✕</button>
                    <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                      <div dangerouslySetInnerHTML={{ __html: svg || "" }} style={{ flexShrink: 0, width: 80, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }} />
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
                    {u.kind === "ad" && u.side === "player" && (() => {
                      const adIdx = playerAD.findIndex((a) => a.x === u.x && a.y === u.y);
                      if (adIdx < 0) return null;
                      const curPrio = playerAD[adIdx].priority || "all";
                      const options = [
                        { key: "all", label: "All", color: "#888" },
                        { key: "cheap", label: "Cheap", color: "#4caf50" },
                        { key: "expensive", label: "Expensive", color: "#ff5555" },
                      ];
                      return (
                        <div style={{ marginTop: 6, borderTop: "1px solid #2a2a35", paddingTop: 6 }}>
                          <div style={{ fontSize: 9, color: "#666", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Target Priority</div>
                          <div style={{ display: "flex", gap: 4 }}>
                            {options.map((o) => (
                              <button key={o.key} onClick={() => {
                                const ad = playerAD[adIdx];
                                setPlayerAD((prev) => prev.map((a, i) => i === adIdx ? { ...a, priority: o.key } : a));
                                broadcast({ type: "ad_priority", x: ad.x, y: ad.y, priority: o.key });
                              }} style={{
                                flex: 1, padding: "4px 6px", fontSize: 9, fontWeight: 600,
                                background: curPrio === o.key ? "rgba(255,255,255,0.1)" : "rgba(30,30,40,0.9)",
                                border: `1.5px solid ${curPrio === o.key ? o.color : "#2a2a35"}`,
                                borderRadius: 4, color: curPrio === o.key ? o.color : "#555", cursor: "pointer",
                              }}>{o.label}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: 9, color: "#555", marginTop: 8, textAlign: "center" }}>Double-click any unit to inspect</div>
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
