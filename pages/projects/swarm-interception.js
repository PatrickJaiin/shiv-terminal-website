import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Drone database ──
// Simulator uses real-world drones with 2024-2026 threat picture.
// `decoy: true` drones (e.g. Gerbera) bait AD into wasting missiles but cause no damage if they breach.
const DRONE_DB = {
  attack: [
    { key: "fpv_kamikaze", name: "FPV Kamikaze", country: "Generic", speed: 150, cost: 500, rcs: 0.01, threat: "cheap", desc: "Commercial-grade FPV drone with improvised warhead. Extremely cheap, hard to detect due to tiny RCS. GNSS jamming has limited effect (operator video link)." },
    { key: "shahed_136", name: "Shahed-136", country: "Iran", speed: 185, cost: 20000, rcs: 0.1, threat: "cheap", desc: "Iranian loitering munition. Delta-wing design, GPS/INS guided, 40kg warhead. Used extensively in Ukraine conflict. GNSS-dependent." },
    { key: "geran_3", name: "Geran-3 (Jet Shahed)", country: "Russia", speed: 600, cost: 80000, rcs: 0.1, threat: "medium", desc: "Jet-powered Shahed variant fielded 2024-2025. ~600 km/h cruise, breaks Gepard tracking solutions. GNSS-dependent." },
    { key: "gerbera", name: "Gerbera (Decoy)", country: "Russia", speed: 180, cost: 10000, rcs: 0.1, threat: "cheap", decoy: true, desc: "Foam-and-plywood Shahed mimic. Identical radar signature, no warhead. Bait to exhaust AD missiles in saturation attacks. ~$10K vs $50K Tamir interceptor." },
    { key: "lancet_3", name: "Lancet-3", country: "Russia", speed: 300, cost: 35000, rcs: 0.05, threat: "medium", desc: "Russian precision loitering munition by ZALA. TV/IR seeker, 3kg warhead. Targets vehicles and fortified positions." },
    { key: "switchblade_600", name: "Switchblade-600", country: "USA", speed: 110, cost: 60000, rcs: 0.04, threat: "medium", desc: "AeroVironment loitering munition. Anti-armor warhead, 40km range, 40min loiter. Used by Ukraine and US SOF." },
    { key: "mohajer_6", name: "Mohajer-6", country: "Iran", speed: 200, cost: 500000, rcs: 0.5, threat: "expensive", desc: "Iranian MALE UAV. 200km range, can carry precision guided munitions. Used for ISR and strike missions." },
    { key: "orion", name: "Orion (Pacer)", country: "Russia", speed: 200, cost: 1000000, rcs: 1.0, threat: "expensive", desc: "Russian medium-altitude long-endurance UAV. 24hr flight time, 4 hardpoints for guided bombs/missiles." },
    { key: "wing_loong", name: "Wing Loong II", country: "China", speed: 370, cost: 2000000, rcs: 1.5, threat: "expensive", desc: "Chinese MALE UCAV comparable to MQ-9 Reaper. 20hr endurance, 480kg payload, exported to 10+ countries." },
  ],
  interceptor: [
    { key: "kamikaze_int", name: "Kamikaze Interceptor", country: "Generic", speed: 350, cost: 15000, rcs: 0.02, destroyOnKill: true, fictional: true, desc: "Game unit. Cheap expendable interceptor drone - rams target on contact. 100% kill rate but destroyed on every engagement. Inspired by Anduril Anvil concept." },
    { key: "armed_int", name: "Armed Interceptor", country: "Generic", speed: 300, cost: 180000, rcs: 0.05, destroyOnKill: false, survivalRate: 0.73, fictional: true, desc: "Game unit. Reusable armed interceptor with onboard weapons. 73% survival rate per engagement - surviving units carry to next wave. Inspired by Fortem DroneHunter." },
    { key: "anduril", name: "Anduril Anvil", country: "USA", speed: 320, cost: 100000, rcs: 0.03, destroyOnKill: true, desc: "Autonomous kinetic interceptor by Anduril Industries. AI-guided, rams target at high speed. Expendable design, low unit cost." },
    { key: "fortem", name: "Fortem DroneHunter", country: "USA", speed: 160, cost: 150000, rcs: 0.08, destroyOnKill: false, survivalRate: 0.65, desc: "Net-capture counter-UAS drone by Fortem Technologies. Deploys net to entangle targets. Reusable with 65% survival rate." },
  ],
};

// ── Ground AD systems database ──
// REAL-WORLD doctrine fields (validated by AD/counter-UAS expert review, Apr 2026):
//   range_m         - operational engagement envelope vs low-altitude drones (NOT marketing max)
//   detection_m     - radar detection range (much greater than engagement; defines awareness ring)
//   pk              - per-missile probability of kill on hit (binary; we don't model HP)
//   salvo           - missiles fired per engagement (shoot-shoot-look doctrine: PAC-3 / S-400 = 2)
//   salvoIntervalS  - seconds between the two missiles in an SSS salvo (Patriot ~4s, S-400 ~1s)
//   burstSize       - missiles ready before long reload (Iron Dome battery ~60 Tamirs)
//   reloadS         - seconds to refill burst after depletion (real crewed reload, not auto)
//   maxSimultaneous - concurrent engagements; saturation attacks defeat by exceeding this
//   setupMin        - emplacement time in minutes (0=fires on the move, 240=Iron Dome battery)
//   mobile          - shoot-and-scoot capable (display-only in sandbox, doesn't gate movement)
// Numbers reflect operational performance vs cruise-altitude drones, not max kinematic envelopes.
const AD_SYSTEMS = [
  { key: "s300",      name: "S-300",        country: "Russia",  type: "long",   range_m: 75000,  detection_m: 250000, missiles: 16,  cost: 115000000,  missileCost: 1000000, pk: 0.7,  rcsThreshold: 0.02,  engageRate: 5, salvo: 2, salvoIntervalS: 1, burstSize: 16, reloadS: 1800, maxSimultaneous: 12, setupMin: 30, mobile: true,  color: "#cc8800", desc: "Soviet/Russian long-range SAM. SA-20 Gargoyle. Tracks 100, engages 12 simultaneously. Deployed by India, China, Iran." },
  { key: "s400",      name: "S-400",        country: "Russia",  type: "long",   range_m: 200000, detection_m: 600000, missiles: 16,  cost: 300000000,  missileCost: 2500000, pk: 0.8,  rcsThreshold: 0.01,  engageRate: 5, salvo: 2, salvoIntervalS: 1, burstSize: 16, reloadS: 1800, maxSimultaneous: 36, setupMin: 30, mobile: true,  color: "#cc8800", desc: "Russia's flagship SAM. SA-21 Growler. 91N6E radar tracks 300 / engages 36. Operational vs drones ~150-200km (radar horizon limited). Exported to Turkey, India, China." },
  { key: "patriot",   name: "Patriot PAC-3",country: "USA",     type: "long",   range_m: 20000,  detection_m: 100000, missiles: 16,  cost: 1000000000, missileCost: 4000000, pk: 0.75, rcsThreshold: 0.05,  engageRate: 9, salvo: 2, salvoIntervalS: 4, burstSize: 16, reloadS: 1800, maxSimultaneous: 9,  setupMin: 60, mobile: false, color: "#4488ff", desc: "US Army primary air defense. AN/MPQ-65 radar. Hit-to-kill PAC-3 MSE. Effective vs low-flying drones ~15-20km (terrain mask). Standard SSS doctrine: 2 missiles per HVT, 4s apart." },
  { key: "nasams",    name: "NASAMS 3",     country: "Norway",  type: "medium", range_m: 25000,  detection_m: 75000,  missiles: 18,  cost: 100000000,  missileCost: 500000,  pk: 0.8,  rcsThreshold: 0.01,  engageRate: 4, salvo: 2, salvoIntervalS: 2, burstSize: 18, reloadS: 1800, maxSimultaneous: 12, setupMin: 45, mobile: false, color: "#4488ff", desc: "Norwegian/US medium-range using AMRAAM-ER. Sentinel radar 75km. Protects US Capitol. 6 missiles per launcher × 3 launchers = 18 ready." },
  { key: "iron_dome", name: "Iron Dome",    country: "Israel",  type: "short",  range_m: 40000,  detection_m: 100000, missiles: 60,  cost: 50000000,   missileCost: 50000,   pk: 0.9,  rcsThreshold: 0.005, engageRate: 3, salvo: 1, salvoIntervalS: 1, burstSize: 60, reloadS: 1500, maxSimultaneous: 20, setupMin: 240, mobile: false, color: "#44bbff", desc: "Israeli rocket/drone defense by Rafael. EL/M-2084 radar. 20 Tamirs × ~3 launchers per battery = 60 ready, ~25 min crewed reload. 90%+ intercept rate." },
  { key: "gepard",    name: "Gepard",       country: "Germany", type: "short",  range_m: 4000,   detection_m: 15000,  missiles: 680, cost: 5000000,    missileCost: 100,     pk: 0.2,  rcsThreshold: 0.001, engageRate: 1, salvo: 1, salvoIntervalS: 1, burstSize: 680, reloadS: 600, maxSimultaneous: 1,  setupMin: 0,  mobile: true,  color: "#88aa44", desc: "German Flakpanzer. Twin 35mm Oerlikon, 680 rounds. AHEAD airburst rounds shred small drones. The unsung hero of Ukraine drone defense. Fires on the move." },
  { key: "pantsir",   name: "Pantsir-S1",   country: "Russia",  type: "short",  range_m: 20000,  detection_m: 36000,  missiles: 12,  cost: 15000000,   missileCost: 60000,   pk: 0.65, rcsThreshold: 0.01,  engageRate: 3, salvo: 2, salvoIntervalS: 2, burstSize: 12, reloadS: 1080, maxSimultaneous: 4,  setupMin: 5,  mobile: true,  color: "#cc8800", desc: "Russian hybrid gun-missile. SA-22 Greyhound. 12 ready 57E6 missiles + twin 30mm. ~18 min reload via TZM resupply truck. Shoot-and-scoot." },
  { key: "iris_t",    name: "IRIS-T SLM",   country: "Germany", type: "medium", range_m: 40000,  detection_m: 100000, missiles: 8,   cost: 150000000,  missileCost: 400000,  pk: 0.8,  rcsThreshold: 0.01,  engageRate: 5, salvo: 2, salvoIntervalS: 2, burstSize: 8,  reloadS: 1800, maxSimultaneous: 8,  setupMin: 30, mobile: true,  color: "#88aa44", desc: "Diehl Defence medium-range SAM. IR seeker with thrust vectoring. Key Ukraine system - 100% intercept record reported in early deployments." },
];

// Breach damage cost based on threat type (infrastructure/civilian damage estimate)
const BREACH_DAMAGE = { cheap: 500000, medium: 5000000, expensive: 50000000 };

// ── Theater configs with geographic bounds ──
const THEATERS = {
  kashmir: {
    name: "LoC Kashmir",
    bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 },
    mapCenter: [34.0, 74.25], mapZoom: 9,
    defensePos: [[5000, 5000]], attackOrigins: [[500, 500], [9500, 500], [500, 9500]],
    freeAD: { key: "s300", x: 5000, y: 5200 },
  },
  israel_iran: {
    name: "Israel-Iran",
    bounds: { south: 31.0, north: 33.0, west: 34.0, east: 36.0 },
    mapCenter: [32.0, 35.0], mapZoom: 8,
    defensePos: [[5000, 5000]], attackOrigins: [[9500, 500], [9500, 9500], [9500, 5000]],
    freeAD: { key: "iron_dome", x: 5000, y: 5200 },
  },
  red_sea: {
    name: "Red Sea",
    bounds: { south: 12.0, north: 15.0, west: 42.0, east: 45.0 },
    mapCenter: [13.5, 43.5], mapZoom: 7,
    defensePos: [[5000, 5000]], attackOrigins: [[9000, 2000], [9000, 8000]],
    freeAD: { key: "patriot", x: 5000, y: 5200 },
  },
  ukraine_kyiv: {
    name: "Ukraine Kyiv",
    bounds: { south: 49.0, north: 51.0, west: 30.0, east: 33.0 },
    mapCenter: [50.0, 31.5], mapZoom: 8,
    defensePos: [[5000, 5000]], attackOrigins: [[9500, 1000], [9500, 5000], [9500, 9000], [7000, 200]],
    freeAD: { key: "iris_t", x: 5000, y: 5200 },
  },
  taiwan_strait: {
    name: "Taiwan Strait",
    bounds: { south: 23.0, north: 26.0, west: 119.0, east: 122.0 },
    mapCenter: [24.5, 120.5], mapZoom: 7,
    defensePos: [[5000, 5000]], attackOrigins: [[9000, 2000], [9000, 5000], [9000, 8000]],
    freeAD: { key: "patriot", x: 5000, y: 5200 },
  },
};

