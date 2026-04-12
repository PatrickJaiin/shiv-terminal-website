/**
 * Shared factory for venue adapters + engine + executor + store.
 * Every API route builds the stack through this so config lives in one place.
 */

import { buildKalshiAdapter } from "../venues/kalshi.js";
import { buildPolymarketAdapter } from "../venues/polymarket.js";
import { buildStore } from "./store.js";
import { buildExecutor } from "./executor.js";

/**
 * Optional ethers signer for Polymarket live execution. Loaded lazily so the
 * engine still runs read-only without ethers installed.
 */
async function tryBuildPolymarketSigner() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk) return null;
  try {
    const { Wallet } = await import("ethers");
    return new Wallet(pk);
  } catch {
    return null;
  }
}

export async function buildStack({ kalshiAuth, apiBase } = {}) {
  const kalshi = buildKalshiAdapter({ auth: kalshiAuth, apiBase });
  const signer = await tryBuildPolymarketSigner();
  const polymarket = buildPolymarketAdapter({ signer });
  const store = buildStore();
  const executor = buildExecutor({ adapters: { kalshi, polymarket }, store });
  return { adapters: { kalshi, polymarket }, store, executor };
}
