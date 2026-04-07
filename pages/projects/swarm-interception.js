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
  kashmir: {
    name: "LoC Kashmir",
    bounds: { south: 33.5, north: 34.5, west: 73.5, east: 75.0 },
    mapCenter: [34.0, 74.25], mapZoom: 9,
    defensePos: [[5000, 5000]], attackOrigins: [[500, 500], [9500, 500], [500, 9500]],
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
    defensePos: [[5000, 5000]], attackOrigins: [[9000, 2000], [9000, 8000]],
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
    defensePos: [[5000, 5000]], attackOrigins: [[9000, 2000], [9000, 5000], [9000, 8000]],
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
        interceptors.push({
          id: iid++,
          x: sp.x + (Math.random() - 0.5) * 1000,
          y: sp.y + (Math.random() - 0.5) * 1000,
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
      a.breachX = a.x;
      a.breachY = a.y;
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
function SimMap({ simState, theater, killFlashes, breachPoints, attackSpawns, defenseSpawns, placementMode, onPlaceSpawn }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const droneLayerRef = useRef(null);
  const spawnLayerRef = useRef(null);
  const legacyLayerRef = useRef(null);
  const flashLayerRef = useRef(null);
  const LRef = useRef(null);
  const onPlaceRef = useRef(onPlaceSpawn);
  const theaterRef2 = useRef(theater);
  onPlaceRef.current = onPlaceSpawn;
  theaterRef2.current = theater;

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

      map.on("click", (e) => {
        const fn = onPlaceRef.current;
        if (!fn) return;
        const th2 = THEATERS[theaterRef2.current] || THEATERS.kashmir;
        let [x, y] = latLngToSim(e.latlng.lat, e.latlng.lng, th2.bounds);
        x = Math.max(0, Math.min(ARENA, x));
        y = Math.max(0, Math.min(ARENA, y));
        fn(x, y);
      });
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

    // Attack spawns (custom with type/count or theater defaults)
    if (atkCustom) {
      for (const sp of attackSpawns) {
        const ll = simToLL(sp.x, sp.y);
        const profile = DRONE_DB.attack.find((d) => d.key === sp.droneKey);
        const label = `${profile ? profile.name.split(" ")[0] : sp.droneKey} x${sp.count}`;
        L.circleMarker(ll, { radius: 10, color: "#ff5555", fillColor: "#ff5555", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
        L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [80, 16], iconAnchor: [40, -8],
            html: `<div style="color:#ff5555;font-size:9px;font-family:monospace;text-align:center;text-shadow:0 0 3px #000">${label}</div>` }),
          interactive: false,
        }).addTo(layer);
      }
    } else {
      for (const sp of th.attackOrigins) {
        const ll = simToLL(sp[0], sp[1]);
        L.circleMarker(ll, { radius: 10, color: "#662222", fillColor: "#662222", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
        L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [40, 16], iconAnchor: [20, -8],
            html: `<div style="color:#662222;font-size:9px;font-family:monospace;text-align:center">ATK</div>` }),
          interactive: false,
        }).addTo(layer);
      }
    }

    // Defense spawns
    if (defCustom) {
      for (const sp of defenseSpawns) {
        const ll = simToLL(sp.x, sp.y);
        const profile = DRONE_DB.interceptor.find((d) => d.key === sp.droneKey);
        const label = `${profile ? profile.name.split(" ")[0] : sp.droneKey} x${sp.count}`;
        L.circleMarker(ll, { radius: 10, color: "#4a9eff", fillColor: "#4a9eff", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
        L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [80, 16], iconAnchor: [40, -8],
            html: `<div style="color:#4a9eff;font-size:9px;font-family:monospace;text-align:center;text-shadow:0 0 3px #000">${label}</div>` }),
          interactive: false,
        }).addTo(layer);
      }
    } else {
      for (const sp of th.defensePos) {
        const ll = simToLL(sp[0], sp[1]);
        L.circleMarker(ll, { radius: 10, color: "#223366", fillColor: "#223366", fillOpacity: 0.3, weight: 2, opacity: 0.8 }).addTo(layer);
        L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [40, 16], iconAnchor: [20, -8],
            html: `<div style="color:#223366;font-size:9px;font-family:monospace;text-align:center">DEF</div>` }),
          interactive: false,
        }).addTo(layer);
      }
    }
  }, [theater, attackSpawns, defenseSpawns, simToLL]);

  // Draw legacy zone with breach gaps
  useEffect(() => {
    const L = LRef.current;
    const layer = legacyLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    const th = THEATERS[theater] || THEATERS.kashmir;
    const latSpan = th.bounds.north - th.bounds.south;
    const metersPerUnit = (latSpan * 111000) / ARENA;
    const geoRadius = LEGACY_RADIUS * metersPerUnit;

    // Use permanent breach points for gaps
    const breachAngles = breachPoints.map((bp) => bp.angle);

    const GAP_SIZE = 0.15; // radians (~8.5 degrees)

    if (breachAngles.length === 0) {
      // No breaches - draw full circle
      const center = simToLL(LEGACY_CENTER[0], LEGACY_CENTER[1]);
      L.circle(center, {
        radius: geoRadius, color: "#22aa22", fillColor: "#22aa22",
        fillOpacity: 0.04, weight: 2, opacity: 0.8,
      }).addTo(layer);
    } else {
      // Draw arc segments with gaps at breach points
      const SEGMENTS = 72;
      const segAngle = (Math.PI * 2) / SEGMENTS;
      for (let i = 0; i < SEGMENTS; i++) {
        const startAngle = (i / SEGMENTS) * Math.PI * 2 - Math.PI;
        const midAngle = startAngle + segAngle / 2;
        // Check if this segment overlaps any breach gap
        const inGap = breachAngles.some((ba) => {
          let diff = midAngle - ba;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          return Math.abs(diff) < GAP_SIZE;
        });
        if (inGap) continue;

        const points = [];
        for (let j = 0; j <= 4; j++) {
          const a = startAngle + (j / 4) * segAngle;
          const sx = LEGACY_CENTER[0] + Math.cos(a) * LEGACY_RADIUS;
          const sy = LEGACY_CENTER[1] + Math.sin(a) * LEGACY_RADIUS;
          points.push(simToLL(sx, sy));
        }
        L.polyline(points, { color: "#22aa22", weight: 2, opacity: 0.8, interactive: false }).addTo(layer);
      }

      // Draw grey impact marks at breach points on the circle
      for (const ba of breachAngles) {
        const bx = LEGACY_CENTER[0] + Math.cos(ba) * LEGACY_RADIUS;
        const by = LEGACY_CENTER[1] + Math.sin(ba) * LEGACY_RADIUS;
        const bll = simToLL(bx, by);
        L.circleMarker(bll, {
          radius: 6, color: "#666", fillColor: "#444",
          fillOpacity: 0.8, weight: 2, opacity: 0.9,
        }).addTo(layer);
        // Crack lines radiating from breach point
        for (let ci = -1; ci <= 1; ci++) {
          const crackAngle = ba + ci * 0.08;
          const cx1 = LEGACY_CENTER[0] + Math.cos(crackAngle) * (LEGACY_RADIUS - 80);
          const cy1 = LEGACY_CENTER[1] + Math.sin(crackAngle) * (LEGACY_RADIUS - 80);
          const cx2 = LEGACY_CENTER[0] + Math.cos(crackAngle) * (LEGACY_RADIUS + 80);
          const cy2 = LEGACY_CENTER[1] + Math.sin(crackAngle) * (LEGACY_RADIUS + 80);
          L.polyline([simToLL(cx1, cy1), simToLL(cx2, cy2)], {
            color: "#555", weight: 1, opacity: 0.6, interactive: false,
          }).addTo(layer);
        }
      }
    }

    // Label
    const center = simToLL(LEGACY_CENTER[0], LEGACY_CENTER[1]);
    L.marker(center, {
      icon: L.divIcon({
        className: "", iconSize: [150, 30], iconAnchor: [75, 15],
        html: '<div style="color:#22aa22;font-size:10px;font-family:monospace;text-align:center;white-space:nowrap;text-shadow:0 0 4px #000">LEGACY DEFENSE ZONE<br>(Patriot / NASAMS)</div>',
      }),
      interactive: false,
    }).addTo(layer);
  }, [theater, simToLL, breachPoints]);

  // Draw drones, pursuit lines, and kill flashes
  useEffect(() => {
    const L = LRef.current;
    const droneLayer = droneLayerRef.current;
    const flashLayer = flashLayerRef.current;
    if (!L || !droneLayer) return;
    droneLayer.clearLayers();

    if (!simState) return;

    // Attackers
    for (const d of simState.attackers) {
      if (d.status === "breached") continue;
      const ll = simToLL(d.x, d.y);
      const colors = { cheap: "#ff6666", medium: "#cc3333", expensive: "#881111" };
      const sizes = { cheap: 4, medium: 5, expensive: 6 };
      const color = d.status !== "active" ? "#444" : (colors[d.threat] || "#ff6666");
      const radius = d.status !== "active" ? 2 : (sizes[d.threat] || 4);
      L.circleMarker(ll, {
        radius, color, fillColor: color, fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);
    }

    // Interceptors + pursuit lines
    for (const d of simState.interceptors) {
      const ll = simToLL(d.x, d.y);
      const color = d.status === "active" ? "#4a9eff" : "#444";
      const radius = d.status === "active" ? 5 : 2;
      L.circleMarker(ll, {
        radius, color, fillColor: color, fillOpacity: 0.9, weight: 1, opacity: 1,
      }).addTo(droneLayer);

      // Pursuit line to target
      if (d.status === "active" && d.targetId != null) {
        const target = simState.attackers.find((a) => a.id === d.targetId && a.status === "active");
        if (target) {
          const tll = simToLL(target.x, target.y);
          L.polyline([ll, tll], {
            color: "#4a9eff", weight: 1, opacity: 0.4, dashArray: "4 4", interactive: false,
          }).addTo(droneLayer);
        }
      }
    }

    // Kill impact pulses and breach markers
    if (flashLayer) {
      flashLayer.clearLayers();
      const now = Date.now();
      for (const flash of killFlashes) {
        const age = now - flash.time;
        const ll = simToLL(flash.x, flash.y);

        if (flash.type === "breach") {
          // Breach: grey impact on defense line, fading warning
          if (age > 3000) continue;
          const progress = age / 3000;
          // Red warning pulse at breach point on line
          const ba = Math.atan2(flash.y - LEGACY_CENTER[1], flash.x - LEGACY_CENTER[0]);
          const bx = LEGACY_CENTER[0] + Math.cos(ba) * LEGACY_RADIUS;
          const by = LEGACY_CENTER[1] + Math.sin(ba) * LEGACY_RADIUS;
          const bll = simToLL(bx, by);
          if (progress < 0.5) {
            const pulse = Math.sin(age / 100 * Math.PI) * 0.5 + 0.5;
            L.circleMarker(bll, {
              radius: 8 + pulse * 6,
              color: "#ff3333", fillColor: "#ff0000",
              fillOpacity: (1 - progress * 2) * 0.5, weight: 2, opacity: (1 - progress * 2) * pulse,
            }).addTo(flashLayer);
          }
          // Breach label
          if (progress < 0.4) {
            L.marker(bll, {
              icon: L.divIcon({
                className: "", iconSize: [60, 16], iconAnchor: [30, -14],
                html: `<div style="color:#ff0000;font-size:10px;font-family:monospace;font-weight:bold;text-align:center;text-shadow:0 0 4px #000;opacity:${1 - progress * 2.5}">BREACH</div>`,
              }),
              interactive: false,
            }).addTo(flashLayer);
          }
        } else {
          // Kill impact: pulsing concentric rings
          if (age > 800) continue;
          const progress = age / 800;
          const pulse = Math.sin(age / 60 * Math.PI) * 0.3 + 0.7;
          // Outer pulsing ring
          L.circleMarker(ll, {
            radius: 8 + progress * 18,
            color: "#ffc800", fillColor: "transparent",
            fillOpacity: 0, weight: 2, opacity: (1 - progress) * pulse,
          }).addTo(flashLayer);
          // Inner pulsing ring
          L.circleMarker(ll, {
            radius: 4 + progress * 8,
            color: "#ff8800", fillColor: "#ff6600",
            fillOpacity: (1 - progress) * 0.5 * pulse, weight: 1.5, opacity: (1 - progress) * pulse,
          }).addTo(flashLayer);
          // Center dot
          if (progress < 0.6) {
            L.circleMarker(ll, {
              radius: 3,
              color: "#ffffff", fillColor: "#ffffff",
              fillOpacity: (1 - progress * 1.6) * pulse, weight: 0, opacity: 1,
            }).addTo(flashLayer);
          }
        }
      }
    }
  }, [simState, killFlashes, simToLL]);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", cursor: placementMode ? "crosshair" : "grab" }}
    />
  );
}

