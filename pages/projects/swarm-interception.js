import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

// Mock drone data for showcase
const MOCK_INTERCEPTORS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: 4000 + Math.random() * 2000,
  y: 4000 + Math.random() * 2000,
  type: "interceptor",
  status: i < 16 ? "active" : "destroyed",
  threat_level: "cheap",
  heading: Math.random() * Math.PI * 2,
}));

const MOCK_ATTACKERS = Array.from({ length: 30 }, (_, i) => {
  const threat =
    i < 20 ? "cheap" : i < 27 ? "medium" : "expensive";
  return {
    id: 100 + i,
    x: Math.random() * 10000,
    y: i < 15 ? Math.random() * 3000 : 3000 + Math.random() * 7000,
    type: threat === "cheap" ? "fpv" : threat === "medium" ? "loitering" : "cruise_missile",
    status: i < 8 ? "destroyed" : "active",
    threat_level: threat,
    heading: Math.random() * Math.PI * 2,
  };
});

const MOCK_DRONES = [...MOCK_INTERCEPTORS, ...MOCK_ATTACKERS];

const MOCK_METRICS = {
  kills: 12,
  misses: 2,
  active_interceptors: 16,
  active_threats: 22,
  total_defense_cost: 3200000,
  threat_value_destroyed: 890000,
  cost_efficiency: 0.28,
  legacy_breaches: 0,
};

const DRONE_DB = {
  attack: [
    { name: "Shahed-136", country: "Iran", max_speed_kmh: 185, unit_cost_usd: 20000, rcs_m2: 0.1 },
    { name: "Lancet-3", country: "Russia", max_speed_kmh: 300, unit_cost_usd: 35000, rcs_m2: 0.05 },
    { name: "Mohajer-6", country: "Iran", max_speed_kmh: 200, unit_cost_usd: 500000, rcs_m2: 0.5 },
    { name: "Orion (Pacer)", country: "Russia", max_speed_kmh: 200, unit_cost_usd: 1000000, rcs_m2: 1.0 },
    { name: "Wing Loong II", country: "China", max_speed_kmh: 370, unit_cost_usd: 2000000, rcs_m2: 1.5 },
    { name: "FPV Kamikaze", country: "Generic", max_speed_kmh: 150, unit_cost_usd: 500, rcs_m2: 0.01 },
  ],
  interceptor: [
    { name: "Custom Interceptor", country: "Generic", max_speed_kmh: 400, unit_cost_usd: 200000, rcs_m2: 0.05 },
    { name: "Anduril Anvil", country: "USA", max_speed_kmh: 320, unit_cost_usd: 100000, rcs_m2: 0.03 },
    { name: "Fortem DroneHunter", country: "USA", max_speed_kmh: 160, unit_cost_usd: 150000, rcs_m2: 0.08 },
  ],
};

const THEATERS = [
  "LoC Kashmir",
  "Israel-Iran",
  "Red Sea",
  "Ukraine Kyiv",
  "Taiwan Strait",
];

