# Swarm 1v1 Multiplayer - Setup & Architecture

This page documents the multiplayer system added to `pages/projects/swarm-1v1.js`.

## Modes

| Mode | How it works | Backend needed |
|---|---|---|
| **Play vs Bot** | Single-player against AI (existing) | None |
| **Create Room** | Generates a 5-letter code, friend joins by code | None (PeerJS public broker) |
| **Join Room** | Enter friend's code, connect to them | None |
| **Find Match (random)** | Queue with random opponent worldwide | Upstash Redis (free tier) |

## Architecture

```
        Browser A                     Browser B
       ┌─────────┐                   ┌─────────┐
       │ Next.js │                   │ Next.js │
       │  page   │ ◄─── Vercel ────► │  page   │
       └────┬────┘                   └────┬────┘
            │                             │
            │ PeerJS broker (free, public)│
            │ - signaling only            │
            │ ▼                          ▼ │
            │ ┌──────────────────────────┐ │
            └─┤  WebRTC DataChannel      ├─┘
              │  (P2P, no relay)         │
              │  - setup state sync      │
              │  - combat snapshots 10Hz │
              │  - round results         │
              └──────────────────────────┘
```

**Vercel** only serves the page. No game traffic touches Vercel.

**PeerJS broker** (free, public) handles WebRTC signaling for ~30 seconds during connection setup. Then disconnects.

**WebRTC DataChannel** carries all game traffic peer-to-peer between the two browsers. No server in the middle.

**Upstash Redis** (Phase 4 only) is used for the matchmaking queue. Players who hit "Find Match" register their PeerJS peer ID in the queue; the server pairs them and returns each peer the other's ID. After that, they connect via PeerJS just like Create/Join Room mode.

## Setting up Upstash Redis (for Find Match mode)

Without Upstash, "Find Match" returns `503 not_configured` and shows a friendly error. Create Room and Join Room work without Upstash.

To enable Find Match:

1. Sign up at [upstash.com](https://upstash.com) (free, no card)
2. Create a new Redis database:
   - Type: Regional (cheaper) or Global
   - Region: pick one near your players
   - Eviction: enabled (any policy)
3. Open the database, scroll to "REST API"
4. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
5. In Vercel project settings → Environment Variables:
   - Add `UPSTASH_REDIS_REST_URL` = the URL
   - Add `UPSTASH_REDIS_REST_TOKEN` = the token
   - Apply to: Production, Preview, Development
6. Redeploy the project

That's it. The matchmaking endpoints will pick up the env vars on the next deploy.

## Free tier limits

- **PeerJS public broker**: rate-limited but generous. Acceptable for casual use.
- **Upstash Redis free**: 10K commands/day. Each match uses ~6 commands plus 1 per polling check. Realistic ceiling: 250-300 matches/day.
- **Vercel Hobby**: 100GB bandwidth/month, 1M edge function invocations/month. Effectively unlimited for hobby use.

## Phases shipped

### Phase 1 — Connection foundation
- 3-mode lobby (Bot / Create / Join), Find Match disabled
- PeerJS hookup, room code create/join
- Connection lifecycle, cleanup, stale-handler safety
- Status: complete

### Phase 2 — Setup state sync
- Setup actions sync over PeerJS (HQ, airspace, resources, AD, interceptors, attack wave, priority, posture)
- Resource deposits broadcast from host to guest on connection
- Ready handshake (both players mark ready, host clicks START COMBAT)
- Status: complete

### Phase 3 — Combat sync
- Host runs the simulation locally; guest never simulates
- Host streams combat snapshots at ~10 Hz over WebRTC DataChannel
- Guest renders received snapshots via render-only loop
- Round-end results broadcast (kills, breaches, budget deltas, game-over)
- Disconnect mid-combat returns both players to lobby
- Status: complete

### Phase 4 — Random matchmaking
- `pages/api/match/queue.js` and `pages/api/match/check.js` (Vercel Edge)
- Find Match button enables when Upstash env vars are set
- 60-second matchmaking timeout
- Cancel removes from queue cleanly
- Status: complete

## Network protocol summary

| Message type | Sender | Purpose |
|---|---|---|
| `deposits` | host on connect | canonical resource deposit list |
| `place_hq` | both | HQ position |
| `airspace` | both | airspace radius |
| `place_resource` | both | claim a deposit |
| `remove_resource` | both | unclaim a deposit |
| `place_ad` | both | place an AD system |
| `remove_ad` | both | sell an AD system |
| `place_interceptor_group` | both | place an interceptor group |
| `remove_interceptor_group` | both | sell an interceptor group |
| `attack_wave` | both | set attack wave composition |
| `attack_priority` | both | set attack priority |
| `def_posture` | both | set defense posture |
| `ready` | both | mark ready / unready |
| `start_combat` | host | host clicked START COMBAT |
| `round_start` | host | round just launched (income deltas) |
| `combat_snapshot` | host (~10Hz) | live entity positions during combat |
| `round_end` | host | round result (kills, breaches, dmg, gameOver) |

## Known limitations (acceptable for v1)

- Both players see the same map orientation (host's POV). Guest's "your" side is at the bottom — slightly weird but functional.
- Mid-match disconnect ends the match for both players (no reconnection)
- No spectators
- No replays
- No ranked / ELO
- Random matchmaking is global, not regional
- The first round may have some cosmetic asymmetry as state syncs settle

## Hosting cost summary

- **Free tier OK for everything** unless you exceed 10K Upstash commands/day or 1M Vercel edge invocations/month
- Realistic ceiling on free tier: ~250 matches/day with active matchmaking
- If you outgrow that: Upstash Pay-as-you-go ~$0.20/100K commands, Vercel Pro $20/mo

## Files touched

- `pages/projects/swarm-1v1.js` (~2000 lines, single file - all client logic)
- `pages/api/match/queue.js` (NEW, edge function)
- `pages/api/match/check.js` (NEW, edge function)
- `docs/swarm-1v1-multiplayer.md` (this file)
