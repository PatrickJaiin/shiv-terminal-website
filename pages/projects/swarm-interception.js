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

// ── Theater configs with geographic bounds ──
const THEATERS = {
  default: {
    name: "Default (abstract arena)",
    bounds: { south: 27.95, north: 28.05, west: 44.95, east: 45.05 },
    mapCenter: [28.0, 45.0], mapZoom: 12,
    defensePos: [[5000, 5000]], attackOrigins: [[0, 0], [10000, 0], [0, 10000], [10000, 10000]],
  },
  kashmir: {
    name: "LoC Kashmir",
    bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 },
    mapCenter: [34.0, 74.25], mapZoom: 9,
    defensePos: [[5000, 6000]], attackOrigins: [[500, 500], [9500, 500], [500, 9500]],
  },
  israel_iran: {
    name: "Israel-Iran",
    bounds: { south: 31.0, north: 33.0, west: 34.0, east: 36.0 },
    mapCenter: [32.0, 35.0], mapZoom: 8,
    defensePos: [[5000, 5000]], attackOrigins: [[9500, 500], [9500, 9500], [9500, 5000]],
  },
  red_sea: {
    name: "Red Sea",
    bounds: { south: 12.0, north: 15.0, west: 42.0, east: 45.0 },
    mapCenter: [13.5, 43.5], mapZoom: 7,
    defensePos: [[3000, 5000]], attackOrigins: [[9000, 2000], [9000, 8000]],
  },
  ukraine_kyiv: {
    name: "Ukraine Kyiv",
    bounds: { south: 49.0, north: 51.0, west: 30.0, east: 33.0 },
    mapCenter: [50.0, 31.5], mapZoom: 8,
    defensePos: [[5000, 5000]], attackOrigins: [[9500, 1000], [9500, 5000], [9500, 9000], [7000, 200]],
  },
  taiwan_strait: {
    name: "Taiwan Strait",
    bounds: { south: 23.0, north: 26.0, west: 119.0, east: 122.0 },
    mapCenter: [24.5, 120.5], mapZoom: 7,
    defensePos: [[2000, 5000]], attackOrigins: [[9000, 2000], [9000, 5000], [9000, 8000]],
  },
};

const SCENARIOS = {
  default_30v20: { name: "default_30v20", attackers: { fpv_kamikaze: 15, shahed_136: 10, lancet_3: 5 }, interceptors: 20 },
  massive_100v50: { name: "massive_100v50", attackers: { fpv_kamikaze: 50, shahed_136: 30, lancet_3: 15, mohajer_6: 5 }, interceptors: 50 },
  cruise_strike: { name: "cruise_missile_strike", attackers: { mohajer_6: 5, orion: 3, wing_loong: 2 }, interceptors: 30 },
  mixed_wave: { name: "mixed_wave", attackers: { fpv_kamikaze: 20, shahed_136: 10, lancet_3: 8, mohajer_6: 2 }, interceptors: 25 },
};

