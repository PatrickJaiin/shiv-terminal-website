# Swarm 1v1 - Visuals, Feel & Audio Audit (April 2026)

A game visuals/sound expert agent audited the entire UI, juice, and audio. Verdict: "**a spreadsheet with moving dots**" - mechanically complete but missing the fundamentals of game feel.

The audit's top recommendation: the game had **zero audio** and no screen shake, hit-pause, or wall-clock VFX. These are the cheapest juice tools in existence and we were leaving them all on the table.

## Top 5 cheapest wins (all applied)

### Fix 1: Audio engine (programmatic Web Audio SFX)
- Added a runtime SFX synthesizer using Web Audio API oscillators + noise buffers
- 8 sounds total: AD fire, drone kill, breach alarm, HQ destroyed, round start, UI click, victory, defeat
- All generated procedurally - **no asset files needed**, zero bundle size impact
- Throttled (40-60ms minimum gap per channel) so AD spam doesn't buzzsaw
- Audio context unlocked on first user gesture (Play vs Bot / Create Room / Join Room)
- Per-event hooks: AD shots, kills, breaches, HQ overwhelm, round start

### Fix 2: Screen shake
- `shakeMap(intensity, frames)` helper that shakes the map container div
- Calls: 4px/6f on breach, 15px/12f on enemy HQ destroyed (victory), 20px/16f on player HQ destroyed (defeat)
- Subconscious "impact" feedback at near-zero CPU cost

### Fix 3: `preferCanvas: true` on Leaflet
- One-line change: forces Leaflet to render `circleMarker` and `circle` via Canvas instead of SVG nodes
- 5-10x speedup on high-entity-count battle frames per audit
- DivIcon-based markers (HQ squares, resource triangles, ammo labels) still use DOM but they're static so it doesn't matter

### Fix 4: Wall-clock VFX decay
- Changed flash aging from sim-step counter to `performance.now() - f.wallTime` deltas in milliseconds
- AD shots now fade over 333ms regardless of battle speed (was 20 sim steps = 1-2 frames at 16x)
- Kill flashes 500ms, damage popups 2000ms - all visible at 16x
- Switched kill/breach flashes to ease-out cubic for "pop then fade" feel
- New breach color `#ff0040` (saturated magenta-red) distinct from kill orange

### Fix 5: CSS filter on satellite tiles
- Wrapped map container with `filter: brightness(0.55) contrast(1.1) saturate(0.6)`
- Mutes the satellite imagery so unit colors pop off the background
- Zero runtime cost - GPU compositor handles it

## What's still on the table (deferred to future polish)

| Effort | Item |
|---|---|
| **Medium** | Drone motion trails (last 4 positions polyline) |
| **Medium** | Hit-pause on big kills (freeze sim 50-150ms) |
| **Medium** | Palette rework (3 friendly + 3 hostile + infrastructure colors, distinct from blue/red overload) |
| **Medium** | Idle animations (HQ pulse, AD radar sweep, deposit glow) |
| **Medium** | Battle log icons + grouping |
| **Medium** | "WAVE INCOMING" banner + heartbeat SFX in last 5s of timer |
| **Medium** | Income floating text popups at HQ |
| **Long** | Sidebar restructure with collapsible accordions |
| **Long** | Music system (setup loop + battle loop crossfade) |
| **Long** | Distinct fire SFX per AD system |
| **Long** | Fullscreen game over overlay with staggered stat reveal |
| **Long** | Canvas overlay for battle drawing (full refactor for 1000+ units) |
| **Long** | Replay system with killcam |

## Color hierarchy issues identified (not yet fixed)

The audit found significant color overloading:
- **3 friendly blues** competing: player HQ (#4a9eff), iron_dome AD (#44bbff), nasams AD (#4488ff)
- **4 enemy reds** competing: HQ (#ff5555), drones (#ff4444), AD (#ff7777), interceptors (#cc4444)
- **Orange overloaded**: oil resource, pantsir AD, kill flash all share `#cc8800`/`#ff8800`

Recommended palette in audit (deferred):
- Player anchor: deep blue `#3d7fff`
- Player attack: teal-cyan `#00ffea`
- Player interceptor: pale sky `#7fd8ff`
- Enemy anchor: magenta-red `#ff2d55`
- AD systems pulled out of red/blue families: yellow, green, purple, orange (one each)
- Kill flash: white starburst `#ffffff`
- Breach flash: saturated magenta-red `#ff0040`

Partial fix applied: breach flash color is now `#ff0040` and kill flashes have a white border. Full palette rework is deferred.

## Reference comparisons cited

- **Mindustry**: pulse the budget number on income arrival
- **They Are Billions**: "WAVE INCOMING" banner + heartbeat SFX
- **Vampire Survivors**: floating gain text + relentless feedback
- **Nuclear Throne**: 2-frame hit-pause, chromatic aberration, screen tints
- **StarCraft 2**: distinct fire sounds per AD system so battles read by ear
- **Hades**: fullscreen game over with staggered stat reveal

## Source

Full audit returned by background agent on 2026-04-08. Stored at:
`C:\Users\PJ\AppData\Local\Temp\claude\C--Users-PJ-Desktop-code-shiv-terminal-website\62cd7ba6-f9ee-4f03-b370-2a7d771a6074\tasks\abf76bd690fe9f5b3.output`
