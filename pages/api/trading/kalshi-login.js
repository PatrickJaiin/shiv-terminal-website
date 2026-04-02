export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, apiBase } = req.body;
  const base = apiBase || "https://trading-api.kalshi.com/trade-api/v2";

  try {
    const resp = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.message || "Login failed" });
    return res.status(200).json({ token: data.token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