const KILL_RADIUS = 120;
const LEGACY_RADIUS = 2000;
const LEGACY_CENTER = [5000, 5000];
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
  const th = THEATERS[theater] || THEATERS.default;
  const center = [5000, 5000];
  const attackOrigins = customAttackSpawns.length > 0 ? customAttackSpawns : th.attackOrigins;
  const defensePositions = customDefenseSpawns.length > 0 ? customDefenseSpawns : th.defensePos;

  const attackerList = [];
  let id = 100;
  for (const [key, count] of Object.entries(scenario.attackers)) {
    const profile = DRONE_DB.attack.find((d) => d.key === key);
    if (!profile) continue;
    for (let i = 0; i < count; i++) {
      const origin = attackOrigins[Math.floor(Math.random() * attackOrigins.length)];
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

  const interceptors = [];
  for (let i = 0; i < scenario.interceptors; i++) {
    const dp = defensePositions[Math.floor(Math.random() * defensePositions.length)];
    interceptors.push({
      id: i,
      x: dp[0] + (Math.random() - 0.5) * 1000,
      y: dp[1] + (Math.random() - 0.5) * 1000,
      speed: 2.0,
      cost: 200000,
      status: "active",
      heading: 0,
      type: "interceptor",
      targetId: null,
    });
  }
  return { interceptors, attackers: attackerList };
}

// ── Simulation step ──
function simStep(state) {
  const { interceptors, attackers, metrics, step } = state;

  for (const a of attackers) {
    if (a.status !== "active") continue;
    const dx = LEGACY_CENTER[0] - a.x;
    const dy = LEGACY_CENTER[1] - a.y;
    const angle = Math.atan2(dy, dx);
    a.heading = a.heading * 0.95 + angle * 0.05 + (Math.random() - 0.5) * 0.03;
    a.x += Math.cos(a.heading) * a.speed;
    a.y += Math.sin(a.heading) * a.speed;
    if (dist(a, { x: LEGACY_CENTER[0], y: LEGACY_CENTER[1] }) < LEGACY_RADIUS * 0.3) {
      a.status = "breached";
      metrics.legacy_breaches++;
      metrics.misses++;
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

  const activeInt = interceptors.filter((i) => i.status === "active").length;
  const activeThreats = attackers.filter((a) => a.status === "active").length;
  return {
    interceptors, attackers,
    metrics: { ...metrics, active_interceptors: activeInt, active_threats: activeThreats },
    step: step + 1,
    done: activeThreats === 0 || activeInt === 0,
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
function SimMap({ simState, theater, killFlashes, attackSpawns, defenseSpawns, placementMode, onMapClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const droneLayerRef = useRef(null);
  const spawnLayerRef = useRef(null);
  const legacyLayerRef = useRef(null);
  const flashLayerRef = useRef(null);
  const LRef = useRef(null);

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
      const th = THEATERS[theater] || THEATERS.default;

      const map = Leaf.map(mapRef.current, {
        center: th.mapCenter,
        zoom: th.mapZoom,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      // Satellite tiles
      Leaf.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri Satellite", maxZoom: 18 }
      ).addTo(map);

      // Streets overlay
      Leaf.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "OSM", maxZoom: 19, opacity: 0.35 }
      ).addTo(map);

      droneLayerRef.current = Leaf.layerGroup().addTo(map);
      spawnLayerRef.current = Leaf.layerGroup().addTo(map);
      legacyLayerRef.current = Leaf.layerGroup().addTo(map);
      flashLayerRef.current = Leaf.layerGroup().addTo(map);

      // Click handler for spawn placement
      map.on("click", (e) => {
        if (onMapClick.current) {
          const th2 = THEATERS[onMapClick.theaterRef?.current] || THEATERS.default;
          const [x, y] = latLngToSim(e.latlng.lat, e.latlng.lng, th2.bounds);
          if (x >= 0 && x <= ARENA && y >= 0 && y <= ARENA) {
            onMapClick.current(x, y);
          }
        }
      });
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Update map view when theater changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const th = THEATERS[theater] || THEATERS.default;
    map.setView(th.mapCenter, th.mapZoom);
  }, [theater]);

  // Draw spawn markers
  useEffect(() => {
    const L = LRef.current;
    const layer = spawnLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const th = THEATERS[theater] || THEATERS.default;
    const atkPoints = attackSpawns.length > 0 ? attackSpawns : th.attackOrigins;
    const defPoints = defenseSpawns.length > 0 ? defenseSpawns : th.defensePos;
    const atkCustom = attackSpawns.length > 0;
    const defCustom = defenseSpawns.length > 0;

    for (const sp of atkPoints) {
      const ll = simToLatLng(sp[0], sp[1], th.bounds);
      L.circleMarker(ll, {
        radius: 10, color: atkCustom ? "#ff5555" : "#662222", fillColor: atkCustom ? "#ff5555" : "#662222",
        fillOpacity: 0.3, weight: 2, opacity: 0.8,
      }).addTo(layer);
      L.marker(ll, {
        icon: L.divIcon({
          className: "", iconSize: [40, 16], iconAnchor: [20, -8],
          html: `<div style="color:${atkCustom ? "#ff5555" : "#662222"};font-size:9px;font-family:monospace;text-align:center">ATK</div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
    for (const sp of defPoints) {
      const ll = simToLatLng(sp[0], sp[1], th.bounds);
      L.circleMarker(ll, {
        radius: 10, color: defCustom ? "#4a9eff" : "#223366", fillColor: defCustom ? "#4a9eff" : "#223366",
        fillOpacity: 0.3, weight: 2, opacity: 0.8,
      }).addTo(layer);
      L.marker(ll, {
        icon: L.divIcon({
          className: "", iconSize: [40, 16], iconAnchor: [20, -8],
          html: `<div style="color:${defCustom ? "#4a9eff" : "#223366"};font-size:9px;font-family:monospace;text-align:center">DEF</div>`,
        }),
        interactive: false,
      }).addTo(layer);
    }
  }, [theater, attackSpawns, defenseSpawns]);

  // Draw legacy zone
  useEffect(() => {
    const L = LRef.current;
    const layer = legacyLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const th = THEATERS[theater] || THEATERS.default;
    const center = simToLatLng(LEGACY_CENTER[0], LEGACY_CENTER[1], th.bounds);

    // Scale legacy radius from sim meters to approximate geographic meters
    const latSpan = th.bounds.north - th.bounds.south;
    const metersPerUnit = (latSpan * 111000) / ARENA;
    const geoRadius = LEGACY_RADIUS * metersPerUnit;

    L.circle(center, {
      radius: geoRadius, color: "#22aa22", fillColor: "#22aa22",
      fillOpacity: 0.04, weight: 2, opacity: 0.8,
    }).addTo(layer);

    L.marker(center, {
      icon: L.divIcon({
        className: "", iconSize: [150, 30], iconAnchor: [75, 15],
        html: '<div style="color:#22aa22;font-size:10px;font-family:monospace;text-align:center;white-space:nowrap;text-shadow:0 0 4px #000">LEGACY DEFENSE ZONE<br>(Patriot / NASAMS)</div>',
      }),
      interactive: false,
    }).addTo(layer);
  }, [theater]);

  // Draw drones and kill flashes
  useEffect(() => {
    const L = LRef.current;
    const droneLayer = droneLayerRef.current;
    const flashLayer = flashLayerRef.current;
    if (!L || !droneLayer) return;
    droneLayer.clearLayers();

    if (!simState) return;
    const th = THEATERS[theater] || THEATERS.default;

    // Attackers
    for (const d of simState.attackers) {
      if (d.status === "breached") continue;
      const ll = simToLatLng(d.x, d.y, th.bounds);
      const colors = { cheap: "#ff6666", medium: "#cc3333", expensive: "#881111" };
      const sizes = { cheap: 4, medium: 5, expensive: 6 };
      const color = d.status !== "active" ? "#444" : (colors[d.threat] || "#ff6666");
      const radius = d.status !== "active" ? 2 : (sizes[d.threat] || 4);
      L.circleMarker(ll, {
        radius, color, fillColor: color, fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Interceptors
    for (const d of simState.interceptors) {
      const ll = simToLatLng(d.x, d.y, th.bounds);
      const color = d.status === "active" ? "#4a9eff" : "#444";
      const radius = d.status === "active" ? 5 : 2;
      L.circleMarker(ll, {
        radius, color, fillColor: color, fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Kill flashes
    if (flashLayer) {
      flashLayer.clearLayers();
      const now = Date.now();
      for (const flash of killFlashes) {
        const age = now - flash.time;
        if (age > 500) continue;
        const progress = age / 500;
        const ll = simToLatLng(flash.x, flash.y, th.bounds);
        L.circleMarker(ll, {
          radius: 10 + progress * 20,
          color: "#ffc800", fillColor: "#ff8800",
          fillOpacity: (1 - progress) * 0.6, weight: 2, opacity: 1 - progress,
        }).addTo(flashLayer);
      }
    }
  }, [simState, theater, killFlashes]);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", cursor: placementMode ? "crosshair" : "grab" }}
    />
  );
}

// ── Main page ──
export default function SwarmInterception() {
  const [theater, setTheater] = useState("default");
  const [scenario, setScenario] = useState("default_30v20");
  const [simState, setSimState] = useState(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [dbTab, setDbTab] = useState("attack");
  const [killFlashes, setKillFlashes] = useState([]);
  const [statusText, setStatusText] = useState("READY");
  const [attackSpawns, setAttackSpawns] = useState([]);
  const [defenseSpawns, setDefenseSpawns] = useState([]);
  const [placementMode, setPlacementMode] = useState(null);

  const simRef = useRef(null);
  const runRef = useRef(false);
  const pausedRef = useRef(false);
  const speedRef = useRef(10);
  const flashesRef = useRef([]);
  const frameRef = useRef(null);
  const theaterRef = useRef(theater);

  // Mutable callback ref for map clicks
  const mapClickRef = useRef(null);
  mapClickRef.theaterRef = theaterRef;

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { theaterRef.current = theater; }, [theater]);

  useEffect(() => {
    if (placementMode) {
      mapClickRef.current = (x, y) => {
        if (placementMode === "attack") {
          setAttackSpawns((prev) => [...prev, [x, y]]);
        } else {
          setDefenseSpawns((prev) => [...prev, [x, y]]);
        }
      };
    } else {
      mapClickRef.current = null;
    }
  }, [placementMode]);

  const startSim = useCallback(() => {
    const sc = SCENARIOS[scenario];
    if (!sc) return;
    setPlacementMode(null);
    const { interceptors, attackers } = createDrones(sc, theater, attackSpawns, defenseSpawns);
    const initial = {
      interceptors, attackers,
      metrics: { kills: 0, misses: 0, legacy_breaches: 0, defense_cost: 0, threat_value_destroyed: 0, active_interceptors: interceptors.length, active_threats: attackers.length },
      step: 0, done: false,
    };
    simRef.current = initial;
    flashesRef.current = [];
    setKillFlashes([]);
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
      s = simStep(s);
      if (s.metrics.kills > prevKills) {
        const newKilled = s.attackers.filter((a) => a.status === "destroyed");
        for (const k of newKilled.slice(-(s.metrics.kills - prevKills))) {
          flashesRef.current.push({ x: k.x, y: k.y, time: Date.now() });
        }
      }
    }

    simRef.current = s;
    const now = Date.now();
    flashesRef.current = flashesRef.current.filter((f) => now - f.time < 600);
    setSimState({ ...s });
    setKillFlashes([...flashesRef.current]);

    if (s.done) { runRef.current = false; setRunning(false); setStatusText("COMPLETE"); }
    else { frameRef.current = requestAnimationFrame(runLoop); }
  }, []);

  const stopSim = useCallback(() => {
    runRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setRunning(false); setPaused(false); setSimState(null); setStatusText("READY");
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => { const next = !p; pausedRef.current = next; setStatusText(next ? "PAUSED" : "RUNNING"); return next; });
  }, []);

  const stepOnce = useCallback(() => {
    if (!simRef.current || simRef.current.done) return;
    pausedRef.current = true; setPaused(true); setStatusText("PAUSED");
    const prevKills = simRef.current.metrics.kills;
    simRef.current = simStep(simRef.current);
    if (simRef.current.metrics.kills > prevKills) {
      const newKilled = simRef.current.attackers.filter((a) => a.status === "destroyed");
      for (const k of newKilled.slice(-(simRef.current.metrics.kills - prevKills))) {
        flashesRef.current.push({ x: k.x, y: k.y, time: Date.now() });
      }
    }
    setSimState({ ...simRef.current });
    setKillFlashes([...flashesRef.current]);
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
            <PanelTitle>Scenario</PanelTitle>
            <select value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={running}
              style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}>
              {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>

            <PanelTitle>Theater</PanelTitle>
            <select value={theater} onChange={(e) => setTheater(e.target.value)} disabled={running}
              style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}>
              {Object.entries(THEATERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>

            <PanelTitle>Spawn Points</PanelTitle>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Click map to place. Empty = theater defaults.</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button onClick={() => setPlacementMode(placementMode === "attack" ? null : "attack")} disabled={running}
                style={{ ...btnBase, background: placementMode === "attack" ? "#4a1a1a" : "#1a2a40", borderColor: placementMode === "attack" ? "#ff5555" : "#2a4a6a", color: placementMode === "attack" ? "#ff5555" : "#e0e0e0", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer", fontSize: 11 }}>
                {placementMode === "attack" ? "Placing ATK..." : `ATK Spawns (${attackSpawns.length})`}
              </button>
              <button onClick={() => setPlacementMode(placementMode === "defense" ? null : "defense")} disabled={running}
                style={{ ...btnBase, background: placementMode === "defense" ? "#1a3a4a" : "#1a2a40", borderColor: placementMode === "defense" ? "#4a9eff" : "#2a4a6a", color: placementMode === "defense" ? "#4a9eff" : "#e0e0e0", opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer", fontSize: 11 }}>
                {placementMode === "defense" ? "Placing DEF..." : `DEF Spawns (${defenseSpawns.length})`}
              </button>
            </div>
            {(attackSpawns.length > 0 || defenseSpawns.length > 0) && (
              <button onClick={() => { setAttackSpawns([]); setDefenseSpawns([]); setPlacementMode(null); }} disabled={running}
                style={{ ...btnBase, background: "#1a1a24", borderColor: "#2a2a35", color: "#888", fontSize: 11, opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}>
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
            <LegendItem color="#22aa22" label="Legacy defense zone" hollow />
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
            <SimMap simState={simState} theater={theater} killFlashes={killFlashes} attackSpawns={attackSpawns} defenseSpawns={defenseSpawns} placementMode={placementMode} onMapClick={mapClickRef} />
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
            <PanelTitle>Economics</PanelTitle>
            <Metric label="Defense Cost" value={`$${formatUSD(m.defense_cost || 0)}`} color="orange" />
            <Metric label="Threat Value Destroyed" value={`$${formatUSD(m.threat_value_destroyed || 0)}`} color="green" />
            <Metric label="Cost Efficiency" value={eff === "-" ? "-" : `${eff}x`} />
            <PanelTitle>Legacy Zone</PanelTitle>
            <Metric label="Breaches" value={m.legacy_breaches || 0} color="red" />
            <PanelTitle>Interceptor Attrition</PanelTitle>
            <Metric label="Lost" value={lost} color="red" />
            <Metric label="Attrition Rate" value={`${attrition}%`} />
          </div>
        </div>
      </div>
    </>
  );
}
