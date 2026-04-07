import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Drone database ──
const DRONE_DB = {
  attack: [
    { key: "shahed_136", name: "Shahed-136", country: "Iran", speed: 185, cost: 20000, rcs: 0.1, threat: "cheap" },
    { key: "lancet_3", name: "Lancet-3", country: "Russia", speed: 300, cost: 35000, rcs: 0.05, threat: "medium" },
    { key: "fpv_kamikaze", name: "FPV Kamikaze", country: "Generic", speed: 150, cost: 500, rcs: 0.01, threat: "cheap" },
    { key: "mohajer_6", name: "Mohajer-6", country: "Iran", speed: 200, cost: 500000, rcs: 0.5, threat: "expensive" },
    { key: "orion", name: "Orion (Pacer)", country: "Russia", speed: 200, cost: 1000000, rcs: 1.0, threat: "expensive" },
    { key: "wing_loong", name: "Wing Loong II", country: "China", speed: 370, cost: 2000000, rcs: 1.5, threat: "expensive" },
  ],
  interceptor: [
    { key: "custom", name: "Custom Interceptor", country: "Generic", speed: 400, cost: 200000, rcs: 0.05 },
    { key: "anduril", name: "Anduril Anvil", country: "USA", speed: 320, cost: 100000, rcs: 0.03 },
    { key: "fortem", name: "Fortem DroneHunter", country: "USA", speed: 160, cost: 150000, rcs: 0.08 },
  ],
};

