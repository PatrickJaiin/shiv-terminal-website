// Phase 4: Matchmaking queue endpoint
// Pairs two players by PeerJS peer ID. Uses Upstash Redis via REST API
// (works on Vercel Edge runtime, no separate hosting needed).
//
// Setup: add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel env vars.
// Free tier: 10K commands/day. Each match uses ~4 commands.

export const config = { runtime: "edge" };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const QUEUE_KEY_PREFIX = "swarm1v1:queue:";
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
  // Multi-theater queuing: player sends an array of theaters they're willing to play.
  // We try to pop from each queue in order. If no match, push to all selected queues.
  let theaters = Array.isArray(body?.theaters) ? body.theaters.filter((t) => typeof t === "string") : [];
  if (theaters.length === 0) theaters = [typeof body?.theater === "string" ? body.theater.trim() : "ukraine_russia"];

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse({ error: "matchmaking_not_configured", configured: false }, 503);
  }

  try {
    // Try to pop a waiting player from any of the selected theater queues
    for (const t of theaters) {
      const qKey = QUEUE_KEY_PREFIX + t;
      const waiting = await redis(["lpop", qKey]);
      if (waiting && waiting !== peerId) {
        const ts = Date.now();
        const matchData = JSON.stringify({ host: waiting, guest: peerId, ts, theater: t });
        await redis(["setex", `${MATCH_KEY_PREFIX}${waiting}`, String(MATCH_TTL), matchData]);
        await redis(["setex", `${MATCH_KEY_PREFIX}${peerId}`, String(MATCH_TTL), matchData]);
        return jsonResponse({ matched: true, role: "guest", opponent: waiting, theater: t });
      }
      // If we popped our own ID, put it back
      if (waiting === peerId) await redis(["rpush", qKey, peerId]);
    }
    // No match found - push to ALL selected theater queues so any opponent on any of these theaters can find us
    for (const t of theaters) {
      const qKey = QUEUE_KEY_PREFIX + t;
      await redis(["rpush", qKey, peerId]);
      await redis(["expire", qKey, "120"]);
    }
    return jsonResponse({ matched: false, queued: true, theaters });
  } catch (e) {
    return jsonResponse({ error: e.message || "redis_error" }, 500);
  }
}