// ── Main page ──
export default function SwarmInterception() {
  const [theater, setTheater] = useState("kashmir");
  const [scenario, setScenario] = useState("default_30v20");
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

  const simRef = useRef(null);
  const runRef = useRef(false);
  const pausedRef = useRef(false);
  const speedRef = useRef(3);
  const flashesRef = useRef([]);
  const frameRef = useRef(null);
  const theaterRef = useRef(theater);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { theaterRef.current = theater; }, [theater]);

  const handlePlaceSpawn = useCallback((x, y) => {
    if (placementMode === "attack") {
      setAttackSpawns((prev) => [...prev, { x, y, droneKey: spawnDroneKey, count: spawnCount }]);
    } else if (placementMode === "defense") {
      const dx = x - LEGACY_CENTER[0];
      const dy = y - LEGACY_CENTER[1];
      if (Math.sqrt(dx * dx + dy * dy) > LEGACY_RADIUS) return;
      setDefenseSpawns((prev) => [...prev, { x, y, droneKey: spawnDefKey, count: spawnCount }]);
    }
  }, [placementMode, spawnDroneKey, spawnDefKey, spawnCount]);

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
      const prevBreaches = s.metrics.legacy_breaches;
      s = simStep(s);
      const now = Date.now();
      // Kill impact flashes
      if (s.metrics.kills > prevKills) {
        const newKilled = s.attackers.filter((a) => a.status === "destroyed");
        for (const k of newKilled.slice(-(s.metrics.kills - prevKills))) {
          flashesRef.current.push({ x: k.x, y: k.y, time: now, type: "kill" });
        }
      }
      // Breach flashes
      if (s.metrics.legacy_breaches > prevBreaches) {
        const newBreached = s.attackers.filter((a) => a.status === "breached" && a.breachX != null);
        const newBPs = [];
        for (const b of newBreached.slice(-(s.metrics.legacy_breaches - prevBreaches))) {
          flashesRef.current.push({ x: b.breachX, y: b.breachY, time: now, type: "breach" });
          newBPs.push({ x: b.breachX, y: b.breachY, angle: Math.atan2(b.breachY - LEGACY_CENTER[1], b.breachX - LEGACY_CENTER[0]) });
          b.breachX = null;
        }
        if (newBPs.length > 0) setBreachPoints((prev) => [...prev, ...newBPs]);
      }
    }

    simRef.current = s;
    const now = Date.now();
    flashesRef.current = flashesRef.current.filter((f) => now - f.time < (f.type === "breach" ? 3000 : 800));
    setSimState({ ...s });
    setKillFlashes([...flashesRef.current]);

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
    setScenario("default_30v20");
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => { const next = !p; pausedRef.current = next; setStatusText(next ? "PAUSED" : "RUNNING"); return next; });
  }, []);

  const stepOnce = useCallback(() => {
    if (!simRef.current || simRef.current.done) return;
    pausedRef.current = true; setPaused(true); setStatusText("PAUSED");
    const prevKills = simRef.current.metrics.kills;
    const prevBreaches = simRef.current.metrics.legacy_breaches;
    simRef.current = simStep(simRef.current);
    const now = Date.now();
    if (simRef.current.metrics.kills > prevKills) {
      const newKilled = simRef.current.attackers.filter((a) => a.status === "destroyed");
      for (const k of newKilled.slice(-(simRef.current.metrics.kills - prevKills))) {
        flashesRef.current.push({ x: k.x, y: k.y, time: now, type: "kill" });
      }
    }
    if (simRef.current.metrics.legacy_breaches > prevBreaches) {
      const newBreached = simRef.current.attackers.filter((a) => a.status === "breached" && a.breachX != null);
      const newBPs = [];
      for (const b of newBreached.slice(-(simRef.current.metrics.legacy_breaches - prevBreaches))) {
        flashesRef.current.push({ x: b.breachX, y: b.breachY, time: now, type: "breach" });
        newBPs.push({ x: b.breachX, y: b.breachY, angle: Math.atan2(b.breachY - LEGACY_CENTER[1], b.breachX - LEGACY_CENTER[0]) });
        b.breachX = null;
      }
      if (newBPs.length > 0) setBreachPoints((prev) => [...prev, ...newBPs]);
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
            <SimMap simState={simState} theater={theater} killFlashes={killFlashes} breachPoints={breachPoints} attackSpawns={attackSpawns} defenseSpawns={defenseSpawns} placementMode={placementMode} onPlaceSpawn={placementMode ? handlePlaceSpawn : null} />
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
