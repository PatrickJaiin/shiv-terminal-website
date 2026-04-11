// Phase 4: Matchmaking check endpoint
// Polled by clients waiting in queue. Returns the match record if pairing has happened.

export const config = { runtime: "edge" };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const MATCH_KEY_PREFIX = "swarm1v1:match:";
const QUEUE_KEY_PREFIX = "swarm1v1:queue:";

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
  if (req.method === "DELETE") {
    // Cancel: remove from queue and match record
    const url = new URL(req.url);
    const peerId = url.searchParams.get("peerId");
    if (!peerId) return jsonResponse({ error: "peerId_required" }, 400);
    if (!REDIS_URL || !REDIS_TOKEN) {
      return jsonResponse({ error: "matchmaking_not_configured", configured: false }, 503);
    }
    try {
      // Remove from all theater queues (player may have queued on multiple)
      const allTheaters = ["ukraine_russia", "kashmir", "israel_iran", "taiwan_strait"];
      for (const t of allTheaters) {
        try { await redis(["lrem", QUEUE_KEY_PREFIX + t, "0", peerId]); } catch {}
      }
      await redis(["del", `${MATCH_KEY_PREFIX}${peerId}`]);
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e.message || "redis_error" }, 500);
    }
  }

  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const peerId = url.searchParams.get("peerId");
  if (!peerId) return jsonResponse({ error: "peerId_required" }, 400);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse({ error: "matchmaking_not_configured", configured: false }, 503);
  }

  try {
    const matchStr = await redis(["get", `${MATCH_KEY_PREFIX}${peerId}`]);
    if (!matchStr) return jsonResponse({ matched: false });
    let match;
    try { match = JSON.parse(matchStr); } catch { return jsonResponse({ matched: false }); }
    const isHost = match.host === peerId;
    const opponent = isHost ? match.guest : match.host;
    return jsonResponse({ matched: true, role: isHost ? "host" : "guest", opponent, theater: match.theater });
  } catch (e) {
    return jsonResponse({ error: e.message || "redis_error" }, 500);
  }
}
