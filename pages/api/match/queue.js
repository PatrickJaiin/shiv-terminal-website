// Phase 4: Matchmaking queue endpoint
// Pairs two players by PeerJS peer ID. Uses Upstash Redis via REST API
// (works on Vercel Edge runtime, no separate hosting needed).
//
// Setup: add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel env vars.
// Free tier: 10K commands/day. Each match uses ~4 commands.

export const config = { runtime: "edge" };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const QUEUE_KEY = "swarm1v1:queue";
const MATCH_KEY_PREFIX = "swarm1v1:match:";
const MATCH_TTL = 300; // 5 minutes

async function redis(parts) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("not_configured");
  const path = parts.map((p) => encodeURIComponent(String(p))).join("/");
  const resp = await fetch(`${REDIS_URL}/${path}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`redis_${resp.status}`);
  const data = await resp.json();
  return data.result;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const peerId = typeof body?.peerId === "string" ? body.peerId.trim() : "";
  if (!peerId) return jsonResponse({ error: "peerId_required" }, 400);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse({ error: "matchmaking_not_configured", configured: false }, 503);
  }

  try {
    // Try to pop a waiting player from the queue
    const waiting = await redis(["lpop", QUEUE_KEY]);
    if (waiting && waiting !== peerId) {
      // Pair them. Store match records for both peers (TTL: 5 min) so /check can find them.
      const ts = Date.now();
      const matchData = JSON.stringify({ host: waiting, guest: peerId, ts });
      // Use SETEX for atomic set+expire
      await redis(["setex", `${MATCH_KEY_PREFIX}${waiting}`, String(MATCH_TTL), matchData]);
      await redis(["setex", `${MATCH_KEY_PREFIX}${peerId}`, String(MATCH_TTL), matchData]);
      // The waiting player was already there → they are the host (their PeerJS instance is open).
      // The new arrival is the guest → they will connect to host's peer ID.
      return jsonResponse({ matched: true, role: "guest", opponent: waiting });
    }
    // No one waiting → queue this peerId
    // RPUSH and refresh queue TTL to prevent stale queue keys
    await redis(["rpush", QUEUE_KEY, peerId]);
    await redis(["expire", QUEUE_KEY, "120"]);
    return jsonResponse({ matched: false, queued: true });
  } catch (e) {
    return jsonResponse({ error: e.message || "redis_error" }, 500);
  }
}
