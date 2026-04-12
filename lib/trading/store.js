/**
 * Tiny JSON-file persistence for orders and positions.
 *
 * Serverless caveat: Vercel / Heroku do not give you a durable FS per request.
 * We write to /tmp which survives for the lifetime of a warm lambda. For
 * real production durability, swap the file backend for Vercel KV, Upstash
 * Redis, or a managed Postgres by only replacing the low-level readAll /
 * writeAll functions. The rest of the API is backend-agnostic.
 */

import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_FILE = path.join(os.tmpdir(), "trading-store.json");

function emptyDb() {
  return { positions: {}, orders: {}, scans: [] };
}

function readAll(file) {
  try {
    if (!fs.existsSync(file)) return emptyDb();
    const raw = fs.readFileSync(file, "utf8");
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw);
    return { ...emptyDb(), ...parsed };
  } catch {
    return emptyDb();
  }
}

function writeAll(file, db) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  } catch (e) {
    // Write failures are non-fatal: the bot still runs, just without persistence.
    console.error("trading-store write failed:", e.message);
  }
}

export function buildStore({ file = DEFAULT_FILE } = {}) {
  function savePosition(pos) {
    const db = readAll(file);
    db.positions[pos.id] = { ...pos, updatedAt: Date.now() };
    writeAll(file, db);
    return db.positions[pos.id];
  }

  function getPosition(id) {
    const db = readAll(file);
    return db.positions[id] || null;
  }

  function listPositions({ status } = {}) {
    const db = readAll(file);
    const all = Object.values(db.positions);
    if (!status) return all;
    return all.filter((p) => p.status === status);
  }

  function updatePosition(id, patch) {
    const db = readAll(file);
    const cur = db.positions[id];
    if (!cur) return null;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    db.positions[id] = next;
    writeAll(file, db);
    return next;
  }

  function saveOrder(order) {
    const db = readAll(file);
    const id = order.orderId || order.clientOrderId;
    if (!id) return order;
    db.orders[id] = { ...order, updatedAt: Date.now() };
    writeAll(file, db);
    return db.orders[id];
  }

  function getOrder(id) {
    const db = readAll(file);
    return db.orders[id] || null;
  }

  function appendScan(scan) {
    const db = readAll(file);
    db.scans = [scan, ...db.scans].slice(0, 50);
    writeAll(file, db);
  }

  function file_() { return file; }

  return { savePosition, getPosition, listPositions, updatePosition, saveOrder, getOrder, appendScan, file: file_ };
}
