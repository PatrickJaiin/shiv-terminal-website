/**
 * Poll Kalshi order fill status.
 * Called by the client after execute returns pending.
 * Each call is a single check — no looping, stays well under Vercel's 10s limit.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiToken, orderId, kalshiTicker, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://trading-api.kalshi.com/trade-api/v2";

  if (!kalshiToken || !orderId) {
    return res.status(400).json({ error: "Missing kalshiToken or orderId" });
  }

  try {
    const statusResp = await fetch(`${apiBase}/portfolio/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${kalshiToken}` },
    });
    const statusData = await statusResp.json();
    const order = statusData.order || statusData;

    if (order.status === "filled") {
      return res.status(200).json({
        filled: true,
        fillPrice: (order.no_price || 0) / 100,
        filledCount: order.place_count || 0,
      });
    }

    return res.status(200).json({ filled: false, status: order.status || "unknown" });
  } catch (e) {
    return res.status(200).json({ filled: false, error: e.message });
  }
}