// Reference photos from Wikimedia Commons (CC-licensed) for every unit type that has
// a real-world counterpart. Stored locally in /public/images/units/ as 250px JPEG
// thumbnails (~15-20KB each) so the modal loads instantly with no external dependency.
// Fictional / non-photographable units (kamikaze_int, armed_int, fortem) keep their
// inline SVG silhouettes since there's no real hardware to reference.
const UNIT_IMG_PATH = "/images/units/";
const UNIT_SKETCHES = {
  ad: {
    iron_dome: `<img src="${UNIT_IMG_PATH}iron_dome.jpg" alt="Iron Dome" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    gepard: `<img src="${UNIT_IMG_PATH}gepard.jpg" alt="Flakpanzer Gepard" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    nasams: `<img src="${UNIT_IMG_PATH}nasams.jpg" alt="NASAMS" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    pantsir: `<img src="${UNIT_IMG_PATH}pantsir.jpg" alt="Pantsir-S1" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    s300: `<img src="${UNIT_IMG_PATH}s300.jpg" alt="S-300" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    s400: `<img src="${UNIT_IMG_PATH}s400.jpg" alt="S-400 Triumf" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    patriot: `<img src="${UNIT_IMG_PATH}patriot.jpg" alt="MIM-104 Patriot" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    iris_t: `<img src="${UNIT_IMG_PATH}iris_t.jpg" alt="IRIS-T SLM" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
  },
  attack: {
    fpv_kamikaze: `<img src="${UNIT_IMG_PATH}fpv_kamikaze.jpg" alt="FPV Kamikaze drone" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    shahed_136: `<img src="${UNIT_IMG_PATH}shahed_136.jpg" alt="HESA Shahed 136" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    // Geran-3 / Gerbera / Switchblade-600 use inline SVG silhouettes (no licensed photos available locally).
    geran_3: `<svg width="60" height="60" viewBox="0 0 60 60"><polygon points="8,30 30,12 52,30 30,48" fill="#cc3333" stroke="#fff" stroke-width="1.5"/><circle cx="44" cy="30" r="4" fill="#ffaa44" stroke="#fff" stroke-width="1"/><polygon points="44,28 52,30 44,32" fill="#ffaa44"/></svg>`,
    gerbera: `<svg width="60" height="60" viewBox="0 0 60 60"><polygon points="8,30 30,12 52,30 30,48" fill="none" stroke="#cc3333" stroke-width="1.5" stroke-dasharray="3 3"/><text x="30" y="34" text-anchor="middle" fill="#cc3333" font-size="11" font-family="monospace" font-weight="bold">D</text></svg>`,
    lancet_3: `<img src="${UNIT_IMG_PATH}lancet_3.jpg" alt="ZALA Lancet" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    switchblade_600: `<svg width="60" height="60" viewBox="0 0 60 60"><rect x="6" y="26" width="40" height="8" fill="#cc3333" stroke="#fff" stroke-width="1.5"/><polygon points="46,30 56,30 50,22 50,38" fill="#ff6633" stroke="#fff" stroke-width="1"/><line x1="20" y1="22" x2="20" y2="14" stroke="#fff" stroke-width="1.5"/><line x1="20" y1="38" x2="20" y2="46" stroke="#fff" stroke-width="1.5"/></svg>`,
    mohajer_6: `<img src="${UNIT_IMG_PATH}mohajer_6.jpg" alt="Mohajer-6" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    orion: `<img src="${UNIT_IMG_PATH}orion.jpg" alt="Kronshtadt Orion" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
    wing_loong: `<img src="${UNIT_IMG_PATH}wing_loong.jpg" alt="Wing Loong II" width="80" height="60" style="object-fit:cover;border-radius:4px;border:1px solid #2a2a35"/>`,
  },
  interceptor: {
    // Game-only fictional units - keep inline SVG silhouettes since they don't exist
    // in the real world to photograph.
    kamikaze_int: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><circle cx="30" cy="30" r="6" fill="#fff"/></svg>`,
    armed_int: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><polygon points="30,8 44,46 30,38 16,46" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`,
    // Anduril Sentry photo from Wikimedia (the closest visual reference for the Anvil
    // since the Anvil itself doesn't have a free-licensed photo).
    anduril: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><polygon points="30,12 38,40 30,32 22,40" fill="#fff"/></svg>`,
    fortem: `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/><circle cx="30" cy="30" r="14" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="30" cy="30" r="4" fill="#fff"/></svg>`,
  },
};

// Sandbox is the only simulator mode now. The wave-based difficulty campaigns
// (medium/hard/nightmare) lived here historically; they have been removed because
// the 1v1 game mode (pages/projects/swarm-1v1.js) is the proper challenge experience.
// The simulator is now purely an open-ended sandbox: place stuff, run it, observe.
const SANDBOX = {
  name: "Sandbox",
  interceptors: 20,
  defaultAttackers: { fpv_kamikaze: 10, shahed_136: 5 },
};

const KILL_RADIUS = 120;
const DEFAULT_ZONE_RADIUS = 2500;
const DEFAULT_ASSET_RADIUS = 600;
const DEFAULT_ZONE_CENTER = [5000, 5000];
const ARENA = 10000;

