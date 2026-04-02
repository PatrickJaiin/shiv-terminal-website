/**
 * Cancel an unfilled Kalshi order.
 * Called by the client after polling times out.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiApiKey, orderId, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://trading-api.kalshi.com/trade-api/v2";

  if (!kalshiApiKey || !orderId) {
    return res.status(400).json({ error: "Missing kalshiApiKey or orderId" });
  }

  try {
    const resp = await fetch(`${apiBase}/portfolio/orders/${orderId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${kalshiApiKey}` },
    });
    const data = await resp.json();
    return res.status(200).json({ cancelled: true, data });
  } catch (e) {
    return res.status(200).json({ cancelled: false, error: e.message });
  }
}
