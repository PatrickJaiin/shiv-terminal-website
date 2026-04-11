// Phase 4 extension: matchmaking stats endpoint
// Returns counts of players currently waiting in queue + active matches.
// Sums across all theater-specific queues (swarm1v1:queue:ukraine_russia, etc).

export const config = { runtime: "edge" };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const THEATERS = ["ukraine_russia", "kashmir", "israel_iran", "taiwan_strait"];
const QUEUE_KEY_PREFIX = "swarm1v1:queue:";
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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "public, s-maxage=5, stale-while-revalidate=10" : "no-store",
    },
  });
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return jsonResponse({ configured: false, queueing: 0, inMatch: 0 });
  }

  try {
    // Sum queue lengths across all theater queues
    let totalQueued = 0;
    for (const t of THEATERS) {
      try {
        const len = await redis(["llen", QUEUE_KEY_PREFIX + t]);
        if (typeof len === "number") totalQueued += len;
      } catch {}
    }
    // Active match count
    let matchKeys = [];
    try {
      const scanResult = await redis(["scan", "0", "match", MATCH_KEY_PATTERN, "count", "100"]);
      matchKeys = Array.isArray(scanResult) && Array.isArray(scanResult[1]) ? scanResult[1] : [];
    } catch {}
    const activeMatchPlayers = matchKeys.length;

    return jsonResponse({
      configured: true,
      queueing: totalQueued,
      inMatchPlayers: activeMatchPlayers,
      activeMatches: Math.floor(activeMatchPlayers / 2),
    });
  } catch (e) {
    return jsonResponse({ error: e.message || "redis_error", configured: false }, 500);
  }
}
