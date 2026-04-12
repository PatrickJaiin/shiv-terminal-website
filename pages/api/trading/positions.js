/**
 * GET /api/trading/positions[?status=open|settled]
 *
 * Reads from the persistent store. This is new; the UI currently keeps
 * positions in component state but any external client (or a reload) can use
 * this to recover them.
 */

import { buildStore } from "../../../lib/trading/store.js";

export default async function handler(req, res) {
  const status = req.query?.status || null;
  const store = buildStore();
  const list = store.listPositions(status ? { status } : undefined);
  return res.status(200).json({ positions: list, count: list.length });
}