function formatUSD(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Isotropic projection: ARENA is mapped to the larger geographic dimension in meters,
// then both x and y use the same meters-per-unit so real-meter ranges (range_m) render
// as proper circles regardless of theater aspect ratio. Ported from game mode.
function getProjection(b) {
  const midLat = (b.south + b.north) / 2;
  const midLng = (b.west + b.east) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const widthM = (b.east - b.west) * 111000 * cosLat;
  const heightM = (b.north - b.south) * 111000;
  const sizeM = Math.max(widthM, heightM);
  const mpu = sizeM / ARENA;
  return { midLat, midLng, cosLat, mpu };
}

// Convert sim coords (0-10000) to lat/lng - uses isotropic projection so circles stay round.
function simToLatLng(x, y, bounds) {
  const p = getProjection(bounds);
  const dxMeters = (x - ARENA / 2) * p.mpu;
  const dyMeters = (y - ARENA / 2) * p.mpu;
  const dLat = dyMeters / 111000;
  const dLng = dxMeters / (111000 * p.cosLat);
  return [p.midLat + dLat, p.midLng + dLng];
}

function latLngToSim(lat, lng, bounds) {
  const p = getProjection(bounds);
  const dxMeters = (lng - p.midLng) * 111000 * p.cosLat;
  const dyMeters = (lat - p.midLat) * 111000;
  return [ARENA / 2 + dxMeters / p.mpu, ARENA / 2 + dyMeters / p.mpu];
}

// Convert real meters to sim units for a given theater's projection.
function metersToSim(meters, bounds) { return meters / getProjection(bounds).mpu; }

// Initialize all per-instance AD runtime fields in one place. Without this, downstream UI
// readers that touch (e.g.) ad.activeEngagements.size before simStep has had a chance to
// lazy-init would throw. simStep also lazy-inits as a defensive backstop.
function initAdInstance(sys) {
  const cap = sys?.burstSize ?? sys?.missiles ?? 6;
  return {
    health: 1,
    ammo: cap,
    burstRemaining: cap,
    reloadStepsLeft: null,
    activeEngagements: new Set(),
    inFlight: [],
    nextShotStep: 0,
  };
}

// ── Create drones for the sandbox run ──
function createDrones(scenario, theater, customAttackSpawns, customDefenseSpawns, attackers) {
  const attackerConfig = attackers || scenario.defaultAttackers;
  const th = THEATERS[theater] || THEATERS.kashmir;
  const center = [5000, 5000];
  const hasCustomAtk = customAttackSpawns.length > 0;
  const hasCustomDef = customDefenseSpawns.length > 0;

  const attackerList = [];
  let id = 100;
  // GNSS-dependent drones lose accuracy under jamming; FPV (operator video) and Lancet/Switchblade
  // (TV/IR seekers) are largely immune. Update if you add new drone types.
  const GNSS_DEPENDENT = new Set(["shahed_136", "geran_3", "gerbera", "mohajer_6", "orion", "wing_loong"]);
  const buildAttacker = (sp, profile, originX, originY) => ({
    id: id++,
    x: sp.x + (Math.random() - 0.5) * 1500,
    y: sp.y + (Math.random() - 0.5) * 1500,
    speed: profile.speed / 200,
    cost: profile.cost,
    threat: profile.threat,
    status: "active",
    heading: Math.atan2(originY - sp.y, originX - sp.x) + (Math.random() - 0.5) * 0.8,
    type: "attacker",
    profileName: profile.name,
    droneKey: profile.key,
    decoy: !!profile.decoy,
    gnssDependent: GNSS_DEPENDENT.has(profile.key),
  });

  if (hasCustomAtk) {
    for (const sp of customAttackSpawns) {
      const profile = DRONE_DB.attack.find((d) => d.key === sp.droneKey);
      if (!profile) continue;
      for (let i = 0; i < sp.count; i++) attackerList.push(buildAttacker(sp, profile, center[0], center[1]));
    }
  } else {
    for (const [key, count] of Object.entries(attackerConfig)) {
      const profile = DRONE_DB.attack.find((d) => d.key === key);
      if (!profile) continue;
      for (let i = 0; i < count; i++) {
        const origin = th.attackOrigins[Math.floor(Math.random() * th.attackOrigins.length)];
        attackerList.push(buildAttacker({ x: origin[0], y: origin[1] }, profile, center[0], center[1]));
      }
    }
  }

  const interceptors = [];
  if (hasCustomDef) {
    let iid = 0;
    for (const sp of customDefenseSpawns) {
      const profile = DRONE_DB.interceptor.find((d) => d.key === sp.droneKey) || DRONE_DB.interceptor[0];
      for (let i = 0; i < sp.count; i++) {
        const sx = sp.x + (Math.random() - 0.5) * 1000;
        const sy = sp.y + (Math.random() - 0.5) * 1000;
        interceptors.push({
          id: iid++,
          x: sx, y: sy,
          spawnX: sx, spawnY: sy,
          speed: profile.speed / 200,
          cost: profile.cost,
          destroyOnKill: profile.destroyOnKill !== false,
          survivalRate: profile.survivalRate || 0,
          status: "active",
          heading: 0,
          type: "interceptor",
          targetId: null,
        });
      }
    }
  } else {
    for (let i = 0; i < scenario.interceptors; i++) {
      const dp = th.defensePos[Math.floor(Math.random() * th.defensePos.length)];
      const sx = dp[0] + (Math.random() - 0.5) * 1000;
      const sy = dp[1] + (Math.random() - 0.5) * 1000;
      interceptors.push({
        id: i,
        x: sx, y: sy,
        spawnX: sx, spawnY: sy,
        speed: 1.75,
        cost: 15000,
        destroyOnKill: true,
        survivalRate: 0,
        status: "active",
        heading: 0,
        type: "interceptor",
        targetId: null,
      });
    }
  }
  return { interceptors, attackers: attackerList };
}

// ── Simulation step ──
// Sim runs at ~10 logical steps/sec. All seconds in AD specs are converted to step counts via *10.
// adUnitsState holds per-instance state mutated in place: ammo, burstRemaining, reloadStepsLeft,
// activeEngagements (Set of attacker ids), nextShotStep (cooldown gate).
function simStep(state, zoneCenter, assetRadius, adUnitsState, zoneRadius, theaterBounds, jammingActive) {
  const { interceptors, attackers, metrics, step } = state;
  // Theater-dependent meters-per-sim-unit. Falls back to 1m=1unit if no bounds (legacy).
  const mpu = theaterBounds ? getProjection(theaterBounds).mpu : 1;

  for (const a of attackers) {
    if (a.status !== "active") continue;
    const prevDist = dist(a, { x: zoneCenter[0], y: zoneCenter[1] });

    // GNSS jamming: degrades GPS-guided drones (Shahed, Geran-3, Mohajer, Orion, Wing Loong, Gerbera).
    // FPV uses operator video link, not GNSS - largely immune. Lancet/Switchblade use TV/IR seekers.
    if (jammingActive && a.gnssDependent) {
      // Two effects: increased heading drift (poor nav) + chance of complete link loss.
      a.jamDrift = (a.jamDrift || 0) + (Math.random() - 0.5) * 0.15;
      if (Math.random() < 0.0004) { a.status = "lost"; metrics.misses++; continue; }
    }

    // Medium/expensive drones prioritize nearby active AD units (SEAD behavior).
    let targetX = zoneCenter[0];
    let targetY = zoneCenter[1];
    if (adUnitsState && !a.decoy && (a.threat === "medium" || a.threat === "expensive")) {
      let bestAD = null;
      // SEAD detection range: 8km in real meters, converted to sim units via theater projection
      // so behavior is consistent regardless of theater bounds (Kashmir vs Ukraine).
      let bestADDist = theaterBounds ? metersToSim(8000, theaterBounds) : 3000;
      for (const ad of adUnitsState) {
        if (ad.health <= 0) continue;
        const d = dist(a, ad);
        if (d < bestADDist) { bestADDist = d; bestAD = ad; }
      }
      if (bestAD) {
        targetX = bestAD.x;
        targetY = bestAD.y;
        a.adTargetId = bestAD.id;
        if (bestADDist < 80) {
          bestAD.health = 0;
          bestAD.ammo = 0;
          a.status = "expended";
          metrics.misses++;
          continue;
        }
      }
    }

    const dx = targetX - a.x;
    const dy = targetY - a.y;
    const angle = Math.atan2(dy, dx);
    let diff = angle - a.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const noise = (Math.random() - 0.5) * 0.03 + (a.jamDrift || 0) * 0.02;
    a.heading += diff * 0.05 + noise;
    a.x += Math.cos(a.heading) * a.speed;
    a.y += Math.sin(a.heading) * a.speed;
    const newDist = dist(a, { x: zoneCenter[0], y: zoneCenter[1] });
    if (!a.crossedZone && prevDist > zoneRadius && newDist <= zoneRadius) {
      a.crossedZone = true;
      a.crossX = a.x;
      a.crossY = a.y;
    }
    if (newDist < assetRadius) {
      a.status = "breached";
      a.breachX = a.x;
      a.breachY = a.y;
      metrics.breaches++;
      metrics.misses++;
      // Decoys carry no warhead - they breach but cause $0 damage. The cost is the AD missiles burned.
      if (!a.decoy) {
        metrics.breach_damage += BREACH_DAMAGE[a.threat] || 500000;
      }
    }
  }

  const activeAttackers = attackers.filter((a) => a.status === "active");
  for (const int of interceptors) {
    if (int.status !== "active") continue;
    let target = activeAttackers.find((a) => a.id === int.targetId);
    if (!target) {
      let best = null;
      let bestDist = Infinity;
      for (const a of activeAttackers) {
        const d = dist(int, a);
        if (d < bestDist) { bestDist = d; best = a; }
      }
      if (best) { int.targetId = best.id; target = best; }
    }
    if (target) {
      const angle = Math.atan2(target.y - int.y, target.x - int.x);
      int.heading = angle;
      int.x += Math.cos(int.heading) * int.speed;
      int.y += Math.sin(int.heading) * int.speed;
      if (dist(int, target) < KILL_RADIUS) {
        target.status = "destroyed";
        metrics.kills++;
        metrics.threat_value_destroyed += target.cost;
        int.targetId = null;
        if (int.destroyOnKill) {
          int.status = "expended";
        } else {
          const survival = int.survivalRate || 0.73;
          if (Math.random() > survival) int.status = "expended";
        }
      }
    }
  }

  // ── Ground AD engagement model ──
  // Each AD unit tracks: ammo (rounds in burst), reloadStepsLeft (long crewed reload),
  // activeEngagements (in-flight salvos against specific targets), nextShotStep (cooldown).
  if (adUnitsState) {
    for (const ad of adUnitsState) {
      if (ad.health <= 0) continue;
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys) continue;

      // Initialize per-instance burst/reload state lazily (state survives across simStep calls
      // because adUnitsState is the persistent ref array).
      if (ad.burstRemaining == null) ad.burstRemaining = sys.burstSize ?? sys.missiles;
      if (ad.activeEngagements == null) ad.activeEngagements = new Set();
      if (ad.nextShotStep == null) ad.nextShotStep = 0;

      // Resolve any in-flight salvos: each engagement carries impactStep + targetId + missiles fired.
      // We model the salvo as a single resolution at impactStep with effective pK = 1 - (1 - pk)^salvo.
      if (ad.inFlight && ad.inFlight.length > 0) {
        const stillFlying = [];
        for (const eng of ad.inFlight) {
          if (step < eng.impactStep) { stillFlying.push(eng); continue; }
          const target = attackers.find((a) => a.id === eng.targetId);
          ad.activeEngagements.delete(eng.targetId);
          if (!target || target.status !== "active") continue; // already gone
          const effectivePk = 1 - Math.pow(1 - sys.pk, eng.salvoSize);
          if (Math.random() < effectivePk) {
            target.status = "destroyed";
            target.killedByAD = true;
            metrics.kills++;
            metrics.threat_value_destroyed += target.cost;
          }
        }
        ad.inFlight = stillFlying;
      } else {
        ad.inFlight = ad.inFlight || [];
      }

      // Reload gate: once burst is depleted, count down the long reload timer.
      if (ad.burstRemaining <= 0) {
        if (ad.reloadStepsLeft == null) ad.reloadStepsLeft = Math.round((sys.reloadS ?? 0) * 10);
        ad.reloadStepsLeft--;
        if (ad.reloadStepsLeft <= 0) {
          ad.burstRemaining = sys.burstSize ?? sys.missiles;
          ad.ammo = ad.burstRemaining;
          ad.reloadStepsLeft = null;
        }
        continue;
      }

      // Cooldown gate (engageRate seconds between fresh launches).
      if (step < ad.nextShotStep) continue;

      // Multi-target capacity: cap concurrent in-flight engagements.
      const maxSim = sys.maxSimultaneous ?? 1;
      if (ad.activeEngagements.size >= maxSim) continue;

      // Acquire targets in range (real-meter envelope converted via mpu) with detectable RCS.
      // Pick the closest unengaged target; saturation = lots of targets but capped engagement slots.
      const rangeUnits = (sys.range_m ?? 5000) / mpu;
      let bestTarget = null;
      let bestDist = Infinity;
      for (const a of attackers) {
        if (a.status !== "active") continue;
        if (ad.activeEngagements.has(a.id)) continue;
        const d = dist(ad, a);
        if (d > rangeUnits) continue;
        const profile = DRONE_DB.attack.find((p) => p.key === a.droneKey) || { rcs: 0.1 };
        if ((a.rcsOverride || profile.rcs || 0.1) < sys.rcsThreshold) continue;
        if (d < bestDist) { bestDist = d; bestTarget = a; }
      }
      if (!bestTarget) continue;

      // Launch the salvo. Consume `salvo` missiles from burst (capped at remaining).
      const salvoSize = Math.min(sys.salvo ?? 1, ad.burstRemaining);
      ad.burstRemaining -= salvoSize;
      ad.ammo = ad.burstRemaining;
      metrics.defense_cost += sys.missileCost * salvoSize;
      ad.activeEngagements.add(bestTarget.id);
      // Gameplay-compressed flight time: 2-8 sim steps (~0.2-0.8s) regardless of real range.
      // Real S-400 shot at 200km is 3-4 minutes ballistic flight; that's unwatchable in a portfolio
      // sandbox, so we collapse to "edge of envelope = 8 steps, point-blank = 2 steps". The
      // engageRate cooldown is what actually paces the AD's tactical tempo here.
      const flightSteps = Math.max(2, Math.round(bestDist / rangeUnits * 8));
      ad.inFlight.push({ targetId: bestTarget.id, impactStep: step + flightSteps, salvoSize });
      // Cooldown until the next salvo can launch (engageRate seconds).
      ad.nextShotStep = step + Math.max(1, Math.round((sys.engageRate ?? 1) * 10));
    }
  }

  const activeInt = interceptors.filter((i) => i.status === "active").length;
  const activeThreats = attackers.filter((a) => a.status === "active").length;

  // RTB: when no threats remain, interceptors fly back to spawn
  if (activeThreats === 0) {
    let allLanded = true;
    for (const int of interceptors) {
      if (int.status !== "active") continue;
      const dx = int.spawnX - int.x;
      const dy = int.spawnY - int.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 30) {
        int.status = "landed";
      } else {
        allLanded = false;
        int.heading = Math.atan2(dy, dx);
        int.x += Math.cos(int.heading) * int.speed;
        int.y += Math.sin(int.heading) * int.speed;
        int.targetId = null;
      }
    }
    const landedOrExpended = interceptors.every((i) => i.status !== "active");
    return {
      interceptors, attackers,
      metrics: { ...metrics, active_interceptors: activeInt, active_threats: 0 },
      step: step + 1,
      done: landedOrExpended,
    };
  }

  return {
    interceptors, attackers,
    metrics: { ...metrics, active_interceptors: activeInt, active_threats: activeThreats },
    step: step + 1,
    done: false,
  };
}

// ── UI components ──
function Metric({ label, value, color = "white" }) {
  const colors = { blue: "#4a9eff", red: "#ff5555", green: "#4caf50", orange: "#ff9800", white: "#e0e0e0" };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1a1a24" }}>
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: colors[color], fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
function PanelTitle({ children }) {
  return <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#666", marginBottom: 8, marginTop: 16 }}>{children}</div>;
}
function ProfileCard({ name, country, speed, cost, rcs }) {
  return (
    <div style={{ background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 4, padding: "8px 10px", marginBottom: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, color: "#e0e0e0", marginBottom: 4 }}>{name} <span style={{ color: "#666" }}>({country})</span></div>
      <div style={{ color: "#888", display: "flex", gap: 8 }}>
        <span>{speed} km/h</span><span>${formatUSD(cost)}</span><span>RCS: {rcs} m2</span>
      </div>
    </div>
  );
}
function LegendItem({ color, label, hollow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: "#e0e0e0" }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: hollow ? "transparent" : color, border: hollow ? `2px solid ${color}` : "none" }} />
      {label}
    </div>
  );
}

