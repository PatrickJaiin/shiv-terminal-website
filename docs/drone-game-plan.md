# Drone Defense - Standalone Game Plan

A future plan for turning the swarm interception prototype into a standalone game site with a GeoGuessr-style business model. This is the long-form vision; current focus is iterating on the in-portfolio webapp first.

## Vision

A web-first competitive drone interception game inspired by GeoGuessr's daily-challenge + ranked-PvP model. Players defend airspace by placing AD systems against waves of attacker drones. Free tier with limited daily plays, Pro subscription unlocks unlimited play and ranked 1v1.

If the web version validates (people keep coming back without nagging), consider a Steam release as Phase 5.

## Reference points

- **GeoGuessr** - daily challenge + ranked Duels = the model
- **Vampire Survivors** - proves Phaser + Electron/Tauri can ship to Steam ($5M+ in revenue)
- **Mindustry** - architectural inspiration: content registry, fixed tick, data-driven entities
- **Brotato / Halls of Torment** - solo dev Steam success stories with simple mechanics

## Phases

### Phase 0 - Validate (1 weekend)
The cheapest experiment that proves the game is fun.

- Fresh repo, separate from portfolio
- Buy a domain (~$10/yr, e.g. dronedefense.gg)
- Port the existing game from `pages/projects/swarm-1v1.js` as a single page
- Deploy to Vercel (free)
- Share with 10 friends
- Watch them play, listen to feedback
- Decision gate: do they keep coming back unprompted? If no, pivot or stop.

No auth, no DB, no payments. Just the game on a domain.

### Phase 1 - Single player + accounts (2-3 weeks)

- Next.js 14 project (same stack you already know)
- Postgres on Railway ($5/mo) or Heroku Basic ($7/mo + $5 db)
- Prisma ORM
- NextAuth.js for sign-in (Google + Discord)
- Schema: `User`, `Run`, `DailyChallenge`, `Score`
- Daily challenge system: cron picks today's scenario, all players run the same one
- Global leaderboard page
- Personal stats page

### Phase 2 - Pro subscription (1 week)

- Stripe Checkout integration
- `User.isPro` boolean
- Free tier: 3 plays/day on a rolling 24h window
- Pro tier: unlimited plays + ranked queue access
- Stripe webhook for subscription lifecycle (created, updated, cancelled, payment_failed)
- Customer portal link for self-service cancellation
- Price target: $3/mo or $25/yr

### Phase 3 - Multiplayer 1v1 (2-3 weeks)

- Colyseus server (Node, separate from web app)
- Deploy alongside web on Railway (same project, different service)
- Refactor simulation to be authoritative server-side
- Matchmaking room: queue, ELO-based pairing
- ELO storage in Postgres
- Reconnection handling (player disconnects mid-match, server holds state for 30s)
- Spectator support (optional, nice-to-have)

### Phase 4 - Content + polish (ongoing)

- More scenarios (10-20 distinct maps/configurations)
- More drone types (swarm, kamikaze, EW jammer, decoy)
- More AD types (laser, missile, jammer, EMP)
- Tech tree / progression
- Seasons (3-month content cycles)
- Cosmetics (skins, AD paint jobs - cosmetic-only, no pay-to-win)
- Replay system (record server tick stream, play back)
- Marketing: Reddit (r/incremental_games, r/WebGames), Discord, TikTok of clips

### Phase 5 - Steam release (only if web validates)

- Decide between two paths:
  - **Tauri wrapper** - thin native shell around the web build, ~5MB binary, fastest path
  - **Full rewrite in Godot** - if web tech is fighting you, only after the design is locked
- Steamworks integration (achievements, cloud saves, leaderboards)
- Marketing prep: capsule art, trailer, store page months before launch
- Wishlist campaign

## Tech stack (Phase 1-3)

```
Next.js 14 (React + Tailwind)   - same as portfolio site
Postgres                          - Railway or Heroku
Prisma ORM                        - type-safe DB access
NextAuth.js                       - auth (free)
Stripe                            - payments (transaction fees only)
Colyseus                          - multiplayer server (Phase 3+)
Vercel                            - web hosting (free until scale)
Railway                           - game server hosting ($5/mo)
```

Nothing new to learn except Stripe webhooks and Colyseus, both well-documented.

## Architecture decisions to make upfront

These are painful to retrofit, so commit to them on day 1:

1. **Authoritative server from Phase 3 onwards** - never trust the client for game state
2. **Deterministic simulation** - seeded PRNG, fixed timestep (60 TPS), no `Math.random()` in the sim loop. Enables replays, fair PvP, reproducible bug reports.
3. **Versioned save/state schema** - every save file has a version number, write migrations for schema changes from day 1
4. **Content registry pattern** - all turrets/drones/items defined as data, not hardcoded classes. Makes adding content trivial and lets you ship balance patches without code changes.
5. **Sim/render separation** - sim runs at 60 TPS, render runs at whatever FPS. Render reads state, never writes.
6. **Server-authoritative sim from start of Phase 3** - don't bolt anti-cheat on later

## Realistic outcomes

GeoGuessr did $20M+ ARR in 2023 with a team and 8 years of momentum. The indie version inspired by it looks like:

- **Best case**: 1000 active players, 20-50 paying, $200-300/mo revenue, pays for hosting + a coffee fund
- **Likely case**: 50-200 players over a year, 5-10 paying, fun project that taught you a ton
- **Worst case**: 5 friends play it, you learn matchmaking + Stripe + production deploys

All three are valid outcomes. The skills and the codebase compound regardless.

## What this plan is NOT

- Not a guarantee of revenue. Most indie games make less than $1k.
- Not a recipe to compete with GeoGuessr. They have an 8-year head start.
- Not an excuse to skip validation. Phase 0 is non-negotiable - prove people want to play before building infrastructure.
- Not Steam-first. Web validates faster and cheaper than Steam ever can.

## Current status

- Web prototype: `pages/projects/swarm-1v1.js` (1225 lines) and `pages/projects/swarm-interception.js` (1605 lines)
- Iterating on gameplay in the existing webapp first
- Standalone game site is post-validation work
