import { useEffect, useState, useRef } from "react";

// Step config. Each step is either:
//   - centered: rendered as a card in the middle of the screen (target null)
//   - anchored: positioned next to a UI element matched via data-tutorial attribute
//
// advance:
//   - "next": user clicks Next button to proceed
//   - { watch: "<state-name>", when: "<truthy expression>" } - parent decides; passes
//     a signal via the autoAdvance prop that re-checks whenever its value changes
const TUTORIAL_STEPS = [
  {
    id: "intro",
    title: "Welcome to Swarm 1v1",
    body: "Defend your HQ. Build a resource economy. Send drones to break the AI's defenses before yours collapse. We'll walk you through round 1 - hit Next to begin.",
    placement: "center",
    advance: "next",
  },
  {
    id: "place_hq",
    title: "Step 1 - Place your HQ",
    body: "Click 'Place HQ' below, then click anywhere inside your blue zone on the map. Your HQ is what you're defending - if it breaches enough times, you lose.",
    target: "place_hq_btn",
    placement: "right",
    advance: "auto-hq",
  },
  {
    id: "airspace",
    title: "Step 2 - Set your airspace",
    body: "Bigger airspace earns more income ($200 per meter per round) but is harder to defend - drones have more area to slip through. Start medium for round 1.",
    target: "airspace_slider",
    placement: "right",
    advance: "next",
  },
  {
    id: "resources",
    title: "Step 3 - Claim a Solar Farm",
    body: "Solar is the cheapest resource ($2M, +$500K/round, 4-round payback). Click Solar Farm, then click a green 'S' marker on the map inside your airspace.",
    target: "resource_solar",
    placement: "right",
    advance: "auto-resource",
  },
  {
    id: "ad",
    title: "Step 4 - Buy a Gepard",
    body: "Gepard ($5M) is a mobile autocannon - shreds cheap drones (FPV, Shahed) but struggles against tankier targets like Mohajer. Place it inside your airspace.",
    target: "ad_gepard",
    placement: "right",
    advance: "auto-ad",
  },
  {
    id: "interceptors",
    title: "Step 5 - Buy interceptors (optional)",
    body: "Kamikaze interceptors ($15K each) ram targets and die. Armed interceptors ($180K) survive 73% of engagements and reuse next round. You already start with a few free.",
    target: "interceptor_panel",
    placement: "right",
    advance: "next",
  },
  {
    id: "wave",
    title: "Step 6 - Design your attack wave",
    body: "Set how many drones you'll launch at the AI this round. FPV is cheap chaff, Shahed has more HP, Mohajer is expensive but tanks Gepard fire. Watch the budget in the top-right.",
    target: "attack_wave",
    placement: "right",
    advance: "next",
  },
  {
    id: "priority_posture",
    title: "Step 7 - Pick attack target + defense posture",
    body: "Attack Priority = what your drones aim for (HQ, AD, Resources, or Interceptors). Defense Posture = how aggressive your interceptors are. 'Pursuing' is a safe default.",
    target: "priority_posture",
    placement: "right",
    advance: "next",
  },
  {
    id: "ready",
    title: "Step 8 - Launch the round",
    body: "Hit READY FOR BATTLE and watch the auto-resolve combat. Surviving units carry to round 2. The AI gets stronger each round.",
    target: "ready_btn",
    placement: "right",
    advance: "auto-combat",
  },
  {
    id: "combat",
    title: "Combat phase",
    body: "Watch HP bars on drones, ammo on AD batteries, and money tick down as units cross enemy airspace ($30/drone). When the dust settles, you'll be back to setup for round 2 - good luck.",
    placement: "center",
    advance: "next",
  },
];

export const SWARM_TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

// Returns the current step's `advance` token so the parent can decide when to auto-advance.
export function getTutorialAdvanceToken(stepIdx) {
  return TUTORIAL_STEPS[stepIdx]?.advance;
}