// ── Leaflet Map component ──
function SimMap({ simState, theater, killFlashes, breachPoints, attackSpawns, defenseSpawns, placementMode, onPlaceSpawn, zoneCenter, zoneRadius, assetRadius, adUnits }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const droneLayerRef = useRef(null);
  const spawnLayerRef = useRef(null);
  const legacyLayerRef = useRef(null);
  const flashLayerRef = useRef(null);
  const LRef = useRef(null);
  const onPlaceRef = useRef(onPlaceSpawn);
  const theaterRef2 = useRef(theater);
  const previewLayerRef = useRef(null);
  const dragStateRef = useRef(null); // { type, startX, startY }
  const [mapReady, setMapReady] = useState(false);
  onPlaceRef.current = onPlaceSpawn;
  // Attach zoneCenter to the ref so drag handlers can read it
  if (onPlaceRef.current) onPlaceRef.current.zoneCenter = zoneCenter;
  theaterRef2.current = theater;

  // Sync placement mode into drag state
  useEffect(() => {
    if (placementMode === "zone_center" || placementMode === "zone_resize" || placementMode === "asset_resize") {
      dragStateRef.current = { mode: placementMode, dragging: false };
    } else {
      dragStateRef.current = null;
      if (previewLayerRef.current) previewLayerRef.current.clearLayers();
    }
  }, [placementMode]);

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function init() {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L.default || L;
      const Leaf = LRef.current;

      if (mapInstanceRef.current) return;
      const th = THEATERS[theaterRef2.current] || THEATERS.kashmir;

      const map = Leaf.map(mapRef.current, {
        center: th.mapCenter,
        zoom: th.mapZoom,
        zoomControl: true,
        preferCanvas: true,
      });
      mapInstanceRef.current = map;

      Leaf.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri Satellite", maxZoom: 18 }
      ).addTo(map);
      Leaf.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "OSM", maxZoom: 19, opacity: 0.35 }
      ).addTo(map);

      droneLayerRef.current = Leaf.layerGroup().addTo(map);
      spawnLayerRef.current = Leaf.layerGroup().addTo(map);
      legacyLayerRef.current = Leaf.layerGroup().addTo(map);
      flashLayerRef.current = Leaf.layerGroup().addTo(map);
      previewLayerRef.current = Leaf.layerGroup().addTo(map);

      // Helper to convert click latlng to sim coords
      function clickToSim(latlng) {
        const th2 = THEATERS[theaterRef2.current] || THEATERS.kashmir;
        let [x, y] = latLngToSim(latlng.lat, latlng.lng, th2.bounds);
        return [Math.max(0, Math.min(ARENA, x)), Math.max(0, Math.min(ARENA, y))];
      }

      function simToMap(x, y) {
        const th2 = THEATERS[theaterRef2.current] || THEATERS.kashmir;
        return simToLatLng(x, y, th2.bounds);
      }

      function getMetersPerUnit() {
        const th2 = THEATERS[theaterRef2.current] || THEATERS.kashmir;
        return ((th2.bounds.north - th2.bounds.south) * 111000) / ARENA;
      }

      // Mousedown: start drag for zone placement modes
      map.on("mousedown", (e) => {
        const fn = onPlaceRef.current;
        if (!fn) return;
        const mode = dragStateRef.current?.mode;
        if (mode === "zone_center" || mode === "zone_resize" || mode === "asset_resize") {
          const [x, y] = clickToSim(e.latlng);
          if (mode === "zone_center") {
            dragStateRef.current = { mode, startX: x, startY: y, dragging: true };
            fn(x, y); // set center immediately
          } else {
            dragStateRef.current = { mode, dragging: true };
          }
          map.dragging.disable();
          e.originalEvent.preventDefault();
        }
      });

      // Mousemove: live preview while dragging
      map.on("mousemove", (e) => {
        const ds = dragStateRef.current;
        if (!ds || !ds.dragging) return;
        const preview = previewLayerRef.current;
        if (!preview) return;
        preview.clearLayers();

        const [mx, my] = clickToSim(e.latlng);
        const mpu = getMetersPerUnit();

        if (ds.mode === "zone_center") {
          // Show both zone circles at cursor position
          const ll = simToMap(mx, my);
          onPlaceRef.current?.(mx, my);
          Leaf.circle(ll, { radius: 2500 * mpu, color: "#22aa22", fillColor: "#22aa22", fillOpacity: 0.05, weight: 2, opacity: 0.6, dashArray: "10 6", interactive: false }).addTo(preview);
          Leaf.circle(ll, { radius: 600 * mpu, color: "#ff4444", fillColor: "#ff2222", fillOpacity: 0.08, weight: 2, opacity: 0.6, dashArray: "8 6", interactive: false }).addTo(preview);
          Leaf.circleMarker(ll, { radius: 4, color: "#ffffff", fillColor: "#ffffff", fillOpacity: 1, weight: 0 }).addTo(preview);
        } else if (ds.mode === "zone_resize" || ds.mode === "asset_resize") {
          // Show preview circle from current zone center to cursor
          const zc = onPlaceRef.current?.zoneCenter || [5000, 5000];
          const dx = mx - zc[0];
          const dy = my - zc[1];
          const r = Math.max(ds.mode === "asset_resize" ? 100 : 500, Math.round(Math.sqrt(dx * dx + dy * dy)));
          const centerLL = simToMap(zc[0], zc[1]);
          const edgeLL = e.latlng;
          const isAsset = ds.mode === "asset_resize";
          Leaf.circle(centerLL, { radius: r * mpu, color: isAsset ? "#ff4444" : "#22aa22", fillColor: isAsset ? "#ff2222" : "#22aa22", fillOpacity: 0.08, weight: 2, opacity: 0.8, dashArray: isAsset ? "8 6" : "10 6", interactive: false }).addTo(preview);
          // Line from center to cursor
          Leaf.polyline([centerLL, edgeLL], { color: isAsset ? "#ff4444" : "#22aa22", weight: 1, opacity: 0.5, dashArray: "4 4", interactive: false }).addTo(preview);
          // Radius label
          Leaf.marker(edgeLL, {
            icon: Leaf.divIcon({ className: "", iconSize: [60, 14], iconAnchor: [30, -8], html: `<div style="color:${isAsset ? "#ff4444" : "#22aa22"};font-size:10px;font-family:monospace;text-align:center;text-shadow:0 0 3px #000">${r}</div>` }),
            interactive: false,
          }).addTo(preview);
        }
      });

      // Mouseup: confirm drag
      map.on("mouseup", (e) => {
        const ds = dragStateRef.current;
        if (!ds || !ds.dragging) return;
        map.dragging.enable();
        const preview = previewLayerRef.current;
        if (preview) preview.clearLayers();

        const [mx, my] = clickToSim(e.latlng);
        const fn = onPlaceRef.current;

        if (ds.mode === "zone_center") {
          fn?.(mx, my);
        } else if (ds.mode === "zone_resize" || ds.mode === "asset_resize") {
          fn?.(mx, my);
        }
        dragStateRef.current = { ...ds, dragging: false };
      });

      // Click handler for spawn placement (non-drag modes)
      map.on("click", (e) => {
        const ds = dragStateRef.current;
        if (ds && (ds.mode === "zone_center" || ds.mode === "zone_resize" || ds.mode === "asset_resize")) return;
        const fn = onPlaceRef.current;
        if (!fn) return;
        const [x, y] = clickToSim(e.latlng);
        fn(x, y);
      });

      setMapReady(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Helper: convert sim coords to map latlng based on theater
  const simToLL = useCallback((x, y) => {
    const th = THEATERS[theater] || THEATERS.kashmir;
    return simToLatLng(x, y, th.bounds);
  }, [theater]);

  // Pan to new theater
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const th = THEATERS[theater] || THEATERS.kashmir;
    map.setView(th.mapCenter, th.mapZoom);
  }, [theater]);

  // Draw spawn markers
  useEffect(() => {
    const L = LRef.current;
    const layer = spawnLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const th = THEATERS[theater] || THEATERS.kashmir;
    const atkCustom = attackSpawns.length > 0;
    const defCustom = defenseSpawns.length > 0;

    // Attack spawns
    if (atkCustom) {
      for (const sp of attackSpawns) {
        L.circleMarker(simToLL(sp.x, sp.y), { radius: 8, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
      }
    } else {
      for (const sp of th.attackOrigins) {
        L.circleMarker(simToLL(sp[0], sp[1]), { radius: 8, color: "#662222", fillColor: "#662222", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
      }
    }

    // Defense spawns
    if (defCustom) {
      for (const sp of defenseSpawns) {
        L.circleMarker(simToLL(sp.x, sp.y), { radius: 8, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
      }
    } else {
      for (const sp of th.defensePos) {
        L.circleMarker(simToLL(sp[0], sp[1]), { radius: 8, color: "#223366", fillColor: "#223366", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
      }
    }
  }, [theater, attackSpawns, defenseSpawns, simToLL, mapReady]);

  // Draw defense zones with breach gaps
  useEffect(() => {
    const L = LRef.current;
    const layer = legacyLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const th = THEATERS[theater] || THEATERS.kashmir;
    // Use the SAME isotropic mpu as simToLL so all geometries (asset zone, AD zone, sim-coord
    // markers) agree on physical size. The previous lat-only metersPerUnit drifted from simToLL's
    // isotropic value on non-square theaters (e.g. Kashmir 1°×1.5°).
    const metersPerUnit = getProjection(th.bounds).mpu;

    // ── Inner: Defended Asset Zone (red dashed) ──
    const assetGeoRadius = assetRadius * metersPerUnit;
    const assetCenter = simToLL(zoneCenter[0], zoneCenter[1]);
    L.circle(assetCenter, {
      radius: assetGeoRadius, color: "#ff4444", fillColor: "#ff2222",
      fillOpacity: 0.06, weight: 2, opacity: 0.6, dashArray: "8 6",
    }).addTo(layer);

    // ── Outer: Ground Air Defense Zone (green dashed) ──
    // Always drawn as a single L.circle in real meters. Leaflet's geodesic circle stays
    // visually round on Mercator regardless of theater latitude. (The previous segmented-arc
    // approach sampled 96 sim-coord points and stitched them with polylines, which on
    // higher-latitude theaters like Israel-Iran picked up Mercator distortion and looked
    // elliptical.) Breach impact dots overlay the ring to mark crossing points.
    const geoRadius = zoneRadius * metersPerUnit;
    const center = simToLL(zoneCenter[0], zoneCenter[1]);
    L.circle(center, {
      radius: geoRadius, color: "#22aa22", fillColor: "#22aa22",
      fillOpacity: 0.03, weight: 2, opacity: 0.8, dashArray: "10 6", interactive: false,
    }).addTo(layer);
    for (const bp of breachPoints) {
      const bll = simToLL(
        zoneCenter[0] + Math.cos(bp.angle) * zoneRadius,
        zoneCenter[1] + Math.sin(bp.angle) * zoneRadius
      );
      L.circleMarker(bll, {
        radius: 5, color: "#888", fillColor: "#555", fillOpacity: 0.9, weight: 2, opacity: 0.8,
      }).addTo(layer);
    }

    // AD coverage rings: engagement envelope (range_m, solid) + detection envelope (faint outer).
    // Both drawn as Leaflet.circle in real meters so they scale correctly across theaters.
    for (const ad of adUnits) {
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys || ad.health <= 0) continue;
      const adLL = simToLL(ad.x, ad.y);
      // Outer detection ring (radar awareness, not engagement).
      if (sys.detection_m && sys.detection_m > sys.range_m) {
        L.circle(adLL, {
          radius: sys.detection_m, color: sys.color, fillColor: sys.color,
          fillOpacity: 0.02, weight: 1, opacity: 0.35, dashArray: "4 6", interactive: false,
        }).addTo(layer);
      }
      // Inner engagement envelope (where it can actually shoot).
      L.circle(adLL, {
        radius: sys.range_m ?? 5000, color: sys.color, fillColor: sys.color,
        fillOpacity: 0.10, weight: 2, opacity: 0.85, interactive: false,
      }).addTo(layer);
      // Center marker so the unit itself is visible at any zoom.
      L.circleMarker(adLL, {
        radius: 6, color: sys.color, fillColor: sys.color,
        fillOpacity: 0.9, weight: 2, opacity: 1, interactive: false,
      }).addTo(layer);
    }
    // adSig is a stable derived signature: only re-render coverage rings when an AD is
    // added/removed/destroyed/moved/replaced. Avoids tearing down all rings every animation
    // frame when runLoop spreads adUnitsRef.current into a new array reference each tick.
  }, [theater, simToLL, breachPoints, mapReady, zoneCenter, zoneRadius, assetRadius, adUnits.map(a => `${a.id}:${a.key}:${a.x}:${a.y}:${a.health}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw drones, AD units, pursuit lines, and kill flashes
  useEffect(() => {
    const L = LRef.current;
    const droneLayer = droneLayerRef.current;
    const flashLayer = flashLayerRef.current;
    if (!L || !droneLayer) return;
    droneLayer.clearLayers();

    // Draw AD unit markers. Destroyed AD is REMOVED from the map entirely (no greyed-
    // out placeholder), matching the game-mode behavior where "destroyed = gone".
    for (const ad of adUnits) {
      if (ad.health <= 0) continue;
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys) continue;
      const ll = simToLL(ad.x, ad.y);
      L.circleMarker(ll, {
        radius: 7, color: sys.color, fillColor: sys.color,
        fillOpacity: 0.9, weight: 2.5, opacity: 1,
      }).addTo(droneLayer);
    }

    if (!simState) return;

    // Attackers (skip destroyed/breached to reduce SVG elements). Decoys render as a hollow
    // dashed ring in amber so the player can spot the bait visually mid-engagement.
    for (const d of simState.attackers) {
      if (d.status !== "active") continue;
      const ll = simToLL(d.x, d.y);
      if (d.decoy) {
        L.circleMarker(ll, {
          radius: 5, color: "#ddbb44", fillColor: "transparent",
          fillOpacity: 0, weight: 1.5, opacity: 0.9, dashArray: "2 2",
        }).addTo(droneLayer);
        continue;
      }
      const colors = { cheap: "#ff6666", medium: "#cc3333", expensive: "#881111" };
      const sizes = { cheap: 4, medium: 5, expensive: 6 };
      L.circleMarker(ll, {
        radius: sizes[d.threat] || 4, color: colors[d.threat] || "#ff6666",
        fillColor: colors[d.threat] || "#ff6666", fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Interceptors. Distinct shape per type (kamikaze = filled circle, armed = ring with
    // center pip), matching the game-mode visual language. Landed interceptors are dim.
    for (const d of simState.interceptors) {
      if (d.status !== "active" && d.status !== "landed") continue;
      const ll = simToLL(d.x, d.y);
      if (d.status === "active") {
        const isKam = d.destroyOnKill !== false;
        if (isKam) {
          L.circleMarker(ll, { radius: 5, color: "#ffffff", fillColor: "#4a9eff", fillOpacity: 0.9, weight: 1.5 }).addTo(droneLayer);
        } else {
          L.circleMarker(ll, { radius: 7, color: "#ffffff", fillColor: "transparent", fillOpacity: 0, weight: 2 }).addTo(droneLayer);
          L.circleMarker(ll, { radius: 2, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 1, weight: 0 }).addTo(droneLayer);
        }
      } else {
        // Landed: dim small dot at the spawn location
        L.circleMarker(ll, { radius: 4, color: "#2266aa", fillColor: "#2266aa", fillOpacity: 0.5, weight: 1 }).addTo(droneLayer);
      }
    }

    // Combat VFX (ported from game mode flash types: ad_explosion, drone_clash + classic kill/breach)
    if (flashLayer) {
      flashLayer.clearLayers();
      const now = Date.now();
      for (const flash of killFlashes) {
        const age = now - flash.time;
        const ll = simToLL(flash.x, flash.y);

        if (flash.type === "breach") {
          if (age > 600) continue;
          const progress = age / 600;
          L.circleMarker(ll, {
            radius: 6 + progress * 8, color: "#ff3333", fillColor: "#ff0000",
            fillOpacity: (1 - progress) * 0.5, weight: 2, opacity: 1 - progress,
          }).addTo(flashLayer);
        } else if (flash.type === "ad_explosion") {
          // AD destroyed by a kamikaze: large white shockwave + orange fireball + sparks
          if (age > 900) continue;
          const p = age / 900;
          const eased = 1 - Math.pow(1 - p, 3);
          // Outer shockwave ring
          L.circleMarker(ll, { radius: 10 + eased * 26, color: "#ffffff", fillOpacity: 0, weight: 3, opacity: (1 - p) * 0.7 }).addTo(flashLayer);
          // Inner fireball
          L.circleMarker(ll, { radius: 6 + eased * 16, color: "#ff4400", fillColor: "#ff8800", fillOpacity: (1 - p) * 0.8, weight: 2, opacity: 1 - p }).addTo(flashLayer);
          // Hot core fades fast
          if (p < 0.5) {
            L.circleMarker(ll, { radius: 4 + eased * 5, color: "#ffcc00", fillColor: "#ffee88", fillOpacity: (1 - p * 2) * 0.9, weight: 0 }).addTo(flashLayer);
          }
          // 4 debris sparkles drifting outward
          for (let di = 0; di < 4; di++) {
            const angle = (di / 4) * Math.PI * 2 + 0.3;
            const dr = eased * 220;
            const dll = simToLL(flash.x + Math.cos(angle) * dr, flash.y + Math.sin(angle) * dr);
            L.circleMarker(dll, { radius: 2, color: "#ffaa00", fillColor: "#ffaa00", fillOpacity: (1 - p) * 0.8, weight: 0 }).addTo(flashLayer);
          }
        } else if (flash.type === "drone_clash") {
          // Interceptor vs drone kill: blue-orange burst with crossing sparks
          if (age > 500) continue;
          const p = age / 500;
          const eased = 1 - Math.pow(1 - p, 3);
          L.circleMarker(ll, { radius: 4 + eased * 10, color: "#4a9eff", fillColor: "#88ccff", fillOpacity: (1 - p) * 0.7, weight: 1.5, opacity: 1 - p }).addTo(flashLayer);
          L.circleMarker(ll, { radius: 6 + eased * 12, color: "#ff8800", fillOpacity: 0, weight: 2, opacity: (1 - p) * 0.6 }).addTo(flashLayer);
          if (p < 0.6) {
            const spk = eased * 110;
            L.circleMarker(simToLL(flash.x - spk, flash.y + spk * 0.5), { radius: 1.5, color: "#ffffff", fillColor: "#ffffff", fillOpacity: (1 - p) * 0.9, weight: 0 }).addTo(flashLayer);
            L.circleMarker(simToLL(flash.x + spk, flash.y - spk * 0.5), { radius: 1.5, color: "#ffffff", fillColor: "#ffffff", fillOpacity: (1 - p) * 0.9, weight: 0 }).addTo(flashLayer);
          }
        } else {
          // Default kill (AD shoots down a drone): small orange ring
          if (age > 500) continue;
          const progress = age / 500;
          L.circleMarker(ll, {
            radius: 6 + progress * 12,
            color: "#ff8800", fillColor: "#ff8800",
            fillOpacity: (1 - progress) * 0.5, weight: 1.5, opacity: 1 - progress,
          }).addTo(flashLayer);
        }
      }
    }
  }, [simState, killFlashes, simToLL, adUnits, theater, mapReady]);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", cursor: placementMode ? "crosshair" : "grab" }}
    />
  );
}

// ── Main page ──
export default function SwarmInterception() {
  const [theater, setTheater] = useState("ukraine_kyiv");
  const [simState, setSimState] = useState(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [dbTab, setDbTab] = useState("attack");
  const [killFlashes, setKillFlashes] = useState([]);
  const [breachPoints, setBreachPoints] = useState([]); // permanent [{x, y, angle}]
  const [statusText, setStatusText] = useState("READY");
  const [attackSpawns, setAttackSpawns] = useState([]); // [{x, y, droneKey, count}]
  const [defenseSpawns, setDefenseSpawns] = useState([]); // [{x, y, droneKey, count}]
  const [placementMode, setPlacementMode] = useState(null);
  const [spawnDroneKey, setSpawnDroneKey] = useState("fpv_kamikaze");
  const [spawnDefKey, setSpawnDefKey] = useState("custom");
  const [spawnCount, setSpawnCount] = useState(10);
  const [zoneCenter, setZoneCenter] = useState(DEFAULT_ZONE_CENTER);
  const [zoneRadius, setZoneRadius] = useState(DEFAULT_ZONE_RADIUS);
  const [assetRadius, setAssetRadius] = useState(DEFAULT_ASSET_RADIUS);
  const [defenseBudget, setDefenseBudget] = useState(100); // in millions USD
  const [statsPanel, setStatsPanel] = useState(false);
  const [adPlaceKey, setAdPlaceKey] = useState("iron_dome");
  const [adUnits, setAdUnits] = useState(() => {
    const th = THEATERS.ukraine_kyiv;
    const sys = AD_SYSTEMS.find((s) => s.key === th.freeAD.key);
    return [{ id: 0, key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, free: true, ...initAdInstance(sys) }];
  });
  // GNSS jamming toggle - degrades GPS-guided drones (Shahed family, Mohajer, Wing Loong, Gerbera).
  // Models the EW reality that Russia/US/UK heavily jam Shahed-class drones in 2024-2026.
  const [jammingActive, setJammingActive] = useState(false);

  const simRef = useRef(null);
  const runRef = useRef(false);
  const pausedRef = useRef(false);
  const speedRef = useRef(3);
  const flashesRef = useRef([]);
  const frameRef = useRef(null);
  const theaterRef = useRef(theater);
  const zoneCenterRef = useRef(zoneCenter);
  const zoneRadiusRef = useRef(zoneRadius);
  const assetRadiusRef = useRef(assetRadius);
  const adUnitsRef = useRef(adUnits);
  const jammingRef = useRef(jammingActive);
  // Map container ref for screen-shake effect (learning from game mode's shakeMap)
  const mapContainerRef = useRef(null);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { theaterRef.current = theater; }, [theater]);
  useEffect(() => { zoneCenterRef.current = zoneCenter; }, [zoneCenter]);
  useEffect(() => { zoneRadiusRef.current = zoneRadius; }, [zoneRadius]);
  useEffect(() => { assetRadiusRef.current = assetRadius; }, [assetRadius]);
  useEffect(() => { adUnitsRef.current = adUnits; }, [adUnits]);
  useEffect(() => { jammingRef.current = jammingActive; }, [jammingActive]);

  // Screen shake helper - ported from game mode (swarm-1v1.js shakeMap pattern).
  // Cheapest "juice" tool ever invented; sells the impact of breaches and AD destruction.
  const shakeMap = useCallback((intensity = 6, frames = 8) => {
    const el = mapContainerRef.current;
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

  const handlePlaceSpawn = useCallback((x, y) => {
    if (placementMode === "attack") {
      setAttackSpawns((prev) => [...prev, { x, y, droneKey: spawnDroneKey, count: spawnCount }]);
    } else if (placementMode === "defense") {
      const dx = x - zoneCenter[0];
      const dy = y - zoneCenter[1];
      if (Math.sqrt(dx * dx + dy * dy) > zoneRadius) return;
      setDefenseSpawns((prev) => [...prev, { x, y, droneKey: spawnDefKey, count: spawnCount }]);
    } else if (placementMode === "zone_center") {
      setZoneCenter([Math.round(x), Math.round(y)]);
      setPlacementMode(null);
    } else if (placementMode === "zone_resize") {
      const dx = x - zoneCenter[0];
      const dy = y - zoneCenter[1];
      setZoneRadius(Math.max(500, Math.round(Math.sqrt(dx * dx + dy * dy))));
      setPlacementMode(null);
    } else if (placementMode === "asset_resize") {
      const dx = x - zoneCenter[0];
      const dy = y - zoneCenter[1];
      setAssetRadius(Math.max(100, Math.round(Math.sqrt(dx * dx + dy * dy))));
      setPlacementMode(null);
    } else if (placementMode === "place_ad") {
      const sys = AD_SYSTEMS.find((s) => s.key === adPlaceKey);
      if (sys) {
        setAdUnits((prev) => [...prev, { id: Date.now(), key: adPlaceKey, x: Math.round(x), y: Math.round(y), ...initAdInstance(sys) }]);
      }
    }
  }, [placementMode, spawnDroneKey, spawnDefKey, spawnCount, zoneCenter, zoneRadius]);

  const startSim = useCallback(() => {
    setPlacementMode(null);
    const { interceptors, attackers } = createDrones(SANDBOX, theater, attackSpawns, defenseSpawns, SANDBOX.defaultAttackers);
    const initial = {
      interceptors, attackers,
      metrics: { kills: 0, misses: 0, breaches: 0, breach_damage: 0, defense_cost: 0, threat_value_destroyed: 0, active_interceptors: interceptors.length, active_threats: attackers.length },
      step: 0, done: false,
    };
    simRef.current = initial;
    flashesRef.current = [];
    setKillFlashes([]);
    setBreachPoints([]);
    setSimState({ ...initial });
    setRunning(true);
    setPaused(false);
    runRef.current = true;
    pausedRef.current = false;
    setStatusText("RUNNING");
    runLoop();
  }, [theater, attackSpawns, defenseSpawns]);

  const runLoop = useCallback(() => {
    if (!runRef.current) return;
    if (pausedRef.current) { frameRef.current = requestAnimationFrame(runLoop); return; }

    let s = simRef.current;
    if (!s || s.done) { runRef.current = false; setRunning(false); setStatusText("COMPLETE"); return; }

    const steps = speedRef.current;
    let triggeredShakes = 0; // batch shakes per frame to avoid spamming requestAnimationFrame
    for (let i = 0; i < steps; i++) {
      if (s.done) break;
      const prevKills = s.metrics.kills;
      const prevBreaches = s.metrics.breaches;
      const prevAdHealth = adUnitsRef.current.map((ad) => ad.health);
      s = simStep(s, zoneCenterRef.current, assetRadiusRef.current, adUnitsRef.current, zoneRadiusRef.current, THEATERS[theaterRef.current]?.bounds, jammingRef.current);
      const now = Date.now();
      // Kill impact flashes - distinguish AD-shoots-down vs interceptor-clash
      if (s.metrics.kills > prevKills) {
        for (const k of s.attackers) {
          if (k.status === "destroyed" && !k.flashed) {
            const flashType = k.killedByAD ? "kill" : "drone_clash";
            flashesRef.current.push({ x: k.x, y: k.y, time: now, type: flashType });
            k.flashed = true;
          }
        }
      }
      // Breach flashes (inner asset zone)
      if (s.metrics.breaches > prevBreaches) {
        for (const b of s.attackers) {
          if (b.status === "breached" && b.breachX != null) {
            flashesRef.current.push({ x: b.breachX, y: b.breachY, time: now, type: "breach" });
            b.breachX = null;
            triggeredShakes = Math.max(triggeredShakes, 6);
          }
        }
      }
      // AD destroyed flashes - detect via prev/current health diff
      adUnitsRef.current.forEach((ad, idx) => {
        if (prevAdHealth[idx] > 0 && ad.health <= 0 && !ad._explosionFlashed) {
          ad._explosionFlashed = true;
          flashesRef.current.push({ x: ad.x, y: ad.y, time: now, type: "ad_explosion" });
          triggeredShakes = Math.max(triggeredShakes, 8);
        }
      });
      // Zone crossing marks (outer green AD line)
      const newCross = [];
      for (const a of s.attackers) {
        if (a.crossedZone && a.crossX != null) {
          newCross.push({ x: a.crossX, y: a.crossY, angle: Math.atan2(a.crossY - zoneCenterRef.current[1], a.crossX - zoneCenterRef.current[0]) });
          a.crossX = null; // mark as counted
        }
      }
      if (newCross.length > 0) setBreachPoints((prev) => [...prev, ...newCross]);
    }

    simRef.current = s;
    const now = Date.now();
    // Slightly longer wallclock decay for explosion flashes (matches game-mode VFX timing)
    flashesRef.current = flashesRef.current.filter((f) => {
      const maxAge = f.type === "breach" ? 1000 : f.type === "ad_explosion" ? 900 : 500;
      return now - f.time < maxAge;
    });
    setSimState({ ...s });
    setKillFlashes([...flashesRef.current]);
    setAdUnits([...adUnitsRef.current]);

    if (triggeredShakes > 0) shakeMap(triggeredShakes, Math.round(triggeredShakes * 1.25));

    if (s.done) {
      runRef.current = false;
      setRunning(false);
      setStatusText("COMPLETE");
    } else {
      frameRef.current = requestAnimationFrame(runLoop);
    }
  }, [shakeMap]);

  const stopSim = useCallback(() => {
    runRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setRunning(false); setPaused(false); setSimState(null); setStatusText("READY");
    setBreachPoints([]);
  }, []);

  const hardReset = useCallback(() => {
    runRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    flashesRef.current = [];
    setRunning(false); setPaused(false); setSimState(null); setStatusText("READY");
    setKillFlashes([]); setBreachPoints([]);
    setAttackSpawns([]); setDefenseSpawns([]);
    setPlacementMode(null);
    setZoneCenter(DEFAULT_ZONE_CENTER);
    setZoneRadius(DEFAULT_ZONE_RADIUS);
    setAssetRadius(DEFAULT_ASSET_RADIUS);
    setDefenseBudget(100);
    const th = THEATERS.ukraine_kyiv;
    const sys = AD_SYSTEMS.find((s2) => s2.key === th.freeAD.key);
    setAdUnits([{ id: 0, key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, free: true, ...initAdInstance(sys) }]);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => { const next = !p; pausedRef.current = next; setStatusText(next ? "PAUSED" : "RUNNING"); return next; });
  }, []);

  const stepOnce = useCallback(() => {
    if (!simRef.current || simRef.current.done) return;
    pausedRef.current = true; setPaused(true); setStatusText("PAUSED");
    const prevKills = simRef.current.metrics.kills;
    const prevBreaches = simRef.current.metrics.breaches;
    simRef.current = simStep(simRef.current, zoneCenterRef.current, assetRadiusRef.current, adUnitsRef.current, zoneRadiusRef.current, THEATERS[theaterRef.current]?.bounds, jammingRef.current);
    const now = Date.now();
    if (simRef.current.metrics.kills > prevKills) {
      for (const k of simRef.current.attackers) {
        if (k.status === "destroyed" && !k.flashed) {
          const flashType = k.killedByAD ? "kill" : "drone_clash";
          flashesRef.current.push({ x: k.x, y: k.y, time: now, type: flashType });
          k.flashed = true;
        }
      }
    }
    if (simRef.current.metrics.breaches > prevBreaches) {
      for (const b of simRef.current.attackers) {
        if (b.status === "breached" && b.breachX != null) {
          flashesRef.current.push({ x: b.breachX, y: b.breachY, time: now, type: "breach" });
          b.breachX = null;
        }
      }
    }
    // Zone crossings
    const newCross = [];
    for (const a of simRef.current.attackers) {
      if (a.crossedZone && a.crossX != null) {
        newCross.push({ x: a.crossX, y: a.crossY, angle: Math.atan2(a.crossY - zoneCenterRef.current[1], a.crossX - zoneCenterRef.current[0]) });
        a.crossX = null;
      }
    }
    if (newCross.length > 0) setBreachPoints((prev) => [...prev, ...newCross]);
    setSimState({ ...simRef.current });
    setKillFlashes([...flashesRef.current]);
    setAdUnits([...adUnitsRef.current]);
    if (simRef.current.done) { runRef.current = false; setRunning(false); setStatusText("COMPLETE"); }
  }, []);

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  const m = simState?.metrics || {};
  const totalInt = simState ? simState.interceptors.length : 0;
  const lost = totalInt - (m.active_interceptors || 0);
  const totalResolved = (m.kills || 0) + (m.misses || 0);
  const killRate = totalResolved > 0 ? ((m.kills / totalResolved) * 100).toFixed(1) : "0";
  const attrition = totalInt > 0 ? ((lost / totalInt) * 100).toFixed(1) : "0";
  const eff = m.defense_cost > 0 && m.threat_value_destroyed > 0 ? (m.threat_value_destroyed / m.defense_cost).toFixed(2) : "-";

  const profiles = DRONE_DB[dbTab] || [];
  const statusColor = statusText === "RUNNING" ? "#4caf50" : statusText === "COMPLETE" ? "#ff9800" : statusText === "PAUSED" ? "#4a9eff" : "#888";
  const btnBase = { padding: "8px 12px", borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid", width: "100%" };

  return (
    <>
      <Head>
        <title>Swarm Interception Simulator - Shiv Gupta</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
      </Head>

      <style jsx global>{`
        .leaflet-container { background: #0a0a0f; }
        @keyframes gameModePulse {
          0%, 100% { box-shadow: 0 0 14px rgba(255,102,136,0.30); transform: scale(1); }
          50% { box-shadow: 0 0 28px rgba(255,102,136,0.55); transform: scale(1.02); }
        }
      `}</style>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/#projects" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>&larr; Back to Projects</Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#4a9eff", letterSpacing: 0.5, margin: 0 }}>SWARM INTERCEPTION SIMULATOR</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setStatsPanel(true)} style={{ padding: "4px 12px", background: "#1a2a40", border: "1px solid #2a4a6a", color: "#4a9eff", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Unit Database</button>
            <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
          </div>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel */}
          <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            {/* Prominent Game Mode CTA - the simulator is open-ended sandbox; the
                challenge experience lives in the 1v1 game mode and we surface that prominently. */}
            <Link href="/projects/swarm-1v1" style={{
              display: "block", padding: "14px 16px", marginBottom: 16,
              background: "linear-gradient(135deg, #6a1a3a 0%, #4a1a2a 100%)",
              border: "2px solid #ff6688", borderRadius: 8,
              color: "#ffffff", textDecoration: "none",
              textAlign: "center", fontWeight: 800, fontSize: 14,
              letterSpacing: 1.2, textTransform: "uppercase",
              boxShadow: "0 0 20px rgba(255,102,136,0.35)",
              animation: "gameModePulse 2.4s ease-in-out infinite",
            }}>
              <div style={{ fontSize: 16 }}>Game Mode</div>
              <div style={{ fontSize: 9, color: "#ffaabb", marginTop: 4, fontWeight: 500, letterSpacing: 0.5, textTransform: "none" }}>1v1 multiplayer / vs bot</div>
            </Link>

            <PanelTitle>Theater</PanelTitle>
            <select value={theater} onChange={(e) => {
              const newTh = e.target.value;
              setTheater(newTh);
              const th = THEATERS[newTh];
              if (th?.freeAD) {
                const sys = AD_SYSTEMS.find((s) => s.key === th.freeAD.key);
                setAdUnits((prev) => {
                  const userPlaced = prev.filter((ad) => !ad.free);
                  return [{ id: Date.now(), key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, free: true, ...initAdInstance(sys) }, ...userPlaced];
                });
              }
            }} disabled={running}
              style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}>
              {Object.entries(THEATERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>

            <PanelTitle>Defense Zones</PanelTitle>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>Click map to set center or resize.</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <button onClick={() => setPlacementMode(placementMode === "zone_center" ? null : "zone_center")} disabled={running}
                style={{ ...btnBase, fontSize: 10, padding: "5px 8px", background: placementMode === "zone_center" ? "#1a3a1a" : "#1a1a24", borderColor: placementMode === "zone_center" ? "#22aa22" : "#2a2a35", color: placementMode === "zone_center" ? "#22aa22" : "#888", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
                {placementMode === "zone_center" ? "Click map..." : "Set Center"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <button onClick={() => setPlacementMode(placementMode === "zone_resize" ? null : "zone_resize")} disabled={running}
                style={{ ...btnBase, fontSize: 10, padding: "5px 8px", background: placementMode === "zone_resize" ? "#1a3a1a" : "#1a1a24", borderColor: placementMode === "zone_resize" ? "#22aa22" : "#2a2a35", color: placementMode === "zone_resize" ? "#22aa22" : "#888", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
                {placementMode === "zone_resize" ? "Click edge..." : `AD Zone r:${zoneRadius}`}
              </button>
              <button onClick={() => setPlacementMode(placementMode === "asset_resize" ? null : "asset_resize")} disabled={running}
                style={{ ...btnBase, fontSize: 10, padding: "5px 8px", background: placementMode === "asset_resize" ? "#4a1a1a" : "#1a1a24", borderColor: placementMode === "asset_resize" ? "#ff4444" : "#2a2a35", color: placementMode === "asset_resize" ? "#ff4444" : "#888", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
                {placementMode === "asset_resize" ? "Click edge..." : `Asset r:${assetRadius}`}
              </button>
            </div>

            <PanelTitle>Ground AD Units</PanelTitle>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <select value={adPlaceKey} onChange={(e) => setAdPlaceKey(e.target.value)} disabled={running}
                style={{ flex: 1, padding: "5px 8px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 10 }}>
                {AD_SYSTEMS.map((s) => (
                  <option key={s.key} value={s.key}>{s.name} (${formatUSD(s.cost)})</option>
                ))}
              </select>
              <button onClick={() => setPlacementMode(placementMode === "place_ad" ? null : "place_ad")} disabled={running}
                style={{ ...btnBase, width: "auto", padding: "5px 10px", fontSize: 10, background: placementMode === "place_ad" ? "#1a3a1a" : "#1a1a24", borderColor: placementMode === "place_ad" ? "#22aa22" : "#2a2a35", color: placementMode === "place_ad" ? "#22aa22" : "#888" }}>
                {placementMode === "place_ad" ? "Click map..." : "Place"}
              </button>
            </div>
            {(() => {
              const sel = AD_SYSTEMS.find((s) => s.key === adPlaceKey);
              if (!sel) return null;
              const rangeKm = ((sel.range_m ?? 0) / 1000).toFixed(0);
              const detKm = ((sel.detection_m ?? 0) / 1000).toFixed(0);
              return (
                <div style={{ fontSize: 9, color: "#666", marginBottom: 4, lineHeight: 1.5 }}>
                  Engage {rangeKm}km / detect {detKm}km | salvo {sel.salvo} | burst {sel.burstSize} ({Math.round(sel.reloadS / 60)}min reload) | {sel.maxSimultaneous} sim. tgts | Pk {(sel.pk * 100).toFixed(0)}% | {sel.mobile ? "mobile" : "fixed"} ({sel.setupMin}min setup)
                </div>
              );
            })()}
            {adUnits.map((ad, i) => {
              const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
              const reloading = ad.reloadStepsLeft != null && ad.reloadStepsLeft > 0;
              const reloadSecs = reloading ? Math.ceil(ad.reloadStepsLeft / 10) : 0;
              const burstNow = ad.burstRemaining ?? ad.ammo ?? 0;
              const burstMax = sys?.burstSize ?? sys?.missiles ?? 0;
              return (
                <div key={ad.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, fontSize: 10, color: sys?.color || "#888" }}>
                  <span style={{ flex: 1 }}>
                    {sys?.name || ad.key} [{burstNow}/{burstMax}]{reloading ? ` ⟳${reloadSecs}s` : ""}{ad.free ? " (free)" : ""}
                  </span>
                  <button onClick={() => setAdUnits((prev) => prev.filter((_, j) => j !== i))} disabled={running}
                    style={{ background: "transparent", border: "1px solid #333", color: "#888", width: 18, height: 18, padding: 0, fontSize: 12, lineHeight: "16px", textAlign: "center", cursor: "pointer", borderRadius: 3 }}>&times;</button>
                </div>
              );
            })}

            <PanelTitle>Electronic Warfare</PanelTitle>
            <button onClick={() => setJammingActive((j) => !j)}
              style={{ ...btnBase, fontSize: 11, padding: "6px 10px",
                background: jammingActive ? "#3a3a1a" : "#1a1a24",
                borderColor: jammingActive ? "#ddcc44" : "#2a2a35",
                color: jammingActive ? "#ddcc44" : "#888" }}>
              GNSS Jamming: {jammingActive ? "ACTIVE" : "off"}
            </button>
            <div style={{ fontSize: 9, color: "#555", marginTop: 4, lineHeight: 1.4 }}>
              Degrades GPS-guided drones (Shahed family, Mohajer, Wing Loong, Gerbera). FPV / TV-seeker drones (Lancet, Switchblade) unaffected.
            </div>

            <PanelTitle>Spawn Points</PanelTitle>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Select type/count, click map to place.</div>

            {/* Drone type selector */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <select value={placementMode === "defense" ? spawnDefKey : spawnDroneKey}
                  onChange={(e) => placementMode === "defense" ? setSpawnDefKey(e.target.value) : setSpawnDroneKey(e.target.value)}
                  disabled={running}
                  style={{ flex: 1, padding: "5px 8px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 11, cursor: running ? "not-allowed" : "pointer" }}>
                  {placementMode === "defense"
                    ? DRONE_DB.interceptor.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)
                    : DRONE_DB.attack.map((d) => <option key={d.key} value={d.key}>{d.name} (${formatUSD(d.cost)})</option>)
                  }
                </select>
                <input type="number" value={spawnCount} onChange={(e) => setSpawnCount(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1" max="100" disabled={running}
                  style={{ width: 50, padding: "5px 6px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 11, textAlign: "center" }} />
              </div>
            </div>

            {/* Place buttons */}
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button onClick={() => setPlacementMode(placementMode === "attack" ? null : "attack")} disabled={running}
                style={{ ...btnBase, background: placementMode === "attack" ? "#4a1a1a" : "#1a2a40", borderColor: placementMode === "attack" ? "#ff5555" : "#2a4a6a", color: placementMode === "attack" ? "#ff5555" : "#e0e0e0", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer", fontSize: 11 }}>
                {placementMode === "attack" ? "Placing ATK..." : `ATK (${attackSpawns.length})`}
              </button>
              <button onClick={() => setPlacementMode(placementMode === "defense" ? null : "defense")} disabled={running}
                style={{ ...btnBase, background: placementMode === "defense" ? "#1a3a4a" : "#1a2a40", borderColor: placementMode === "defense" ? "#4a9eff" : "#2a4a6a", color: placementMode === "defense" ? "#4a9eff" : "#e0e0e0", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer", fontSize: 11 }}>
                {placementMode === "defense" ? "Placing DEF..." : `DEF (${defenseSpawns.reduce((s, sp) => s + sp.count, 0)})`}
              </button>
            </div>

            {/* Spawn list */}
            {attackSpawns.map((sp, i) => {
              const p = DRONE_DB.attack.find((d) => d.key === sp.droneKey);
              return (
                <div key={`a${i}`} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, fontSize: 10, color: "#ff5555" }}>
                  <span style={{ flex: 1 }}>{p ? p.name : sp.droneKey} x{sp.count}</span>
                  <button onClick={() => setAttackSpawns((prev) => prev.filter((_, j) => j !== i))} disabled={running}
                    style={{ background: "transparent", border: "1px solid #333", color: "#ff5555", width: 18, height: 18, padding: 0, fontSize: 12, lineHeight: "16px", textAlign: "center", cursor: "pointer", borderRadius: 3 }}>&times;</button>
                </div>
              );
            })}
            {defenseSpawns.map((sp, i) => {
              const p = DRONE_DB.interceptor.find((d) => d.key === sp.droneKey);
              return (
                <div key={`d${i}`} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, fontSize: 10, color: "#4a9eff" }}>
                  <span style={{ flex: 1 }}>{p ? p.name : sp.droneKey} x{sp.count}</span>
                  <button onClick={() => setDefenseSpawns((prev) => prev.filter((_, j) => j !== i))} disabled={running}
                    style={{ background: "transparent", border: "1px solid #333", color: "#4a9eff", width: 18, height: 18, padding: 0, fontSize: 12, lineHeight: "16px", textAlign: "center", cursor: "pointer", borderRadius: 3 }}>&times;</button>
                </div>
              );
            })}

            {(attackSpawns.length > 0 || defenseSpawns.length > 0) && (
              <button onClick={() => { setAttackSpawns([]); setDefenseSpawns([]); setPlacementMode(null); }} disabled={running}
                style={{ ...btnBase, background: "#1a1a24", borderColor: "#2a2a35", color: "#888", fontSize: 11, marginTop: 4, opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
                Clear All Spawns
              </button>
            )}

            <PanelTitle>Simulation</PanelTitle>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={startSim} disabled={running && !simState?.done} style={{ ...btnBase, background: "#1a4a2a", borderColor: "#2a6a3a", color: "#4caf50", opacity: running && !simState?.done ? 0.4 : 1, cursor: running && !simState?.done ? "not-allowed" : "pointer" }}>Start</button>
              <button onClick={stopSim} disabled={!running && !simState} style={{ ...btnBase, background: "#4a1a1a", borderColor: "#6a2a2a", color: "#ff5555", opacity: !running && !simState ? 0.4 : 1, cursor: !running && !simState ? "not-allowed" : "pointer" }}>Stop</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={togglePause} disabled={!running} style={{ ...btnBase, background: "#1a2a40", borderColor: "#2a4a6a", color: "#e0e0e0", opacity: !running ? 0.4 : 1, cursor: !running ? "not-allowed" : "pointer" }}>{paused ? "Resume" : "Pause"}</button>
              <button onClick={stepOnce} disabled={!simState || simState.done} style={{ ...btnBase, background: "#1a2a40", borderColor: "#2a4a6a", color: "#e0e0e0", opacity: !simState || simState.done ? 0.4 : 1, cursor: !simState || simState.done ? "not-allowed" : "pointer" }}>Step</button>
            </div>
            <button onClick={hardReset} style={{ ...btnBase, background: "#1a1a24", borderColor: "#2a2a35", color: "#888", fontSize: 11, marginBottom: 8 }}>Reset All</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Speed:</label>
              <input type="range" min="1" max="50" value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} style={{ flex: 1, padding: 0, margin: 0, height: 20 }} />
              <span style={{ fontSize: 12, color: "#4a9eff", minWidth: 30, textAlign: "right" }}>{speed}x</span>
            </div>

            <PanelTitle>Legend</PanelTitle>
            <LegendItem color="#4a9eff" label="Interceptor (active)" />
            <LegendItem color="#666" label="Interceptor (lost)" />
            <LegendItem color="#ff6666" label="FPV / Cheap threat" />
            <LegendItem color="#cc3333" label="Loitering / Medium" />
            <LegendItem color="#881111" label="Cruise missile / Expensive" />
            <LegendItem color="#22aa22" label="Ground air defense zone" hollow />
            <LegendItem color="#ff4444" label="Defended asset zone" hollow />
            <LegendItem color="#ff8800" label="Kill flash" />

            <PanelTitle>Drone Database</PanelTitle>
            <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
              {["attack", "interceptor"].map((tab) => (
                <button key={tab} onClick={() => setDbTab(tab)}
                  style={{ flex: 1, padding: 6, textAlign: "center", fontSize: 11, background: dbTab === tab ? "#1a2a40" : "#1a1a24", border: `1px solid ${dbTab === tab ? "#4a9eff" : "#2a2a35"}`, color: dbTab === tab ? "#4a9eff" : "#e0e0e0", cursor: "pointer", borderRadius: 3 }}>
                  {tab === "attack" ? "Attack" : "Defense"}
                </button>
              ))}
            </div>
            {profiles.map((p) => <ProfileCard key={p.key} name={p.name} country={p.country} speed={p.speed} cost={p.cost} rcs={p.rcs} />)}
          </div>

          {/* Map - wrapped in a shake-able container so shakeMap can translate it on impacts */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }}>
              <SimMap simState={simState} theater={theater} killFlashes={killFlashes} breachPoints={breachPoints} attackSpawns={attackSpawns} defenseSpawns={defenseSpawns} placementMode={placementMode} onPlaceSpawn={placementMode ? handlePlaceSpawn : null} zoneCenter={zoneCenter} zoneRadius={zoneRadius} assetRadius={assetRadius} adUnits={adUnits} />
            </div>
            {statsPanel && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
                onClick={() => setStatsPanel(false)}>
                <div style={{ background: "#111118", border: "1px solid #2a2a35", borderRadius: 12, padding: "24px", maxWidth: 700, width: "90%", maxHeight: "80vh", overflowY: "auto" }}
                  onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 18, color: "#4a9eff" }}>Unit Database</h2>
                    <button onClick={() => setStatsPanel(false)} style={{ background: "transparent", border: "1px solid #333", color: "#888", width: 28, height: 28, fontSize: 16, cursor: "pointer", borderRadius: 4 }}>&times;</button>
                  </div>

                  <div style={{ fontSize: 10, color: "#666", marginBottom: 12 }}>Real-world systems with publicly available specifications. Game mode units marked with *.</div>

                  <h3 style={{ fontSize: 12, color: "#ff6666", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Attack Drones</h3>
                  {DRONE_DB.attack.map((d) => (
                    <div key={d.key} style={{ background: "#1a1a24", border: `1px solid ${d.decoy ? "#aa8800" : "#2a2a35"}`, borderRadius: 6, padding: 12, marginBottom: 6, display: "flex", gap: 12 }}>
                      <div style={{ flexShrink: 0, width: 80, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: UNIT_SKETCHES.attack[d.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="#cc3333" stroke="#fff" stroke-width="2"/></svg>` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: "#ff6666" }}>
                            {d.name} {d.decoy && <span style={{ fontSize: 9, color: "#ddbb44", fontWeight: 400 }}>* DECOY</span>}
                          </span>
                          <span style={{ fontSize: 10, color: "#666" }}>{d.country}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 6, fontSize: 10, flexWrap: "wrap" }}>
                          <span style={{ color: "#888" }}>Speed: <span style={{ color: "#e0e0e0" }}>{d.speed} km/h</span></span>
                          <span style={{ color: "#888" }}>Cost: <span style={{ color: "#ff9800" }}>${formatUSD(d.cost)}</span></span>
                          <span style={{ color: "#888" }}>RCS: <span style={{ color: "#e0e0e0" }}>{d.rcs} m2</span></span>
                          <span style={{ color: "#888" }}>Threat: <span style={{ color: d.threat === "expensive" ? "#ff3333" : d.threat === "medium" ? "#ff9800" : "#4caf50" }}>{d.threat}</span></span>
                        </div>
                        <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4 }}>{d.desc}</div>
                      </div>
                    </div>
                  ))}

                  <h3 style={{ fontSize: 12, color: "#4a9eff", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Interceptor Drones</h3>
                  {DRONE_DB.interceptor.map((d) => (
                    <div key={d.key} style={{ background: "#1a1a24", border: `1px solid ${d.fictional ? "#333300" : "#2a2a35"}`, borderRadius: 6, padding: 12, marginBottom: 6, display: "flex", gap: 12 }}>
                      <div style={{ flexShrink: 0, width: 80, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: UNIT_SKETCHES.interceptor[d.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="#4a9eff" stroke="#fff" stroke-width="2.5"/></svg>` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: "#4a9eff" }}>
                            {d.name} {d.fictional && <span style={{ fontSize: 9, color: "#aa8800", fontWeight: 400 }}>* GAME UNIT</span>}
                          </span>
                          <span style={{ fontSize: 10, color: "#666" }}>{d.country}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 6, fontSize: 10, flexWrap: "wrap" }}>
                          <span style={{ color: "#888" }}>Speed: <span style={{ color: "#e0e0e0" }}>{d.speed} km/h</span></span>
                          <span style={{ color: "#888" }}>Cost: <span style={{ color: "#ff9800" }}>${formatUSD(d.cost)}</span></span>
                          <span style={{ color: "#888" }}>Type: <span style={{ color: d.destroyOnKill ? "#ff5555" : "#4caf50" }}>{d.destroyOnKill ? "Kamikaze" : "Reusable"}</span></span>
                          {!d.destroyOnKill && <span style={{ color: "#888" }}>Survival: <span style={{ color: "#4caf50" }}>{((d.survivalRate || 0) * 100).toFixed(0)}%</span></span>}
                        </div>
                        <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4 }}>{d.desc}</div>
                      </div>
                    </div>
                  ))}

                  <h3 style={{ fontSize: 12, color: "#22aa22", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Ground Air Defense Systems</h3>
                  {AD_SYSTEMS.map((s) => {
                    const rangeKm = ((s.range_m ?? 0) / 1000).toFixed(0);
                    const detKm = ((s.detection_m ?? 0) / 1000).toFixed(0);
                    const reloadMin = Math.round((s.reloadS ?? 0) / 60);
                    const effectivePk = 1 - Math.pow(1 - s.pk, s.salvo ?? 1);
                    return (
                    <div key={s.key} style={{ background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 6, padding: 12, marginBottom: 6, display: "flex", gap: 12 }}>
                      <div style={{ flexShrink: 0, width: 80, height: 60, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: UNIT_SKETCHES.ad[s.key] || `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${s.color}" stroke="#fff" stroke-width="2.5"/></svg>` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: s.color }}>{s.name}</span>
                          <span style={{ fontSize: 10, color: "#666" }}>{s.country} - {s.type} range - {s.mobile ? "mobile" : "fixed"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 10, flexWrap: "wrap" }}>
                          <span style={{ color: "#888" }}>Engage: <span style={{ color: "#e0e0e0" }}>{rangeKm}km</span></span>
                          <span style={{ color: "#888" }}>Detect: <span style={{ color: "#e0e0e0" }}>{detKm}km</span></span>
                          <span style={{ color: "#888" }}>Burst: <span style={{ color: "#e0e0e0" }}>{s.burstSize}</span></span>
                          <span style={{ color: "#888" }}>Reload: <span style={{ color: "#e0e0e0" }}>{reloadMin}min</span></span>
                          <span style={{ color: "#888" }}>Salvo: <span style={{ color: "#e0e0e0" }}>{s.salvo}</span></span>
                          <span style={{ color: "#888" }}>Sim. tgts: <span style={{ color: "#e0e0e0" }}>{s.maxSimultaneous}</span></span>
                          <span style={{ color: "#888" }}>Setup: <span style={{ color: "#e0e0e0" }}>{s.setupMin}min</span></span>
                          <span style={{ color: "#888" }}>Per-msl Pk: <span style={{ color: "#4caf50" }}>{(s.pk * 100).toFixed(0)}%</span></span>
                          <span style={{ color: "#888" }}>Salvo Pk: <span style={{ color: "#4caf50" }}>{(effectivePk * 100).toFixed(0)}%</span></span>
                          <span style={{ color: "#888" }}>Cost: <span style={{ color: "#ff9800" }}>${formatUSD(s.cost)}</span></span>
                          <span style={{ color: "#888" }}>Shot: <span style={{ color: "#ff9800" }}>${formatUSD(s.missileCost)}</span></span>
                          <span style={{ color: "#888" }}>Min RCS: <span style={{ color: "#e0e0e0" }}>{s.rcsThreshold} m2</span></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555", width: 50 }}>Engage km</span>
                          <div style={{ flex: 1, background: "#0a0a0f", borderRadius: 3, height: 6 }}>
                            <div style={{ width: `${Math.min(100, ((s.range_m ?? 0) / 200000) * 100)}%`, height: "100%", background: s.color, borderRadius: 3, opacity: 0.7 }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555", width: 50 }}>Salvo Pk</span>
                          <div style={{ flex: 1, background: "#0a0a0f", borderRadius: 3, height: 6 }}>
                            <div style={{ width: `${effectivePk * 100}%`, height: "100%", background: "#4caf50", borderRadius: 3, opacity: 0.7 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "#555", lineHeight: 1.4, marginTop: 4 }}>{s.desc}</div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div style={{ width: 260, background: "#111118", borderLeft: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <PanelTitle>Status</PanelTitle>
            <Metric label="Time Elapsed" value={simState ? `${(simState.step * 0.1).toFixed(1)}s` : "0.0s"} />
            <Metric label="Step" value={simState?.step || 0} />
            <PanelTitle>Forces</PanelTitle>
            <Metric label="Interceptors" value={simState ? `${m.active_interceptors} / ${totalInt}` : "0 / 0"} color="blue" />
            <Metric label="Active Threats" value={m.active_threats || 0} color="red" />
            <PanelTitle>Combat</PanelTitle>
            <Metric label="Kills" value={m.kills || 0} color="green" />
            <Metric label="Misses" value={m.misses || 0} color="red" />
            <Metric label="Kill Rate" value={`${killRate}%`} />
            <PanelTitle>Defense Zones</PanelTitle>
            <Metric label="Breaches" value={m.breaches || 0} color="red" />
            <PanelTitle>Interceptor Attrition</PanelTitle>
            <Metric label="Lost" value={lost} color="red" />
            <Metric label="Attrition Rate" value={`${attrition}%`} />

            {/* Defense Budget - sandbox mode: user-adjustable budget that the cost
                breakdown is compared against. No win/lose check, just informational. */}
            <PanelTitle>Defense Budget</PanelTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <input type="range" min="50" max="5000" step="50" value={defenseBudget}
                onChange={(e) => setDefenseBudget(parseInt(e.target.value))}
                style={{ flex: 1, padding: 0, margin: 0, height: 18 }} />
              <span style={{ fontSize: 12, color: "#4a9eff", minWidth: 45, textAlign: "right", fontWeight: 600 }}>${defenseBudget}M</span>
            </div>
            {(() => {
              const budgetUSD = defenseBudget * 1e6;
              // Costs: buying drones + buying AD + AD ammo spent + breach damage
              let droneFleetCost = 0;
              if (simState) {
                droneFleetCost = simState.interceptors.reduce((s, i) => s + i.cost, 0);
              } else if (defenseSpawns.length > 0) {
                droneFleetCost = defenseSpawns.reduce((s, sp) => {
                  const p = DRONE_DB.interceptor.find((d) => d.key === sp.droneKey) || DRONE_DB.interceptor[0];
                  return s + p.cost * sp.count;
                }, 0);
              } else {
                droneFleetCost = SANDBOX.interceptors * 200000;
              }
              const adDeployCost = adUnits.reduce((s, ad) => { if (ad.free) return s; const sys = AD_SYSTEMS.find((s2) => s2.key === ad.key); return s + (sys ? sys.cost : 0); }, 0);
              const ammoSpent = m.defense_cost || 0; // AD missile costs
              const breachDmg = m.breach_damage || 0;
              const totalSpent = droneFleetCost + adDeployCost + ammoSpent + breachDmg;
              const remaining = budgetUSD - totalSpent;
              const pctUsed = budgetUSD > 0 ? Math.min(100, (totalSpent / budgetUSD) * 100) : 0;
              const overBudget = remaining < 0;

              return (
                <div style={{ fontSize: 11 }}>
                  {/* Budget bar */}
                  <div style={{ background: "#1a1a24", borderRadius: 4, height: 8, marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pctUsed, 100)}%`, background: pctUsed > 90 ? "#ff5555" : pctUsed > 70 ? "#ff9800" : "#4caf50", borderRadius: 4, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#4a9eff" }}>
                    <span>Drone Fleet</span><span>${formatUSD(droneFleetCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#cc8800" }}>
                    <span>Ground AD Deploy</span><span>${formatUSD(adDeployCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#ff9800" }}>
                    <span>AD Ammo Spent</span><span>${formatUSD(ammoSpent)}</span>
                  </div>
                  {breachDmg > 0 && (
                    <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#ff3333" }}>
                      <span>Breach Damage ({m.breaches})</span><span>${formatUSD(breachDmg)}</span>
                    </div>
                  )}
                  <div style={{ padding: "6px 0", borderTop: "2px solid #2a2a35", marginTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 12, color: overBudget ? "#ff5555" : "#4caf50" }}>
                    <span>Remaining</span><span>{overBudget ? "-" : ""}${formatUSD(Math.abs(remaining))}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", textAlign: "right" }}>{pctUsed.toFixed(0)}% of ${formatUSD(budgetUSD)} budget</div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
