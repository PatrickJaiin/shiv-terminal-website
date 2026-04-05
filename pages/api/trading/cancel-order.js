import { kalshiFetch } from "../../../utils/kalshi-auth";

/**
 * Cancel an unfilled Kalshi order.
 * Called by the client after polling times out.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { kalshiKeyId, kalshiPrivateKey, orderId, config: cfg } = req.body;
  const apiBase = cfg?.kalshiApiBase || "https://api.elections.kalshi.com/trade-api/v2";

  if (!kalshiKeyId || !kalshiPrivateKey || !orderId) {
    return res.status(400).json({ error: "Missing Kalshi credentials or orderId" });
  }

  const kalshiAuth = { keyId: kalshiKeyId, privateKey: kalshiPrivateKey };

  try {
    const resp = await kalshiFetch(`${apiBase}/portfolio/orders/${orderId}`, {
      ...kalshiAuth,
      method: "DELETE",
    });
    const data = await resp.json();
    return res.status(200).json({ cancelled: true, data });
  } catch (e) {
    return res.status(200).json({ cancelled: false, error: e.message });
  }
}
