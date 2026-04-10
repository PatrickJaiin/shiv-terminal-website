// Returns temporary TURN relay credentials from metered.ca.
// Called once per match start - keeps the API key server-side.
// Falls back gracefully: if not configured or metered is down, client uses STUN-only.

export const config = { runtime: "edge" };

const API_KEY = process.env.METERED_API_KEY;
const APP_NAME = process.env.METERED_APP_NAME; // e.g. "myapp" from myapp.metered.live

function jsonResponse(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheSeconds > 0
        ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
        : "no-store",
    },
  });
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!API_KEY || !APP_NAME) {
    return jsonResponse({ iceServers: [], configured: false });
  }

  try {
    const resp = await fetch(
      `https://${APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${API_KEY}`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) {
      return jsonResponse({ iceServers: [], error: "metered_error" }, 502);
    }
    const servers = await resp.json();
    // Cache for 5 min - metered credentials last ~24h, no need to fetch every match
    return jsonResponse({ iceServers: servers, configured: true }, 200, 300);
  } catch (e) {
    return jsonResponse({ iceServers: [], error: e.message || "fetch_failed" }, 502);
  }
}
