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

// ── Theater configs ──
const THEATERS = {
  default: { name: "Default (abstract arena)", center: [5000, 5000], defensePos: [[5000, 5000]], attackOrigins: [[0, 0], [10000, 0], [0, 10000], [10000, 10000]], color: "#1a1a24" },
  kashmir: { name: "LoC Kashmir", center: [5000, 5000], defensePos: [[5000, 6000]], attackOrigins: [[500, 500], [9500, 500], [500, 9500]], color: "#1a2418" },
  israel_iran: { name: "Israel-Iran", center: [5000, 5000], defensePos: [[5000, 5000]], attackOrigins: [[9500, 500], [9500, 9500], [9500, 5000]], color: "#241a18" },
  red_sea: { name: "Red Sea", center: [5000, 5000], defensePos: [[3000, 5000]], attackOrigins: [[9000, 2000], [9000, 8000]], color: "#181a24" },
  ukraine_kyiv: { name: "Ukraine Kyiv", center: [5000, 5000], defensePos: [[5000, 5000]], attackOrigins: [[9500, 1000], [9500, 5000], [9500, 9000], [7000, 200]], color: "#24241a" },
  taiwan_strait: { name: "Taiwan Strait", center: [5000, 5000], defensePos: [[2000, 5000]], attackOrigins: [[9000, 2000], [9000, 5000], [9000, 8000]], color: "#1a2024" },
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

// ── Create drones for a scenario ──
function createDrones(scenario, theater, customAttackSpawns, customDefenseSpawns) {
  const th = THEATERS[theater] || THEATERS.default;
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
        heading: Math.atan2(th.center[1] - origin[1], th.center[0] - origin[0]) + (Math.random() - 0.5) * 0.8,
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

  // Move attackers toward legacy center with some wander
  for (const a of attackers) {
    if (a.status !== "active") continue;
    const dx = LEGACY_CENTER[0] - a.x;
    const dy = LEGACY_CENTER[1] - a.y;
    const angle = Math.atan2(dy, dx);
    a.heading = a.heading * 0.95 + angle * 0.05 + (Math.random() - 0.5) * 0.03;
    a.x += Math.cos(a.heading) * a.speed;
    a.y += Math.sin(a.heading) * a.speed;

    // Check legacy breach
    if (dist(a, { x: LEGACY_CENTER[0], y: LEGACY_CENTER[1] }) < LEGACY_RADIUS * 0.3) {
      a.status = "breached";
      metrics.legacy_breaches++;
      metrics.misses++;
    }
  }

  // Assign targets and move interceptors
  const activeAttackers = attackers.filter((a) => a.status === "active");
  for (const int of interceptors) {
    if (int.status !== "active") continue;

    // Find or reassign target
    let target = activeAttackers.find((a) => a.id === int.targetId);
    if (!target) {
      // Find closest unassigned or closest active attacker
      let best = null;
      let bestDist = Infinity;
      for (const a of activeAttackers) {
        const d = dist(int, a);
        if (d < bestDist) {
          bestDist = d;
          best = a;
        }
      }
      if (best) {
        int.targetId = best.id;
        target = best;
      }
    }

    if (target) {
      const dx = target.x - int.x;
      const dy = target.y - int.y;
      const angle = Math.atan2(dy, dx);
      // Proportional navigation
      int.heading = angle;
      int.x += Math.cos(int.heading) * int.speed;
      int.y += Math.sin(int.heading) * int.speed;

      // Check kill
      if (dist(int, target) < KILL_RADIUS) {
        target.status = "destroyed";
        metrics.kills++;
        metrics.threat_value_destroyed += target.cost;
        metrics.defense_cost += int.cost * 0.1; // engagement cost
        int.targetId = null;
        // 30% chance interceptor is expended (kinetic ram)
        if (Math.random() < 0.3) {
          int.status = "expended";
        }
      }
    }
  }

  const activeInt = interceptors.filter((i) => i.status === "active").length;
  const activeThreats = attackers.filter((a) => a.status === "active").length;
  const done = activeThreats === 0 || activeInt === 0;

  return {
    interceptors,
    attackers,
    metrics: {
      ...metrics,
      active_interceptors: activeInt,
      active_threats: activeThreats,
    },
    step: step + 1,
    done,
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
        <span>{speed} km/h</span>
        <span>${formatUSD(cost)}</span>
        <span>RCS: {rcs} m2</span>
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

// ── Canvas renderer ──
function SimCanvas({ simState, theater, killFlashes, attackSpawns, defenseSpawns, placementMode, onCanvasClick }) {
  const canvasRef = useRef(null);
  const th = THEATERS[theater] || THEATERS.default;

  const handleClick = useCallback((e) => {
    if (!onCanvasClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ARENA;
    const y = ((e.clientY - rect.top) / rect.height) * ARENA;
    onCanvasClick(x, y);
  }, [onCanvasClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = th.color;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#2a2a35";
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= 20; gx++) {
      const x = (gx / 20) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let gy = 0; gy <= 20; gy++) {
      const y = (gy / 20) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Legacy zone
    const cx = (LEGACY_CENTER[0] / ARENA) * w;
    const cy = (LEGACY_CENTER[1] / ARENA) * h;
    const r = (LEGACY_RADIUS / ARENA) * Math.min(w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#22aa22";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(34, 170, 34, 0.04)";
    ctx.fill();
    ctx.font = "10px monospace";
    ctx.fillStyle = "#22aa22";
    ctx.textAlign = "center";
    ctx.fillText("LEGACY DEFENSE ZONE", cx, cy - 8);
    ctx.fillText("(Patriot / NASAMS)", cx, cy + 8);

    // Theater label
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#333";
    ctx.textAlign = "left";
    ctx.fillText(th.name.toUpperCase(), 10, 20);

    // Draw spawn markers (pre-sim)
    for (const sp of attackSpawns) {
      const sx = (sp[0] / ARENA) * w;
      const sy = (sp[1] / ARENA) * h;
      // Red diamond
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = "#ff5555";
      ctx.lineWidth = 2;
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.fillStyle = "rgba(255, 85, 85, 0.15)";
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.font = "9px monospace";
      ctx.fillStyle = "#ff5555";
      ctx.textAlign = "center";
      ctx.fillText("ATK", sx, sy + 20);
    }
    for (const sp of defenseSpawns) {
      const sx = (sp[0] / ARENA) * w;
      const sy = (sp[1] / ARENA) * h;
      // Blue shield shape
      ctx.strokeStyle = "#4a9eff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(74, 158, 255, 0.15)";
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.font = "9px monospace";
      ctx.fillStyle = "#4a9eff";
      ctx.textAlign = "center";
      ctx.fillText("DEF", sx, sy + 20);
    }

    if (!simState) {
      // Idle state message
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#444";
      ctx.textAlign = "center";
      const msg = placementMode ? `Click on map to place ${placementMode === "attack" ? "ATTACK" : "DEFENSE"} spawn point` : "Select a scenario and press Start";
      ctx.fillText(msg, w / 2, h / 2);
      return;
    }

    // Kill flashes
    const now = Date.now();
    for (const flash of killFlashes) {
      const age = now - flash.time;
      if (age > 500) continue;
      const progress = age / 500;
      const fx = (flash.x / ARENA) * w;
      const fy = (flash.y / ARENA) * h;
      const fr = 8 + progress * 25;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 136, 0, ${(1 - progress) * 0.6})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 200, 0, ${(1 - progress)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw attackers (behind)
    for (const d of simState.attackers) {
      const sx = (d.x / ARENA) * w;
      const sy = (d.y / ARENA) * h;
      if (d.status !== "active" && d.status !== "breached") {
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#333"; ctx.fill();
        continue;
      }
      if (d.status === "breached") continue;
      const colors = { cheap: "#ff6666", medium: "#cc3333", expensive: "#881111" };
      const sizes = { cheap: 4, medium: 5, expensive: 6 };
      ctx.beginPath();
      ctx.arc(sx, sy, sizes[d.threat] || 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[d.threat] || "#ff6666";
      ctx.fill();
      // Direction indicator
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(d.heading) * 12, sy + Math.sin(d.heading) * 12);
      ctx.strokeStyle = colors[d.threat] || "#ff6666";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw interceptors (on top)
    for (const d of simState.interceptors) {
      const sx = (d.x / ARENA) * w;
      const sy = (d.y / ARENA) * h;
      if (d.status !== "active") {
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#333"; ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#4a9eff";
      ctx.fill();
      // Pursuit line to target
      if (d.targetId != null) {
        const target = simState.attackers.find((a) => a.id === d.targetId && a.status === "active");
        if (target) {
          const tx = (target.x / ARENA) * w;
          const ty = (target.y / ARENA) * h;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = "rgba(74, 158, 255, 0.15)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [simState, theater, killFlashes, th, attackSpawns, defenseSpawns, placementMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return <canvas ref={canvasRef} onClick={handleClick} style={{ width: "100%", height: "100%", display: "block", cursor: placementMode ? "crosshair" : "default" }} />;
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
  const [placementMode, setPlacementMode] = useState(null); // null | "attack" | "defense"

  const simRef = useRef(null);
  const runRef = useRef(false);
  const pausedRef = useRef(false);
  const speedRef = useRef(10);
  const killsRef = useRef(0);
  const flashesRef = useRef([]);
  const frameRef = useRef(null);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const handleCanvasClick = useCallback((x, y) => {
    if (!placementMode) return;
    if (placementMode === "attack") {
      setAttackSpawns((prev) => [...prev, [x, y]]);
    } else {
      setDefenseSpawns((prev) => [...prev, [x, y]]);
    }
  }, [placementMode]);

  const startSim = useCallback(() => {
    const sc = SCENARIOS[scenario];
    if (!sc) return;
    setPlacementMode(null);
    const { interceptors, attackers } = createDrones(sc, theater, attackSpawns, defenseSpawns);
    const initial = {
      interceptors,
      attackers,
      metrics: { kills: 0, misses: 0, legacy_breaches: 0, defense_cost: 0, threat_value_destroyed: 0, active_interceptors: interceptors.length, active_threats: attackers.length },
      step: 0,
      done: false,
    };
    simRef.current = initial;
    killsRef.current = 0;
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
    if (pausedRef.current) {
      frameRef.current = requestAnimationFrame(runLoop);
      return;
    }

    let s = simRef.current;
    if (!s || s.done) {
      runRef.current = false;
      setRunning(false);
      setStatusText("COMPLETE");
      return;
    }

    const steps = speedRef.current;
    for (let i = 0; i < steps; i++) {
      if (s.done) break;
      const prevKills = s.metrics.kills;
      s = simStep(s);
      // Track kill flashes
      if (s.metrics.kills > prevKills) {
        const newKilled = s.attackers.filter((a) => a.status === "destroyed");
        for (const k of newKilled.slice(-( s.metrics.kills - prevKills))) {
          flashesRef.current.push({ x: k.x, y: k.y, time: Date.now() });
        }
      }
    }

    simRef.current = s;
    // Prune old flashes
    const now = Date.now();
    flashesRef.current = flashesRef.current.filter((f) => now - f.time < 600);

    setSimState({ ...s });
    setKillFlashes([...flashesRef.current]);

    if (s.done) {
      runRef.current = false;
      setRunning(false);
      setStatusText("COMPLETE");
    } else {
      frameRef.current = requestAnimationFrame(runLoop);
    }
  }, []);

  const stopSim = useCallback(() => {
    runRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setRunning(false);
    setPaused(false);
    setSimState(null);
    setStatusText("READY");
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      setStatusText(next ? "PAUSED" : "RUNNING");
      return next;
    });
  }, []);

  const stepOnce = useCallback(() => {
    if (!simRef.current || simRef.current.done) return;
    pausedRef.current = true;
    setPaused(true);
    setStatusText("PAUSED");
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
    if (simRef.current.done) {
      runRef.current = false;
      setRunning(false);
      setStatusText("COMPLETE");
    }
  }, []);

  // Cleanup on unmount
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
      </Head>

      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/#projects" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none" }}>
              &larr; Back to Projects
            </Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#4a9eff", letterSpacing: 0.5, margin: 0 }}>
              SWARM INTERCEPTION SIMULATOR
            </h1>
          </div>
          <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
        </div>

        {/* Main */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel */}
          <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <PanelTitle>Scenario</PanelTitle>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              disabled={running}
              style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}
            >
              {Object.entries(SCENARIOS).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>

            <PanelTitle>Theater</PanelTitle>
            <select
              value={theater}
              onChange={(e) => setTheater(e.target.value)}
              disabled={running}
              style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1 }}
            >
              {Object.entries(THEATERS).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>

            <PanelTitle>Spawn Points</PanelTitle>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
              Click map to place. Empty = theater defaults.
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button
                onClick={() => setPlacementMode(placementMode === "attack" ? null : "attack")}
                disabled={running}
                style={{
                  ...btnBase,
                  background: placementMode === "attack" ? "#4a1a1a" : "#1a2a40",
                  borderColor: placementMode === "attack" ? "#ff5555" : "#2a4a6a",
                  color: placementMode === "attack" ? "#ff5555" : "#e0e0e0",
                  opacity: running ? 0.4 : 1,
                  cursor: running ? "not-allowed" : "pointer",
                  fontSize: 11,
                }}
              >
                {placementMode === "attack" ? "Placing ATK..." : `ATK Spawns (${attackSpawns.length})`}
              </button>
              <button
                onClick={() => setPlacementMode(placementMode === "defense" ? null : "defense")}
                disabled={running}
                style={{
                  ...btnBase,
                  background: placementMode === "defense" ? "#1a3a4a" : "#1a2a40",
                  borderColor: placementMode === "defense" ? "#4a9eff" : "#2a4a6a",
                  color: placementMode === "defense" ? "#4a9eff" : "#e0e0e0",
                  opacity: running ? 0.4 : 1,
                  cursor: running ? "not-allowed" : "pointer",
                  fontSize: 11,
                }}
              >
                {placementMode === "defense" ? "Placing DEF..." : `DEF Spawns (${defenseSpawns.length})`}
              </button>
            </div>
            {(attackSpawns.length > 0 || defenseSpawns.length > 0) && (
              <button
                onClick={() => { setAttackSpawns([]); setDefenseSpawns([]); setPlacementMode(null); }}
                disabled={running}
                style={{ ...btnBase, background: "#1a1a24", borderColor: "#2a2a35", color: "#888", fontSize: 11, opacity: running ? 0.4 : 1, cursor: running ? "not-allowed" : "pointer" }}
              >
                Clear All Spawns
              </button>
            )}

            <PanelTitle>Simulation</PanelTitle>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={startSim} disabled={running && !simState?.done} style={{ ...btnBase, background: "#1a4a2a", borderColor: "#2a6a3a", color: "#4caf50", opacity: running && !simState?.done ? 0.4 : 1, cursor: running && !simState?.done ? "not-allowed" : "pointer" }}>
                Start
              </button>
              <button onClick={stopSim} disabled={!running && !simState} style={{ ...btnBase, background: "#4a1a1a", borderColor: "#6a2a2a", color: "#ff5555", opacity: !running && !simState ? 0.4 : 1, cursor: !running && !simState ? "not-allowed" : "pointer" }}>
                Stop
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={togglePause} disabled={!running} style={{ ...btnBase, background: "#1a2a40", borderColor: "#2a4a6a", color: "#e0e0e0", opacity: !running ? 0.4 : 1, cursor: !running ? "not-allowed" : "pointer" }}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button onClick={stepOnce} disabled={!simState || simState.done} style={{ ...btnBase, background: "#1a2a40", borderColor: "#2a4a6a", color: "#e0e0e0", opacity: !simState || simState.done ? 0.4 : 1, cursor: !simState || simState.done ? "not-allowed" : "pointer" }}>
                Step
              </button>
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
                <button
                  key={tab}
                  onClick={() => setDbTab(tab)}
                  style={{ flex: 1, padding: 6, textAlign: "center", fontSize: 11, background: dbTab === tab ? "#1a2a40" : "#1a1a24", border: `1px solid ${dbTab === tab ? "#4a9eff" : "#2a2a35"}`, color: dbTab === tab ? "#4a9eff" : "#e0e0e0", cursor: "pointer", borderRadius: 3 }}
                >
                  {tab === "attack" ? "Attack" : "Defense"}
                </button>
              ))}
            </div>
            {profiles.map((p) => (
              <ProfileCard key={p.key} name={p.name} country={p.country} speed={p.speed} cost={p.cost} rcs={p.rcs} />
            ))}
          </div>

          {/* Canvas */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <SimCanvas simState={simState} theater={theater} killFlashes={killFlashes} attackSpawns={attackSpawns} defenseSpawns={defenseSpawns} placementMode={placementMode} onCanvasClick={handleCanvasClick} />
          </div>

          {/* Right panel - metrics */}
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
