// Phase 4 extension: matchmaking stats endpoint
// Returns counts of players currently waiting in queue + active matches.
// Polled by the lobby waiting screen so users see "X players searching, Y in matches".

export const config = { runtime: "edge" };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const QUEUE_KEY = "swarm1v1:queue";
const MATCH_KEY_PATTERN = "swarm1v1:match:*";

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
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse({ configured: false, queueing: 0, inMatch: 0 });
  }

  try {
    // Queue length = players waiting for an opponent
    const queueLen = await redis(["llen", QUEUE_KEY]);
    // Active match count = number of swarm1v1:match:* keys / 2 (each match writes 2 records)
    let matchKeys = [];
    try {
      // Use scan-style match. SCAN with cursor in REST API is tricky; use a simple approach.
      // Each match has 2 records (host + guest peer), so divide by 2 for unique matches.
      const scanResult = await redis(["scan", "0", "match", MATCH_KEY_PATTERN, "count", "100"]);
      matchKeys = Array.isArray(scanResult) && Array.isArray(scanResult[1]) ? scanResult[1] : [];
    } catch {}
    const activeMatchPlayers = matchKeys.length;

    return jsonResponse({
      configured: true,
      queueing: typeof queueLen === "number" ? queueLen : 0,
      inMatchPlayers: activeMatchPlayers,
      activeMatches: Math.floor(activeMatchPlayers / 2),
    });
  } catch (e) {
    return jsonResponse({ error: e.message || "redis_error", configured: false }, 500);
  }
}