function formatUSD(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function Metric({ label, value, color = "white" }) {
  const colors = {
    blue: "#4a9eff",
    red: "#ff5555",
    green: "#4caf50",
    orange: "#ff9800",
    white: "#e0e0e0",
  };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1a1a24" }}>
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: colors[color] || "#e0e0e0", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function PanelTitle({ children }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#666", marginBottom: 8, marginTop: 16 }}>
      {children}
    </div>
  );
}

function ProfileCard({ name, country, speed, cost, rcs }) {
  return (
    <div style={{ background: "#1a1a24", border: "1px solid #2a2a35", borderRadius: 4, padding: "8px 10px", marginBottom: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, color: "#e0e0e0", marginBottom: 4 }}>
        {name} <span style={{ color: "#666" }}>({country})</span>
      </div>
      <div style={{ color: "#888", display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          flexShrink: 0,
          background: hollow ? "transparent" : color,
          border: hollow ? `2px solid ${color}` : "none",
        }}
      />
      {label}
    </div>
  );
}

function Canvas({ drones }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const dronesRef = useRef(drones.map((d) => ({ ...d })));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += w / 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += h / 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Legacy zone
    const cx = (5000 / 10000) * w;
    const cy = (5000 / 10000) * h;
    const r = (2000 / 10000) * Math.min(w, h);
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

    // Animate drones
    const current = dronesRef.current;
    current.forEach((d) => {
      // Drift movement
      if (d.status === "active") {
        const speed = d.type === "interceptor" ? 0.4 : 0.25;
        d.x += Math.cos(d.heading) * speed;
        d.y += Math.sin(d.heading) * speed;
        d.heading += (Math.random() - 0.5) * 0.05;
        // Bounce off walls
        if (d.x < 0 || d.x > 10000) d.heading = Math.PI - d.heading;
        if (d.y < 0 || d.y > 10000) d.heading = -d.heading;
        d.x = Math.max(0, Math.min(10000, d.x));
        d.y = Math.max(0, Math.min(10000, d.y));
      }

      const sx = (d.x / 10000) * w;
      const sy = (d.y / 10000) * h;

      let color, radius;
      if (d.type === "interceptor") {
        color = d.status === "active" ? "#4a9eff" : "#444";
        radius = d.status === "active" ? 4 : 2;
      } else {
        if (d.status !== "active") {
          color = "#444";
          radius = 2;
        } else if (d.threat_level === "expensive") {
          color = "#881111";
          radius = 5;
        } else if (d.threat_level === "medium") {
          color = "#cc3333";
          radius = 4;
        } else {
          color = "#ff6666";
          radius = 3;
        }
      }

      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export default function SwarmInterception() {
  const [dbTab, setDbTab] = useState("attack");
  const profiles = dbTab === "attack" ? DRONE_DB.attack : DRONE_DB.interceptor;
  const totalInt = 20;
  const lost = totalInt - MOCK_METRICS.active_interceptors;
  const totalResolved = MOCK_METRICS.kills + MOCK_METRICS.misses;
  const killRate = totalResolved > 0 ? ((MOCK_METRICS.kills / totalResolved) * 100).toFixed(1) : "0";
  const attrition = ((lost / totalInt) * 100).toFixed(1);

  return (
    <>
      <Head>
        <title>Swarm Interception Simulator - Shiv Gupta</title>
      </Head>

      {/* Full-screen dashboard */}
      <div style={{ background: "#0a0a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#111118", borderBottom: "1px solid #2a2a35", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/#projects" style={{ color: "#4a9eff", fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              &larr; Back to Projects
            </Link>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#4a9eff", letterSpacing: 0.5, margin: 0 }}>
              SWARM INTERCEPTION SIMULATOR
            </h1>
          </div>
          <span style={{ fontSize: 12, color: "#4caf50" }}>DEMO MODE</span>
        </div>

        {/* Main layout */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel - controls */}
          <div style={{ width: 280, background: "#111118", borderRight: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <PanelTitle>Scenario</PanelTitle>
            <select style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8 }}>
              <option>default_30v20</option>
              <option>massive_100v50</option>
              <option>cruise_missile_strike</option>
              <option>mixed_wave</option>
            </select>

            <PanelTitle>Theater</PanelTitle>
            <select style={{ width: "100%", padding: "8px 12px", background: "#1a1a24", border: "1px solid #2a2a35", color: "#e0e0e0", borderRadius: 4, fontSize: 13, marginBottom: 8 }}>
              <option>Default (abstract arena)</option>
              {THEATERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>

            <PanelTitle>Simulation</PanelTitle>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button style={{ flex: 1, padding: "8px 12px", background: "#1a4a2a", border: "1px solid #2a6a3a", color: "#4caf50", borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Start
              </button>
              <button disabled style={{ flex: 1, padding: "8px 12px", background: "#4a1a1a", border: "1px solid #6a2a2a", color: "#ff5555", borderRadius: 4, fontSize: 13, fontWeight: 500, opacity: 0.4, cursor: "not-allowed" }}>
                Stop
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button disabled style={{ flex: 1, padding: "8px 12px", background: "#1a2a40", border: "1px solid #2a4a6a", color: "#e0e0e0", borderRadius: 4, fontSize: 13, fontWeight: 500, opacity: 0.4, cursor: "not-allowed" }}>
                Pause
              </button>
              <button disabled style={{ flex: 1, padding: "8px 12px", background: "#1a2a40", border: "1px solid #2a4a6a", color: "#e0e0e0", borderRadius: 4, fontSize: 13, fontWeight: 500, opacity: 0.4, cursor: "not-allowed" }}>
                Step
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Speed:</label>
              <input type="range" min="1" max="50" defaultValue="10" style={{ flex: 1, padding: 0, margin: 0, height: 20 }} />
              <span style={{ fontSize: 12, color: "#4a9eff", minWidth: 30, textAlign: "right" }}>10x</span>
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
              {["attack", "defense"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDbTab(tab === "defense" ? "interceptor" : "attack")}
                  style={{
                    flex: 1,
                    padding: 6,
                    textAlign: "center",
                    fontSize: 11,
                    background: (tab === "attack" ? "attack" : "interceptor") === dbTab ? "#1a2a40" : "#1a1a24",
                    border: `1px solid ${(tab === "attack" ? "attack" : "interceptor") === dbTab ? "#4a9eff" : "#2a2a35"}`,
                    color: (tab === "attack" ? "attack" : "interceptor") === dbTab ? "#4a9eff" : "#e0e0e0",
                    cursor: "pointer",
                    borderRadius: 3,
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {profiles.map((p) => (
              <ProfileCard key={p.name} name={p.name} country={p.country} speed={p.max_speed_kmh} cost={p.unit_cost_usd} rcs={p.rcs_m2} />
            ))}
          </div>

          {/* Map / Canvas area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <Canvas drones={MOCK_DRONES} />
            {/* Demo overlay badge */}
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(17,17,24,0.9)", border: "1px solid #2a2a35", borderRadius: 8, padding: "10px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                Live demo with animated mock data
              </div>
              <div style={{ fontSize: 11, color: "#666" }}>
                Full simulation requires local Python backend (ROS2 + Gazebo)
              </div>
            </div>
          </div>

          {/* Right panel - metrics */}
          <div style={{ width: 260, background: "#111118", borderLeft: "1px solid #2a2a35", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <PanelTitle>Status</PanelTitle>
            <Metric label="Time Elapsed" value="42.3s" />
            <Metric label="Step" value="423" />

            <PanelTitle>Forces</PanelTitle>
            <Metric label="Interceptors" value={`${MOCK_METRICS.active_interceptors} / ${totalInt}`} color="blue" />
            <Metric label="Active Threats" value={MOCK_METRICS.active_threats} color="red" />

            <PanelTitle>Combat</PanelTitle>
            <Metric label="Kills" value={MOCK_METRICS.kills} color="green" />
            <Metric label="Misses" value={MOCK_METRICS.misses} color="red" />
            <Metric label="Kill Rate" value={`${killRate}%`} />

            <PanelTitle>Economics</PanelTitle>
            <Metric label="Defense Cost" value={`$${formatUSD(MOCK_METRICS.total_defense_cost)}`} color="orange" />
            <Metric label="Threat Value Destroyed" value={`$${formatUSD(MOCK_METRICS.threat_value_destroyed)}`} color="green" />
            <Metric label="Cost Efficiency" value={`${MOCK_METRICS.cost_efficiency.toFixed(2)}x`} />

            <PanelTitle>Legacy Zone</PanelTitle>
            <Metric label="Threats in Zone" value="0" />
            <Metric label="Breaches" value={MOCK_METRICS.legacy_breaches} color="red" />

            <PanelTitle>Interceptor Attrition</PanelTitle>
            <Metric label="Lost" value={lost} color="red" />
            <Metric label="Attrition Rate" value={`${attrition}%`} />
          </div>
        </div>
      </div>
    </>
  );
}
