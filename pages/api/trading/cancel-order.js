/**
 * Cancel an unfilled Kalshi order.
 * Called by the client after polling times out.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiToken, orderId, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://trading-api.kalshi.com/trade-api/v2";

  if (!kalshiToken || !orderId) {
    return res.status(400).json({ error: "Missing kalshiToken or orderId" });
  }

  try {
    const resp = await fetch(`${apiBase}/portfolio/orders/${orderId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${kalshiToken}` },
    });
    const data = await resp.json();
    return res.status(200).json({ cancelled: true, data });
  } catch (e) {
    return res.status(200).json({ cancelled: false, error: e.message });
  }
}