// ── Ground AD systems database ──
// engageRate: seconds between shots (lower = faster). Based on real reload/cycle times.
// missileCost: cost per interceptor missile fired
const AD_SYSTEMS = [
  { key: "s300", name: "S-300", country: "Russia", type: "long", range: 4000, missiles: 4, cost: 115000000, missileCost: 1000000, pk: 0.7, rcsThreshold: 0.02, engageRate: 5, color: "#cc8800" },
  { key: "s400", name: "S-400", country: "Russia", type: "long", range: 5000, missiles: 4, cost: 300000000, missileCost: 2500000, pk: 0.8, rcsThreshold: 0.01, engageRate: 5, color: "#cc8800" },
  { key: "patriot", name: "Patriot PAC-3", country: "USA", type: "long", range: 3500, missiles: 16, cost: 1000000000, missileCost: 4000000, pk: 0.75, rcsThreshold: 0.05, engageRate: 9, color: "#4488ff" },
  { key: "nasams", name: "NASAMS 3", country: "Norway", type: "medium", range: 2500, missiles: 6, cost: 100000000, missileCost: 500000, pk: 0.8, rcsThreshold: 0.01, engageRate: 4, color: "#4488ff" },
  { key: "iron_dome", name: "Iron Dome", country: "Israel", type: "short", range: 2000, missiles: 20, cost: 50000000, missileCost: 50000, pk: 0.85, rcsThreshold: 0.005, engageRate: 3, color: "#44bbff" },
  { key: "gepard", name: "Gepard", country: "Germany", type: "short", range: 800, missiles: 680, cost: 5000000, missileCost: 100, pk: 0.2, rcsThreshold: 0.001, engageRate: 1, color: "#88aa44" },
  { key: "pantsir", name: "Pantsir-S1", country: "Russia", type: "short", range: 1500, missiles: 12, cost: 15000000, missileCost: 60000, pk: 0.65, rcsThreshold: 0.01, engageRate: 3, color: "#cc8800" },
  { key: "iris_t", name: "IRIS-T SLM", country: "Germany", type: "medium", range: 2500, missiles: 8, cost: 150000000, missileCost: 400000, pk: 0.8, rcsThreshold: 0.01, engageRate: 5, color: "#88aa44" },
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

const SCENARIOS = {
  sandbox: { name: "Sandbox", attackers: { fpv_kamikaze: 10, shahed_136: 5 }, interceptors: 20, budget: null },
  medium: { name: "Medium", attackers: { fpv_kamikaze: 80, shahed_136: 40, lancet_3: 20 }, interceptors: 6, budget: 100 },
  hard: { name: "Hard", attackers: { fpv_kamikaze: 150, shahed_136: 70, lancet_3: 40, mohajer_6: 15 }, interceptors: 5, budget: 150 },
  nightmare: { name: "Nightmare", attackers: { fpv_kamikaze: 250, shahed_136: 100, lancet_3: 60, mohajer_6: 25, orion: 10, wing_loong: 5 }, interceptors: 4, budget: 200 },
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

// Convert sim coords (0-10000) to lat/lng for a theater
function simToLatLng(x, y, bounds) {
  const lat = bounds.south + (y / ARENA) * (bounds.north - bounds.south);
  const lng = bounds.west + (x / ARENA) * (bounds.east - bounds.west);
  return [lat, lng];
}

function latLngToSim(lat, lng, bounds) {
  const x = ((lng - bounds.west) / (bounds.east - bounds.west)) * ARENA;
  const y = ((lat - bounds.south) / (bounds.north - bounds.south)) * ARENA;
  return [x, y];
}

// ── Create drones for a scenario ──
function createDrones(scenario, theater, customAttackSpawns, customDefenseSpawns) {
  const th = THEATERS[theater] || THEATERS.kashmir;
  const center = [5000, 5000];
  const hasCustomAtk = customAttackSpawns.length > 0;
  const hasCustomDef = customDefenseSpawns.length > 0;

  const attackerList = [];
  let id = 100;

  if (hasCustomAtk) {
    // Use custom spawn points with their own drone type and count
    for (const sp of customAttackSpawns) {
      const profile = DRONE_DB.attack.find((d) => d.key === sp.droneKey);
      if (!profile) continue;
      for (let i = 0; i < sp.count; i++) {
        attackerList.push({
          id: id++,
          x: sp.x + (Math.random() - 0.5) * 1500,
          y: sp.y + (Math.random() - 0.5) * 1500,
          speed: profile.speed / 200,
          cost: profile.cost,
          threat: profile.threat,
          status: "active",
          heading: Math.atan2(center[1] - sp.y, center[0] - sp.x) + (Math.random() - 0.5) * 0.8,
          type: "attacker",
          profileName: profile.name,
        });
      }
    }
  } else {
    // Use scenario defaults with theater origins
    for (const [key, count] of Object.entries(scenario.attackers)) {
      const profile = DRONE_DB.attack.find((d) => d.key === key);
      if (!profile) continue;
      for (let i = 0; i < count; i++) {
        const origin = th.attackOrigins[Math.floor(Math.random() * th.attackOrigins.length)];
        attackerList.push({
          id: id++,
          x: origin[0] + (Math.random() - 0.5) * 1500,
          y: origin[1] + (Math.random() - 0.5) * 1500,
          speed: profile.speed / 200,
          cost: profile.cost,
          threat: profile.threat,
          status: "active",
          heading: Math.atan2(center[1] - origin[1], center[0] - origin[0]) + (Math.random() - 0.5) * 0.8,
          type: "attacker",
          profileName: profile.name,
        });
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
        speed: 2.0,
        cost: 200000,
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
function simStep(state, zoneCenter, assetRadius, adUnitsState, zoneRadius) {
  const { interceptors, attackers, metrics, step } = state;

  for (const a of attackers) {
    if (a.status !== "active") continue;
    const prevDist = dist(a, { x: zoneCenter[0], y: zoneCenter[1] });

    // Medium/expensive drones prioritize nearby active AD units
    let targetX = zoneCenter[0];
    let targetY = zoneCenter[1];
    if (adUnitsState && (a.threat === "medium" || a.threat === "expensive")) {
      // Find closest alive AD unit within detection range
      let bestAD = null;
      let bestADDist = 3000; // detection range
      for (const ad of adUnitsState) {
        if (ad.health <= 0) continue;
        const d = dist(a, ad);
        if (d < bestADDist) { bestADDist = d; bestAD = ad; }
      }
      if (bestAD) {
        targetX = bestAD.x;
        targetY = bestAD.y;
        a.adTargetId = bestAD.id;
        // Check if close enough to destroy AD unit
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
    a.heading += diff * 0.05 + (Math.random() - 0.5) * 0.03;
    a.x += Math.cos(a.heading) * a.speed;
    a.y += Math.sin(a.heading) * a.speed;
    const newDist = dist(a, { x: zoneCenter[0], y: zoneCenter[1] });
    // Detect crossing green AD zone line
    if (!a.crossedZone && prevDist > zoneRadius && newDist <= zoneRadius) {
      a.crossedZone = true;
      a.crossX = a.x;
      a.crossY = a.y;
    }
    // Detect breach of inner asset zone
    if (newDist < assetRadius) {
      a.status = "breached";
      a.breachX = a.x;
      a.breachY = a.y;
      metrics.breaches++;
      metrics.misses++;
      metrics.breach_damage += BREACH_DAMAGE[a.threat] || 500000;
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
        metrics.defense_cost += int.cost * 0.1;
        int.targetId = null;
        if (Math.random() < 0.3) int.status = "expended";
      }
    }
  }

  // AD units engage attackers within range
  if (adUnitsState) {
    for (const ad of adUnitsState) {
      if (ad.health <= 0 || ad.ammo <= 0) continue;
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys) continue;
      // Fire rate based on engageRate (seconds between shots, sim runs at 10 steps/sec)
      const fireInterval = Math.max(1, Math.round(sys.engageRate * 10));
      if (step % fireInterval !== 0) continue;
      // Find closest in-range attacker with detectable RCS
      let bestTarget = null;
      let bestDist = Infinity;
      for (const a of attackers) {
        if (a.status !== "active") continue;
        const d = dist(ad, a);
        if (d > sys.range) continue;
        const profile = DRONE_DB.attack.find((p) => p.key === a.profileName?.toLowerCase?.().replace(/ /g, "_")) || { rcs: 0.1 };
        if ((a.rcsOverride || profile.rcs || 0.1) < sys.rcsThreshold) continue;
        if (d < bestDist) { bestDist = d; bestTarget = a; }
      }
      if (bestTarget) {
        ad.ammo--;
        metrics.defense_cost += sys.missileCost;
        if (Math.random() < sys.pk) {
          bestTarget.status = "destroyed";
          bestTarget.killedByAD = true;
          metrics.kills++;
          metrics.threat_value_destroyed += bestTarget.cost;
        }
      }
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
    const latSpan = th.bounds.north - th.bounds.south;
    const metersPerUnit = (latSpan * 111000) / ARENA;

    // ── Inner: Defended Asset Zone (red dashed) ──
    const assetGeoRadius = assetRadius * metersPerUnit;
    const assetCenter = simToLL(zoneCenter[0], zoneCenter[1]);
    L.circle(assetCenter, {
      radius: assetGeoRadius, color: "#ff4444", fillColor: "#ff2222",
      fillOpacity: 0.06, weight: 2, opacity: 0.6, dashArray: "8 6",
    }).addTo(layer);

    // ── Outer: Ground Air Defense Zone (green dashed with gaps at crossings) ──
    const geoRadius = zoneRadius * metersPerUnit;
    const GAP = 0.12; // radians per breach gap

    if (breachPoints.length === 0) {
      const center = simToLL(zoneCenter[0], zoneCenter[1]);
      L.circle(center, {
        radius: geoRadius, color: "#22aa22", fillColor: "#22aa22",
        fillOpacity: 0.03, weight: 2, opacity: 0.8, dashArray: "10 6",
      }).addTo(layer);
    } else {
      // Draw 36 arc segments, skip those near a breach
      const SEG = 24;
      const segArc = (Math.PI * 2) / SEG;
      for (let i = 0; i < SEG; i++) {
        const mid = -Math.PI + (i + 0.5) * segArc;
        const inGap = breachPoints.some((bp) => {
          let d = mid - bp.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          return Math.abs(d) < GAP;
        });
        if (inGap) continue;
        const pts = [];
        for (let j = 0; j <= 3; j++) {
          const a = -Math.PI + i * segArc + (j / 3) * segArc;
          pts.push(simToLL(zoneCenter[0] + Math.cos(a) * zoneRadius, zoneCenter[1] + Math.sin(a) * zoneRadius));
        }
        L.polyline(pts, { color: "#22aa22", weight: 2, opacity: 0.8, dashArray: "10 6", interactive: false }).addTo(layer);
      }
      // Grey impact dots at each breach
      for (const bp of breachPoints) {
        const bll = simToLL(
          zoneCenter[0] + Math.cos(bp.angle) * zoneRadius,
          zoneCenter[1] + Math.sin(bp.angle) * zoneRadius
        );
        L.circleMarker(bll, {
          radius: 5, color: "#888", fillColor: "#555", fillOpacity: 0.9, weight: 2, opacity: 0.8,
        }).addTo(layer);
      }
    }

    // AD unit range indicators (lightweight circleMarkers instead of heavy L.circle)
    for (const ad of adUnits) {
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys || ad.health <= 0) continue;
      const adLL = simToLL(ad.x, ad.y);
      L.circleMarker(adLL, {
        radius: 25, color: sys.color, fillColor: sys.color,
        fillOpacity: 0.08, weight: 1, opacity: 0.3, interactive: false,
      }).addTo(layer);
    }
  }, [theater, simToLL, breachPoints, mapReady, zoneCenter, zoneRadius, assetRadius]);

  // Draw drones, AD units, pursuit lines, and kill flashes
  useEffect(() => {
    const L = LRef.current;
    const droneLayer = droneLayerRef.current;
    const flashLayer = flashLayerRef.current;
    if (!L || !droneLayer) return;
    droneLayer.clearLayers();

    // Draw AD unit markers (circleMarkers only, no DOM labels)
    for (const ad of adUnits) {
      const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
      if (!sys) continue;
      const ll = simToLL(ad.x, ad.y);
      const alive = ad.health > 0;
      L.circleMarker(ll, {
        radius: alive ? 7 : 4, color: alive ? sys.color : "#444", fillColor: alive ? sys.color : "#333",
        fillOpacity: alive ? 0.8 : 0.4, weight: 2, opacity: alive ? 1 : 0.5,
      }).addTo(droneLayer);
    }

    if (!simState) return;

    // Attackers (skip destroyed/breached to reduce SVG elements)
    for (const d of simState.attackers) {
      if (d.status !== "active") continue;
      const ll = simToLL(d.x, d.y);
      const colors = { cheap: "#ff6666", medium: "#cc3333", expensive: "#881111" };
      const sizes = { cheap: 4, medium: 5, expensive: 6 };
      L.circleMarker(ll, {
        radius: sizes[d.threat] || 4, color: colors[d.threat] || "#ff6666",
        fillColor: colors[d.threat] || "#ff6666", fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Interceptors (no pursuit/RTB lines during sim for performance)
    for (const d of simState.interceptors) {
      if (d.status !== "active" && d.status !== "landed") continue;
      const ll = simToLL(d.x, d.y);
      const color = d.status === "active" ? "#4a9eff" : "#2266aa";
      L.circleMarker(ll, {
        radius: 5, color, fillColor: color, fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Kill impact pulses and breach markers
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
        } else {
          // Kill impact: simple expanding ring
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
  const [scenario, setScenario] = useState("medium");
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
  const [adPlaceKey, setAdPlaceKey] = useState("iron_dome");
  const [adUnits, setAdUnits] = useState(() => {
    const th = THEATERS.ukraine_kyiv;
    const sys = AD_SYSTEMS.find((s) => s.key === th.freeAD.key);
    return [{ id: 0, key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, health: 1, ammo: sys?.missiles || 6, free: true }];
  });

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

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { theaterRef.current = theater; }, [theater]);
  useEffect(() => { zoneCenterRef.current = zoneCenter; }, [zoneCenter]);
  useEffect(() => { zoneRadiusRef.current = zoneRadius; }, [zoneRadius]);
  useEffect(() => { assetRadiusRef.current = assetRadius; }, [assetRadius]);
  useEffect(() => { adUnitsRef.current = adUnits; }, [adUnits]);

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
        setAdUnits((prev) => [...prev, { id: Date.now(), key: adPlaceKey, x: Math.round(x), y: Math.round(y), health: 1, ammo: sys.missiles }]);
      }
    }
  }, [placementMode, spawnDroneKey, spawnDefKey, spawnCount, zoneCenter, zoneRadius]);

  const startSim = useCallback(() => {
    const sc = SCENARIOS[scenario];
    if (!sc) return;
    setPlacementMode(null);
    const { interceptors, attackers } = createDrones(sc, theater, attackSpawns, defenseSpawns);
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
  }, [scenario, theater, attackSpawns, defenseSpawns]);

  const runLoop = useCallback(() => {
    if (!runRef.current) return;
    if (pausedRef.current) { frameRef.current = requestAnimationFrame(runLoop); return; }

    let s = simRef.current;
    if (!s || s.done) { runRef.current = false; setRunning(false); setStatusText("COMPLETE"); return; }

    const steps = speedRef.current;
    for (let i = 0; i < steps; i++) {
      if (s.done) break;
      const prevKills = s.metrics.kills;
      const prevBreaches = s.metrics.breaches;
      s = simStep(s, zoneCenterRef.current, assetRadiusRef.current, adUnitsRef.current, zoneRadiusRef.current);
      const now = Date.now();
      // Kill impact flashes
      if (s.metrics.kills > prevKills) {
        for (const k of s.attackers) {
          if (k.status === "destroyed" && !k.flashed) {
            flashesRef.current.push({ x: k.x, y: k.y, time: now, type: "kill" });
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
          }
        }
      }
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
    flashesRef.current = flashesRef.current.filter((f) => now - f.time < (f.type === "breach" ? 1000 : 500));
    setSimState({ ...s });
    setKillFlashes([...flashesRef.current]);
    setAdUnits([...adUnitsRef.current]);

    if (s.done) { runRef.current = false; setRunning(false); setStatusText("COMPLETE"); }
    else { frameRef.current = requestAnimationFrame(runLoop); }
  }, []);

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
    setScenario("medium");
    setZoneCenter(DEFAULT_ZONE_CENTER);
    setZoneRadius(DEFAULT_ZONE_RADIUS);
    setAssetRadius(DEFAULT_ASSET_RADIUS);
    setDefenseBudget(100);
    const th = THEATERS.ukraine_kyiv;
    const sys = AD_SYSTEMS.find((s2) => s2.key === th.freeAD.key);
    setAdUnits([{ id: 0, key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, health: 1, ammo: sys?.missiles || 6, free: true }]);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => { const next = !p; pausedRef.current = next; setStatusText(next ? "PAUSED" : "RUNNING"); return next; });
  }, []);

  const stepOnce = useCallback(() => {
    if (!simRef.current || simRef.current.done) return;
    pausedRef.current = true; setPaused(true); setStatusText("PAUSED");
    const prevKills = simRef.current.metrics.kills;
    const prevBreaches = simRef.current.metrics.breaches;
    simRef.current = simStep(simRef.current, zoneCenterRef.current, assetRadiusRef.current, adUnitsRef.current, zoneRadiusRef.current);
    const now = Date.now();
    if (simRef.current.metrics.kills > prevKills) {
      for (const k of simRef.current.attackers) {
        if (k.status === "destroyed" && !k.flashed) {
          flashesRef.current.push({ x: k.x, y: k.y, time: now, type: "kill" });
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
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </Head>

      <style jsx global>{`
        .leaflet-container { background: #0a0a0f; }
      `}</style>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/#projects" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>&larr; Back to Projects</Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#4a9eff", letterSpacing: 0.5, margin: 0 }}>SWARM INTERCEPTION SIMULATOR</h1>
          </div>
          <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel */}
          <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <PanelTitle>Difficulty (Attack Wave)</PanelTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
              {Object.entries(SCENARIOS).map(([k, v]) => {
                const total = Object.values(v.attackers).reduce((s, n) => s + n, 0);
                const colorMap = { sandbox: "#4a9eff", medium: "#ff9800", hard: "#ff5555", nightmare: "#cc00cc" };
                const c = colorMap[k] || "#888";
                const active = scenario === k;
                return (
                  <button key={k} onClick={() => { setScenario(k); if (v.budget != null) setDefenseBudget(v.budget); }} disabled={running}
                    style={{
                      padding: "8px 6px", fontSize: 11, fontWeight: active ? 700 : 400, borderRadius: 4,
                      cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1,
                      border: `2px solid ${active ? c : "#2a2a35"}`,
                      background: active ? "rgba(255,255,255,0.05)" : "#1a1a24",
                      color: active ? c : "#888", textAlign: "center", lineHeight: 1.4,
                    }}>
                    {v.name}<br/><span style={{ fontSize: 9, opacity: 0.7 }}>{total} drones</span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const sc = SCENARIOS[scenario];
              if (!sc) return null;
              return (
                <div style={{ fontSize: 9, color: "#555", marginBottom: 6 }}>
                  {Object.entries(sc.attackers).map(([k, n]) => {
                    const p = DRONE_DB.attack.find((d) => d.key === k);
                    return <span key={k} style={{ marginRight: 6 }}>{p ? p.name.split(" ")[0] : k} x{n}</span>;
                  })}
                </div>
              );
            })()}

            <PanelTitle>Theater</PanelTitle>
            <select value={theater} onChange={(e) => {
              const newTh = e.target.value;
              setTheater(newTh);
              const th = THEATERS[newTh];
              if (th?.freeAD) {
                const sys = AD_SYSTEMS.find((s) => s.key === th.freeAD.key);
                setAdUnits((prev) => {
                  const userPlaced = prev.filter((ad) => !ad.free);
                  return [{ id: Date.now(), key: th.freeAD.key, x: th.freeAD.x, y: th.freeAD.y, health: 1, ammo: sys?.missiles || 6, free: true }, ...userPlaced];
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
              return (
                <div style={{ fontSize: 9, color: "#666", marginBottom: 4, lineHeight: 1.5 }}>
                  {sel.type} range | {sel.range}m | {sel.missiles} rounds | {(60 / sel.engageRate).toFixed(0)} tgt/min | Pk {(sel.pk * 100).toFixed(0)}% | ${formatUSD(sel.missileCost)}/shot
                </div>
              );
            })()}
            {adUnits.map((ad, i) => {
              const sys = AD_SYSTEMS.find((s) => s.key === ad.key);
              return (
                <div key={ad.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, fontSize: 10, color: sys?.color || "#888" }}>
                  <span style={{ flex: 1 }}>{sys?.name || ad.key} [{ad.ammo}]{ad.free ? " (free)" : ""}</span>
                  <button onClick={() => setAdUnits((prev) => prev.filter((_, j) => j !== i))} disabled={running}
                    style={{ background: "transparent", border: "1px solid #333", color: "#888", width: 18, height: 18, padding: 0, fontSize: 12, lineHeight: "16px", textAlign: "center", cursor: "pointer", borderRadius: 3 }}>&times;</button>
                </div>
              );
            })}

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
                {placementMode === "defense" ? "Placing DEF..." : `DEF (${defenseSpawns.length})`}
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

          {/* Map */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <SimMap simState={simState} theater={theater} killFlashes={killFlashes} breachPoints={breachPoints} attackSpawns={attackSpawns} defenseSpawns={defenseSpawns} placementMode={placementMode} onPlaceSpawn={placementMode ? handlePlaceSpawn : null} zoneCenter={zoneCenter} zoneRadius={zoneRadius} assetRadius={assetRadius} adUnits={adUnits} />
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

            {/* Defense Budget */}
            <PanelTitle>Defense Budget{scenario !== "sandbox" ? " (fixed)" : ""}</PanelTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <input type="range" min="50" max="5000" step="50" value={defenseBudget}
                onChange={(e) => setDefenseBudget(parseInt(e.target.value))}
                disabled={scenario !== "sandbox"}
                style={{ flex: 1, padding: 0, margin: 0, height: 18, opacity: scenario !== "sandbox" ? 0.5 : 1 }} />
              <span style={{ fontSize: 12, color: "#4a9eff", minWidth: 45, textAlign: "right", fontWeight: 600 }}>${defenseBudget}M</span>
            </div>
            {(() => {
              const budgetUSD = defenseBudget * 1e6;
              // Drone fleet cost: from sim state if running, from spawns/scenario if pre-sim
              let droneFleetCost = 0;
              if (simState) {
                droneFleetCost = simState.interceptors.reduce((s, i) => s + i.cost, 0);
              } else if (defenseSpawns.length > 0) {
                droneFleetCost = defenseSpawns.reduce((s, sp) => {
                  const p = DRONE_DB.interceptor.find((d) => d.key === sp.droneKey) || DRONE_DB.interceptor[0];
                  return s + p.cost * sp.count;
                }, 0);
              } else {
                const sc = SCENARIOS[scenario];
                if (sc) droneFleetCost = sc.interceptors * 200000;
              }
              const lostDroneCost = simState ? simState.interceptors.filter((i) => i.status === "expended").reduce((s, i) => s + i.cost, 0) : 0;
              const flightCost = m.defense_cost || 0;
              const adDeployCost = adUnits.reduce((s, ad) => { if (ad.free) return s; const sys = AD_SYSTEMS.find((s2) => s2.key === ad.key); return s + (sys ? sys.cost : 0); }, 0);
              const adDamageCost = adUnits.reduce((s, ad) => { if (ad.health <= 0) { const sys = AD_SYSTEMS.find((s2) => s2.key === ad.key); return s + (sys ? sys.cost * 0.5 : 0); } return s; }, 0);
              const breachDmg = m.breach_damage || 0;
              const totalSpent = droneFleetCost + lostDroneCost + flightCost + adDeployCost + adDamageCost + breachDmg;
              const remaining = budgetUSD - totalSpent;
              const pctUsed = budgetUSD > 0 ? Math.min(100, (totalSpent / budgetUSD) * 100) : 0;
              const overBudget = remaining < 0;
              const isDone = simState?.done;
              const isSandbox = scenario === "sandbox";
              const failed = isDone && !isSandbox && overBudget;

              return (
                <div style={{ fontSize: 11 }}>
                  {/* Budget bar */}
                  <div style={{ background: "#1a1a24", borderRadius: 4, height: 8, marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pctUsed, 100)}%`, background: pctUsed > 90 ? "#ff5555" : pctUsed > 70 ? "#ff9800" : "#4caf50", borderRadius: 4, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#4a9eff" }}>
                    <span>Drone Fleet</span><span>${formatUSD(droneFleetCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#ff5555" }}>
                    <span>Drones Lost</span><span>${formatUSD(lostDroneCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#ff9800" }}>
                    <span>Flight/Ops</span><span>${formatUSD(flightCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#cc8800" }}>
                    <span>Ground AD Deploy</span><span>${formatUSD(adDeployCost)}</span>
                  </div>
                  <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#884400" }}>
                    <span>Ground AD Damage</span><span>${formatUSD(adDamageCost)}</span>
                  </div>
                  {breachDmg > 0 && (
                    <div style={{ borderBottom: "1px solid #1a1a24", padding: "4px 0", display: "flex", justifyContent: "space-between", color: "#ff3333" }}>
                      <span>Breach Damage ({m.breaches})</span><span>${formatUSD(breachDmg)}</span>
                    </div>
                  )}
                  <div style={{ padding: "6px 0", borderTop: "2px solid #2a2a35", marginTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 12, color: overBudget ? "#ff5555" : "#4caf50" }}>
                    <span>Remaining</span><span>{overBudget ? "-" : ""}${formatUSD(Math.abs(remaining))}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#666", textAlign: "right" }}>{pctUsed.toFixed(0)}% of budget used</div>

                  {isDone && !isSandbox && (
                    <div style={{
                      marginTop: 8, padding: "8px 12px", borderRadius: 6, textAlign: "center",
                      fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                      background: failed ? "rgba(255, 85, 85, 0.1)" : "rgba(76, 175, 80, 0.1)",
                      border: `1px solid ${failed ? "#6a2a2a" : "#2a6a3a"}`,
                      color: failed ? "#ff5555" : "#4caf50",
                    }}>
                      {failed ? "DEFENSE FAILED - OVER BUDGET" : "DEFENSE SUCCESSFUL"}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
