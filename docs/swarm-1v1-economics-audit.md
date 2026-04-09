# Swarm 1v1 - Economics Audit (April 2026)

A game economics expert agent audited the entire economy and identified the round-1 FPV rush exploit plus 12 other issues. This doc captures the audit findings + which fixes were applied.

## The headline finding

**The game was decided in round 1** by an FPV rush exploit. With FPV at $500/drone and a 100-drone wave cap, attackers could send 100 drones for $50K (0.16% of starting budget). 100 drones vs the AI defender's 4 AD systems + 16 interceptors = 31 expected breaches, instantly triggering the 8-breach HQ overwhelm threshold.

The defender, starting with **zero defenses**, couldn't possibly survive without spending nearly the entire $30M budget on AD in 60 seconds.

## Top 3 critical issues (all fixed)

### Fix 1: FPV cost $500 → $15K
Now matches the Kamikaze interceptor cost (1:1 trade economics). 100 FPVs cost $1.5M (5% of starting budget) — a meaningful rush tax.

### Fix 2: HQ overwhelm scales with wave size
Old: fixed 8 breaches = game over
New: `max(8, 20% of wave size)` + 6 per extra HQ
A 100-drone wave now needs 20 breaches to overwhelm. Multi-HQ defenders get even more headroom.

### Fix 3: Breach damage scales with attacker cost
Old: flat $500K per breach regardless of drone type
New: `max($100K, attacker_cost × 2)`
| Unit | Cost | Old breach dmg | New breach dmg |
|---|---:|---:|---:|
| FPV | $15K | $500K | $100K |
| Shahed | $20K | $500K | $100K |
| Lancet | $35K | $500K | $100K |
| Mohajer | $500K | $500K | $1M |

Now expensive drones are actually more threatening than cheap ones.

### Fix 4: Player starts with 10 free kamikaze interceptors
Granted automatically when HQ is placed. Player is no longer defenseless on round 1.

## Other fixes applied

- **Iron Dome buffed**: 20 → 60 missiles ($51M for 51 expected kills, viable vs swarms)
- **NASAMS rebalanced**: $100M → $40M, 6 → 20 missiles (was strictly worst purchase)
- **Arms Factory income**: $0.9M → $1.5M (no longer dominated by Solar/Oil)

## Issues identified but NOT yet applied

### TIER 2 (high impact, medium effort)
- **Cap attack wave size by round number** — instead of flat 100, scale e.g. `10 + round × 5`
- **Buff Armed Interceptor or drop price** — currently strictly dominated by Kamikaze at $180K vs $15K
- **Scarce deposits** — cut from 30 → 12 to create real opportunity cost

### TIER 3 (structural)
- **Bankruptcy floor** $-50M → $-5M for real economic pressure
- **Comeback mechanic** — emergency airlift if budget drops below $5M (one-time $10M aid)
- **Multi-HQ rework** — give each HQ $500K/rnd base income to make extras a real eco choice

## Game theory issues to watch

### No paper-rock-scissors
The audit notes that the game lacks a clean counter matrix. Ideal:
- FPV < Kamikaze (cheap meets cheap)
- Shahed < Gepard (slow + numerous → flak)
- Lancet < Pantsir (medium → mid-tier AD)
- Mohajer < NASAMS (expensive → top-tier AD)

Currently FPV beats everything because of cost and quantity. Fix #1 partially addresses this; future work should ensure each AD system is the best counter to one drone type.

### No tempo vs eco tradeoff
A healthy RTS has rush vs eco as a real choice. Currently rush wins because rushing is essentially free. Fix #1 raises the rush cost to 5% of budget, but it's still cheaper than eco-up. Consider a per-wave minimum cost or a wave cooldown.

### Snowball without comeback
Income is linear (good — no compounding) but breach damage compounds (lose a $16M oil refinery → also lose the ongoing income). No comeback mechanics exist. Recommended: emergency airlift at $5M budget.

## References cited by the audit

- **Mindustry**: bounded deposits, supply caps, opportunity cost via slot scarcity
- **StarCraft**: tempo curves where workers cost the same as marines
- **Clash Royale**: elixir cycling forces wave cooldown / cost floors
- **Vampire Survivors / Brotato**: solo-dev modern indie economy patterns
- **They Are Billions**: defenders pay even when not attacked, attacker also pays meaningfully

## Source

Full audit returned by background agent on 2026-04-08. Stored at:
`C:\Users\PJ\AppData\Local\Temp\claude\C--Users-PJ-Desktop-code-shiv-terminal-website\62cd7ba6-f9ee-4f03-b370-2a7d771a6074\tasks\acf7af6ec84d8e6d0.output`

(Note: temp file, may not persist long-term. Key findings preserved above.)