export default function SwarmTutorial({ stepIdx, onAdvance, onSkip }) {
  const step = TUTORIAL_STEPS[stepIdx];
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  // Continuously re-measure the target element's bounding rect. The setup sidebar can
  // scroll independently; using rAF keeps the spotlight glued to the moving element
  // without burning a full setInterval timer.
  useEffect(() => {
    if (!step?.target) { setRect(null); return; }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((prev) => {
          if (prev && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height) return prev;
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
      } else {
        setRect(null);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [step?.target, stepIdx]);

  if (!step) return null;

  const isCentered = step.placement === "center" || !rect;
  const PADDING = 8;

  // Compute tooltip position next to the target (clamped to viewport).
  let tooltipStyle = { position: "fixed", zIndex: 10001 };
  if (isCentered) {
    tooltipStyle = { ...tooltipStyle, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const TT_W = 320;
    const TT_H_GUESS = 180;
    if (step.placement === "right") {
      let left = rect.x + rect.width + PADDING + 12;
      let top = rect.y + rect.height / 2 - TT_H_GUESS / 2;
      if (left + TT_W > window.innerWidth - 8) left = rect.x - TT_W - PADDING - 12;
      top = Math.max(12, Math.min(top, window.innerHeight - TT_H_GUESS - 12));
      tooltipStyle = { ...tooltipStyle, left, top, width: TT_W };
    } else if (step.placement === "left") {
      let left = rect.x - TT_W - PADDING - 12;
      let top = rect.y + rect.height / 2 - TT_H_GUESS / 2;
      if (left < 8) left = rect.x + rect.width + PADDING + 12;
      top = Math.max(12, Math.min(top, window.innerHeight - TT_H_GUESS - 12));
      tooltipStyle = { ...tooltipStyle, left, top, width: TT_W };
    } else if (step.placement === "top") {
      let left = rect.x + rect.width / 2 - TT_W / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - TT_W - 12));
      tooltipStyle = { ...tooltipStyle, left, top: rect.y - TT_H_GUESS - PADDING - 12, width: TT_W };
    } else {
      let left = rect.x + rect.width / 2 - TT_W / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - TT_W - 12));
      tooltipStyle = { ...tooltipStyle, left, top: rect.y + rect.height + PADDING + 12, width: TT_W };
    }
  }

  // Spotlight: SVG mask with a hole over the target rect. Clicks pass through to the
  // hole so the user can interact with the highlighted element. Clicks elsewhere on the
  // backdrop are absorbed (pointer-events: auto on the dim layer outside the cutout).
  const RADIUS = 12;
  const showSpotlight = !isCentered && rect;

  const isAutoStep = step.advance && step.advance.startsWith("auto-");
  const showNext = step.advance === "next";

  return (
    <>
      {/* Backdrop: dimmed everywhere except the spotlight cutout. The whole layer is
          pointer-events: none so the user can still click the highlighted button to
          satisfy the step. The SVG mask cuts a transparent hole over the target element. */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 10000,
        pointerEvents: "none",
      }}>
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <mask id="swarm-tutorial-mask">
              <rect width="100%" height="100%" fill="white" />
              {showSpotlight && (
                <rect
                  x={rect.x - PADDING} y={rect.y - PADDING}
                  width={rect.width + PADDING * 2} height={rect.height + PADDING * 2}
                  rx={RADIUS} ry={RADIUS}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.62)" mask="url(#swarm-tutorial-mask)" />
        </svg>

        {/* Pulse outline around the target. Pointer events disabled so it never blocks. */}
        {showSpotlight && (
          <div style={{
            position: "absolute",
            left: rect.x - PADDING, top: rect.y - PADDING,
            width: rect.width + PADDING * 2, height: rect.height + PADDING * 2,
            borderRadius: RADIUS,
            boxShadow: "0 0 0 2px #ff6688, 0 0 18px 6px rgba(255, 102, 136, 0.55)",
            pointerEvents: "none",
            animation: "swarmTutorialPulse 1.6s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        background: "#111118",
        border: "2px solid #ff6688",
        borderRadius: 10,
        padding: "16px 18px 14px",
        color: "#e0e0e0",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7), 0 0 24px rgba(255, 102, 136, 0.25)",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        maxWidth: isCentered ? 480 : undefined,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>
            Tutorial · {stepIdx + 1} / {TUTORIAL_STEPS.length}
          </div>
          <button onClick={onSkip} style={{
            background: "transparent", border: "1px solid #444", color: "#888",
            fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          }}>
            Skip
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#ff6688", marginBottom: 6 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 12, color: "#cfcfcf", lineHeight: 1.55, marginBottom: 12 }}>
          {step.body}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 10, color: "#666" }}>
            {isAutoStep ? "Continues when you do it" : ""}
          </div>
          {showNext && (
            <button onClick={onAdvance} style={{
              background: "#4a1a2a", border: "1px solid #ff6688", color: "#ff6688",
              fontSize: 12, fontWeight: 600, padding: "7px 18px", borderRadius: 5, cursor: "pointer",
              letterSpacing: 0.5,
            }}>
              {stepIdx === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next →"}
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes swarmTutorialPulse {
          0%, 100% { box-shadow: 0 0 0 2px #ff6688, 0 0 18px 6px rgba(255, 102, 136, 0.55); }
          50% { box-shadow: 0 0 0 2px #ff6688, 0 0 26px 10px rgba(255, 102, 136, 0.85); }
        }
      `}</style>
    </>
  );
}
